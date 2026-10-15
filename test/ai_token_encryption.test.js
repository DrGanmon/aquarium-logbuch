'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const { createTestEnvironment, createMongoTestEnvironment } = require('./helpers/env');

for (const backend of ['sqlite', 'mongodb']) test(`Persönliche KI-Schlüssel: Verschlüsselung, Migration, Anbieter und Restore (${backend})`, { timeout: 90000 }, async t => {
  const env = backend === 'sqlite' ? createTestEnvironment({ DB_TYPE: 'sqlite', APP_ENCRYPTION_KEY: null }) : await createMongoTestEnvironment({ APP_ENCRYPTION_KEY: null });
  t.after(() => env.cleanup());
  const account = await env.createUserAndLogin('encrypted_ai');
  const other = await env.createUserAndLogin('other_ai');
  const db = require('../dist/backend/src/db');
  const crypto = require('../dist/backend/src/services/ai-token-crypto');
  const ai = require('../dist/backend/src/services/ai-chat-service');
  const migration = require('../dist/backend/src/db/migrations/007_encrypted_ai_tokens');
  const { backupService } = require('../dist/backend/src/services/backup-service');
  const raw = db.getRawDb();
  const currentSchemaVersion = db.getSchemaVersion();
  const tokens = { openai: 'sk-proj-personal-openai-1234', gemini: 'AIza-personal-gemini-5678', claude: 'sk-ant-personal-claude-9012' };
  const read = () => backend === 'sqlite' ? raw.prepare('SELECT * FROM users WHERE id = ?').get(account.id) : raw.collection('users').findOne({ id: account.id });
  const rawUpdate = async fields => {
    if (backend === 'sqlite') raw.prepare(`UPDATE users SET ${Object.keys(fields).map(key => key + ' = ?').join(', ')} WHERE id = ?`).run(...Object.values(fields), account.id);
    else await raw.collection('users').updateOne({ id: account.id }, { $set: fields });
  };
  const auth = { Cookie: account.cookie };
  const saved = await env.request('/api/me/ai', { method: 'PUT', headers: auth, body: { provider: 'openai', openaiApiKey: tokens.openai, geminiApiKey: tokens.gemini, claudeApiKey: tokens.claude, openaiModel: 'test-openai', geminiModel: 'test-gemini', claudeModel: 'test-claude' } });
  assert.equal(saved.status, 200);
  for (const provider of crypto.AI_PROVIDERS) {
    const stored = await read();
    assert.match(stored[`${provider}_api_key`], /^ai-key:v1:/);
    assert.notEqual(stored[`${provider}_api_key`], tokens[provider]);
    assert.equal(stored[`${provider}_api_key_prefix`], tokens[provider].slice(0, 4));
    assert.equal(stored[`${provider}_api_key_suffix`], tokens[provider].slice(-4));
    assert.equal(saved.data.user[`${provider}KeyMasked`], `${tokens[provider].slice(0, 4)}...${tokens[provider].slice(-4)}`);
    assert.equal(ai.resolveProviderAndConfig(stored, provider).apiKey, tokens[provider]);
    assert.equal(JSON.stringify(saved.data).includes(tokens[provider]), false);
    assert.equal(JSON.stringify(saved.data).includes(stored[`${provider}_api_key`]), false);
  }
  const masterFile = path.join(env.getDataDir(), 'app-encryption.key');
  assert.match(fs.readFileSync(masterFile, 'utf8').trim(), /^[0-9a-f]{64}$/);
  if (process.platform !== 'win32') assert.equal(fs.statSync(masterFile).mode & 0o777, 0o600);
  const before = await read();
  await db.users.update(account.id, { openai_model: 'changed-model' });
  assert.equal((await read()).openai_api_key, before.openai_api_key, 'Änderung anderer Einstellungen darf nicht erneut verschlüsseln');
  await db.users.update(account.id, { openai_api_key: tokens.openai });
  assert.notEqual((await read()).openai_api_key, before.openai_api_key, 'Zufälliger IV pro Speicherung');
  assert.throws(() => crypto.decryptAiToken(before.openai_api_key, other.id, 'openai'), /nicht entschlüsselt/);
  assert.throws(() => crypto.decryptAiToken(before.openai_api_key, account.id, 'gemini'), /nicht entschlüsselt/);
  const parts = before.openai_api_key.split(':');
  parts[3] = (parts[3][0] === 'A' ? 'B' : 'A') + parts[3].slice(1);
  assert.throws(() => crypto.decryptAiToken(parts.join(':'), account.id, 'openai'), /nicht entschlüsselt/);
  const originalMaster = fs.readFileSync(masterFile);
  fs.writeFileSync(masterFile, '11'.repeat(32));
  assert.throws(() => crypto.personalAiToken(before, 'openai'), /nicht entschlüsselt/);
  fs.writeFileSync(masterFile, originalMaster);
  fs.renameSync(masterFile, masterFile + '.saved');
  assert.throws(() => crypto.personalAiToken(before, 'openai'), /nicht entschlüsselt/);
  assert.equal(fs.existsSync(masterFile), false, 'Bei fehlendem Schlüssel keinen Ersatz für vorhandene Chiffretexte erzeugen');
  fs.renameSync(masterFile + '.saved', masterFile);

  // A legacy version-6 database, including the snapshot created before migrating.
  await rawUpdate(Object.fromEntries(crypto.AI_PROVIDERS.map(provider => [`${provider}_api_key`, tokens[provider]])));
  if (backend === 'sqlite') raw.prepare('DELETE FROM schema_version WHERE version > 6').run();
  else await raw.collection('schema_version').deleteMany({ version: { $gt: 6 } });
  await db.close();
  await db.init();
  const migrated = await (backend === 'sqlite' ? db.getRawDb().prepare('SELECT * FROM users WHERE id = ?').get(account.id) : db.getRawDb().collection('users').findOne({ id: account.id }));
  assert.equal(db.getSchemaVersion(), currentSchemaVersion);
  for (const provider of crypto.AI_PROVIDERS) assert.equal(crypto.personalAiToken(migrated, provider), tokens[provider]);
  const snapshot = backupService.listBackups().find(item => item.filename.includes('pre-migration-v6'));
  assert.ok(snapshot);
  const snapshotText = zlib.gunzipSync(require('../dist/backend/src/services/backup-crypto').decryptLocalBackup(backupService.getBackupBuffer(snapshot.filename))).toString('utf8');
  for (const token of Object.values(tokens)) assert.equal(snapshotText.includes(token), false, 'Migrationsbackup darf keine Klartextschlüssel enthalten');
  const snapshotObject = JSON.parse(snapshotText);
  const snapUser = snapshotObject.data.users.find(user => user.id === account.id);
  assert.equal(crypto.personalAiToken(snapUser, 'openai'), tokens.openai);

  const cipherBeforeRestart = migrated.openai_api_key;
  await db.close();await db.init();
  assert.equal((await db.users.findById(account.id)).openai_api_key, cipherBeforeRestart, 'Neustart ist idempotent');
  const backup = await backupService.generateBackupData({ dbAdapter: db, includeFiles: false });
  const serialized = JSON.stringify(backup);
  for (const token of Object.values(tokens)) assert.equal(serialized.includes(token), false);
  // A missing/wrong master key must reject a restore BEFORE replacing existing data.
  process.env.APP_ENCRYPTION_KEY = '22'.repeat(32);
  await assert.rejects(backupService.restoreBackup(backup), /nicht entschlüsselt/);
  delete process.env.APP_ENCRYPTION_KEY;
  assert.ok(await db.users.findById(other.id));
  await backupService.restoreBackup(backup);
  for (const provider of crypto.AI_PROVIDERS) assert.equal(crypto.personalAiToken(await db.users.findById(account.id), provider), tokens[provider]);

  // Older archives can contain plaintext; importing upgrades them before any DB insert.
  const legacyBackup = structuredClone(backup);
  for (const provider of crypto.AI_PROVIDERS) legacyBackup.data.users.find(user => user.id === account.id)[`${provider}_api_key`] = tokens[provider];
  await backupService.restoreBackup(legacyBackup);
  const restored = await db.users.findById(account.id);
  for (const provider of crypto.AI_PROVIDERS) assert.equal(crypto.personalAiToken(restored, provider), tokens[provider]);
  const restoredMe = await env.request('/api/me', { headers: auth });
  assert.equal(restoredMe.status, 200);
  assert.equal(restoredMe.data.geminiKeyMasked, 'AIza...5678');
  for (const provider of crypto.AI_PROVIDERS) {
    const removed = await env.request(`/api/me/${provider}`, { method: 'DELETE', headers: auth });
    assert.equal(removed.status, 200);
    const user = await db.users.findById(account.id);
    assert.equal(user[`${provider}_api_key`], null);
    assert.equal(user[`${provider}_api_key_prefix`], null);
    assert.equal(user[`${provider}_api_key_suffix`], null);
  }
  // Idempotence and reserved encryption formats are checked without touching unrelated values.
  await db.users.update(account.id, { openai_api_key: 'tiny' });
  assert.equal(crypto.personalAiMask(await db.users.findById(account.id), 'openai', ''), '***');
  await db.users.update(account.id, { openai_api_key: 'äöüäöüäö' });
  assert.equal(crypto.personalAiMask(await db.users.findById(account.id), 'openai', ''), '***');
  await assert.rejects(db.users.update(account.id, { openai_api_key: 'ai-key:v1:malformed' }), /nicht entschlüsselt/);
  if (backend === 'sqlite') migration.upSqlite(db.getRawDb());else await migration.upMongo(db.getRawDb());
});

test('KI-Master-Schlüssel: explizite Konfiguration und ungültige Werte', async t => {
  const env = createTestEnvironment({ DB_TYPE: 'sqlite', APP_ENCRYPTION_KEY: 'ab'.repeat(32) });
  t.after(() => env.cleanup());
  const user = await env.createUserAndLogin('configured_ai');
  const db = require('../dist/backend/src/db');
  const crypto = require('../dist/backend/src/services/ai-token-crypto');
  await db.users.update(user.id, { openai_api_key: 'configured-personal-token-1234' });
  assert.equal(fs.existsSync(path.join(env.getDataDir(), 'app-encryption.key')), false);
  const saved = await db.users.findById(user.id);
  assert.equal(crypto.personalAiToken(saved, 'openai'), 'configured-personal-token-1234');
  process.env.APP_ENCRYPTION_KEY = 'too-short';
  await assert.rejects(db.users.update(user.id, { openai_api_key: 'replacement-token-5678' }), /64 Hex/);
  assert.equal((await db.users.findById(user.id)).openai_api_key, saved.openai_api_key);
  process.env.APP_ENCRYPTION_KEY = 'cd'.repeat(32);
  await db.close();
  await assert.rejects(db.init(), /nicht entschlüsselt/);
  assert.equal(db.getRawDb(), null, 'Fehlgeschlagener Start muss die Verbindung schließen');
  process.env.APP_ENCRYPTION_KEY = 'ab'.repeat(32);
  await db.init();
  assert.equal(crypto.personalAiToken(await db.users.findById(user.id), 'openai'), 'configured-personal-token-1234');
});

test('KI-Master-Schlüssel: parallele Worker erzeugen atomar dieselbe persistente Datei', async t => {
  const env = createTestEnvironment({ DB_TYPE: 'sqlite', APP_ENCRYPTION_KEY: null });
  t.after(() => env.cleanup());
  await env.start();
  const { execFile } = require('node:child_process');
  const crypto = require('../dist/backend/src/services/ai-token-crypto');
  const modulePath = path.resolve(__dirname, '../dist/backend/src/services/ai-token-crypto');
  const script = `const c=require(${JSON.stringify(modulePath)});process.stdout.write(JSON.stringify(c.encryptPersonalAiFields(1,{openai_api_key:'concurrent-personal-token-1234'})));`;
  const rows = await Promise.all(Array.from({ length: 8 }, () => new Promise((resolve, reject) => {
    execFile(process.execPath, ['-e', script], { env: process.env }, (error, stdout) => error ? reject(error) : resolve(JSON.parse(stdout)));
  })));
  for (const row of rows) assert.equal(crypto.personalAiToken({ id: 1, ...row }, 'openai'), 'concurrent-personal-token-1234');
  assert.equal(new Set(rows.map(row => row.openai_api_key)).size, 8);
  assert.equal(fs.readdirSync(env.getDataDir()).filter(name => name.startsWith('app-encryption.key.') && name.endsWith('.tmp')).length, 0);
});

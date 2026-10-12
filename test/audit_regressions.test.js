'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createTestEnvironment, createMongoTestEnvironment } = require('./helpers/env');

for (const [name, createEnvironment] of [['SQLite', createTestEnvironment], ['MongoDB', createMongoTestEnvironment]]) {
  test(`Audit (${name}): Rechte, parallele Einladungen, aktuelle Chats und Erinnerungsreservierungen`, async (t) => {
    const env = await createEnvironment();
    t.after(() => env.cleanup());
    const owner = await env.createUserAndLogin('audit_owner');
    const db = require('../dist/backend/src/db');
    const headers = { Cookie: owner.cookie };

    // Eine bestehende Session darf durch eine behauptete Admin-Adresse keine Rechte bekommen.
    const change = await env.request('/api/me/profile', { method: 'PUT', headers, body: { email: 'admin@example.com' } });
    assert.equal(change.status, 200);
    assert.equal(change.data.user.emailVerified, false);
    assert.equal(change.data.user.isAdmin, false);
    assert.equal((await env.request('/api/admin/registration', { headers })).status, 403);
    const user = await db.users.findById(owner.id);
    assert.ok(user.email_verify_token);
    const registration = require('../dist/backend/src/services/registration-service').registrationService;
    registration.saveConfig({ mode: 'invite_admin' });
    assert.equal((await env.request('/api/me/invitations', { method: 'POST', headers, body: { type: 'mail', email: 'victim@example.com' } })).status, 403);
    registration.saveConfig({ mode: 'open' });
    const verification = await Promise.all(Array.from({ length: 2 }, () => env.request('/api/verify-email', { method: 'POST', body: { token: user.email_verify_token } })));
    assert.deepEqual(verification.map(result => result.status).sort(), [200, 400]);
    assert.equal((await env.request('/api/admin/registration', { headers })).status, 200);

    const malformedCookie = await env.request('/api/me', { headers: { Cookie: `${owner.cookie}; broken=%E0%A4%A` } });
    assert.equal(malformedCookie.status, 200);
    const arrayBody = await env.request('/api/me/profile', { method: 'PUT', headers, body: [] });
    assert.equal(arrayBody.status, 400);
    for (const suiteId of ['__proto__', 'constructor', 'unknown-suite']) {
      const inventory = await env.request('/api/me/test-inventory/ph', { method: 'PUT', headers, body: { suiteId, used: 1 } });
      assert.equal(inventory.status, 400);
    }
    assert.equal(Object.prototype.ph, undefined);

    const invitation = await db.invitations.create({ code: `audit-${name}`, max_uses: 1, expires_at: Date.now() + 60000 });
    const claims = await Promise.all(Array.from({ length: 12 }, () => db.invitations.use(invitation.id)));
    assert.equal(claims.filter(Boolean).length, 1);
    assert.equal((await db.invitations.findById(invitation.id)).used_count, 1);
    await db.invitations.releaseUse(invitation.id);
    assert.equal(await db.invitations.use(invitation.id), true);
    const expired = await db.invitations.create({ code: `expired-${name}`, expires_at: Date.now() - 1 });
    assert.equal(await db.invitations.use(expired.id), false);

    const created = await env.request('/api/aquariums', { method: 'POST', headers, body: { name: 'Audit aquarium', water_type: 'fresh' } });
    assert.equal(created.status, 200);
    const aquariumId = created.data.id;
    const imageService = require('../dist/backend/src/services/image-service');
    const photo = path.join(imageService.UPLOADS_DIR, 'audit-primary.png');
    fs.writeFileSync(photo, Buffer.from('audit image'));
    await db.aquariums.updateImage(aquariumId, 'audit-primary.png');
    const viewer = await db.users.create({ username: 'shared_viewer', email: 'viewer@example.com', email_verified: 1 });
    await db.shares.upsert(aquariumId, viewer.id, 'view', 'accepted');
    const deletion = await env.request(`/api/admin/users/${viewer.id}`, { method: 'DELETE', headers });
    assert.equal(deletion.status, 200);
    assert.equal(fs.existsSync(photo), true, 'Fotos fremder, freigegebener Aquarien bleiben erhalten');

    for (let i = 0; i < 105; i++) await db.aquariumChats.create({ aquariumId, userId: owner.id, role: 'user', content: String(i) });
    const messages = await db.aquariumChats.listForAquarium(aquariumId);
    assert.equal(messages.length, 100);
    assert.equal(messages[0].content, '5');
    assert.equal(messages.at(-1).content, '104');

    const stamp = new Date().toISOString();
    const reminders = await Promise.all(Array.from({ length: 8 }, () => db.aquariums.updateReminderSent(aquariumId, 'measure', stamp, null)));
    assert.equal(reminders.filter(Boolean).length, 1);
    assert.equal(await db.aquariums.updateReminderSent(aquariumId, 'measure', null, 'stale'), false);
    assert.equal(await db.aquariums.updateReminderSent(aquariumId, 'measure', null, stamp), true);

    await env.request('/api/admin/registration/config', { method: 'PUT', headers, body: { mode: 'invite_admin' } });
    const registrationInvite = await db.invitations.create({ code: `register-${name}`, max_uses: 1, expires_at: Date.now() + 60000 });
    const registrations = await Promise.all(['one', 'two'].map(suffix => env.request('/api/register', {
      method: 'POST', body: { username: `race_${suffix}`, email: `race_${suffix}@example.com`, password: 'password123', inviteCode: registrationInvite.code },
    })));
    assert.deepEqual(registrations.map(result => result.status).sort(), [200, 400]);
    assert.equal((await db.invitations.findById(registrationInvite.id)).used_count, 1);

    const inviter = await db.users.create({ username: 'regular_inviter', email: 'inviter@example.com', email_verified: 1 });
    const mailInvite = await db.invitations.create({ code: `untrusted-mail-${name}`, type: 'mail', email: 'candidate@example.com', created_by: inviter.id, expires_at: Date.now() + 60000 });
    const guest = await env.request('/api/register', { method: 'POST', body: { username: 'candidate', email: 'candidate@example.com', password: 'password123', inviteCode: mailInvite.code } });
    assert.equal(guest.status, 200);
    assert.equal(guest.data.needsVerification, true);
    assert.equal(guest.cookies.session, undefined);

    await env.request('/api/forgot-password', { method: 'POST', body: { identifier: 'audit_owner' } });
    const resetUser = await db.users.findById(owner.id);
    const resets = await Promise.all(['new-password-one', 'new-password-two'].map(password => env.request('/api/reset-password', { method: 'POST', body: { token: resetUser.password_reset_token, password } })));
    assert.deepEqual(resets.map(result => result.status).sort(), [200, 400]);
    await db.aquariums.delete(aquariumId);
    assert.equal(fs.existsSync(photo), false, 'Aquarium-Löschung räumt Bilddateien auch unter MongoDB auf');

  });
}

test('Audit: OIDC verknüpft keine Konten über unbestätigte E-Mail-Adressen', async (t) => {
  const env = createTestEnvironment();
  t.after(() => env.cleanup());
  await env.start();
  const db = require('../dist/backend/src/db');
  const { userForClaims } = require('../dist/backend/src/services/oidc-service');
  const local = await db.users.create({ username: 'oidc_owner', email: 'oidc_owner@example.com', password_hash: 'local', email_verified: 1 });
  await assert.rejects(userForClaims({ sub: 'untrusted', email: 'oidc_owner@example.com', email_verified: false }, db));
  assert.equal((await db.users.findById(local.id)).oidc_sub, null);
  const linked = await userForClaims({ sub: 'trusted', email: 'oidc_owner@example.com', email_verified: true }, db);
  assert.equal(linked.id, local.id);
  await userForClaims({ sub: 'trusted', email: 'admin@example.com', email_verified: false }, db);
  assert.equal((await db.users.findById(local.id)).email, 'oidc_owner@example.com');
  await assert.rejects(userForClaims({ email_verified: true }, db), /subject/);
});

test('Audit: Worker beendet sich mit Code 0, lehnt Überlast und Aufträge nach Shutdown ab', { timeout: 10000 }, async (t) => {
  const { WorkerPool } = require('../dist/backend/src/utils/worker-pool');
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'aquarium-audit-worker-'));
  const workerPath = path.join(directory, 'exit.cjs');
  fs.writeFileSync(workerPath, "require('node:worker_threads').parentPort.on('message', () => process.exit(0));");
  const pool = new WorkerPool({ numWorkers: 1, workerPath, maxQueuedTasks: 1 });
  t.after(async () => { await pool.terminate(); fs.rmSync(directory, { recursive: true, force: true }); });
  const tasks = Promise.allSettled([pool.exec('hashPassword', { pw: 'one' }), pool.exec('hashPassword', { pw: 'two' })]);
  await assert.rejects(pool.exec('hashPassword', { pw: 'three' }), /voll/);
  assert.ok((await tasks).every(result => result.status === 'rejected'));
  await pool.terminate();
  await assert.rejects(pool.exec('hashPassword', { pw: 'four' }), /beendet/);
});

test('Audit: deaktivierte Mail-Queue ist begrenzt; Supervisor entfernt Signal-Handler', async (t) => {
  const { MailService } = require('../dist/backend/src/services/mail-service');
  const { Supervisor } = require('../dist/backend/src/services/supervisor');
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'aquarium-audit-mail-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const configFile = path.join(directory, 'mail.json');
  fs.writeFileSync(configFile, JSON.stringify({ enabled: false, host: 'disabled.invalid' }));
  const mail = new MailService(configFile, 2);
  assert.equal(mail.enqueueMail({ to: 'one@example.com', subject: 'one' }).ok, true);
  assert.equal(mail.enqueueMail({ to: 'two@example.com', subject: 'two' }).ok, true);
  assert.equal(mail.enqueueMail({ to: 'three@example.com', subject: 'three' }).ok, false);
  assert.equal(mail.getQueueStatus().queueLength, 2);
  const supervisor = new Supervisor();
  const count = process.listenerCount('SIGTERM');
  supervisor._bindProcessSignals();
  assert.equal(process.listenerCount('SIGTERM'), count + 1);
  await supervisor.stop();
  assert.equal(process.listenerCount('SIGTERM'), count);
});

test('Audit: SMTP lehnt Header-Injection ab und erzwingt angefordertes TLS', async (t) => {
  const net = require('node:net');
  const { sendSmtpMail } = require('../dist/backend/src/utils/smtp');
  await assert.rejects(sendSmtpMail({ host: 'localhost' }, { from: 'owner@example.com', to: 'target@example.com\r\nBcc: victim@example.com' }), /Zeilenumbrüche/);
  let authenticated = false;
  const server = net.createServer(socket => {
    socket.write('220 audit server\r\n');
    socket.on('data', data => {
      if (data.toString().startsWith('EHLO')) socket.write('250 audit server\r\n');
      if (data.toString().startsWith('AUTH')) authenticated = true;
    });
  });
  await new Promise((resolve, reject) => { server.once('error', reject);server.listen(0, '127.0.0.1', resolve); });
  t.after(() => new Promise(resolve => server.close(resolve)));
  await assert.rejects(sendSmtpMail({ host: '127.0.0.1', port: server.address().port, requireTls: true, user: 'secret-user', pass: 'secret-password' }, { from: 'owner@example.com', to: 'target@example.com', subject: 'test' }), /TLS/);
  assert.equal(authenticated, false);
});

test('Audit: KI-Kontext hält das Zeichenbudget ein und priorisiert neue Nachrichten', () => {
  const { compressChatHistory } = require('../dist/backend/src/services/ai-chat-service');
  const history = Array.from({ length: 30 }, (_, index) => ({ role: index % 2 ? 'assistant' : 'user', content: `${index}:` + 'x'.repeat(8000) }));
  for (const budget of [100, 12000]) {
    const result = compressChatHistory(history, { maxTotalChars: budget });
    assert.ok(result.reduce((sum, message) => sum + message.content.length, 0) <= budget);
    assert.ok(result.at(-1).content.startsWith('29:'));
  }
});

test('Audit: KI-Anfrage zum Provider endet bei abgebrochener Client-Verbindung', { timeout: 10000 }, async (t) => {
  const http = require('node:http');
  let started;
  let disconnected;
  const providerStarted = new Promise(resolve => { started = resolve; });
  const providerDisconnected = new Promise(resolve => { disconnected = resolve; });
  const provider = http.createServer((req, res) => { res.once('close', disconnected);req.resume();started(); });
  await new Promise((resolve, reject) => { provider.once('error', reject);provider.listen(0, '127.0.0.1', resolve); });
  t.after(() => { provider.closeAllConnections();return new Promise(resolve => provider.close(resolve)); });
  const env = createTestEnvironment({ OPENAI_API_KEY: 'audit-key', OPENAI_BASE_URL: `http://127.0.0.1:${provider.address().port}/v1` });
  t.after(() => env.cleanup());
  const user = await env.createUserAndLogin('cancel_chat');
  const aquarium = await env.request('/api/aquariums', { method: 'POST', headers: { Cookie: user.cookie }, body: { name: 'Cancellation audit' } });
  const controller = new AbortController();
  const request = fetch(`${env.getBaseUrl()}/api/aquariums/${aquarium.data.id}/chat`, {
    method: 'POST', headers: { Cookie: user.cookie, 'Content-Type': 'application/json', 'X-Requested-With': 'fetch' },
    body: JSON.stringify({ message: 'Hello', provider: 'openai' }), signal: controller.signal,
  });
  const rejected = assert.rejects(request, /abort/i);
  await providerStarted;
  controller.abort();
  await rejected;
  await providerDisconnected;
  const db = require('../dist/backend/src/db');
  assert.equal(await db.aquariumChats.countForAquarium(aquarium.data.id), 0);
});

test('Audit: fehlgeschlagener Konfigurationswechsel erhält die alte Datei; große Logs werden begrenzt gelesen', (t) => {
  const { writeJsonFile } = require('../dist/backend/src/services/json-config-store');
  const logger = require('../dist/backend/src/utils/logger');
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'aquarium-audit-files-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const filename = path.join(directory, 'config.json');
  writeJsonFile(filename, { mode: 'closed' });
  const originalRename = fs.renameSync;
  fs.renameSync = () => { throw new Error('simulated disk failure'); };
  try { assert.throws(() => writeJsonFile(filename, { mode: 'open' }), /disk failure/); }
  finally { fs.renameSync = originalRename; }
  assert.deepEqual(JSON.parse(fs.readFileSync(filename, 'utf8')), { mode: 'closed' });
  assert.deepEqual(fs.readdirSync(directory), ['config.json']);
  const logPath = path.join(directory, 'large.log');
  fs.writeFileSync(logPath, 'old log entry\n'.repeat(400000) + 'newest one\nnewest two\n');
  const oldLogFile = process.env.LOG_FILE;
  process.env.LOG_FILE = logPath;
  try { assert.deepEqual(logger.readRecentLogs(2), ['newest one', 'newest two']); }
  finally { if (oldLogFile === undefined) delete process.env.LOG_FILE;else process.env.LOG_FILE = oldLogFile; }
});

test('Audit: große Worker-Statistiken benötigen kein unbeschränktes Argumentarray', async () => {
  const { executeTask } = require('../dist/backend/src/utils/thread-worker');
  const stats = await executeTask('computeStats', { measurements: Array(150000).fill({ values: { ph: 7 } }).concat([{ values: { ph: NaN } }]), params: ['ph'] });
  assert.deepEqual(stats.ph, { count: 150000, min: 7, max: 7, avg: 7 });
});

test('Audit: MongoDB verweigert den Betrieb ohne erforderliche Indizes', async () => {
  const MongoAdapter = require('../dist/backend/src/db/mongo-adapter');
  const adapter = new MongoAdapter();
  adapter.db = { collection: () => ({ createIndex: async () => { throw new Error('uniqueness index failed'); } }) };
  await assert.rejects(adapter._createIndexes(), /uniqueness index failed/);
});

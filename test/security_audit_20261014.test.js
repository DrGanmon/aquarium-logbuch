'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createTestEnvironment, createMongoTestEnvironment } = require('./helpers/env');

for (const backend of ['sqlite', 'mongodb']) test(`Sicherheitsaudit: Passwortwechsel, Missbrauchsschutz und abgelaufene Freigaben (${backend})`, { timeout: 60000 }, async t => {
  const env = backend === 'sqlite' ? createTestEnvironment({ DB_TYPE: 'sqlite' }) : await createMongoTestEnvironment();t.after(() => env.cleanup());
  const user = await env.createUserAndLogin('audit_password');
  const second = await env.request('/api/login', { method: 'POST', body: { username: 'audit_password', password: 'password123' } });
  const changed = await env.request('/api/password', { method: 'POST', headers: { Cookie: user.cookie }, body: { current: 'password123', next: 'newpassword123' } });
  assert.equal(changed.status, 200);assert.ok(changed.cookieHeader);
  assert.equal((await env.request('/api/me', { headers: { Cookie: user.cookie } })).status, 401);
  assert.equal((await env.request('/api/me', { headers: { Cookie: second.cookieHeader } })).status, 401);
  assert.equal((await env.request('/api/me', { headers: { Cookie: changed.cookieHeader } })).status, 200);
  const limited = await env.createUserAndLogin('audit_limited');
  const request = (path, body) => env.request(path, { method: 'POST', headers: { Cookie: limited.cookie }, body });
  assert.equal((await request('/api/password', { current: 'x'.repeat(201), next: 'password123' })).status, 400);
  assert.equal((await request('/api/password', { current: 'password123', next: 'x'.repeat(201) })).status, 400);
  const brute = await Promise.all(Array.from({ length: 9 }, () => request('/api/password', { current: 'wrongpassword', next: 'password123' })));
  assert.equal(brute.filter(result => result.status === 429).length, 1);
  assert.ok(brute.every(result => [400, 429].includes(result.status)));
  const deletes = await Promise.all(Array.from({ length: 9 }, () => request('/api/me/delete-request', { password: 'wrongpassword' })));
  assert.equal(deletes.filter(result => result.status === 429).length, 1);
  assert.ok(deletes.every(result => [400, 429].includes(result.status)));

  for (const token of [{ value: 'invalid' }, 'x'.repeat(129)])
    assert.equal((await env.request('/api/shares/accept', { method: 'POST', body: { token } })).status, 400);
  assert.equal((await env.request('/api/shares/accept', { method: 'POST', body: { token: '   ', aquarium_id: 1 } })).status, 401);
  const db = require('../dist/backend/src/db');
  const owner = await env.createUserAndLogin('audit_owner');
  const aq = await db.aquariums.create({ user_id: owner.id, name: 'Audit', water_type: 'fresh' });
  await db.shares.upsert(aq.id, limited.id, 'write', 'pending', 'expired-audit-token', Date.now() - 1000);
  assert.equal((await request('/api/shares/accept', { aquarium_id: aq.id })).status, 400);
  assert.equal(await db.shares.accept(aq.id, limited.id), false);
  assert.equal(await db.shares.acceptByToken('expired-audit-token', limited.id), false);
  assert.equal((await db.shares.find(aq.id, limited.id)).status, 'pending');
  await db.shares.upsert(aq.id, limited.id, 'write', 'pending', 'valid-audit-token', Date.now() + 60000);
  const accepted = await Promise.all(Array.from({ length: 2 }, () => env.request('/api/shares/accept', { method: 'POST', body: { token: 'valid-audit-token' } })));
  assert.equal(accepted.filter(result => result.status === 200).length, 1);
  assert.ok(accepted.every(result => [200, 400, 404].includes(result.status)));
  const stranger = await env.createUserAndLogin('audit_stranger');
  const own = await db.aquariums.create({ user_id: stranger.id, name: 'Foreign', water_type: 'fresh' });
  assert.equal((await request('/api/shares/accept', { aquarium_id: own.id })).status, 404);
  assert.equal((await env.request(`/api/aquariums/${aq.id}`, { headers: { Cookie: stranger.cookie } })).status, 404);
  const admin = await env.createUserAndLogin('audit_admin', 'password123', 'admin@example.com');
  const adminReset = await env.request(`/api/admin/users/${stranger.id}`, { method: 'PUT', headers: { Cookie: admin.cookie },
    body: { username: 'audit_stranger', email: 'audit_stranger@example.com', password: 'resetpassword123' } });
  assert.equal(adminReset.status, 200);
  assert.equal((await env.request('/api/me', { headers: { Cookie: stranger.cookie } })).status, 401);
  assert.equal((await env.request('/api/me', { headers: { Cookie: admin.cookie } })).status, 200);
  const racing = await env.createUserAndLogin('audit_racing');
  const raced = await Promise.all(['newpassword-a', 'newpassword-b'].map(next => env.request('/api/password', {
    method: 'POST', headers: { Cookie: racing.cookie }, body: { current: 'password123', next } })));
  assert.equal(raced.filter(result => result.status === 200).length, 1);
  assert.ok(raced.every(result => [200, 400, 401, 409].includes(result.status)));
  const { backupService } = require('../dist/backend/src/services/backup-service');
  const fs = require('node:fs'), path = require('node:path');
  await backupService.saveAdminConfig({ password: 'backup-test-password' });
  const backup = await backupService.createBackup({ includeFiles: false });
  if (process.platform !== 'win32') assert.equal(fs.statSync(path.join(backupService.backupsDir, backup.filename)).mode & 0o777, 0o600);
  fs.chmodSync(path.join(backupService.backupsDir, backup.filename), 0o644);
  await backupService.createBackup({ includeFiles: false, customFilename: backup.filename });
  if (process.platform !== 'win32') assert.equal(fs.statSync(path.join(backupService.backupsDir, backup.filename)).mode & 0o777, 0o600);
  for (const type of ['__proto__', 'constructor', 'toString']) {
    const result = await env.request(`/api/aquariums/${aq.id}/maintenance`, { method: 'POST', headers: { Cookie: owner.cookie }, body: { type } });
    assert.equal(result.status, 400);
  }
});

test('OIDC: verschlüsselter State verbirgt PKCE und funktioniert workerübergreifend nur mit geheimem Schlüssel', async t => {
  const crypto = require('node:crypto');
  const { createOidc } = require('../dist/backend/src/services/oidc-client');
  const originalFetch = global.fetch;t.after(() => { global.fetch = originalFetch; });
  const config = { issuer: 'https://oidc.test', clientId: 'public-client', redirectUri: 'https://app.test/auth/callback', stateSecret: 'test-only-secret-'.repeat(4) };
  let tokenCalls = 0, unsupportedAlg;
  global.fetch = async url => {
    if (String(url).includes('.well-known')) return new Response(JSON.stringify({ issuer: config.issuer, authorization_endpoint: 'https://oidc.test/authorize', token_endpoint: 'https://oidc.test/token', jwks_uri: 'https://oidc.test/keys' }));
    tokenCalls++;
    if (unsupportedAlg) return new Response(JSON.stringify({ id_token: `${Buffer.from(JSON.stringify({ alg: unsupportedAlg })).toString('base64url')}.e30.ZmFrZQ` }));
    return new Response(JSON.stringify({ error: 'stopped-after-state-validation' }), { status: 400 });
  };
  const first = createOidc(config), second = createOidc(config);
  const { state } = await first.startLogin();
  assert.ok(state.startsWith('v2.'));
  for (const part of state.split('.').slice(1)) assert.equal(Buffer.from(part, 'base64url').toString().includes('"v":'), false);
  await assert.rejects(second.finishLogin({ state, code: 'test-code' }, state), /stopped-after-state-validation/);
  assert.equal(tokenCalls, 1);
  const parts = state.split('.');const ciphertext = Buffer.from(parts[2], 'base64url');ciphertext[0] ^= 1;parts[2] = ciphertext.toString('base64url');
  const tampered = parts.join('.');
  await assert.rejects(second.finishLogin({ state: tampered, code: 'test-code' }, tampered), /Anmeldung hat zu lange gedauert/);
  assert.equal(tokenCalls, 1);
  const foreign = createOidc({ ...config, stateSecret: 'different-secret' });
  await assert.rejects(foreign.finishLogin({ state, code: 'test-code' }, state), /Anmeldung hat zu lange gedauert/);
  const publicFirst = createOidc({ ...config, stateSecret: undefined });
  const publicSecond = createOidc({ ...config, stateSecret: undefined });
  const publicState = (await publicFirst.startLogin()).state;
  await assert.rejects(publicSecond.finishLogin({ state: publicState, code: 'test-code' }, publicState), /Anmeldung hat zu lange gedauert/);
  const payload = Buffer.from(JSON.stringify({ t: Date.now(), n: 'known', v: 'known' })).toString('base64url');
  const oldSignature = crypto.createHmac('sha256', crypto.createHash('sha256').update(config.clientId).digest()).update(payload).digest('base64url');
  const forged = `${payload}.${oldSignature}`;
  await assert.rejects(publicSecond.finishLogin({ state: forged, code: 'test-code' }, forged), /Anmeldung hat zu lange gedauert/);
  assert.equal(tokenCalls, 1);
  for (const alg of ['__proto__', 'constructor', 'toString']) {
    unsupportedAlg = alg;
    const fresh = (await second.startLogin()).state;
    await assert.rejects(second.finishLogin({ state: fresh, code: 'test-code' }, fresh), /Nicht unterstützter Signatur-Algorithmus/);
  }
  assert.equal(tokenCalls, 4);
});

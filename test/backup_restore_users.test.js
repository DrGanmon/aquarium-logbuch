'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createTestEnvironment, createMongoTestEnvironment } = require('./helpers/env');

for (const backend of ['sqlite', 'mongodb']) test(`Restore: Adminrechte, Sprache und Diagrammzeitraum bleiben erhalten (${backend})`, { timeout: 120000 }, async t => {
  const env = backend === 'mongodb' ? await createMongoTestEnvironment() : createTestEnvironment();
  t.after(() => env.cleanup());
  const admin = await env.createUserAndLogin('restore_admin', 'password123', 'admin@example.com');
  const member = await env.createUserAndLogin('restore_member', 'password123', 'member@example.com');
  const headers = { Cookie: admin.cookie }, memberHeaders = { Cookie: member.cookie };
  assert.equal((await env.request('/api/me', { method: 'PUT', headers: memberHeaders, body: { language: 'en', defaultGraphRange: '30' } })).status, 200);
  const memberId = (await env.request('/api/me', { headers: memberHeaders })).data.id;
  // A second administrator granted in the user management must survive as well.
  const promoted = await env.request(`/api/admin/users/${memberId}`, { method: 'PUT', headers, body: { username: 'restore_member', email: 'member@example.com', isAdmin: true } });
  assert.equal(promoted.status, 200, promoted.text);
  assert.equal((await env.request('/api/admin/backups/config', { method: 'PUT', headers, body: { password: 'backup-test-password' } })).status, 200);
  const backup = await env.request('/api/admin/backups/create', { method: 'POST', headers });
  assert.equal(backup.status, 200, backup.text);

  const restored = await env.request(`/api/admin/backups/${encodeURIComponent(backup.data.filename)}/restore`, { method: 'POST', headers });
  assert.equal(restored.status, 200, restored.text);
  const me = (await env.request('/api/me', { headers })).data;
  assert.equal(me.isAdmin, true, 'Der Administrator behält seine Rechte');
  assert.equal((await env.request('/api/admin/backups', { headers })).status, 200, 'Adminbereich bleibt nach dem Restore erreichbar');
  const restoredMember = (await env.request('/api/me', { headers: memberHeaders })).data;
  assert.equal(restoredMember.isAdmin, true, 'Weitere Administratoren bleiben erhalten');
  assert.equal(restoredMember.language, 'en');
  assert.equal(restoredMember.defaultGraphRange, '30');
});

test('Restore: Backups ohne Adminkennzeichen übernehmen bestätigte ADMIN_EMAIL-Konten wie die Migration', () => {
  const env = createTestEnvironment();
  try {
    const { backupService } = require('../dist/backend/src/services/backup-service');
    const users = (extra = {}) => [
      { id: 1, username: 'legacy_admin', email: 'Admin@Example.com', email_verified: 1, password_hash: 'x', ...extra },
      { id: 2, username: 'legacy_unverified', email: 'admin@example.com ', email_verified: 0, password_hash: 'x' },
      { id: 3, username: 'legacy_user', email: 'user@example.com', email_verified: 1, password_hash: 'x', language: 'en', default_graph_range: ' 180 ' },
    ];
    const legacy = backupService.migrateBackupData({ version: 1, data: { users: users() } }).data.users;
    assert.deepEqual(legacy.map(user => user.is_admin), [1, 0, 0], 'Nur bestätigte ADMIN_EMAIL-Konten werden Administratoren');
    assert.equal(legacy[2].language, 'en');
    assert.equal(legacy[2].default_graph_range, '180');
    assert.equal(legacy[0].language, 'de');
    const current = backupService.migrateBackupData({ version: 4, data: { users: users({ is_admin: 0 }) } }).data.users;
    assert.deepEqual(current.map(user => user.is_admin), [0, 0, 0], 'Vorhandene Kennzeichen haben Vorrang vor ADMIN_EMAIL');
  } finally { void env.cleanup(); }
});

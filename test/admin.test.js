'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createTestEnvironment } = require('./helpers/env');

test('Admin: Zugriffsschutz und Benutzerverwaltung', async (t) => {
  const env = createTestEnvironment({
    ADMIN_EMAIL: 'admin@example.com, superadmin@domain.tld',
  });
  t.after(async () => await env.cleanup());

  // 1. Regulären Benutzer (Nicht-Admin) anlegen
  const regularUser = await env.createUserAndLogin('regular_user', 'password123', 'regular@example.com');

  // 2. Admin-Benutzer anlegen (mit passender E-Mail, Case-Insensitive Groß-/Kleinschreibung testen)
  const adminUser = await env.createUserAndLogin('admin_boss', 'adminpassword123', 'ADMIN@EXAMPLE.COM');

  // Prüfen ob /api/me korrekte isAdmin Werte liefert
  const meReg = await env.request('/api/me', { headers: { Cookie: regularUser.cookie } });
  assert.strictEqual(meReg.data.isAdmin, false);

  const meAdmin = await env.request('/api/me', { headers: { Cookie: adminUser.cookie } });
  assert.strictEqual(meAdmin.data.isAdmin, true);

  // 3. Nicht-Admin versucht Admin-Endpunkte aufzurufen -> 403 Forbidden
  const forbiddenGet = await env.request('/api/admin/users', { headers: { Cookie: regularUser.cookie } });
  assert.strictEqual(forbiddenGet.status, 403);

  const forbiddenPost = await env.request('/api/admin/users', {
    method: 'POST',
    headers: { Cookie: regularUser.cookie },
    body: { username: 'hacker', password: 'password123' },
  });
  assert.strictEqual(forbiddenPost.status, 403);

  const forbiddenPut = await env.request(`/api/admin/users/${regularUser.id}`, {
    method: 'PUT',
    headers: { Cookie: regularUser.cookie },
    body: { username: 'hacker_rename' },
  });
  assert.strictEqual(forbiddenPut.status, 403);

  const forbiddenDel = await env.request(`/api/admin/users/${adminUser.id}`, {
    method: 'DELETE',
    headers: { Cookie: regularUser.cookie },
  });
  assert.strictEqual(forbiddenDel.status, 403);

  // 4. Admin ruft Benutzerliste ab
  const userListRes = await env.request('/api/admin/users', { headers: { Cookie: adminUser.cookie } });
  assert.strictEqual(userListRes.status, 200);
  assert.ok(Array.isArray(userListRes.data));
  assert.strictEqual(userListRes.data.length, 2);

  const adminInList = userListRes.data.find((u) => u.id === adminUser.id);
  assert.ok(adminInList);
  assert.strictEqual(adminInList.isAdmin, true);
  assert.strictEqual(adminInList.hasPassword, true);

  // 5. Admin legt neuen Benutzer an
  const newUserRes = await env.request('/api/admin/users', {
    method: 'POST',
    headers: { Cookie: adminUser.cookie },
    body: {
      username: 'managed_user',
      password: 'managedpassword123',
      email: 'managed@example.com',
      oidcSub: 'pocket-id-sub-999',
    },
  });
  assert.strictEqual(newUserRes.status, 200);
  const managedUserId = newUserRes.data.id;
  assert.ok(managedUserId > 0);

  // Weitere Administratoren werden über die Datenbankrolle verwaltet.
  const promoteRes = await env.request(`/api/admin/users/${managedUserId}`, {
    method: 'PUT', headers: { Cookie: adminUser.cookie },
    body: { username: 'managed_user', email: 'managed@example.com', oidcSub: 'pocket-id-sub-999', isAdmin: true },
  });
  assert.strictEqual(promoteRes.status, 200);
  const promotedLogin = await env.request('/api/login', { method: 'POST', body: { username: 'managed_user', password: 'managedpassword123' } });
  assert.strictEqual((await env.request('/api/admin/users', { headers: { Cookie: promotedLogin.cookieHeader } })).status, 200);

  // Validierung: Duplizierter Benutzername, E-Mail oder oidcSub -> 409
  const dupNameRes = await env.request('/api/admin/users', {
    method: 'POST',
    headers: { Cookie: adminUser.cookie },
    body: { username: 'managed_user', password: 'password123' },
  });
  assert.strictEqual(dupNameRes.status, 409);

  const dupEmailRes = await env.request('/api/admin/users', {
    method: 'POST',
    headers: { Cookie: adminUser.cookie },
    body: { username: 'other_name', email: 'MANAGED@example.com' },
  });
  assert.strictEqual(dupEmailRes.status, 409);

  const dupSubRes = await env.request('/api/admin/users', {
    method: 'POST',
    headers: { Cookie: adminUser.cookie },
    body: { username: 'other_name_2', oidcSub: 'pocket-id-sub-999' },
  });
  assert.strictEqual(dupSubRes.status, 409);

  // 6. Admin bearbeitet Benutzer (PUT)
  const editUserRes = await env.request(`/api/admin/users/${managedUserId}`, {
    method: 'PUT',
    headers: { Cookie: adminUser.cookie },
    body: {
      username: 'managed_user_renamed',
      email: 'newemail@example.com',
      password: 'newmanagedpassword456',
      oidcSub: 'updated-sub-999',
      isAdmin: true,
    },
  });
  assert.strictEqual(editUserRes.status, 200);

  const selfDemote = await env.request(`/api/admin/users/${adminUser.id}`, {
    method: 'PUT', headers: { Cookie: adminUser.cookie },
    body: { username: 'admin_boss', email: 'admin@example.com', isAdmin: false },
  });
  assert.strictEqual(selfDemote.status, 400);

  // Prüfen ob geänderter Benutzer sich mit neuem Passwort einloggen kann
  const loginNewPw = await env.request('/api/login', {
    method: 'POST',
    body: { username: 'managed_user_renamed', password: 'newmanagedpassword456' },
  });
  assert.strictEqual(loginNewPw.status, 200);

  // 7. Admin versucht sich selbst zu löschen -> 400 Bad Request
  const selfDelRes = await env.request(`/api/admin/users/${adminUser.id}`, {
    method: 'DELETE',
    headers: { Cookie: adminUser.cookie },
  });
  assert.strictEqual(selfDelRes.status, 400);

  // 8. Admin löscht einen anderen Benutzer -> 200 OK
  const delOtherRes = await env.request(`/api/admin/users/${managedUserId}`, {
    method: 'DELETE',
    headers: { Cookie: adminUser.cookie },
  });
  assert.strictEqual(delOtherRes.status, 200);

  // Gelöschter Benutzer kann sich nicht mehr einloggen
  const loginDeleted = await env.request('/api/login', {
    method: 'POST',
    body: { username: 'managed_user_renamed', password: 'newmanagedpassword456' },
  });
  assert.strictEqual(loginDeleted.status, 401);
});

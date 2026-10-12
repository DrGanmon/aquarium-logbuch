'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createTestEnvironment } = require('./helpers/env');

test('Auth: Registrierung, Validierung und Duplikate', async (t) => {
  const env = createTestEnvironment({ ADMIN_EMAIL: 'admin@example.com' });
  t.after(async () => await env.cleanup());

  // 1. Erfolgreiche Registrierung für regulären Benutzer (benötigt Verifizierung)
  const res1 = await env.request('/api/register', {
    method: 'POST',
    body: { username: 'testuser1', password: 'password123', email: 'test1@example.com' },
  });
  assert.strictEqual(res1.status, 200);
  assert.strictEqual(res1.data.username, 'testuser1');
  assert.strictEqual(res1.data.email, 'test1@example.com');
  assert.strictEqual(res1.data.needsVerification, true);
  assert.ok(res1.data.id > 0);

  // 1b. Auch die Admin-E-Mail erfordert einen Besitznachweis
  const resAdmin = await env.request('/api/register', {
    method: 'POST',
    body: { username: 'adminuser', password: 'password123', email: 'admin@example.com' },
  });
  assert.strictEqual(resAdmin.status, 200);
  assert.strictEqual(resAdmin.data.needsVerification, true);
  assert.equal(resAdmin.cookies.session, undefined);
  const blockedAdmin = await env.request('/api/login', { method: 'POST', body: { username: 'adminuser', password: 'password123' } });
  assert.equal(blockedAdmin.status, 403);

  // 2. Ungültiger Benutzername (zu kurz)
  const resShort = await env.request('/api/register', {
    method: 'POST',
    body: { username: 'ab', password: 'password123', email: 'short@example.com' },
  });
  assert.strictEqual(resShort.status, 400);

  // 3. Ungültige Zeichen im Benutzernamen
  const resInvalid = await env.request('/api/register', {
    method: 'POST',
    body: { username: 'user@bad!', password: 'password123', email: 'bad@example.com' },
  });
  assert.strictEqual(resInvalid.status, 400);

  // 4. Zu kurzes Passwort (< 8 Zeichen)
  const resPw = await env.request('/api/register', {
    method: 'POST',
    body: { username: 'testuser2', password: 'short', email: 'shortpw@example.com' },
  });
  assert.strictEqual(resPw.status, 400);

  // 5. Duplizierter Benutzername (409 Conflict)
  const resDupUser = await env.request('/api/register', {
    method: 'POST',
    body: { username: 'testuser1', password: 'password123', email: 'another@example.com' },
  });
  assert.strictEqual(resDupUser.status, 409);

  // 6. Ungültige E-Mail-Adresse
  const resBadEmail = await env.request('/api/register', {
    method: 'POST',
    body: { username: 'testuser3', password: 'password123', email: 'not-an-email' },
  });
  assert.strictEqual(resBadEmail.status, 400);

  // 7. Duplizierte E-Mail-Adresse (409 Conflict)
  const resDupEmail = await env.request('/api/register', {
    method: 'POST',
    body: { username: 'testuser4', password: 'password123', email: 'TEST1@example.com' },
  });
  assert.strictEqual(resDupEmail.status, 409);
});

test('Auth: Deaktivierte Registrierung', async (t) => {
  const env = createTestEnvironment({ ALLOW_REGISTRATION: 'false' });
  t.after(async () => await env.cleanup());

  const res = await env.request('/api/register', {
    method: 'POST',
    body: { username: 'newuser', password: 'password123' },
  });
  assert.strictEqual(res.status, 403);
});

test('Auth: Login und Brute-Force Rate Limiting', async (t) => {
  const env = createTestEnvironment();
  t.after(async () => await env.cleanup());

  // Benutzer anlegen
  const regRes = await env.request('/api/register', {
    method: 'POST',
    body: { username: 'logintest', password: 'correctpassword', email: 'logintest@example.com' },
  });
  const db = require('../dist/backend/src/db');
  const u = await db.users.findByUsername('logintest');
  if (u && u.email_verify_token) {
    await env.request('/api/verify-email', {
      method: 'POST',
      body: { token: u.email_verify_token },
    });
  }

  // Falsches Passwort
  const failRes = await env.request('/api/login', {
    method: 'POST',
    body: { username: 'logintest', password: 'wrongpassword' },
  });
  assert.strictEqual(failRes.status, 401);

  // Nicht existierender Benutzer
  const noUserRes = await env.request('/api/login', {
    method: 'POST',
    body: { username: 'doesnotexist', password: 'wrongpassword' },
  });
  assert.strictEqual(noUserRes.status, 401);

  // Erfolgreicher Login
  const successRes = await env.request('/api/login', {
    method: 'POST',
    body: { username: 'logintest', password: 'correctpassword' },
  });
  assert.strictEqual(successRes.status, 200);
  assert.strictEqual(successRes.data.username, 'logintest');
  assert.ok(successRes.cookies.session);

  // Brute-Force Test: 8 Fehlversuche provozieren ab dem 9. Versuch 429
  for (let i = 0; i < 8; i++) {
    const r = await env.request('/api/login', {
      method: 'POST',
      body: { username: 'bruteforce_target', password: 'badpassword' },
    });
    assert.strictEqual(r.status, 401);
  }
  const rateLimitRes = await env.request('/api/login', {
    method: 'POST',
    body: { username: 'bruteforce_target', password: 'badpassword' },
  });
  assert.strictEqual(rateLimitRes.status, 429);
});

test('Auth: /api/me und Passwortänderung', async (t) => {
  const env = createTestEnvironment();
  t.after(async () => await env.cleanup());

  const user = await env.createUserAndLogin('pwtestuser', 'oldpassword123', 'pw@example.com');

  // /api/me aufrufen
  const meRes = await env.request('/api/me', {
    headers: { Cookie: user.cookie },
  });
  assert.strictEqual(meRes.status, 200);
  assert.strictEqual(meRes.data.username, 'pwtestuser');
  assert.strictEqual(meRes.data.email, 'pw@example.com');
  assert.strictEqual(meRes.data.hasPassword, true);
  assert.strictEqual(meRes.data.hasOidc, false);
  assert.strictEqual(meRes.data.isAdmin, false);

  // Passwort ändern mit falschem aktuellem Passwort
  const failChange = await env.request('/api/password', {
    method: 'POST',
    headers: { Cookie: user.cookie },
    body: { current: 'wrongold', next: 'newpassword123' },
  });
  assert.strictEqual(failChange.status, 400);

  // Passwort ändern mit zu kurzem neuen Passwort
  const shortChange = await env.request('/api/password', {
    method: 'POST',
    headers: { Cookie: user.cookie },
    body: { current: 'oldpassword123', next: 'short' },
  });
  assert.strictEqual(shortChange.status, 400);

  // Erfolgreiche Passwortänderung
  const okChange = await env.request('/api/password', {
    method: 'POST',
    headers: { Cookie: user.cookie },
    body: { current: 'oldpassword123', next: 'newpassword123' },
  });
  assert.strictEqual(okChange.status, 200);

  // Login mit altem Passwort schlägt fehl
  const oldLogin = await env.request('/api/login', {
    method: 'POST',
    body: { username: 'pwtestuser', password: 'oldpassword123' },
  });
  assert.strictEqual(oldLogin.status, 401);

  // Login mit neuem Passwort erfolgreich
  const newLogin = await env.request('/api/login', {
    method: 'POST',
    body: { username: 'pwtestuser', password: 'newpassword123' },
  });
  assert.strictEqual(newLogin.status, 200);
});

test('Auth: Logout und Session-Invalidierung', async (t) => {
  const env = createTestEnvironment();
  t.after(async () => await env.cleanup());

  const user = await env.createUserAndLogin('logoutuser', 'password123');

  // Prüfen ob eingeloggt
  const check1 = await env.request('/api/me', {
    headers: { Cookie: user.cookie },
  });
  assert.strictEqual(check1.status, 200);

  // Logout durchführen
  const logoutRes = await env.request('/api/logout', {
    method: 'POST',
    headers: { Cookie: user.cookie },
  });
  assert.strictEqual(logoutRes.status, 200);

  // Gleicher Cookie darf jetzt nicht mehr funktionieren (401)
  const check2 = await env.request('/api/me', {
    headers: { Cookie: user.cookie },
  });
  assert.strictEqual(check2.status, 401);
});

test('Auth: CSRF-Schutz und Header-Validierung', async (t) => {
  const env = createTestEnvironment();
  t.after(async () => await env.cleanup());

  const user = await env.createUserAndLogin('csrftestuser', 'password123');

  // POST ohne X-Requested-With Header -> 403 Forbidden
  const noHeaderRes = await env.request('/api/aquariums', {
    method: 'POST',
    headers: { Cookie: user.cookie, 'X-Requested-With': '' },
    body: { name: 'Mein Aquarium' },
  });
  assert.strictEqual(noHeaderRes.status, 403);

  // POST mit ungültigem Content-Type (z.B. text/plain) -> 415
  const baseUrl = env.getBaseUrl();
  const badContentTypeRes = await fetch(`${baseUrl}/api/aquariums`, {
    method: 'POST',
    headers: {
      Cookie: user.cookie,
      'X-Requested-With': 'fetch',
      'Content-Type': 'text/plain',
    },
    body: 'name=Test',
  });
  assert.strictEqual(badContentTypeRes.status, 415);
});

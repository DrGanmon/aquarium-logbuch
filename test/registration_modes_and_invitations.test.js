'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createTestEnvironment, createMongoTestEnvironment } = require('./helpers/env');

test('Registrierungs-Modi & Einladungen: Umfassender Workflow (SQLite)', async (t) => {
  const env = createTestEnvironment({
    ADMIN_EMAIL: 'admin@example.com',
  });
  t.after(async () => await env.cleanup());

  const admin = await env.createUserAndLogin('admin_user', 'adminpass123', 'admin@example.com');
  const user1 = await env.createUserAndLogin('regular_user1', 'password123', 'user1@example.com');

  // 1. Modus: Geschlossen (closed)
  await t.test('Modus Geschlossen (closed): Registrierung und Einladungen gesperrt', async () => {
    // Admin stellt auf geschlossen
    const cfgRes = await env.request('/api/admin/registration/config', {
      method: 'PUT',
      headers: { Cookie: admin.cookie },
      body: { mode: 'closed' },
    });
    assert.strictEqual(cfgRes.status, 200);
    assert.strictEqual(cfgRes.data.config.mode, 'closed');
    assert.strictEqual(cfgRes.data.config.isClosed, true);

    // Registrierungs-Endpunkt prüfen
    const pubRes = await env.request('/api/registration');
    assert.strictEqual(pubRes.status, 200);
    assert.strictEqual(pubRes.data.isClosed, true);
    assert.strictEqual(pubRes.data.registration, false);

    // Registrierung muss abgewiesen werden
    const tryReg = await env.request('/api/register', {
      method: 'POST',
      body: { username: 'blocked_user', password: 'password123', email: 'blocked@example.com' },
    });
    assert.strictEqual(tryReg.status, 403);

    // Regulärer Nutzer darf im geschlossenen Modus keine Einladungen erstellen
    const tryInv = await env.request('/api/me/invitations', {
      method: 'POST',
      headers: { Cookie: user1.cookie },
      body: { type: 'code', days: 7 },
    });
    assert.strictEqual(tryInv.status, 403);
  });

  // 2. Modus: Einladung (Admin) (invite_admin)
  await t.test('Modus Einladung (Admin): Nur Admins können einladen & Codes verwalten', async () => {
    // Admin stellt auf invite_admin
    await env.request('/api/admin/registration/config', {
      method: 'PUT',
      headers: { Cookie: admin.cookie },
      body: { mode: 'invite_admin', userCodeMaxDays: 7 },
    });

    // Registrierung ohne Code muss fehlschlagen
    const tryRegNoCode = await env.request('/api/register', {
      method: 'POST',
      body: { username: 'nocode_user', password: 'password123', email: 'nocode@example.com' },
    });
    assert.strictEqual(tryRegNoCode.status, 400);
    assert.match(tryRegNoCode.data.error, /Einladungscode/i);

    // Regulärer Nutzer darf keine Einladung erstellen
    const tryUserInv = await env.request('/api/me/invitations', {
      method: 'POST',
      headers: { Cookie: user1.cookie },
      body: { type: 'code', days: 5 },
    });
    assert.strictEqual(tryUserInv.status, 403);

    // Admin erstellt Code mit max_uses = 2 und 30 Tagen Gültigkeit
    const adminInvRes = await env.request('/api/admin/invitations', {
      method: 'POST',
      headers: { Cookie: admin.cookie },
      body: { type: 'code', code: 'TEST-ADMIN-CODE', maxUses: 2, days: 30, note: 'Für Freunde' },
    });
    assert.strictEqual(adminInvRes.status, 200);
    assert.strictEqual(adminInvRes.data.invitation.code, 'TEST-ADMIN-CODE');

    // Code validieren
    const valRes = await env.request('/api/invitations/validate?code=TEST-ADMIN-CODE');
    assert.strictEqual(valRes.status, 200);
    assert.strictEqual(valRes.data.valid, true);

    // Erste Registrierung mit dem Code
    const reg1 = await env.request('/api/register', {
      method: 'POST',
      body: { username: 'invited_one', password: 'password123', email: 'invited1@example.com', inviteCode: 'TEST-ADMIN-CODE' },
    });
    assert.strictEqual(reg1.status, 200);

    // Zweite Registrierung mit dem Code
    const reg2 = await env.request('/api/register', {
      method: 'POST',
      body: { username: 'invited_two', password: 'password123', email: 'invited2@example.com', inviteCode: 'TEST-ADMIN-CODE' },
    });
    assert.strictEqual(reg2.status, 200);

    // Dritte Registrierung (Limit 2 erreicht) muss fehlschlagen
    const reg3 = await env.request('/api/register', {
      method: 'POST',
      body: { username: 'invited_three', password: 'password123', email: 'invited3@example.com', inviteCode: 'TEST-ADMIN-CODE' },
    });
    assert.strictEqual(reg3.status, 400);
    assert.match(reg3.data.error, /vollständig eingelöst/i);

    // Admin erstellt E-Mail-Einladung
    const mailInvRes = await env.request('/api/admin/invitations', {
      method: 'POST',
      headers: { Cookie: admin.cookie },
      body: { type: 'mail', email: 'special_guest@example.com', days: 14 },
    });
    assert.strictEqual(mailInvRes.status, 200);
    const guestCode = mailInvRes.data.invitation.code;

    // Registrierung mit falscher E-Mail muss fehlschlagen
    const wrongMailReg = await env.request('/api/register', {
      method: 'POST',
      body: { username: 'special_guest', password: 'password123', email: 'wrong_mail@example.com', inviteCode: guestCode },
    });
    assert.strictEqual(wrongMailReg.status, 400);
    assert.match(wrongMailReg.data.error, /nur für die E-Mail-Adresse/i);

    // Registrierung mit korrekter E-Mail gelingt direkt
    const correctMailReg = await env.request('/api/register', {
      method: 'POST',
      body: { username: 'special_guest', password: 'password123', email: 'special_guest@example.com', inviteCode: guestCode },
    });
    assert.strictEqual(correctMailReg.status, 200);
  });

  // 3. Modus: Einladung (Offen) (invite_open)
  await t.test('Modus Einladung (Offen): Reguläre Nutzer können Codes & Mails im Profil erstellen', async () => {
    // Admin konfiguriert invite_open und max 7 Tage für Nutzer-Codes
    await env.request('/api/admin/registration/config', {
      method: 'PUT',
      headers: { Cookie: admin.cookie },
      body: { mode: 'invite_open', userCodeMaxDays: 7, mailInviteMaxDays: 14 },
    });

    // Nutzer 1 erstellt einen Einladungscode
    const userCodeRes = await env.request('/api/me/invitations', {
      method: 'POST',
      headers: { Cookie: user1.cookie },
      body: { type: 'code', days: 5, note: 'Code für Arbeitskollegen' },
    });
    assert.strictEqual(userCodeRes.status, 200);
    assert.ok(userCodeRes.data.invitation.code);
    const userCode = userCodeRes.data.invitation.code;
    const userCodeId = userCodeRes.data.invitation.id;

    // Nutzer 1 ruft seine Einladungsliste ab
    const myInvs = await env.request('/api/me/invitations', {
      headers: { Cookie: user1.cookie },
    });
    assert.strictEqual(myInvs.status, 200);
    assert.strictEqual(myInvs.data.canInvite, true);
    assert.ok(myInvs.data.invitations.some((i) => i.code === userCode));

    // Kollege registriert sich mit dem Code
    const friendReg = await env.request('/api/register', {
      method: 'POST',
      body: { username: 'colleague_friend', password: 'password123', email: 'colleague@example.com', inviteCode: userCode },
    });
    assert.strictEqual(friendReg.status, 200);

    // Erneuter Registrierungsversuch mit demselben Einmal-Code schlägt fehl
    const friendReg2 = await env.request('/api/register', {
      method: 'POST',
      body: { username: 'colleague_friend2', password: 'password123', email: 'colleague2@example.com', inviteCode: userCode },
    });
    assert.strictEqual(friendReg2.status, 400);

    // Nutzer 1 erstellt E-Mail-Einladung
    const userMailRes = await env.request('/api/me/invitations', {
      method: 'POST',
      headers: { Cookie: user1.cookie },
      body: { type: 'mail', email: 'family_member@example.com', days: 10, note: 'Für Familie' },
    });
    assert.strictEqual(userMailRes.status, 200);
    const familyCode = userMailRes.data.invitation.code;
    const familyInvId = userMailRes.data.invitation.id;

    // Nutzer 1 löscht seine Einladung wieder
    const delRes = await env.request(`/api/me/invitations/${familyInvId}`, {
      method: 'DELETE',
      headers: { Cookie: user1.cookie },
    });
    assert.strictEqual(delRes.status, 200);

    // Gelöschter Code kann nicht mehr verwendet werden
    const familyReg = await env.request('/api/register', {
      method: 'POST',
      body: { username: 'family_member', password: 'password123', email: 'family_member@example.com', inviteCode: familyCode },
    });
    assert.strictEqual(familyReg.status, 400);
    assert.match(familyReg.data.error, /Ungültiger Einladungscode/i);
  });

  // 4. Admin-Verwaltung & Export/Import
  await t.test('Admin-Liste & Backup-Integrität', async () => {
    const adminList = await env.request('/api/admin/registration', {
      headers: { Cookie: admin.cookie },
    });
    assert.strictEqual(adminList.status, 200);
    assert.ok(Array.isArray(adminList.data.invitations));

    // Export aller Daten inklusive Einladungen
    const db = require('../src/db');
    const exported = await db.exportAllData();
    assert.ok(Array.isArray(exported.invitations));
    assert.ok(exported.invitations.length > 0);

    // Re-Import
    await db.importAllData(exported);
    const reloadedInvs = await db.invitations.listAll();
    assert.strictEqual(reloadedInvs.length, exported.invitations.length);
  });
});

test('Registrierungs-Modi & Einladungen: MongoDB Kompatibilität', async (t) => {
  const env = await createMongoTestEnvironment({
    ADMIN_EMAIL: 'admin@example.com',
  });
  t.after(async () => await env.cleanup());

  const admin = await env.createUserAndLogin('admin_mongo', 'adminpass123', 'admin@example.com');
  const user1 = await env.createUserAndLogin('mongo_user1', 'password123', 'user1@example.com');

  // Admin stellt auf invite_open
  const cfgRes = await env.request('/api/admin/registration/config', {
    method: 'PUT',
    headers: { Cookie: admin.cookie },
    body: { mode: 'invite_open', userCodeMaxDays: 7, mailInviteMaxDays: 14 },
  });
  assert.strictEqual(cfgRes.status, 200);

  // User 1 erstellt Einladung
  const invRes = await env.request('/api/me/invitations', {
    method: 'POST',
    headers: { Cookie: user1.cookie },
    body: { type: 'code', days: 7, note: 'Mongo invite' },
  });
  assert.strictEqual(invRes.status, 200);
  const code = invRes.data.invitation.code;

  // Neuer Benutzer registriert sich mit Code
  const regRes = await env.request('/api/register', {
    method: 'POST',
    body: { username: 'mongo_invited', password: 'password123', email: 'invited_mongo@example.com', inviteCode: code },
  });
  assert.strictEqual(regRes.status, 200);

  // Zweite Registrierung mit dem Code schlägt fehl
  const regRes2 = await env.request('/api/register', {
    method: 'POST',
    body: { username: 'mongo_invited2', password: 'password123', email: 'invited_mongo2@example.com', inviteCode: code },
  });
  assert.strictEqual(regRes2.status, 400);

  // Backup Export/Import Test
  const db = require('../src/db');
  const exported = await db.exportAllData();
  assert.ok(Array.isArray(exported.invitations));
  assert.ok(exported.invitations.length > 0);

  await db.importAllData(exported);
  const reloaded = await db.invitations.listAll();
  assert.strictEqual(reloaded.length, exported.invitations.length);
});

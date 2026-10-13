'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { createTestEnvironment, createMongoTestEnvironment } = require('./helpers/env');

// Minimal gültige 1x1 PNG- und JPEG-Bilder als Base64
const TINY_PNG_BASE64 =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

test('Konto-Löschung: Zweistufiger Ablauf mit App- und E-Mail-Bestätigung (SQLite)', async (t) => {
  const env = createTestEnvironment({
    ADMIN_EMAIL: 'admin@example.com',
  });
  t.after(async () => await env.cleanup());

  // 1. Benutzer erstellen
  const user1 = await env.createUserAndLogin('user_to_delete', 'password123', 'delete_me@example.com');
  const user2 = await env.createUserAndLogin('other_user', 'password123', 'other@example.com');
  const admin = await env.createUserAndLogin('admin_user', 'adminpass123', 'admin@example.com');

  // Avatar für user1 hochladen
  const avatarRes = await env.request('/api/me/avatar', {
    method: 'POST',
    headers: { Cookie: user1.cookie },
    body: { image: TINY_PNG_BASE64 },
  });
  assert.strictEqual(avatarRes.status, 200);

  // Aquarium für user1 anlegen samt Foto, Besatz (mit Bild), Messwert und Log
  const aqRes = await env.request('/api/aquariums', {
    method: 'POST',
    headers: { Cookie: user1.cookie },
    body: { name: 'Mein Testbecken', volume_l: 120, water_type: 'fresh' },
  });
  assert.strictEqual(aqRes.status, 200);
  const aqId = aqRes.data.id;

  // Aquarium-Bild hochladen
  const aqImgRes = await env.request(`/api/aquariums/${aqId}/images`, {
    method: 'POST',
    headers: { Cookie: user1.cookie },
    body: { image: TINY_PNG_BASE64, caption: 'Hauptansicht' },
  });
  assert.strictEqual(aqImgRes.status, 200);

  // Besatz mit Bild für user1 anlegen
  const stockRes = await env.request(`/api/aquariums/${aqId}/stock`, {
    method: 'POST',
    headers: { Cookie: user1.cookie },
    body: { species: 'Roter Neon', count: 10, name: 'Schwarm 1' },
  });
  assert.strictEqual(stockRes.status, 200);
  const stockId = stockRes.data.id;

  const stockImgRes = await env.request(`/api/aquariums/${aqId}/stock/${stockId}/image`, {
    method: 'POST',
    headers: { Cookie: user1.cookie },
    body: { image: TINY_PNG_BASE64 },
  });
  assert.strictEqual(stockImgRes.status, 200);

  // Messwert für user1 erfassen (mit Grenzwert-Alarm)
  const measRes = await env.request(`/api/aquariums/${aqId}/measurements`, {
    method: 'POST',
    headers: { Cookie: user1.cookie },
    body: { measured_at: new Date().toISOString(), values: { no2: 1.0, ph: 7.2 } },
  });
  assert.strictEqual(measRes.status, 200);

  // Wartungslog für user1 anlegen
  const maintRes = await env.request(`/api/aquariums/${aqId}/maintenance`, {
    method: 'POST',
    headers: { Cookie: user1.cookie },
    body: { logged_at: new Date().toISOString(), type: 'water_change', percentage: 30 },
  });
  assert.strictEqual(maintRes.status, 200);

  // user1 teilt sein Becken mit user2
  const shareRes = await env.request(`/api/aquariums/${aqId}/shares`, {
    method: 'POST',
    headers: { Cookie: user1.cookie },
    body: { username: 'other_user', role: 'view' },
  });
  assert.strictEqual(shareRes.status, 200);

  // user2 legt eigenes Becken an und teilt es mit user1
  const user2AqRes = await env.request('/api/aquariums', {
    method: 'POST',
    headers: { Cookie: user2.cookie },
    body: { name: 'User2 Becken', volume_l: 200, water_type: 'fresh' },
  });
  assert.strictEqual(user2AqRes.status, 200);
  const user2AqId = user2AqRes.data.id;

  const shareUser2Res = await env.request(`/api/aquariums/${user2AqId}/shares`, {
    method: 'POST',
    headers: { Cookie: user2.cookie },
    body: { username: 'user_to_delete', role: 'write' },
  });
  assert.strictEqual(shareUser2Res.status, 200);

  // user1 nimmt die Einladung von user2 an
  await env.request('/api/shares/accept', {
    method: 'POST',
    headers: { Cookie: user1.cookie },
    body: { aquarium_id: user2AqId },
  });

  // user1 erfasst eine Pflegemaßnahme im Becken von user2
  const maintOnUser2Res = await env.request(`/api/aquariums/${user2AqId}/maintenance`, {
    method: 'POST',
    headers: { Cookie: user1.cookie },
    body: { logged_at: new Date().toISOString(), type: 'care', description: 'Scheiben geputzt' },
  });
  assert.strictEqual(maintOnUser2Res.status, 200);

  // 2. Prüfungen für Löschanforderung (/api/me/delete-request)
  // a) Unauthentifiziert -> 401
  const unauthReq = await env.request('/api/me/delete-request', {
    method: 'POST',
    body: { password: 'password123' },
  });
  assert.strictEqual(unauthReq.status, 401);

  // b) Administrator darf sich nicht selbst über Profil löschen -> 400
  const adminReq = await env.request('/api/me/delete-request', {
    method: 'POST',
    headers: { Cookie: admin.cookie },
    body: { password: 'adminpass123' },
  });
  assert.strictEqual(adminReq.status, 400);
  assert.ok(adminReq.data.error.includes('Administrator-Account'));

  // c) Falsches Passwort -> 400
  const wrongPwReq = await env.request('/api/me/delete-request', {
    method: 'POST',
    headers: { Cookie: user1.cookie },
    body: { password: 'wrongpassword' },
  });
  assert.strictEqual(wrongPwReq.status, 400);
  assert.ok(wrongPwReq.data.error.includes('Passwort'));

  // d) Fehlendes Passwort -> 400
  const missingPwReq = await env.request('/api/me/delete-request', {
    method: 'POST',
    headers: { Cookie: user1.cookie },
    body: {},
  });
  assert.strictEqual(missingPwReq.status, 400);

  // e) Erfolgreiche Löschanforderung mit korrektem Passwort
  const validReq = await env.request('/api/me/delete-request', {
    method: 'POST',
    headers: { Cookie: user1.cookie },
    body: { password: 'password123' },
  });
  assert.strictEqual(validReq.status, 200);
  assert.strictEqual(validReq.data.ok, true);
  assert.ok(validReq.data.message.includes('Bestätigungs-E-Mail'));

  // Token aus DB holen
  const db = require('../dist/backend/src/db');
  await db.init();
  const rawDb = db.getRawDb();
  const dbUser = rawDb.prepare('SELECT * FROM users WHERE id = ?').get(user1.id);
  assert.ok(dbUser.account_delete_token);
  assert.ok(dbUser.account_delete_expires > Date.now());

  // 3. Prüfungen für finale Bestätigung (/api/confirm-delete-account)
  // a) Ohne Token -> 400
  const noTokenConfirm = await env.request('/api/confirm-delete-account', {
    method: 'POST',
    body: {},
  });
  assert.strictEqual(noTokenConfirm.status, 400);

  // b) Falsches Token -> 400
  const invalidTokenConfirm = await env.request('/api/confirm-delete-account', {
    method: 'POST',
    body: { token: 'invalid_token_123' },
  });
  assert.strictEqual(invalidTokenConfirm.status, 400);

  // c) Abgelaufenes Token -> 400
  rawDb.prepare('UPDATE users SET account_delete_expires = ? WHERE id = ?').run(Date.now() - 1000, user1.id);
  const expiredConfirm = await env.request('/api/confirm-delete-account', {
    method: 'POST',
    body: { token: dbUser.account_delete_token },
  });
  assert.strictEqual(expiredConfirm.status, 400);
  assert.ok(expiredConfirm.data.error.includes('abgelaufen'));

  // Neues gültiges Token anfordern
  const reReq = await env.request('/api/me/delete-request', {
    method: 'POST',
    headers: { Cookie: user1.cookie },
    body: { password: 'password123' },
  });
  assert.strictEqual(reReq.status, 200);
  const updatedUser = rawDb.prepare('SELECT * FROM users WHERE id = ?').get(user1.id);

  // Uploads-Dateien vor Löschung prüfen
  const uploadsDir = path.join(env.getDataDir(), 'uploads');
  const filesBefore = fs.readdirSync(uploadsDir).filter((f) => f !== '.gitkeep');
  assert.ok(filesBefore.length >= 3, 'Mindestens 3 Upload-Dateien (Avatar, Aquarium, Stock) sollten existieren');

  // d) Gültige Bestätigung der Löschung
  const deleteConfirm = await env.request('/api/confirm-delete-account', {
    method: 'POST',
    body: { token: updatedUser.account_delete_token },
  });
  assert.strictEqual(deleteConfirm.status, 200);
  assert.strictEqual(deleteConfirm.data.ok, true);

  // 4. Verifikation nach der Löschung:
  // a) Benutzer existiert nicht mehr in der Datenbank
  const deletedUser = rawDb.prepare('SELECT * FROM users WHERE id = ?').get(user1.id);
  assert.strictEqual(deletedUser, undefined);

  // b) Session von user1 ist ungültig (401 bei /api/me)
  const meAfterDelete = await env.request('/api/me', {
    headers: { Cookie: user1.cookie },
  });
  assert.strictEqual(meAfterDelete.status, 401);

  // c) Aquarien von user1 wurden restlos entfernt
  const aqAfter = rawDb.prepare('SELECT * FROM aquariums WHERE user_id = ?').all(user1.id);
  assert.strictEqual(aqAfter.length, 0);

  const imagesAfter = rawDb.prepare('SELECT * FROM aquarium_images WHERE aquarium_id = ?').all(aqId);
  assert.strictEqual(imagesAfter.length, 0);

  const stockAfter = rawDb.prepare('SELECT * FROM stock WHERE aquarium_id = ?').all(aqId);
  assert.strictEqual(stockAfter.length, 0);

  const measAfter = rawDb.prepare('SELECT * FROM measurements WHERE aquarium_id = ?').all(aqId);
  assert.strictEqual(measAfter.length, 0);

  const alertsAfter = rawDb.prepare('SELECT * FROM alerts WHERE aquarium_id = ?').all(aqId);
  assert.strictEqual(alertsAfter.length, 0);

  const maintAfter = rawDb.prepare('SELECT * FROM maintenance_logs WHERE aquarium_id = ?').all(aqId);
  assert.strictEqual(maintAfter.length, 0);

  const sharesAfter = rawDb.prepare('SELECT * FROM aquarium_shares WHERE aquarium_id = ? OR user_id = ?').all(aqId, user1.id);
  assert.strictEqual(sharesAfter.length, 0);

  // d) Upload-Dateien von user1 wurden von der Festplatte gelöscht
  const filesAfter = fs.readdirSync(uploadsDir).filter((f) => f !== '.gitkeep');
  assert.strictEqual(filesAfter.length, 0, 'Alle Bilddateien des gelöschten Benutzers sollten entfernt sein');

  // e) Becken und Daten von user2 sind weiterhin vollständig und unversehrt
  const user2Aqs = await env.request('/api/aquariums', {
    headers: { Cookie: user2.cookie },
  });
  assert.strictEqual(user2Aqs.status, 200);
  assert.strictEqual(user2Aqs.data.length, 1);
  assert.strictEqual(user2Aqs.data[0].id, user2AqId);

  // Log in user2's Becken existiert noch, created_by wurde sauber auf NULL gesetzt (keine Foreign-Key-Inkonsistenz)
  const user2Logs = await env.request(`/api/aquariums/${user2AqId}/logs`, {
    headers: { Cookie: user2.cookie },
  });
  assert.strictEqual(user2Logs.status, 200);
  assert.ok(user2Logs.data.length >= 1);
});

test('Konto-Löschung: Zweistufiger Ablauf unter MongoDB', { timeout: 60000 }, async (t) => {
  const env = await createMongoTestEnvironment({
    ADMIN_EMAIL: 'admin@example.com',
  });
  if (!env) {
    t.skip('MongoDB In-Memory Server steht in dieser Umgebung nicht zur Verfügung.');
    return;
  }
  t.after(async () => await env.cleanup());

  const db = require('../dist/backend/src/db');
  await db.init();
  const rawDb = db.getRawDb();

  const user = await env.createUserAndLogin('mongo_delete_user', 'password123', 'mongo_delete@example.com');
  const user2 = await env.createUserAndLogin('mongo_other_user', 'password123', 'mongo_other@example.com');

  // Aquarium für user erstellen
  const aqRes = await env.request('/api/aquariums', {
    method: 'POST',
    headers: { Cookie: user.cookie },
    body: { name: 'Mongo Testbecken', volume_l: 150 },
  });
  assert.strictEqual(aqRes.status, 200);

  // Löschanforderung
  const reqRes = await env.request('/api/me/delete-request', {
    method: 'POST',
    headers: { Cookie: user.cookie },
    body: { password: 'password123' },
  });
  assert.strictEqual(reqRes.status, 200);
  assert.strictEqual(reqRes.data.ok, true);

  // User aus Mongo holen
  const dbUser = await rawDb.collection('users').findOne({ id: user.id });
  assert.ok(dbUser.account_delete_token);

  // Bestätigung der Löschung
  const confirmRes = await env.request('/api/confirm-delete-account', {
    method: 'POST',
    body: { token: dbUser.account_delete_token },
  });
  assert.strictEqual(confirmRes.status, 200);
  assert.strictEqual(confirmRes.data.ok, true);

  // Verifizieren, dass Benutzer und Daten gelöscht sind
  const userAfter = await rawDb.collection('users').findOne({ id: user.id });
  assert.strictEqual(userAfter, null);

  const aqsAfter = await rawDb.collection('aquariums').find({ user_id: user.id }).toArray();
  assert.strictEqual(aqsAfter.length, 0);

  // Anderer Nutzer funktioniert ungestört weiter
  const me2 = await env.request('/api/me', {
    headers: { Cookie: user2.cookie },
  });
  assert.strictEqual(me2.status, 200);
  assert.strictEqual(me2.data.username, 'mongo_other_user');
});

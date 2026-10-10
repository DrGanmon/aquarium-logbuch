'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { createTestEnvironment } = require('./helpers/env');

// Minimal gültige 1x1 PNG- und JPEG-Bilder als Base64
const TINY_PNG_BASE64 =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

const TINY_JPEG_BASE64 =
  'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=';

test('Benutzerprofil: Abruf, Aktualisierung und Validierung', async (t) => {
  const env = createTestEnvironment();
  t.after(async () => await env.cleanup());

  const user1 = await env.createUserAndLogin('profileuser1', 'password123', 'user1@example.com');
  const user2 = await env.createUserAndLogin('profileuser2', 'password123', 'user2@example.com');

  // 1. Initialer Profilabruf
  const me1 = await env.request('/api/me', {
    headers: { Cookie: user1.cookie },
  });
  assert.strictEqual(me1.status, 200);
  assert.strictEqual(me1.data.username, 'profileuser1');
  assert.strictEqual(me1.data.firstName, '');
  assert.strictEqual(me1.data.lastName, '');
  assert.strictEqual(me1.data.bio, '');
  assert.strictEqual(me1.data.hasAvatar, false);
  assert.strictEqual(me1.data.avatarUrl, null);
  assert.strictEqual(me1.data.email, 'user1@example.com');

  // 2. Profil aktualisieren: Vorname, Nachname, Über mich, Benutzername
  const updateRes = await env.request('/api/me', {
    method: 'PUT',
    headers: { Cookie: user1.cookie },
    body: {
      username: 'max_aquarist',
      firstName: 'Max',
      lastName: 'Mustermann',
      bio: 'Aquaristik-Begeisterter mit 3 Südamerika-Becken.',
      email: 'max.mustermann@example.com',
    },
  });
  assert.strictEqual(updateRes.status, 200);
  assert.strictEqual(updateRes.data.ok, true);
  assert.strictEqual(updateRes.data.user.username, 'max_aquarist');
  assert.strictEqual(updateRes.data.user.firstName, 'Max');
  assert.strictEqual(updateRes.data.user.lastName, 'Mustermann');
  assert.strictEqual(updateRes.data.user.bio, 'Aquaristik-Begeisterter mit 3 Südamerika-Becken.');
  assert.strictEqual(updateRes.data.user.email, 'max.mustermann@example.com');

  // 3. Erneuter Abruf /api/me zur Bestätigung der Persistenz
  const meUpdated = await env.request('/api/me', {
    headers: { Cookie: user1.cookie },
  });
  assert.strictEqual(meUpdated.status, 200);
  assert.strictEqual(meUpdated.data.username, 'max_aquarist');
  assert.strictEqual(meUpdated.data.firstName, 'Max');
  assert.strictEqual(meUpdated.data.lastName, 'Mustermann');
  assert.strictEqual(meUpdated.data.bio, 'Aquaristik-Begeisterter mit 3 Südamerika-Becken.');
  assert.strictEqual(meUpdated.data.email, 'max.mustermann@example.com');

  // 4. Validierungsfehler: Zu kurzer Benutzername
  const badNameRes = await env.request('/api/me', {
    method: 'PUT',
    headers: { Cookie: user1.cookie },
    body: { username: 'ab' },
  });
  assert.strictEqual(badNameRes.status, 400);

  // 5. Validierungsfehler: Ungültige Zeichen im Benutzernamen
  const invalidCharRes = await env.request('/api/me', {
    method: 'PUT',
    headers: { Cookie: user1.cookie },
    body: { username: 'max@bad!' },
  });
  assert.strictEqual(invalidCharRes.status, 400);

  // 6. Validierungsfehler: Ungültige E-Mail-Adresse
  const badEmailRes = await env.request('/api/me', {
    method: 'PUT',
    headers: { Cookie: user1.cookie },
    body: { username: 'max_aquarist', email: 'not-an-email' },
  });
  assert.strictEqual(badEmailRes.status, 400);

  // 7. Konflikt: Bereits vergebener Benutzername von user2
  const dupNameRes = await env.request('/api/me', {
    method: 'PUT',
    headers: { Cookie: user1.cookie },
    body: { username: 'profileuser2' },
  });
  assert.strictEqual(dupNameRes.status, 409);

  // 8. Konflikt: Bereits vergebene E-Mail von user2
  const dupEmailRes = await env.request('/api/me', {
    method: 'PUT',
    headers: { Cookie: user1.cookie },
    body: { username: 'max_aquarist', email: 'USER2@example.com' },
  });
  assert.strictEqual(dupEmailRes.status, 409);
});

test('Benutzerprofil: Profilbild Upload, Anzeige, Austausch und Löschung', async (t) => {
  const env = createTestEnvironment();
  t.after(async () => await env.cleanup());

  const user = await env.createUserAndLogin('avatartest', 'password123');
  const user2 = await env.createUserAndLogin('avatar_viewer', 'password123');

  // 1. Vor dem Upload: /api/me/avatar liefert 404
  const noAvatarRes = await env.request('/api/me/avatar', {
    headers: { Cookie: user.cookie },
  });
  assert.strictEqual(noAvatarRes.status, 404);

  // 2. Ungültige Bilddaten abweisen
  const badImageRes = await env.request('/api/me/avatar', {
    method: 'POST',
    headers: { Cookie: user.cookie },
    body: { image: 'data:image/png;base64,ungueltigeDaten' },
  });
  assert.strictEqual(badImageRes.status, 400);

  // 3. PNG-Profilbild erfolgreich hochladen
  const uploadPngRes = await env.request('/api/me/avatar', {
    method: 'POST',
    headers: { Cookie: user.cookie },
    body: { image: TINY_PNG_BASE64 },
  });
  assert.strictEqual(uploadPngRes.status, 200);
  assert.strictEqual(uploadPngRes.data.ok, true);

  // 4. Profilstatus prüfen
  const meAfterUpload = await env.request('/api/me', {
    headers: { Cookie: user.cookie },
  });
  assert.strictEqual(meAfterUpload.data.hasAvatar, true);
  assert.ok(meAfterUpload.data.avatarUrl);

  // 5. Eigenes Profilbild abrufen
  const getAvatarRes = await env.request('/api/me/avatar', {
    headers: { Cookie: user.cookie },
  });
  assert.strictEqual(getAvatarRes.status, 200);
  assert.strictEqual(getAvatarRes.headers.get('content-type'), 'image/png');

  // 6. Profilbild eines anderen Nutzers über /api/users/:id/avatar abrufen
  const otherViewRes = await env.request(`/api/users/${user.id}/avatar`, {
    headers: { Cookie: user2.cookie },
  });
  assert.strictEqual(otherViewRes.status, 200);
  assert.strictEqual(otherViewRes.headers.get('content-type'), 'image/png');

  // 7. Profilbild austauschen (JPEG hochladen) -> Altes Bild auf Disk wird ersetzt
  const uploadsDir = path.join(env.getDataDir(), 'uploads');
  const filesBefore = fs.readdirSync(uploadsDir);
  assert.strictEqual(filesBefore.length, 1);
  const oldFileName = filesBefore[0];

  const uploadJpgRes = await env.request('/api/me/avatar', {
    method: 'POST',
    headers: { Cookie: user.cookie },
    body: { image: TINY_JPEG_BASE64 },
  });
  assert.strictEqual(uploadJpgRes.status, 200);

  const filesAfter = fs.readdirSync(uploadsDir);
  assert.strictEqual(filesAfter.length, 1);
  assert.notStrictEqual(filesAfter[0], oldFileName);

  const getJpgRes = await env.request('/api/me/avatar', {
    headers: { Cookie: user.cookie },
  });
  assert.strictEqual(getJpgRes.status, 200);
  assert.strictEqual(getJpgRes.headers.get('content-type'), 'image/jpeg');

  // 8. Profilbild löschen
  const deleteRes = await env.request('/api/me/avatar', {
    method: 'DELETE',
    headers: { Cookie: user.cookie },
  });
  assert.strictEqual(deleteRes.status, 200);
  assert.strictEqual(deleteRes.data.ok, true);

  // Datei auf Disk ist gelöscht
  assert.strictEqual(fs.readdirSync(uploadsDir).length, 0);

  // Nach Löschung: /api/me/avatar liefert 404
  const afterDeleteRes = await env.request('/api/me/avatar', {
    headers: { Cookie: user.cookie },
  });
  assert.strictEqual(afterDeleteRes.status, 404);

  const meAfterDelete = await env.request('/api/me', {
    headers: { Cookie: user.cookie },
  });
  assert.strictEqual(meAfterDelete.data.hasAvatar, false);
  assert.strictEqual(meAfterDelete.data.avatarUrl, null);
});

test('Benutzerprofil: Schutz vor unauthentifiziertem Zugriff', async (t) => {
  const env = createTestEnvironment();
  t.after(async () => await env.cleanup());

  const getMe = await env.request('/api/me');
  assert.strictEqual(getMe.status, 401);

  const putMe = await env.request('/api/me', {
    method: 'PUT',
    body: { firstName: 'Hacker' },
  });
  assert.strictEqual(putMe.status, 401);

  const getAvatar = await env.request('/api/me/avatar');
  assert.strictEqual(getAvatar.status, 401);

  const postAvatar = await env.request('/api/me/avatar', {
    method: 'POST',
    body: { image: TINY_PNG_BASE64 },
  });
  assert.strictEqual(postAvatar.status, 401);

  const deleteAvatar = await env.request('/api/me/avatar', {
    method: 'DELETE',
  });
  assert.strictEqual(deleteAvatar.status, 401);
});

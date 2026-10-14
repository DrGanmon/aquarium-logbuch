'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
require('fs');
require('path');
const { createTestEnvironment } = require('./helpers/env');

test('Aquarium-Bilder: Upload, Anzeige, Formate, Validierung und Löschen', async (t) => {
  const env = createTestEnvironment();
  t.after(async () => await env.cleanup());

  const user = await env.createUserAndLogin('img_user', 'password123', 'img@test.local');

  // Aquarium erstellen
  const createAq = await env.request('/api/aquariums', {
    method: 'POST',
    headers: { Cookie: user.cookie },
    body: { name: 'Foto-Becken', water_type: 'fresh', volume_l: 250 },
  });
  assert.strictEqual(createAq.status, 200);
  const aqId = createAq.data.id;

  // 1. Zunächst kein Bild -> 404
  const getImgNone = await env.request(`/api/aquariums/${aqId}/image`, {
    headers: { Cookie: user.cookie },
  });
  assert.strictEqual(getImgNone.status, 404);

  // 2. Gültiges 1x1 PNG als Base64
  const pngBase64 =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  const uploadPng = await env.request(`/api/aquariums/${aqId}/image`, {
    method: 'POST',
    headers: { Cookie: user.cookie },
    body: { image: pngBase64 },
  });
  assert.strictEqual(uploadPng.status, 200);
  assert.strictEqual(uploadPng.data.ok, true);

  // 3. Bild abrufen
  const getPng = await env.request(`/api/aquariums/${aqId}/image`, {
    headers: { Cookie: user.cookie },
  });
  assert.strictEqual(getPng.status, 200);
  assert.strictEqual(getPng.headers.get('content-type'), 'image/png');

  // In der Aquarienübersicht prüfen
  const getAqDetail = await env.request(`/api/aquariums/${aqId}`, {
    headers: { Cookie: user.cookie },
  });
  assert.strictEqual(getAqDetail.status, 200);
  assert.strictEqual(getAqDetail.data.aquarium.has_image, true);
  assert.ok(getAqDetail.data.aquarium.image_url.includes(`aquariums/${aqId}/image`));

  // 4. Ungültiges Bildformat (Textdatei als Base64) -> 400
  const invalidBase64 = 'data:image/png;base64,' + Buffer.from('Dies ist kein Bild').toString('base64');
  const uploadInvalid = await env.request(`/api/aquariums/${aqId}/image`, {
    method: 'POST',
    headers: { Cookie: user.cookie },
    body: { image: invalidBase64 },
  });
  assert.strictEqual(uploadInvalid.status, 400);

  // 5. Zu großes Bild (> 5 MB) -> 400
  const bigBuffer = Buffer.alloc(5.2 * 1024 * 1024, 0xff);
  // PNG Magic bytes am Anfang
  bigBuffer[0] = 0x89;
  bigBuffer[1] = 0x50;
  bigBuffer[2] = 0x4e;
  bigBuffer[3] = 0x47;
  const bigBase64 = 'data:image/png;base64,' + bigBuffer.toString('base64');
  const uploadBig = await env.request(`/api/aquariums/${aqId}/image`, {
    method: 'POST',
    headers: { Cookie: user.cookie },
    body: { image: bigBase64 },
  });
  assert.strictEqual(uploadBig.status, 400);

  // 6. Gültiges JPEG hochladen (Ersetzen des alten Bildes)
  const jpegBuffer = Buffer.from([
    0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x01, 0x00, 0x48, 0x00, 0x48, 0x00, 0x00,
    0xff, 0xdb, 0x00, 0x43, 0x00, 0x08, 0x06, 0x06, 0x07, 0x06, 0x05, 0x08, 0x07, 0x07, 0x07, 0x09, 0x09, 0x08, 0x0a, 0x0c,
    0x14, 0x0d, 0x0c, 0x0b, 0x0b, 0x0c, 0x19, 0x12, 0x13, 0x0f, 0x14, 0x1d, 0x1a, 0x1f, 0x1e, 0x1d, 0x1a, 0x1c, 0x1c, 0x20,
    0x24, 0x2e, 0x27, 0x20, 0x22, 0x2c, 0x23, 0x1c, 0x1c, 0x28, 0x37, 0x29, 0x2c, 0x30, 0x31, 0x34, 0x34, 0x34, 0x1f, 0x27,
    0x39, 0x3d, 0x38, 0x32, 0x3c, 0x2e, 0x33, 0x34, 0x32, 0xff, 0xc0, 0x00, 0x0b, 0x08, 0x00, 0x01, 0x00, 0x01, 0x01, 0x01,
    0x11, 0x00, 0xff, 0xc4, 0x00, 0x1f, 0x00, 0x00, 0x01, 0x05, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0a, 0x0b, 0xff, 0xda, 0x00, 0x08, 0x01,
    0x01, 0x00, 0x00, 0x3f, 0x00, 0xbf, 0x00, 0xff, 0xd9,
  ]);
  const uploadJpeg = await env.request(`/api/aquariums/${aqId}/image`, {
    method: 'POST',
    headers: { Cookie: user.cookie },
    body: { image: 'data:image/jpeg;base64,' + jpegBuffer.toString('base64') },
  });
  assert.strictEqual(uploadJpeg.status, 200);

  const getJpeg = await env.request(`/api/aquariums/${aqId}/image`, {
    headers: { Cookie: user.cookie },
  });
  assert.strictEqual(getJpeg.status, 200);
  assert.strictEqual(getJpeg.headers.get('content-type'), 'image/jpeg');

  // 7. Bild explizit löschen
  const delImg = await env.request(`/api/aquariums/${aqId}/image`, {
    method: 'DELETE',
    headers: { Cookie: user.cookie },
  });
  assert.strictEqual(delImg.status, 200);

  const getAfterDel = await env.request(`/api/aquariums/${aqId}/image`, {
    headers: { Cookie: user.cookie },
  });
  assert.strictEqual(getAfterDel.status, 404);
});

test('Aquarien teilen: Berechtigungen (view vs. write), Freigabe-Verwaltung und Isolation', async (t) => {
  const env = createTestEnvironment();
  t.after(async () => await env.cleanup());

  const owner = await env.createUserAndLogin('owner_anna', 'passwordAnna123', 'anna@test.local');
  const viewer = await env.createUserAndLogin('reader_ben', 'passwordBen123', 'ben@test.local');
  const stranger = await env.createUserAndLogin('stranger_clara', 'passwordClara123', 'clara@test.local');

  // Owner erstellt Aquarium
  const createAq = await env.request('/api/aquariums', {
    method: 'POST',
    headers: { Cookie: owner.cookie },
    body: { name: 'Gemeinsames Korallenbecken', water_type: 'salt', volume_l: 500, reminder_days: 7 },
  });
  assert.strictEqual(createAq.status, 200);
  const aqId = createAq.data.id;

  // Bild hochladen
  const pngBase64 =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  await env.request(`/api/aquariums/${aqId}/image`, {
    method: 'POST',
    headers: { Cookie: owner.cookie },
    body: { image: pngBase64 },
  });

  // Vor Freigabe: Ben und Clara sehen das Aquarium nicht (404)
  const getBefore = await env.request(`/api/aquariums/${aqId}`, { headers: { Cookie: viewer.cookie } });
  assert.strictEqual(getBefore.status, 404);

  // 1. Ungültige Freigabe-Versuche durch Owner
  const shareNonExistent = await env.request(`/api/aquariums/${aqId}/shares`, {
    method: 'POST',
    headers: { Cookie: owner.cookie },
    body: { username: 'unbekannter_user', role: 'view' },
  });
  assert.strictEqual(shareNonExistent.status, 404);

  const shareSelf = await env.request(`/api/aquariums/${aqId}/shares`, {
    method: 'POST',
    headers: { Cookie: owner.cookie },
    body: { username: 'owner_anna', role: 'view' },
  });
  assert.strictEqual(shareSelf.status, 400);

  // 2. Owner teilt Aquarium mit Ben (Rolle: view) -> erzeugt Einladung (Status pending)
  const shareWithBen = await env.request(`/api/aquariums/${aqId}/shares`, {
    method: 'POST',
    headers: { Cookie: owner.cookie },
    body: { usernameOrEmail: 'ben@test.local', role: 'view' },
  });
  assert.strictEqual(shareWithBen.status, 200);
  assert.strictEqual(shareWithBen.data.role, 'view');
  assert.strictEqual(shareWithBen.data.username, 'reader_ben');
  assert.strictEqual(shareWithBen.data.status, 'pending');
  assert.ok(shareWithBen.data.token, 'Token sollte generiert worden sein');
  const inviteToken = shareWithBen.data.token;

  // Freigabeliste abrufen: Owner sieht Ausstehend-Status
  const listShares = await env.request(`/api/aquariums/${aqId}/shares`, {
    headers: { Cookie: owner.cookie },
  });
  assert.strictEqual(listShares.status, 200);
  assert.strictEqual(listShares.data.length, 1);
  assert.strictEqual(listShares.data[0].username, 'reader_ben');
  assert.strictEqual(listShares.data[0].role, 'view');
  assert.strictEqual(listShares.data[0].status, 'pending');

  // Vor Annahme: Ben sieht das geteilte Aquarium NICHT in seiner Liste und darf es nicht abrufen (404)
  const listBeforeAccept = await env.request('/api/aquariums', { headers: { Cookie: viewer.cookie } });
  assert.strictEqual(listBeforeAccept.status, 200);
  assert.strictEqual(listBeforeAccept.data.length, 0);

  const getBeforeAccept = await env.request(`/api/aquariums/${aqId}`, { headers: { Cookie: viewer.cookie } });
  assert.strictEqual(getBeforeAccept.status, 404);

  // Ben sieht die ausstehende Einladung in /api/shares/pending
  const pendingBen = await env.request('/api/shares/pending', { headers: { Cookie: viewer.cookie } });
  assert.strictEqual(pendingBen.status, 200);
  assert.strictEqual(pendingBen.data.length, 1);
  assert.strictEqual(pendingBen.data[0].aquarium_id, aqId);
  assert.strictEqual(pendingBen.data[0].owner_username, 'owner_anna');

  // Token-Details prüfen
  const checkToken = await env.request(`/api/shares/invite/${inviteToken}`);
  assert.strictEqual(checkToken.status, 200);
  assert.strictEqual(checkToken.data.valid, true);
  assert.strictEqual(checkToken.data.aquarium_name, 'Gemeinsames Korallenbecken');
  assert.strictEqual(checkToken.data.owner_username, 'owner_anna');

  // 3. Ben nimmt die Einladung an (POST /api/shares/accept)
  const acceptRes = await env.request('/api/shares/accept', {
    method: 'POST',
    headers: { Cookie: viewer.cookie },
    body: { token: inviteToken },
  });
  assert.strictEqual(acceptRes.status, 200);
  assert.strictEqual(acceptRes.data.ok, true);

  // 4. Nach Annahme: Ben sieht das Aquarium in seiner Übersicht
  const listBen = await env.request('/api/aquariums', { headers: { Cookie: viewer.cookie } });
  assert.strictEqual(listBen.status, 200);
  assert.strictEqual(listBen.data.length, 1);
  assert.strictEqual(listBen.data[0].id, aqId);
  assert.strictEqual(listBen.data[0].role, 'view');
  assert.strictEqual(listBen.data[0].owner_username, 'owner_anna');
  assert.strictEqual(listBen.data[0].has_image, true);

  // 5. Ben kann Aquarium, Bild und Messungen lesen
  const viewAqBen = await env.request(`/api/aquariums/${aqId}`, { headers: { Cookie: viewer.cookie } });
  assert.strictEqual(viewAqBen.status, 200);
  assert.strictEqual(viewAqBen.data.role, 'view');

  const viewImgBen = await env.request(`/api/aquariums/${aqId}/image`, { headers: { Cookie: viewer.cookie } });
  assert.strictEqual(viewImgBen.status, 200);

  // 6. Ben (view) darf NICHT schreiben -> 403 auf alle Schreiboperationen
  const putAqBen = await env.request(`/api/aquariums/${aqId}`, {
    method: 'PUT',
    headers: { Cookie: viewer.cookie },
    body: { name: 'Geändert von Ben' },
  });
  assert.strictEqual(putAqBen.status, 403);

  const delAqBen = await env.request(`/api/aquariums/${aqId}`, {
    method: 'DELETE',
    headers: { Cookie: viewer.cookie },
  });
  assert.strictEqual(delAqBen.status, 403);

  const addStockBen = await env.request(`/api/aquariums/${aqId}/stock`, {
    method: 'POST',
    headers: { Cookie: viewer.cookie },
    body: { species: 'Anemonenfisch', count: 2 },
  });
  assert.strictEqual(addStockBen.status, 403);

  const addMeasBen = await env.request(`/api/aquariums/${aqId}/measurements`, {
    method: 'POST',
    headers: { Cookie: viewer.cookie },
    body: { values: { temp: 25.5, salin: 35.0 } },
  });
  assert.strictEqual(addMeasBen.status, 403);

  const delImgBen = await env.request(`/api/aquariums/${aqId}/image`, {
    method: 'DELETE',
    headers: { Cookie: viewer.cookie },
  });
  assert.strictEqual(delImgBen.status, 403);

  const manageSharesBen = await env.request(`/api/aquariums/${aqId}/shares`, {
    headers: { Cookie: viewer.cookie },
  });
  assert.strictEqual(manageSharesBen.status, 403);

  // 6. Owner stuft Ben auf 'write' hoch
  const updateShareBen = await env.request(`/api/aquariums/${aqId}/shares`, {
    method: 'POST',
    headers: { Cookie: owner.cookie },
    body: { username: 'reader_ben', role: 'write' },
  });
  assert.strictEqual(updateShareBen.status, 200);
  assert.strictEqual(updateShareBen.data.role, 'write');

  // 7. Ben (write) kann nun schreiben: Besatz, Messungen, Alarme
  const addStockWrite = await env.request(`/api/aquariums/${aqId}/stock`, {
    method: 'POST',
    headers: { Cookie: viewer.cookie },
    body: { species: 'Garnelen', count: 10, profile: 'wirbellose' },
  });
  assert.strictEqual(addStockWrite.status, 200);
  const stockId = addStockWrite.data.id;

  const addMeasWrite = await env.request(`/api/aquariums/${aqId}/measurements`, {
    method: 'POST',
    headers: { Cookie: viewer.cookie },
    body: { values: { no2: 1.5 } }, // Löst Alarm aus
  });
  assert.strictEqual(addMeasWrite.status, 200);
  const measId = addMeasWrite.data.id;

  // Alarm quittieren als write-User
  const ackAlert = await env.request(`/api/aquariums/${aqId}/alerts/ack`, {
    method: 'POST',
    headers: { Cookie: viewer.cookie },
    body: {},
  });
  assert.strictEqual(ackAlert.status, 200);

  // Messung löschen als write-User
  const delMeas = await env.request(`/api/aquariums/${aqId}/measurements/${measId}`, {
    method: 'DELETE',
    headers: { Cookie: viewer.cookie },
  });
  assert.strictEqual(delMeas.status, 200);

  // Besatz löschen als write-User
  const delStock = await env.request(`/api/aquariums/${aqId}/stock/${stockId}`, {
    method: 'DELETE',
    headers: { Cookie: viewer.cookie },
  });
  assert.strictEqual(delStock.status, 200);

  // Ben (write) darf trotzdem NICHT das gesamte Aquarium löschen oder Freigaben Dritter verwalten
  const delAqWrite = await env.request(`/api/aquariums/${aqId}`, {
    method: 'DELETE',
    headers: { Cookie: viewer.cookie },
  });
  assert.strictEqual(delAqWrite.status, 403);

  const manageSharesWrite = await env.request(`/api/aquariums/${aqId}/shares`, {
    method: 'POST',
    headers: { Cookie: viewer.cookie },
    body: { username: 'stranger_clara', role: 'view' },
  });
  assert.strictEqual(manageSharesWrite.status, 403);

  // 8. Dritter (Clara, nicht freigegeben) hat keinerlei Zugriff -> 404
  const getClara = await env.request(`/api/aquariums/${aqId}`, { headers: { Cookie: stranger.cookie } });
  assert.strictEqual(getClara.status, 404);

  const imgClara = await env.request(`/api/aquariums/${aqId}/image`, { headers: { Cookie: stranger.cookie } });
  assert.strictEqual(imgClara.status, 404);

  // 9. Ben verlässt die Freigabe selbst (DELETE /api/aquariums/:id/shares/:userId mit eigener ID)
  const leaveShare = await env.request(`/api/aquariums/${aqId}/shares/${viewer.id}`, {
    method: 'DELETE',
    headers: { Cookie: viewer.cookie },
  });
  assert.strictEqual(leaveShare.status, 200);

  // Nach dem Verlassen hat Ben keinen Zugriff mehr -> 404
  const getAfterLeave = await env.request(`/api/aquariums/${aqId}`, { headers: { Cookie: viewer.cookie } });
  assert.strictEqual(getAfterLeave.status, 404);
});

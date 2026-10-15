'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createTestEnvironment } = require('./helpers/env');

const samplePngBase64 =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

const sampleJpegBase64 =
  'data:image/jpeg;base64,' +
  Buffer.from([
    0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x01, 0x00, 0x48, 0x00, 0x48, 0x00, 0x00,
    0xff, 0xdb, 0x00, 0x43, 0x00, 0x08, 0x06, 0x06, 0x07, 0x06, 0x05, 0x08, 0x07, 0x07, 0x07, 0x09, 0x09, 0x08, 0x0a, 0x0c,
    0x14, 0x0d, 0x0c, 0x0b, 0x0b, 0x0c, 0x19, 0x12, 0x13, 0x0f, 0x14, 0x1d, 0x1a, 0x1f, 0x1e, 0x1d, 0x1a, 0x1c, 0x1c, 0x20,
    0x24, 0x2e, 0x27, 0x20, 0x22, 0x2c, 0x23, 0x1c, 0x1c, 0x28, 0x37, 0x29, 0x2c, 0x30, 0x31, 0x34, 0x34, 0x34, 0x1f, 0x27,
    0x39, 0x3d, 0x38, 0x32, 0x3c, 0x2e, 0x33, 0x34, 0x32, 0xff, 0xc0, 0x00, 0x0b, 0x08, 0x00, 0x01, 0x00, 0x01, 0x01, 0x01,
    0x11, 0x00, 0xff, 0xc4, 0x00, 0x1f, 0x00, 0x00, 0x01, 0x05, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0a, 0x0b, 0xff, 0xda, 0x00, 0x08, 0x01,
    0x01, 0x00, 0x00, 0x3f, 0x00, 0xbf, 0x00, 0xff, 0xd9,
  ]).toString('base64');

test('Aquarium: Motto und generelle Beschreibung anlegen, abrufen und aktualisieren', async (t) => {
  const env = createTestEnvironment();
  t.after(async () => await env.cleanup());

  const user = await env.createUserAndLogin('aquarist', 'password123', 'aquarist@test.local');

  // 1. Aquarium mit Motto und ausführlicher Beschreibung anlegen
  const createRes = await env.request('/api/aquariums', {
    method: 'POST',
    headers: { Cookie: user.cookie },
    body: {
      name: 'Naturaquarium 120P',
      motto: 'Grüne Oase im Wohnzimmer',
      description: 'Iwagumi-Layout mit Seiryu-Steinen, feinem Sand und dichter Eleocharis-Bepflanzung. CO2-Düngung 30 mg/l.',
      water_type: 'fresh',
      volume_l: 300,
      reminder_days: 7,
      notes: 'Wöchentlicher Wasserwechsel empfohlen.',
    },
  });
  assert.strictEqual(createRes.status, 200);
  const aqId = createRes.data.id;

  // 2. Aquarium Details abrufen
  const detailRes = await env.request(`/api/aquariums/${aqId}`, {
    headers: { Cookie: user.cookie },
  });
  assert.strictEqual(detailRes.status, 200);
  assert.strictEqual(detailRes.data.aquarium.name, 'Naturaquarium 120P');
  assert.strictEqual(detailRes.data.aquarium.motto, 'Grüne Oase im Wohnzimmer');
  assert.strictEqual(
    detailRes.data.aquarium.description,
    'Iwagumi-Layout mit Seiryu-Steinen, feinem Sand und dichter Eleocharis-Bepflanzung. CO2-Düngung 30 mg/l.'
  );

  // 3. Aquarium Liste abrufen
  const listRes = await env.request('/api/aquariums', {
    headers: { Cookie: user.cookie },
  });
  assert.strictEqual(listRes.status, 200);
  const aqInList = listRes.data.find((a) => a.id === aqId);
  assert.ok(aqInList);
  assert.strictEqual(aqInList.motto, 'Grüne Oase im Wohnzimmer');
  assert.strictEqual(aqInList.description, 'Iwagumi-Layout mit Seiryu-Steinen, feinem Sand und dichter Eleocharis-Bepflanzung. CO2-Düngung 30 mg/l.');

  // 4. Motto & Beschreibung aktualisieren
  const updateRes = await env.request(`/api/aquariums/${aqId}`, {
    method: 'PUT',
    headers: { Cookie: user.cookie },
    body: {
      name: 'Naturaquarium 120P (Aktualisiert)',
      motto: 'Fließender Bergbach',
      description: 'Umbau zu Ryoboku-Style mit Moorkienwurzeln und Farnen.',
      water_type: 'fresh',
      volume_l: 300,
      reminder_days: 14,
    },
  });
  assert.strictEqual(updateRes.status, 200);

  const detailUpdated = await env.request(`/api/aquariums/${aqId}`, {
    headers: { Cookie: user.cookie },
  });
  assert.strictEqual(detailUpdated.status, 200);
  assert.strictEqual(detailUpdated.data.aquarium.name, 'Naturaquarium 120P (Aktualisiert)');
  assert.strictEqual(detailUpdated.data.aquarium.motto, 'Fließender Bergbach');
  assert.strictEqual(detailUpdated.data.aquarium.description, 'Umbau zu Ryoboku-Style mit Moorkienwurzeln und Farnen.');
});

test('Aquarium-Bildergalerie: Mehrere Bilder hochladen, anzeigen, als Titelbild festlegen, Bildunterschriften und Löschen', async (t) => {
  const env = createTestEnvironment();
  t.after(async () => await env.cleanup());

  const user = await env.createUserAndLogin('gallery_owner', 'password123', 'gallery@test.local');
  const viewer = await env.createUserAndLogin('gallery_viewer', 'password123', 'viewer@test.local');

  // Aquarium anlegen
  const createAq = await env.request('/api/aquariums', {
    method: 'POST',
    headers: { Cookie: user.cookie },
    body: { name: 'Galerie-Becken', water_type: 'fresh', volume_l: 200 },
  });
  const aqId = createAq.data.id;

  // Für Viewer mit 'view' freigeben und annehmen
  await env.request(`/api/aquariums/${aqId}/shares`, {
    method: 'POST',
    headers: { Cookie: user.cookie },
    body: { username: 'gallery_viewer', role: 'view' },
  });
  await env.request('/api/shares/accept', {
    method: 'POST',
    headers: { Cookie: viewer.cookie },
    body: { aquarium_id: aqId },
  });

  // 1. Zunächst keine Bilder
  const initialImages = await env.request(`/api/aquariums/${aqId}/images`, {
    headers: { Cookie: user.cookie },
  });
  assert.strictEqual(initialImages.status, 200);
  assert.strictEqual(initialImages.data.length, 0);

  // 2. Erstes Bild hochladen (automatisch primär)
  const upload1 = await env.request(`/api/aquariums/${aqId}/images`, {
    method: 'POST',
    headers: { Cookie: user.cookie },
    body: {
      image: samplePngBase64,
      caption: 'Frontalansicht Tag 1',
    },
  });
  assert.strictEqual(upload1.status, 200);
  assert.strictEqual(upload1.data.ok, true);
  assert.strictEqual(upload1.data.caption, 'Frontalansicht Tag 1');
  assert.strictEqual(upload1.data.is_primary, true);
  const img1Id = upload1.data.id;

  // 3. Zweites Bild hochladen (als JPEG)
  const upload2 = await env.request(`/api/aquariums/${aqId}/images`, {
    method: 'POST',
    headers: { Cookie: user.cookie },
    body: {
      image: sampleJpegBase64,
      caption: 'Seitenansicht mit Bepflanzung',
      is_primary: false,
    },
  });
  assert.strictEqual(upload2.status, 200);
  const img2Id = upload2.data.id;
  assert.strictEqual(upload2.data.is_primary, false);

  // 4. Drittes Bild hochladen (direkt als primär)
  const upload3 = await env.request(`/api/aquariums/${aqId}/images`, {
    method: 'POST',
    headers: { Cookie: user.cookie },
    body: {
      image: samplePngBase64,
      caption: 'Detailaufnahme Hardscape',
      is_primary: true,
    },
  });
  assert.strictEqual(upload3.status, 200);
  const img3Id = upload3.data.id;
  assert.strictEqual(upload3.data.is_primary, true);

  // 5. Bilderliste abrufen (auch für Viewer)
  const getImagesViewer = await env.request(`/api/aquariums/${aqId}/images`, {
    headers: { Cookie: viewer.cookie },
  });
  assert.strictEqual(getImagesViewer.status, 200);
  assert.strictEqual(getImagesViewer.data.length, 3);
  // Sortierung: primäres Bild zuerst
  assert.strictEqual(getImagesViewer.data[0].id, img3Id);
  assert.strictEqual(getImagesViewer.data[0].is_primary, true);

  // 6. Einzelne Bilddateien abrufen
  const getImageFile1 = await env.request(`/api/aquariums/${aqId}/images/${img1Id}`, {
    headers: { Cookie: viewer.cookie },
  });
  assert.strictEqual(getImageFile1.status, 200);
  assert.strictEqual(getImageFile1.headers.get('content-type'), 'image/png');

  const getImageFile2 = await env.request(`/api/aquariums/${aqId}/images/${img2Id}`, {
    headers: { Cookie: viewer.cookie },
  });
  assert.strictEqual(getImageFile2.status, 200);
  assert.strictEqual(getImageFile2.headers.get('content-type'), 'image/jpeg');

  // 7. Bildunterschrift aktualisieren
  const updateCap = await env.request(`/api/aquariums/${aqId}/images/${img2Id}`, {
    method: 'PUT',
    headers: { Cookie: user.cookie },
    body: { caption: 'Aktualisierte Seitenansicht Woche 4' },
  });
  assert.strictEqual(updateCap.status, 200);

  // 8. Bild 2 als Titelbild setzen
  const setPrimary = await env.request(`/api/aquariums/${aqId}/images/${img2Id}/primary`, {
    method: 'PUT',
    headers: { Cookie: user.cookie },
  });
  assert.strictEqual(setPrimary.status, 200);

  const imagesAfterPrimary = await env.request(`/api/aquariums/${aqId}/images`, {
    headers: { Cookie: user.cookie },
  });
  assert.strictEqual(imagesAfterPrimary.data[0].id, img2Id);
  assert.strictEqual(imagesAfterPrimary.data[0].is_primary, true);

  // 9. Viewer darf keine Bilder ändern oder löschen (403)
  const viewerDelete = await env.request(`/api/aquariums/${aqId}/images/${img1Id}`, {
    method: 'DELETE',
    headers: { Cookie: viewer.cookie },
  });
  assert.strictEqual(viewerDelete.status, 403);

  // 10. Bild löschen durch Owner
  const deleteImg3 = await env.request(`/api/aquariums/${aqId}/images/${img3Id}`, {
    method: 'DELETE',
    headers: { Cookie: user.cookie },
  });
  assert.strictEqual(deleteImg3.status, 200);

  const imagesAfterDelete = await env.request(`/api/aquariums/${aqId}/images`, {
    headers: { Cookie: user.cookie },
  });
  assert.strictEqual(imagesAfterDelete.data.length, 2);
  assert.ok(!imagesAfterDelete.data.some((img) => img.id === img3Id));
});

test('Besatz & Bewohner: Namen vergeben, Porträtfotos hochladen, anzeigen, bearbeiten und löschen', async (t) => {
  const env = createTestEnvironment();
  t.after(async () => await env.cleanup());

  const user = await env.createUserAndLogin('fish_owner', 'password123', 'fish@test.local');
  const viewer = await env.createUserAndLogin('fish_viewer', 'password123', 'fviewer@test.local');

  const createAq = await env.request('/api/aquariums', {
    method: 'POST',
    headers: { Cookie: user.cookie },
    body: { name: 'Kampffisch-Reich', water_type: 'fresh', volume_l: 60 },
  });
  const aqId = createAq.data.id;

  // Freigabe für Viewer und annehmen
  await env.request(`/api/aquariums/${aqId}/shares`, {
    method: 'POST',
    headers: { Cookie: user.cookie },
    body: { username: 'fish_viewer', role: 'view' },
  });
  await env.request('/api/shares/accept', {
    method: 'POST',
    headers: { Cookie: viewer.cookie },
    body: { aquarium_id: aqId },
  });

  // 1. Bewohner mit Name und Foto anlegen
  const addBetta = await env.request(`/api/aquariums/${aqId}/stock`, {
    method: 'POST',
    headers: { Cookie: user.cookie },
    body: {
      species: 'Siamesischer Kampffisch',
      name: 'Bubbles der Große',
      count: 1,
      profile: 'allgemein',
      image: samplePngBase64,
    },
  });
  assert.strictEqual(addBetta.status, 200);
  assert.strictEqual(addBetta.data.name, 'Bubbles der Große');
  assert.ok(addBetta.data.image_file);
  const bettaId = addBetta.data.id;

  // 2. Weiteren Bewohner ohne Foto, aber mit Gruppenbezeichnung anlegen
  const addShrimps = await env.request(`/api/aquariums/${aqId}/stock`, {
    method: 'POST',
    headers: { Cookie: user.cookie },
    body: {
      species: 'Amanogarnele',
      name: 'Putz-Truppe Alpha',
      count: 5,
      profile: 'garnelen',
    },
  });
  assert.strictEqual(addShrimps.status, 200);
  assert.strictEqual(addShrimps.data.name, 'Putz-Truppe Alpha');
  const shrimpId = addShrimps.data.id;

  // 3. Aquarium Details abrufen und Besatz prüfen
  const getDetail = await env.request(`/api/aquariums/${aqId}`, {
    headers: { Cookie: viewer.cookie },
  });
  assert.strictEqual(getDetail.status, 200);
  assert.strictEqual(getDetail.data.stock.length, 2);

  const bettaStock = getDetail.data.stock.find((s) => s.id === bettaId);
  assert.ok(bettaStock);
  assert.strictEqual(bettaStock.name, 'Bubbles der Große');
  assert.strictEqual(bettaStock.has_image, true);
  assert.ok(bettaStock.image_url.includes(`/stock/${bettaId}/image`));

  const shrimpStock = getDetail.data.stock.find((s) => s.id === shrimpId);
  assert.ok(shrimpStock);
  assert.strictEqual(shrimpStock.name, 'Putz-Truppe Alpha');
  assert.strictEqual(shrimpStock.has_image, false);

  // 4. Bewohner-Foto abrufen
  const getBettaImage = await env.request(`/api/aquariums/${aqId}/stock/${bettaId}/image`, {
    headers: { Cookie: viewer.cookie },
  });
  assert.strictEqual(getBettaImage.status, 200);
  assert.strictEqual(getBettaImage.headers.get('content-type'), 'image/png');

  // 5. Bewohner bearbeiten: Name ändern und Foto für Garnelen hochladen
  const updateShrimp = await env.request(`/api/aquariums/${aqId}/stock/${shrimpId}`, {
    method: 'PUT',
    headers: { Cookie: user.cookie },
    body: {
      species: 'Amanogarnele',
      name: 'Die fleißigen Amanos',
      count: 6,
      profile: 'garnelen',
      image: sampleJpegBase64,
    },
  });
  assert.strictEqual(updateShrimp.status, 200);
  assert.strictEqual(updateShrimp.data.name, 'Die fleißigen Amanos');
  assert.strictEqual(updateShrimp.data.count, 6);
  assert.ok(updateShrimp.data.image_file);

  const getShrimpImage = await env.request(`/api/aquariums/${aqId}/stock/${shrimpId}/image`, {
    headers: { Cookie: viewer.cookie },
  });
  assert.strictEqual(getShrimpImage.status, 200);
  assert.strictEqual(getShrimpImage.headers.get('content-type'), 'image/jpeg');

  // 6. Foto des Kampffischs separat löschen
  const delBettaImg = await env.request(`/api/aquariums/${aqId}/stock/${bettaId}/image`, {
    method: 'DELETE',
    headers: { Cookie: user.cookie },
  });
  assert.strictEqual(delBettaImg.status, 200);

  const getBettaImgAfterDel = await env.request(`/api/aquariums/${aqId}/stock/${bettaId}/image`, {
    headers: { Cookie: user.cookie },
  });
  assert.strictEqual(getBettaImgAfterDel.status, 404);

  // 7. Bewohner löschen
  const delShrimps = await env.request(`/api/aquariums/${aqId}/stock/${shrimpId}`, {
    method: 'DELETE',
    headers: { Cookie: user.cookie },
  });
  assert.strictEqual(delShrimps.status, 200);

  const getDetailFinal = await env.request(`/api/aquariums/${aqId}`, {
    headers: { Cookie: user.cookie },
  });
  assert.strictEqual(getDetailFinal.data.stock.length, 1);
});

test('Backup & Restore: Motto, Beschreibung, Mehrfach-Bildergalerie und Bewohner-Fotos bleiben nach Restore vollständig erhalten', async (t) => {
  const env = createTestEnvironment();
  t.after(async () => await env.cleanup());

  const admin = await env.createUserAndLogin('backup_admin', 'password123', 'admin@example.com');
  const backupConfig = await env.request('/api/admin/backups/config', {
    method: 'PUT',
    headers: { Cookie: admin.cookie },
    body: { password: 'backup-test-password' },
  });
  assert.equal(backupConfig.status, 200);

  // Aquarium mit Motto, Beschreibung, mehreren Bildern und Bewohnern anlegen
  const createAq = await env.request('/api/aquariums', {
    method: 'POST',
    headers: { Cookie: admin.cookie },
    body: {
      name: 'Vollständiges Backup-Becken',
      motto: 'Traumhafte Unterwasserwelt',
      description: 'Aquascaping Wettbewerbsbecken mit Wurzelholz und Lavasteinen.',
      water_type: 'fresh',
      volume_l: 180,
    },
  });
  const aqId = createAq.data.id;

  // 2 Galerie-Bilder hochladen
  await env.request(`/api/aquariums/${aqId}/images`, {
    method: 'POST',
    headers: { Cookie: admin.cookie },
    body: { image: samplePngBase64, caption: 'Galeriebild 1', is_primary: true },
  });

  await env.request(`/api/aquariums/${aqId}/images`, {
    method: 'POST',
    headers: { Cookie: admin.cookie },
    body: { image: sampleJpegBase64, caption: 'Galeriebild 2', is_primary: false },
  });

  // Bewohner mit Name und Foto anlegen
  const addStock = await env.request(`/api/aquariums/${aqId}/stock`, {
    method: 'POST',
    headers: { Cookie: admin.cookie },
    body: {
      species: 'Siamesischer Kampffisch',
      name: 'Kaiser Franz',
      count: 1,
      image: samplePngBase64,
    },
  });
  const stockId = addStock.data.id;

  // Backup erstellen
  const createBackupRes = await env.request('/api/admin/backups/create', {
    method: 'POST',
    headers: { Cookie: admin.cookie },
  });
  assert.strictEqual(createBackupRes.status, 200);
  const backupFilename = createBackupRes.data.filename;

  // Aquarium modifizieren / löschen
  await env.request(`/api/aquariums/${aqId}`, {
    method: 'DELETE',
    headers: { Cookie: admin.cookie },
  });

  const checkDeleted = await env.request(`/api/aquariums/${aqId}`, {
    headers: { Cookie: admin.cookie },
  });
  assert.strictEqual(checkDeleted.status, 404);

  // Backup wiederherstellen
  const restoreRes = await env.request(`/api/admin/backups/${backupFilename}/restore`, {
    method: 'POST',
    headers: { Cookie: admin.cookie },
  });
  assert.strictEqual(restoreRes.status, 200, JSON.stringify(restoreRes.data));
  assert.strictEqual(restoreRes.data.ok, true);

  // Wiederhergestelltes Becken prüfen
  const restoredDetail = await env.request(`/api/aquariums/${aqId}`, {
    headers: { Cookie: admin.cookie },
  });
  assert.strictEqual(restoredDetail.status, 200);
  assert.strictEqual(restoredDetail.data.aquarium.name, 'Vollständiges Backup-Becken');
  assert.strictEqual(restoredDetail.data.aquarium.motto, 'Traumhafte Unterwasserwelt');
  assert.strictEqual(restoredDetail.data.aquarium.description, 'Aquascaping Wettbewerbsbecken mit Wurzelholz und Lavasteinen.');

  // Galerie prüfen
  const restoredImages = await env.request(`/api/aquariums/${aqId}/images`, {
    headers: { Cookie: admin.cookie },
  });
  assert.strictEqual(restoredImages.status, 200);
  assert.strictEqual(restoredImages.data.length, 2);

  // Bewohner prüfen
  const restoredStock = restoredDetail.data.stock.find((s) => s.id === stockId);
  assert.ok(restoredStock);
  assert.strictEqual(restoredStock.name, 'Kaiser Franz');
  assert.strictEqual(restoredStock.has_image, true);

  // Bewohner-Foto abrufen
  const restoredStockImg = await env.request(`/api/aquariums/${aqId}/stock/${stockId}/image`, {
    headers: { Cookie: admin.cookie },
  });
  assert.strictEqual(restoredStockImg.status, 200);
  assert.strictEqual(restoredStockImg.headers.get('content-type'), 'image/png');
});

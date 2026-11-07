'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { createTestEnvironment, createMongoTestEnvironment } = require('./helpers/env');

const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
const uploads = env => path.join(env.getDataDir(), 'uploads');
const plantFiles = env => fs.existsSync(uploads(env)) ? fs.readdirSync(uploads(env)).filter(name => name.startsWith('plant_')) : [];

for (const backend of ['sqlite', 'mongodb']) test(`Pflanzenfotos: hochladen, beschriften, Rechte, Löschen und Wiederherstellung (${backend})`, { timeout: 120000 }, async t => {
  const env = backend === 'mongodb' ? await createMongoTestEnvironment() : createTestEnvironment();
  t.after(() => env.cleanup());
  const owner = await env.createUserAndLogin('plantphoto_owner', 'password123', 'admin@example.com');
  const viewer = await env.createUserAndLogin('plantphoto_viewer', 'password123', 'viewer@example.com');
  const stranger = await env.createUserAndLogin('plantphoto_stranger', 'password123', 'stranger@example.com');
  const headers = { Cookie: owner.cookie }, viewerHeaders = { Cookie: viewer.cookie }, strangerHeaders = { Cookie: stranger.cookie };
  const created = await env.request('/api/aquariums', { method: 'POST', headers, body: { name: 'Pflanzenbecken', water_type: 'fresh', volume_l: 120 } });
  assert.equal(created.status, 200, created.text);
  const root = `/api/aquariums/${created.data.id}`;
  const [plant, other] = (await env.request('/api/plants?waterType=fresh&limit=2', { headers })).data.plants;
  assert.equal((await env.request(`${root}/plants/${encodeURIComponent(plant.id)}`, { method: 'PUT', headers, body: { count: 3 } })).status, 200);

  const missingPlant = await env.request(`${root}/plant-images`, { method: 'POST', headers, body: { plant_id: other.id, image: png } });
  assert.equal(missingPlant.status, 404, 'Fotos nur für eingetragene Pflanzen');
  const invalid = await env.request(`${root}/plant-images`, { method: 'POST', headers, body: { plant_id: plant.id, image: 'kein-bild' } });
  assert.equal(invalid.status, 400);

  const first = await env.request(`${root}/plant-images`, { method: 'POST', headers, body: { plant_id: plant.id, image: png, caption: '  hinten links hinter der Wurzel  ' } });
  assert.equal(first.status, 200, first.text);
  assert.equal(first.data.caption, 'hinten links hinter der Wurzel');
  assert.equal(first.data.plant_id, plant.id);
  assert.equal(first.data.image_url, `api/aquariums/${created.data.id}/plant-images/${first.data.id}`);
  assert.equal(first.data.filename, undefined, 'Dateinamen bleiben intern');
  const second = await env.request(`${root}/plant-images`, { method: 'POST', headers, body: { plant_id: plant.id, image: png } });
  assert.equal(second.status, 200, second.text);
  assert.equal(plantFiles(env).length, 2);

  const list = await env.request(`${root}/plant-images`, { headers });
  assert.equal(list.status, 200);
  assert.deepEqual(list.data.map(photo => photo.id), [first.data.id, second.data.id]);
  assert.ok(list.data.every(photo => photo.filename === undefined));
  assert.equal((await env.request(`${root}/plant-images?plantId=${encodeURIComponent(other.id)}`, { headers })).data.length, 0);
  const file = await env.request(`${root}/plant-images/${first.data.id}`, { headers });
  assert.equal(file.status, 200);
  assert.match(file.headers.get('content-type'), /^image\//);

  assert.equal((await env.request(`${root}/plant-images/${first.data.id}`, { method: 'PUT', headers, body: { caption: 'vorne rechts' } })).status, 200);
  assert.equal((await env.request(`${root}/plant-images`, { headers })).data[0].caption, 'vorne rechts');

  // Lesende Freigaben sehen Fotos, dürfen aber nichts ändern; Fremde sehen nichts.
  assert.equal((await env.request(`${root}/shares`, { method: 'POST', headers, body: { usernameOrEmail: 'plantphoto_viewer', role: 'view' } })).status, 200);
  assert.equal((await env.request('/api/shares/accept', { method: 'POST', headers: viewerHeaders, body: { aquarium_id: created.data.id } })).status, 200);
  assert.equal((await env.request(`${root}/plant-images`, { headers: viewerHeaders })).data.length, 2);
  assert.equal((await env.request(`${root}/plant-images/${first.data.id}`, { headers: viewerHeaders })).status, 200);
  assert.equal((await env.request(`${root}/plant-images`, { method: 'POST', headers: viewerHeaders, body: { plant_id: plant.id, image: png } })).status, 403);
  assert.equal((await env.request(`${root}/plant-images/${first.data.id}`, { method: 'DELETE', headers: viewerHeaders })).status, 403);
  assert.equal((await env.request(`${root}/plant-images`, { headers: strangerHeaders })).status, 404);
  assert.equal((await env.request(`${root}/plant-images/${first.data.id}`, { headers: strangerHeaders })).status, 404);

  // Sicherung und Wiederherstellung erhalten Fotos samt Dateien.
  assert.equal((await env.request('/api/admin/backups/config', { method: 'PUT', headers, body: { password: 'backup-test-password' } })).status, 200);
  const backup = await env.request('/api/admin/backups/create', { method: 'POST', headers });
  assert.equal(backup.status, 200, backup.text);

  assert.equal((await env.request(`${root}/plant-images/${second.data.id}`, { method: 'DELETE', headers })).status, 200);
  assert.equal((await env.request(`${root}/plant-images/${second.data.id}`, { method: 'DELETE', headers })).status, 404);
  assert.equal(plantFiles(env).length, 1);
  assert.equal((await env.request(`${root}/plants/${encodeURIComponent(plant.id)}`, { method: 'DELETE', headers })).status, 200);
  assert.equal((await env.request(`${root}/plant-images`, { headers })).data.length, 0, 'Entfernte Pflanzen nehmen ihre Fotos mit');
  assert.equal(plantFiles(env).length, 0);

  const restored = await env.request(`/api/admin/backups/${encodeURIComponent(backup.data.filename)}/restore`, { method: 'POST', headers });
  assert.equal(restored.status, 200, restored.text);
  const restoredList = await env.request(`${root}/plant-images`, { headers });
  assert.deepEqual(restoredList.data.map(photo => [photo.id, photo.caption]), [[first.data.id, 'vorne rechts'], [second.data.id, null]]);
  assert.equal((await env.request(`${root}/plant-images/${second.data.id}`, { headers })).status, 200);
  const next = await env.request(`${root}/plant-images`, { method: 'POST', headers, body: { plant_id: plant.id, image: png } });
  assert.equal(next.status, 200, next.text);
  assert.ok(next.data.id > second.data.id, 'Neue IDs kollidieren nicht mit wiederhergestellten Fotos');

  // Das Löschen des Aquariums entfernt alle Fotodateien.
  assert.equal((await env.request(root, { method: 'DELETE', headers })).status, 200);
  assert.equal(plantFiles(env).length, 0);
});

for (const backend of ['sqlite', 'mongodb']) test(`Pflanzenfotos: Offline-Abgleich mit Operations-IDs und Ausgangsstand (${backend})`, { timeout: 90000 }, async t => {
  const env = backend === 'mongodb' ? await createMongoTestEnvironment() : createTestEnvironment();
  t.after(() => env.cleanup());
  const user = await env.createUserAndLogin('plantphoto_offline'), headers = { Cookie: user.cookie };
  const owner = (await env.request('/api/me', { headers })).data.id;
  const command = (path, method, body = {}, base = null) => ({ id: randomUUID(), owner, path, method, body, base });
  const post = op => env.request('/api/offline/operations', { method: 'POST', headers, body: op });
  const created = await post(command('/aquariums', 'POST', { name: 'Offline-Pflanzen', volume_l: 80 }));
  const root = '/aquariums/' + created.data.result.id;
  const plant = (await env.request('/api/plants?waterType=fresh&limit=1', { headers })).data.plants[0];
  assert.equal((await post(command(`${root}/plants/${encodeURIComponent(plant.id)}`, 'PUT', { count: 2 }, 'missing'))).status, 200);

  const upload = command(root + '/plant-images', 'POST', { plant_id: plant.id, image: png, caption: 'Mitte' });
  const first = await post(upload);
  assert.equal(first.status, 200, first.text);
  assert.deepEqual((await post(upload)).data, first.data, 'Wiederholungen erzeugen keine Duplikate');
  assert.equal(first.data.target, root + '/plant-images');

  const state = (await env.request('/api/offline/state', { headers })).data;
  assert.equal(state.responses[root + '/plant-images'].length, 1);
  assert.equal(state.responses[root + '/plant-images'][0].caption, 'Mitte');
  assert.equal(state.responses[root + '/plant-images'][0].filename, undefined);
  assert.equal(state.versions[root + '/plant-images'], first.data.version);

  const photo = first.data.result.id;
  const rename = await post(command(`${root}/plant-images/${photo}`, 'PUT', { caption: 'links' }, state.versions[root + '/plant-images']));
  assert.equal(rename.status, 200, rename.text);
  const stale = await post(command(`${root}/plant-images/${photo}`, 'DELETE', {}, state.versions[root + '/plant-images']));
  assert.equal(stale.status, 409, 'Veralteter Ausgangsstand wird als Konflikt gemeldet');
  assert.ok(stale.data.conflict.version);
  const removed = await post(command(`${root}/plant-images/${photo}`, 'DELETE', {}, stale.data.conflict.version));
  assert.equal(removed.status, 200, removed.text);
  assert.equal((await env.request(`/api${root}/plant-images`, { headers })).data.length, 0);
  assert.equal((await post(command(root + '/plant-images', 'POST', { plant_id: 'unbekannt', image: png }))).status, 404);
});

test('Pflanzenfotos: lokaler Offline-Stand, Grenze und Bildpfade', () => {
  const { applyLocalOperation, deriveWorkspace } = require('../dist/backend/src/shared/offline-workspace-model');
  const { workspaceWrite, canonicalResource } = require('../dist/backend/src/shared/offline-workspace');
  const { MAX_PHOTOS_PER_PLANT } = require('../dist/backend/src/shared/plant-images');
  assert.equal(workspaceWrite('/aquariums/4/plant-images', 'POST'), true);
  assert.equal(workspaceWrite('/aquariums/4/plant-images/-12', 'PUT'), true);
  assert.equal(workspaceWrite('/aquariums/4/plant-images/12', 'DELETE'), true);
  assert.equal(workspaceWrite('/aquariums/4/plant-images', 'PUT'), false);
  assert.equal(canonicalResource('/aquariums/4/plant-images/-12'), '/aquariums/4/plant-images');

  const root = '/aquariums/4';
  const snapshot = { schema: 1, owner: 1, language: 'de', updatedAt: '', versions: {}, rules: { profiles: {}, parameters: [] }, responses: {
    '/me': { username: 'demo' }, '/config': { maintenanceTypes: {}, suites: [], userPreferences: {} }, '/aquariums': [{ id: 4, name: 'Demo' }],
    [root]: { aquarium: { id: 4, water_type: 'fresh', created_at: '2026-01-01T00:00:00.000Z' }, role: 'owner', alerts: [] },
    [root + '/plants']: [{ aquarium_id: 4, plant_id: 'anubias', count: 1 }], [root + '/plant-images']: [] } };
  let next = -1;
  const run = (path, method, body = {}) => applyLocalOperation(snapshot, { id: randomUUID(), owner: 1, kind: 'workspace', aquarium: '4', path, method, body, base: null, temporaryIds: [next--], createdAt: '2026-11-07T10:00:00.000Z' });
  const added = run(root + '/plant-images', 'POST', { plant_id: 'anubias', caption: ' Wurzel ' });
  assert.equal(added.image_url, 'api/aquariums/4/plant-images/-1');
  assert.equal(snapshot.responses[root + '/plant-images'][0].caption, 'Wurzel');
  assert.throws(() => run(root + '/plant-images', 'POST', { plant_id: 'fehlt' }), /nicht eingetragen/);
  run(root + '/plant-images/-1', 'PUT', { caption: 'Stein' });
  assert.equal(snapshot.responses[root + '/plant-images'][0].caption, 'Stein');
  for (let index = 1; index < MAX_PHOTOS_PER_PLANT; index++) run(root + '/plant-images', 'POST', { plant_id: 'anubias' });
  assert.throws(() => run(root + '/plant-images', 'POST', { plant_id: 'anubias' }), /höchstens/);
  run(root + '/plants/anubias', 'DELETE');
  assert.equal(snapshot.responses[root + '/plant-images'].length, 0, 'Lokales Entfernen der Pflanze entfernt auch ihre Fotos');
  assert.doesNotThrow(() => deriveWorkspace(snapshot));

  const read = file => fs.readFileSync(path.join(__dirname, '..', 'public/frontend', file), 'utf8');
  for (const file of ['service-worker.ts', 'mobile-images.ts']) assert.match(read(file), /plant-images\\\/-\?\\d\+/, file);
  assert.match(read('offline-workspace.ts'), /plant-images\/' \+ photo\.id/);
  const section = read('components/PlantSection.vue');
  assert.match(section, /type="file"[^>]*multiple/);
  assert.match(section, /v-server-image/);
  assert.doesNotMatch(section, /v-if="!readonly"[^>]*>\{\{ t\('plantStock\.photos'/, 'Lesende Freigaben sehen die Fotos');
});

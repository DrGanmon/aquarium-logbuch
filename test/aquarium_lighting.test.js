'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { createTestEnvironment, createMongoTestEnvironment } = require('./helpers/env');

const valid = { red: 30, green: 40, blue: '55,5', white: 100, start_time: '10:00', end_time: '20:30', sunrise_minutes: 45, sunset_minutes: 30, note: ' Leuchte A ' };

test('Beleuchtung: Prüfung, Lichtkurve und Zusammenfassung', () => {
  const { validateLightingInput, brightnessAt, lightingSummary, photoperiodMinutes, previewColor } = require('../dist/backend/src/shared/lighting');
  assert.deepEqual(validateLightingInput(valid).value, { red: 30, green: 40, blue: 55.5, white: 100, start_time: '10:00', end_time: '20:30', sunrise_minutes: 45, sunset_minutes: 30, note: 'Leuchte A' });
  for (const [change, message] of [[{ red: 101 }, /0 und 100/], [{ white: -1 }, /0 und 100/], [{ green: 'viel' }, /0 und 100/],
    [{ red: 0, green: 0, blue: 0, white: 0 }, /Mindestens ein/], [{ start_time: '25:00' }, /HH:MM/], [{ end_time: '10:00' }, /nicht gleich/],
    [{ sunrise_minutes: 241 }, /0 und 240/], [{ sunset_minutes: 1.5 }, /ganze Minuten/], [{ start_time: '10:00', end_time: '11:00', sunrise_minutes: 40, sunset_minutes: 30 }, /nicht länger/]]) {
    assert.match(validateLightingInput({ ...valid, ...change }).error || '', message, JSON.stringify(change));
  }
  assert.equal(validateLightingInput({ ...valid, red: 0, green: 0, blue: 0 }).error, undefined, 'Einzelne Kanäle dürfen aus sein');
  const light = validateLightingInput(valid).value;
  assert.equal(photoperiodMinutes(light), 630);
  assert.deepEqual(lightingSummary(light), { photoperiod_minutes: 630, full_from: '10:45', full_until: '20:00', full_minutes: 555 });
  assert.equal(brightnessAt(light, 9 * 60 + 59), 0);
  assert.equal(brightnessAt(light, 10 * 60), 0);
  assert.equal(brightnessAt(light, 10 * 60 + 15), 15 / 45);
  assert.equal(brightnessAt(light, 15 * 60), 1);
  assert.equal(brightnessAt(light, 20 * 60 + 15), 0.5);
  assert.equal(brightnessAt(light, 20 * 60 + 30), 0);
  const night = validateLightingInput({ ...valid, start_time: '22:00', end_time: '02:00', sunrise_minutes: 0, sunset_minutes: 60 }).value;
  assert.equal(photoperiodMinutes(night), 240, 'Lichttag über Mitternacht');
  assert.equal(brightnessAt(night, 23 * 60), 1);
  assert.equal(brightnessAt(night, 90), 0.5);
  assert.equal(brightnessAt(night, 3 * 60), 0);
  assert.equal(lightingSummary(night).full_until, '01:00');
  assert.match(previewColor(light), /^#[0-9a-f]{6}$/);
  assert.equal(previewColor({ red: 100, green: 0, blue: 0, white: 0 }), '#ff0000');
});

for (const backend of ['sqlite', 'mongodb']) test(`Beleuchtung: API, Rechte, Sicherung und Offline-Abgleich (${backend})`, { timeout: 120000 }, async t => {
  const env = backend === 'mongodb' ? await createMongoTestEnvironment() : createTestEnvironment();
  t.after(() => env.cleanup());
  const owner = await env.createUserAndLogin('licht_owner', 'password123', 'admin@example.com');
  const viewer = await env.createUserAndLogin('licht_viewer', 'password123', 'viewer@example.com');
  const stranger = await env.createUserAndLogin('licht_fremd', 'password123', 'fremd@example.com');
  const headers = { Cookie: owner.cookie }, viewerHeaders = { Cookie: viewer.cookie }, strangerHeaders = { Cookie: stranger.cookie };
  const created = await env.request('/api/aquariums', { method: 'POST', headers, body: { name: 'Lichtbecken', volume_l: 120 } });
  const root = `/api/aquariums/${created.data.id}`;

  const empty = await env.request(root + '/lighting', { headers });
  assert.equal(empty.status, 200);
  assert.equal(empty.data, null);
  assert.equal((await env.request(root + '/lighting', { method: 'PUT', headers, body: { ...valid, red: 120 } })).status, 400);
  const saved = await env.request(root + '/lighting', { method: 'PUT', headers, body: valid });
  assert.equal(saved.status, 200, saved.text);
  assert.equal(saved.data.blue, 55.5);
  assert.equal(saved.data.full_from, '10:45');
  assert.equal(saved.data.photoperiod_minutes, 630);
  const changed = await env.request(root + '/lighting', { method: 'PUT', headers, body: { ...valid, white: 60, end_time: '21:00' } });
  assert.equal(changed.data.white, 60);
  assert.equal((await env.request(root + '/lighting', { headers })).data.end_time, '21:00');

  assert.equal((await env.request(`${root}/shares`, { method: 'POST', headers, body: { usernameOrEmail: 'licht_viewer', role: 'view' } })).status, 200);
  assert.equal((await env.request('/api/shares/accept', { method: 'POST', headers: viewerHeaders, body: { aquarium_id: created.data.id } })).status, 200);
  assert.equal((await env.request(root + '/lighting', { headers: viewerHeaders })).data.white, 60, 'Lesende Freigaben sehen die Beleuchtung');
  assert.equal((await env.request(root + '/lighting', { method: 'PUT', headers: viewerHeaders, body: valid })).status, 403);
  assert.equal((await env.request(root + '/lighting', { method: 'DELETE', headers: viewerHeaders })).status, 403);
  assert.equal((await env.request(root + '/lighting', { headers: strangerHeaders })).status, 404);

  // Offline-Aktionen mit Operations-ID und Ausgangsstand.
  const ownerId = (await env.request('/api/me', { headers })).data.id;
  const state = (await env.request('/api/offline/state', { headers })).data;
  const path = `/aquariums/${created.data.id}/lighting`;
  assert.equal(state.responses[path].white, 60);
  const command = (method, body, base) => ({ id: randomUUID(), owner: ownerId, path, method, body, base });
  const put = command('PUT', { ...valid, white: 70 }, state.versions[path]);
  const first = await env.request('/api/offline/operations', { method: 'POST', headers, body: put });
  assert.equal(first.status, 200, first.text);
  assert.deepEqual((await env.request('/api/offline/operations', { method: 'POST', headers, body: put })).data, first.data);
  const stale = await env.request('/api/offline/operations', { method: 'POST', headers, body: command('PUT', { ...valid, white: 10 }, state.versions[path]) });
  assert.equal(stale.status, 409, 'Konkurrierende Lichtänderungen werden nicht still überschrieben');
  assert.equal((await env.request(root + '/lighting', { headers })).data.white, 70);

  // Sicherung und Wiederherstellung.
  assert.equal((await env.request('/api/admin/backups/config', { method: 'PUT', headers, body: { password: 'backup-test-password' } })).status, 200);
  const backup = await env.request('/api/admin/backups/create', { method: 'POST', headers });
  assert.equal(backup.status, 200, backup.text);
  assert.equal((await env.request(root + '/lighting', { method: 'DELETE', headers })).status, 200);
  assert.equal((await env.request(root + '/lighting', { headers })).data, null);
  assert.equal((await env.request(`/api/admin/backups/${encodeURIComponent(backup.data.filename)}/restore`, { method: 'POST', headers })).status, 200);
  assert.equal((await env.request(root + '/lighting', { headers })).data.white, 70);

  assert.equal((await env.request(root, { method: 'DELETE', headers })).status, 200);
  const again = await env.request('/api/aquariums', { method: 'POST', headers, body: { name: 'Neues Becken', volume_l: 60 } });
  assert.equal((await env.request(`/api/aquariums/${again.data.id}/lighting`, { headers })).data, null, 'Gelöschte Aquarien hinterlassen keine Lichtdaten');
});

test('Beleuchtung: lokaler Offline-Stand, Oberfläche und Sprachen', () => {
  const { applyLocalOperation } = require('../dist/backend/src/shared/offline-workspace-model');
  const { workspaceWrite } = require('../dist/backend/src/shared/offline-workspace');
  assert.equal(workspaceWrite('/aquariums/2/lighting', 'PUT'), true);
  assert.equal(workspaceWrite('/aquariums/-2/lighting', 'DELETE'), true);
  assert.equal(workspaceWrite('/aquariums/2/lighting', 'POST'), false);
  const snapshot = { schema: 1, owner: 1, language: 'de', updatedAt: '', versions: {}, rules: { profiles: {}, parameters: [] },
    responses: { '/me': {}, '/config': {}, '/aquariums': [], '/aquariums/2': { aquarium: { id: 2 }, role: 'owner' }, '/aquariums/2/lighting': null } };
  const run = (method, body = {}) => applyLocalOperation(snapshot, { id: randomUUID(), owner: 1, kind: 'workspace', aquarium: '2', path: '/aquariums/2/lighting', method, body, base: null, temporaryIds: [-1], createdAt: '2026-11-07T10:00:00.000Z' });
  run('PUT', valid);
  assert.equal(snapshot.responses['/aquariums/2/lighting'].full_until, '20:00');
  assert.throws(() => run('PUT', { ...valid, start_time: 'x' }), /HH:MM/);
  run('DELETE');
  assert.equal(snapshot.responses['/aquariums/2/lighting'], null);
  snapshot.responses['/aquariums/2'].role = 'view';
  assert.throws(() => run('PUT', valid), /Schreibberechtigung/);

  const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
  const de = { ...JSON.parse(read('public/locales/de.json')), ...JSON.parse(read('public/locales/features.de.json')) }, en = { ...JSON.parse(read('public/locales/en.json')), ...JSON.parse(read('public/locales/features.en.json')) };
  assert.deepEqual(Object.keys(en.lighting).sort(), Object.keys(de.lighting).sort());
  assert.match(read('public/frontend/views/AquariumView.vue'), /LightingSection = lazyComponent/);
  const section = read('public/frontend/components/LightingSection.vue');
  for (const channel of ['red', 'green', 'blue', 'white']) assert.match(de.lighting[channel], /\((R|G|B|W)\)/);
  assert.match(section, /type="range" min="0" max="100"/);
  assert.match(section, /type="time"/);
});

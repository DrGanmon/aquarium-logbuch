'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { createTestEnvironment, createMongoTestEnvironment } = require('./helpers/env');

const basic = (login, password) => ({ Authorization: 'Basic ' + Buffer.from(`${login}:${password}`).toString('base64') });
const ymd = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const shift = days => { const date = new Date();date.setDate(date.getDate() + days);return ymd(date); };
const propfind = '<?xml version="1.0"?><d:propfind xmlns:d="DAV:"><d:prop><d:resourcetype/><d:getetag/></d:prop></d:propfind>';

test('Pflegeaufgaben: Intervalle, Monatsenden und Fälligkeit nach Logbuch', () => {
  const { addInterval, careTaskStatus, validateCareTaskInput, lastMaintenanceByType } = require('../dist/backend/src/shared/care-tasks');
  const { MAINTENANCE_TYPES } = require('../dist/backend/src/shared/maintenance');
  assert.equal(addInterval('2026-01-31', 1, 'months'), '2026-02-28');
  assert.equal(addInterval('2028-01-31', 1, 'months'), '2028-02-29');
  assert.equal(addInterval('2026-03-29', 2, 'weeks'), '2026-04-12');
  assert.equal(addInterval('2026-12-30', 3, 'days'), '2027-01-02');
  const task = { interval: 2, unit: 'weeks', start_date: '2026-11-01', is_active: true };
  const now = new Date(2026, 10, 7, 12);
  assert.deepEqual(careTaskStatus(task, null, now), { last_done_at: null, next_due_date: '2026-11-01', is_due: true, is_overdue: true, days_remaining: -6 });
  assert.equal(careTaskStatus(task, new Date(2026, 10, 5, 18).toISOString(), now).next_due_date, '2026-11-19');
  assert.equal(careTaskStatus({ ...task, start_date: '2026-12-24' }, new Date(2026, 10, 5).toISOString(), now).next_due_date, '2026-12-24', 'Ein späteres Startdatum hat Vorrang');
  assert.equal(careTaskStatus({ ...task, is_active: false }, null, now).next_due_date, null);
  assert.ok(validateCareTaskInput({ type: 'fertilize', interval: 1, unit: 'weeks', start_date: '2026-11-01' }, MAINTENANCE_TYPES).error, 'Düngen hat eigene Pläne');
  assert.ok(validateCareTaskInput({ type: 'water_change', interval: 0, unit: 'weeks', start_date: '2026-11-01' }, MAINTENANCE_TYPES).error);
  assert.ok(validateCareTaskInput({ type: 'water_change', interval: 25, unit: 'months', start_date: '2026-11-01' }, MAINTENANCE_TYPES).error);
  assert.ok(validateCareTaskInput({ type: 'water_change', interval: 1, unit: 'weeks', start_date: '2026-02-30' }, MAINTENANCE_TYPES).error);
  assert.ok(validateCareTaskInput({ type: 'water_change', interval: 1, unit: 'weeks', start_date: '2026-02-03', time_of_day: '25:00' }, MAINTENANCE_TYPES).error);
  assert.deepEqual(validateCareTaskInput({ type: 'plants_cut', title: '  Stängel kürzen ', interval: 3, unit: 'weeks', start_date: '2026-02-03', time_of_day: '18:30' }, MAINTENANCE_TYPES).value,
    { type: 'plants_cut', title: 'Stängel kürzen', note: null, interval: 3, unit: 'weeks', start_date: '2026-02-03', time_of_day: '18:30', is_active: true });
  assert.deepEqual(lastMaintenanceByType([{ type: 'water_change', logged_at: '2026-01-02T10:00:00.000Z' }, { type: 'water_change', logged_at: '2026-03-02T10:00:00.000Z' }, { type: 'care', logged_at: '2026-02-01T00:00:00.000Z' }]),
    { water_change: '2026-03-02T10:00:00.000Z', care: '2026-02-01T00:00:00.000Z' });
});

for (const backend of ['sqlite', 'mongodb']) test(`Pflegeaufgaben, iCal und CalDAV mit eigenem Passwort (${backend})`, { timeout: 120000 }, async t => {
  const env = backend === 'mongodb' ? await createMongoTestEnvironment() : createTestEnvironment();
  t.after(() => env.cleanup());
  const owner = await env.createUserAndLogin('kalender_owner', 'password123', 'admin@example.com');
  const viewer = await env.createUserAndLogin('kalender_viewer', 'password123', 'viewer@example.com');
  const stranger = await env.createUserAndLogin('kalender_fremd', 'password123', 'fremd@example.com');
  const headers = { Cookie: owner.cookie }, viewerHeaders = { Cookie: viewer.cookie }, strangerHeaders = { Cookie: stranger.cookie };
  const ownerId = (await env.request('/api/me', { headers })).data.id;
  const strangerId = (await env.request('/api/me', { headers: strangerHeaders })).data.id;
  const created = await env.request('/api/aquariums', { method: 'POST', headers, body: { name: 'Gesellschaft, 240 l', water_type: 'fresh', volume_l: 240, measure_cycle_interval: 1, measure_cycle_unit: 'weeks' } });
  assert.equal(created.status, 200, created.text);
  const root = `/api/aquariums/${created.data.id}`;

  // Aufgaben anlegen, prüfen und Rechte durchsetzen.
  assert.equal((await env.request(root + '/tasks', { method: 'POST', headers, body: { type: 'fertilize', interval: 1, unit: 'weeks', start_date: shift(0) } })).status, 400);
  const water = await env.request(root + '/tasks', { method: 'POST', headers, body: { type: 'water_change', interval: 1, unit: 'weeks', start_date: shift(-3), note: 'Mit Osmosewasser; 30 %' } });
  assert.equal(water.status, 200, water.text);
  assert.equal(water.data.next_due_date, shift(-3));
  assert.equal(water.data.is_overdue, true);
  const prune = await env.request(root + '/tasks', { method: 'POST', headers, body: { type: 'plants_cut', title: 'Stängelpflanzen kürzen', interval: 1, unit: 'months', start_date: shift(5), time_of_day: '18:30' } });
  assert.equal(prune.status, 200, prune.text);
  const updated = await env.request(`${root}/tasks/${prune.data.id}`, { method: 'PUT', headers, body: { type: 'plants_cut', title: 'Stängelpflanzen kürzen', interval: 2, unit: 'months', start_date: shift(5), time_of_day: '18:30' } });
  assert.equal(updated.data.interval, 2);
  assert.equal((await env.request(`${root}/tasks/999999`, { method: 'PUT', headers, body: { type: 'care', interval: 1, unit: 'weeks', start_date: shift(0) } })).status, 404);
  const plan = await env.request(root + '/fertilizers', { method: 'POST', headers, body: { mode: 'manual', name: 'Eisen', fertilizer_name: 'Eisendünger', amount_ml: '2,5', interval_days: 3, time_of_day: '08:00' } });
  assert.equal(plan.status, 200, plan.text);

  assert.equal((await env.request(`${root}/shares`, { method: 'POST', headers, body: { usernameOrEmail: 'kalender_viewer', role: 'view' } })).status, 200);
  assert.equal((await env.request('/api/shares/accept', { method: 'POST', headers: viewerHeaders, body: { aquarium_id: created.data.id } })).status, 200);
  assert.equal((await env.request(root + '/tasks', { headers: viewerHeaders })).data.length, 2);
  assert.equal((await env.request(root + '/tasks', { method: 'POST', headers: viewerHeaders, body: { type: 'care', interval: 1, unit: 'weeks', start_date: shift(0) } })).status, 403);
  assert.equal((await env.request(root + '/tasks', { headers: strangerHeaders })).status, 404);
  assert.equal((await env.request(`${root}/tasks/${water.data.id}`, { method: 'DELETE', headers: strangerHeaders })).status, 404);

  // Ein Logbucheintrag gleicher Art erledigt die Aufgabe und verschiebt die Fälligkeit.
  assert.equal((await env.request(root + '/maintenance', { method: 'POST', headers, body: { type: 'water_change', logged_at: new Date().toISOString(), percentage: 30 } })).status, 200);
  const afterLog = (await env.request(root + '/tasks', { headers })).data.find(task => task.id === water.data.id);
  assert.equal(afterLog.next_due_date, shift(7));
  assert.equal(afterLog.is_due, false);

  // iCal-Download für das aktuelle und nächste Jahr.
  assert.equal((await env.request('/api/me/calendar.ics')).status, 401);
  const ics = await env.request('/api/me/calendar.ics', { headers });
  assert.equal(ics.status, 200);
  assert.match(ics.headers.get('content-type'), /^text\/calendar/);
  const year = new Date().getFullYear();
  assert.match(ics.headers.get('content-disposition'), new RegExp(`aquarienpflege-${year}-${year + 1}\\.ics`));
  assert.match(ics.text, /^BEGIN:VCALENDAR\r\nVERSION:2\.0\r\n/);
  assert.ok(ics.text.split('\r\n').every(line => Buffer.byteLength(line) <= 75), 'Zeilen sind nach RFC 5545 gefaltet');
  const unfolded = ics.text.replace(/\r\n /g, '');
  assert.match(unfolded, new RegExp(`UID:task-${water.data.id}@aquarium-logbuch\\r\\n`));
  assert.match(unfolded, new RegExp(`DTSTART;VALUE=DATE:${shift(7).replace(/-/g, '')}\\r\\n`));
  assert.match(unfolded, new RegExp(`RRULE:FREQ=WEEKLY;INTERVAL=1;UNTIL=${year + 1}1231\\r\\n`));
  assert.match(unfolded, /SUMMARY:💧 Wasserwechsel – Gesellschaft\\, 240 l\r\n/, 'Sonderzeichen werden maskiert');
  assert.match(unfolded, /DESCRIPTION:Mit Osmosewasser\\; 30 %\r\n/);
  assert.match(unfolded, new RegExp(`RRULE:FREQ=MONTHLY;INTERVAL=2;UNTIL=${year + 1}1231T235959\\r\\n`));
  assert.match(unfolded, /DTSTART:\d{8}T183000\r\nDURATION:PT30M/);
  assert.match(unfolded, new RegExp(`UID:fertilizer-${plan.data.id}@aquarium-logbuch`));
  assert.match(unfolded, new RegExp(`UID:measure-${created.data.id}@aquarium-logbuch`));
  assert.doesNotMatch((await env.request('/api/me/calendar.ics', { headers: viewerHeaders })).text, /BEGIN:VEVENT/, 'Lesende Freigaben erhalten keine Pflegetermine');

  // Automatisch erzeugtes CalDAV-Passwort, stabil bis zur Neuerzeugung.
  const access = await env.request('/api/me/caldav', { headers });
  assert.equal(access.status, 200, access.text);
  assert.equal(access.headers.get('cache-control'), 'no-store');
  assert.ok(access.data.password.length >= 32);
  assert.equal(access.data.username, 'kalender_owner');
  assert.match(access.data.serverUrl, /\/caldav\/$/);
  assert.match(access.data.calendarUrl, new RegExp(`/caldav/${ownerId}/pflege/$`));
  assert.equal((await env.request('/api/me/caldav', { headers })).data.password, access.data.password);
  assert.equal((await env.request('/api/me/caldav')).status, 401);
  const auth = basic('kalender_owner', access.data.password);
  const calendar = `/caldav/${ownerId}/pflege/`;

  const options = await env.request('/caldav/', { method: 'OPTIONS' });
  assert.equal(options.status, 204);
  assert.match(options.headers.get('dav'), /calendar-access/);
  const anonymous = await env.request(calendar);
  assert.equal(anonymous.status, 401);
  assert.match(anonymous.headers.get('www-authenticate'), /^Basic realm=/);
  assert.equal((await env.request(calendar, { headers: basic('kalender_owner', 'password123') })).status, 401, 'Das Kontopasswort öffnet den Kalender nicht');
  assert.equal((await env.request(calendar, { headers: basic('kalender_owner', access.data.password + 'x') })).status, 401);
  assert.equal((await env.request(calendar, { headers: { Cookie: owner.cookie } })).status, 401, 'Sitzungscookies gelten nicht für CalDAV');
  assert.equal((await env.request(calendar, { headers: basic('admin@example.com', access.data.password) })).status, 200, 'Anmeldung auch per E-Mail');

  const discovery = await env.request('/.well-known/caldav');
  assert.equal(discovery.status, 301);
  assert.match(discovery.headers.get('location'), /\/caldav\/$/);
  const principalLookup = await env.request('/caldav/', { method: 'PROPFIND', headers: { ...auth, Depth: '0', 'Content-Type': 'application/xml' }, body: '<d:propfind xmlns:d="DAV:"><d:prop><d:current-user-principal/></d:prop></d:propfind>' });
  assert.equal(principalLookup.status, 207);
  assert.match(principalLookup.text, new RegExp(`<D:current-user-principal><D:href>/caldav/${ownerId}/</D:href>`));
  const home = await env.request(`/caldav/${ownerId}/`, { method: 'PROPFIND', headers: { ...auth, Depth: '1' }, body: propfind });
  assert.equal(home.status, 207);
  assert.match(home.text, new RegExp(`<C:calendar-home-set><D:href>/caldav/${ownerId}/</D:href>`));
  assert.match(home.text, /<D:resourcetype><D:collection\/><C:calendar\/><\/D:resourcetype>/);
  const listing = await env.request(calendar, { method: 'PROPFIND', headers: { ...auth, Depth: '1' }, body: propfind });
  assert.equal(listing.status, 207);
  const hrefs = [...listing.text.matchAll(/<D:href>([^<]+\.ics)<\/D:href>/g)].map(match => match[1]);
  assert.equal(hrefs.length, 4, listing.text);
  assert.match(listing.text, /<CS:getctag>[a-f0-9]{64}<\/CS:getctag>/);
  const multiget = await env.request(calendar, { method: 'REPORT', headers: { ...auth, Depth: '1', 'Content-Type': 'application/xml' },
    body: `<c:calendar-multiget xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"><d:prop><d:getetag/><c:calendar-data/></d:prop><d:href>${hrefs[0]}</d:href></c:calendar-multiget>` });
  assert.equal(multiget.status, 207, multiget.text);
  assert.equal((multiget.text.match(/<D:response>/g) || []).length, 1);
  assert.match(multiget.text, /<C:calendar-data>BEGIN:VCALENDAR/);
  const query = await env.request(calendar, { method: 'REPORT', headers: { ...auth, Depth: '1' }, body: '<c:calendar-query xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"><d:prop><c:calendar-data/></d:prop></c:calendar-query>' });
  assert.equal((query.text.match(/<D:response>/g) || []).length, 4);
  const single = await env.request(hrefs[0], { headers: auth });
  assert.equal(single.status, 200);
  assert.match(single.text, /BEGIN:VEVENT/);
  assert.equal((single.text.match(/BEGIN:VEVENT/g) || []).length, 1);
  assert.ok(single.headers.get('etag'));
  assert.equal((await env.request(hrefs[0], { method: 'PUT', headers: { ...auth, 'Content-Type': 'text/calendar' }, body: 'BEGIN:VCALENDAR' })).status, 403, 'Schreibgeschützt');
  assert.equal((await env.request(hrefs[0], { method: 'DELETE', headers: auth })).status, 403);

  // Fremde Kalender bleiben unsichtbar – auch mit gültigen eigenen Zugangsdaten.
  assert.equal((await env.request(`/caldav/${strangerId}/pflege/`, { method: 'PROPFIND', headers: { ...auth, Depth: '1' }, body: propfind })).status, 404);
  const strangerAccess = (await env.request('/api/me/caldav', { headers: strangerHeaders })).data;
  assert.notEqual(strangerAccess.password, access.data.password);
  assert.equal((await env.request(calendar, { headers: basic('kalender_fremd', strangerAccess.password) })).status, 404);
  assert.equal((await env.request(calendar, { headers: basic('kalender_fremd', access.data.password) })).status, 401);

  // Neues Passwort sperrt das alte sofort.
  const renewed = await env.request('/api/me/caldav/password', { method: 'POST', headers });
  assert.equal(renewed.status, 200);
  assert.notEqual(renewed.data.password, access.data.password);
  assert.equal((await env.request(calendar, { headers: auth })).status, 401);
  assert.equal((await env.request(calendar, { headers: basic('kalender_owner', renewed.data.password) })).status, 200);

  // Sicherung: Aufgaben bleiben, CalDAV-Zugänge werden nach der Wiederherstellung neu erzeugt.
  assert.equal((await env.request('/api/admin/backups/config', { method: 'PUT', headers, body: { password: 'backup-test-password' } })).status, 200);
  const backup = await env.request('/api/admin/backups/create', { method: 'POST', headers });
  assert.equal(backup.status, 200, backup.text);
  assert.equal((await env.request(`${root}/tasks/${water.data.id}`, { method: 'DELETE', headers })).status, 200);
  assert.equal((await env.request(`/api/admin/backups/${encodeURIComponent(backup.data.filename)}/restore`, { method: 'POST', headers })).status, 200);
  const restoredTasks = (await env.request(root + '/tasks', { headers })).data;
  assert.deepEqual(restoredTasks.map(task => task.id).sort(), [water.data.id, prune.data.id].sort());
  assert.equal((await env.request(calendar, { headers: basic('kalender_owner', renewed.data.password) })).status, 401, 'Wiederhergestellte Konten erben keine Kalenderzugänge');
  const next = await env.request(root + '/tasks', { method: 'POST', headers, body: { type: 'care', interval: 1, unit: 'days', start_date: shift(1) } });
  assert.ok(next.data.id > Math.max(water.data.id, prune.data.id));

  assert.equal((await env.request(root, { method: 'DELETE', headers })).status, 200);
  assert.equal((await env.request('/api/me/calendar.ics', { headers })).text.includes('BEGIN:VEVENT'), false, 'Gelöschte Aquarien verschwinden aus dem Kalender');
});

test('CalDAV: wiederholte Fehlanmeldungen werden begrenzt', { timeout: 60000 }, async t => {
  const env = createTestEnvironment();
  t.after(() => env.cleanup());
  const user = await env.createUserAndLogin('kalender_limit');
  const id = (await env.request('/api/me', { headers: { Cookie: user.cookie } })).data.id;
  let status = 0;
  for (let attempt = 0; attempt < 25 && status !== 429; attempt++) status = (await env.request(`/caldav/${id}/pflege/`, { headers: basic('kalender_limit', 'falsch-' + attempt) })).status;
  assert.equal(status, 429);
});

for (const backend of ['sqlite', 'mongodb']) test(`Pflegeaufgaben offline: Operations-IDs, Ausgangsstand und lokale Fälligkeit (${backend})`, { timeout: 90000 }, async t => {
  const env = backend === 'mongodb' ? await createMongoTestEnvironment() : createTestEnvironment();
  t.after(() => env.cleanup());
  const user = await env.createUserAndLogin('aufgaben_offline'), headers = { Cookie: user.cookie };
  const owner = (await env.request('/api/me', { headers })).data.id;
  const command = (path, method, body = {}, base = null) => ({ id: randomUUID(), owner, path, method, body, base });
  const post = op => env.request('/api/offline/operations', { method: 'POST', headers, body: op });
  const created = await post(command('/aquariums', 'POST', { name: 'Offline-Aufgaben', volume_l: 60 }));
  const root = '/aquariums/' + created.data.result.id;
  const add = command(root + '/tasks', 'POST', { type: 'filter_clean', interval: 4, unit: 'weeks', start_date: shift(2) });
  const first = await post(add);
  assert.equal(first.status, 200, first.text);
  assert.deepEqual((await post(add)).data, first.data, 'Wiederholung erzeugt keine zweite Aufgabe');
  const state = (await env.request('/api/offline/state', { headers })).data;
  assert.equal(state.responses[root + '/tasks'].length, 1);
  const path = `${root}/tasks/${first.data.result.id}`;
  assert.ok(state.versions[path]);
  const edit = await post(command(path, 'PUT', { type: 'filter_clean', interval: 6, unit: 'weeks', start_date: shift(2) }, state.versions[path]));
  assert.equal(edit.status, 200, edit.text);
  const stale = await post(command(path, 'DELETE', {}, state.versions[path]));
  assert.equal(stale.status, 409, 'Veralteter Stand wird zur Entscheidung angezeigt');
  assert.equal((await post(command(path, 'DELETE', {}, stale.data.conflict.version))).status, 200);
  assert.equal((await env.request(`/api${root}/tasks`, { headers })).data.length, 0);

  const { applyLocalOperation, deriveWorkspace } = require('../dist/backend/src/shared/offline-workspace-model');
  const { workspaceWrite } = require('../dist/backend/src/shared/offline-workspace');
  assert.equal(workspaceWrite('/aquariums/3/tasks', 'POST'), true);
  assert.equal(workspaceWrite('/aquariums/3/tasks/-4', 'PUT'), true);
  const local = '/aquariums/3';
  const snapshot = { schema: 1, owner: 1, language: 'de', updatedAt: '', versions: {}, rules: { profiles: {}, parameters: [] }, responses: {
    '/me': { username: 'demo' }, '/config': { maintenanceTypes: { water_change: { label: 'Wasserwechsel' }, fertilize: {} }, suites: [], userPreferences: {} }, '/aquariums': [{ id: 3, name: 'Demo' }],
    [local]: { aquarium: { id: 3, water_type: 'fresh', created_at: '2026-01-01T00:00:00.000Z' }, role: 'owner', alerts: [] },
    [local + '/maintenance']: [{ id: 1, type: 'water_change', logged_at: new Date().toISOString() }], [local + '/tasks']: [] } };
  const run = (opPath, method, body) => applyLocalOperation(snapshot, { id: randomUUID(), owner: 1, kind: 'workspace', aquarium: '3', path: opPath, method, body, base: null, temporaryIds: [-9], createdAt: new Date().toISOString() });
  run(local + '/tasks', 'POST', { type: 'water_change', interval: 10, unit: 'days', start_date: shift(-30) });
  assert.throws(() => run(local + '/tasks', 'POST', { type: 'fertilize', interval: 1, unit: 'days', start_date: shift(0) }), /Pflegeart/);
  deriveWorkspace(snapshot);
  assert.equal(snapshot.responses[local + '/tasks'][0].next_due_date, shift(10), 'Fälligkeit wird lokal aus dem Logbuch berechnet');
});

test('Pflegeaufgaben und Kalender: Oberfläche, Sprachen und Online-Grenzen', () => {
  const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
  const de = { ...JSON.parse(read('public/locales/de.json')), ...JSON.parse(read('public/locales/features.de.json')) }, en = { ...JSON.parse(read('public/locales/en.json')), ...JSON.parse(read('public/locales/features.en.json')) };
  for (const section of ['careTasks', 'calendar']) assert.deepEqual(Object.keys(en[section]).sort(), Object.keys(de[section]).sort(), section);
  assert.equal(de.profile.tabs.calendar, 'Kalender');
  const settings = read('public/frontend/components/CalendarSettings.vue');
  assert.match(settings, /networkOnly: true/, 'CalDAV-Zugangsdaten werden nie offline vorgemerkt');
  assert.match(read('public/frontend/views/AquariumView.vue'), /CareTaskSection = lazyComponent/);
  assert.match(read('public/frontend/views/ProfileView.vue'), /CalendarSettings = lazyComponent/);
  assert.doesNotMatch(read('public/frontend/service-worker.ts'), /caldav/i, 'Der Service Worker speichert keine Kalenderdaten');
});

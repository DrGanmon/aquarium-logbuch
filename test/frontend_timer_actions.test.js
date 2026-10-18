'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const compile = file => ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;

test('Timer-Aktionen wechseln ohne Datenverlust, lassen den offenen Test unverändert und prüfen Konto und Timerfassung', async () => {
  const a = { values: { ph: '7,2' }, timers: { ph: 123 }, completed: { ph: 123 } };
  const b = { values: { ph: '6,8' }, timers: { ph: 456 }, completed: {} };
  const measurementDrafts = { a, b };
  const route = { value: { path: '/a/b/messen' } };
  const session = { user: { id: 1 } };
  const location = { hash: '#/a/b/messen' }, messages = [];
  const exports = {};
  new Function('require', 'exports', 'location', 'navigator', compile('public/frontend/composables/measurement-timers.ts'))(
    id => id.includes('measurement-drafts') ? { measurementDrafts } : id.includes('router') ? { route } : { session }, exports, location,
    { serviceWorker: { getRegistration: async () => ({ active: { postMessage: message => messages.push(message) } }) } },
  );
  exports.openMeasurementTest('b');
  assert.equal(location.hash, '#/a/b/messen');
  const data = { type: 'OPEN_MEASUREMENT_TIMER', aquariumId: 'a', testKey: 'ph', endTime: 123, userId: 2 };
  exports.handleMeasurementTimerMessage({ data });
  assert.equal(location.hash, '#/a/b/messen');
  data.userId = 1;
  exports.handleMeasurementTimerMessage({ data });
  assert.equal(location.hash, '#/a/a/messen?resume=1');
  assert.equal(b.values.ph, '6,8');
  assert.equal(a.values.ph, '7,2');
  await exports.stopMeasurementTimer('a', 'ph', 122);
  assert.equal(a.timers.ph, 123);
  await exports.stopMeasurementTimer('a', 'ph', 123);
  assert.deepEqual(a.timers, {});
  assert.deepEqual(a.completed, {});
  assert.equal(b.timers.ph, 456);
  assert.equal(messages[0].type, 'CANCEL_TIMER');
});

function worker() {
  const handlers = {}, scheduled = [], notifications = [], messages = [], opened = [];
  let focused = 0, closed = 0;
  const client = { id: 'original', url: 'https://example.test/app/#/a/b/messen', postMessage: data => messages.push(data), focus: async () => { focused++; } };
  const scope = {
    registration: { scope: 'https://example.test/app/', showNotification: async (title, options) => notifications.push({ title, ...options }), getNotifications: async () => [] },
    location: { href: 'https://example.test/app/sw.js' },
    clients: { matchAll: async () => [client], openWindow: async url => opened.push(url) },
    addEventListener: (type, callback) => { handlers[type] = callback; },
  };
  new Function('self', 'exports', 'setTimeout', 'clearTimeout', compile('public/frontend/service-worker.ts'))(scope, {}, callback => { scheduled.push(callback);return scheduled.length; }, () => {});
  const dispatch = async (type, data) => { const promises = [];handlers[type]({ ...data, waitUntil: promise => promises.push(promise) });await Promise.all(promises); };
  const click = action => dispatch('notificationclick', { action, notification: { data: notifications[0].data, close: () => { closed++; } } });
  return { dispatch, scheduled, notifications, messages, opened, client, click, focused: () => focused, closed: () => closed };
}
test('Systembenachrichtigung bietet beide Aktionen und öffnet den ursprünglichen Tab per Nachricht ohne Neuladen', async () => {
  const w = worker();
  await w.dispatch('message', { source: w.client, data: { type: 'SCHEDULE_TIMER', timerId: 'a:ph', aquariumId: 'a', testKey: 'ph', userId: 1, endTime: 123, url: 'https://example.test/app/#/a/a/messen?resume=1' } });
  w.scheduled[0]();
  await Promise.resolve();
  assert.deepEqual(w.notifications[0].actions.map(action => action.action), ['stop-timer', 'open-test']);
  await w.click('open-test');
  assert.equal(w.messages[0].type, 'OPEN_MEASUREMENT_TIMER');
  assert.equal(w.focused(), 1);
  assert.deepEqual(w.opened, []);
  await w.click('stop-timer');
  assert.equal(w.messages[1].type, 'STOP_MEASUREMENT_TIMER');
  assert.equal(w.focused(), 1);
  assert.equal(w.closed(), 2);
});

test('Eine alte Systembenachrichtigung beendet keinen inzwischen neu gestarteten Timer', async () => {
  const w = worker();
  const data = { type: 'SCHEDULE_TIMER', timerId: 'a:ph', aquariumId: 'a', testKey: 'ph', userId: 1, endTime: 123, url: 'https://example.test/app/#/a/a/messen?resume=1' };
  await w.dispatch('message', { source: w.client, data });
  w.scheduled[0]();
  await w.dispatch('message', { source: w.client, data: { ...data, endTime: 456 } });
  await w.click('stop-timer');
  assert.deepEqual(w.messages, []);
  assert.deepEqual(w.opened, []);
});

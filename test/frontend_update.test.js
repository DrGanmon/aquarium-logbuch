'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const CURRENT = 'a'.repeat(64), NEXT = 'b'.repeat(64);
test('Frontend-Inhaltshash: Reihenfolge bleibt neutral, geänderte Dateien und Service Worker ändern die Version', () => {
  const { frontendRevision } = require('../scripts/frontend-revision');
  const files = { './': '<html></html>', 'dist/app.js': 'app', 'dist/style.css': 'style' };
  const original = frontendRevision(files, 'worker');
  assert.deepEqual(frontendRevision(Object.fromEntries(Object.entries(files).reverse()), 'worker'), original);
  for (const name of Object.keys(files)) {
    const changed = frontendRevision({ ...files, [name]: files[name] + ' changed' }, 'worker');
    assert.notEqual(changed.version, original.version);
    assert.notEqual(changed.assets[name], original.assets[name]);
  }
  assert.notEqual(frontendRevision(files, 'updated worker').version, original.version);
  assert.equal(frontendRevision({ ...files, 'dist/app.js': 'changed' }, 'worker').assets['dist/style.css'], original.assets['dist/style.css']);
});
function setup(fetch, serviceWorker = true) {
  let mount, unmount, tick, reloads = 0, updates = 0;
  const events = {}, messages = [];
  const registration = { waiting: null, installing: null, addEventListener(type, fn) { events[type] = fn; }, removeEventListener() {}, async update() { updates++; } };
  const navigator = { onLine: true };
  if (serviceWorker) navigator.serviceWorker = { controller: { postMessage: message => messages.push(message) }, register: async () => registration, addEventListener(type, fn) { events[type] = fn; }, removeEventListener() {} };
  const document = { visibilityState: 'visible', baseURI: 'https://example.test/aquarium/', querySelector: selector => ({ content: selector.includes('frontend-version') ? CURRENT : '1.2.3-ALPHA' }), addEventListener() {}, removeEventListener() {} };
  const source = fs.readFileSync('public/frontend/composables/frontend-update.ts', 'utf8').replace('import.meta.env.DEV', 'false');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports = {};
  new Function('require', 'exports', 'document', 'navigator', 'window', 'fetch', 'setInterval', 'clearInterval', code)(
    () => ({ ref: value => ({ value }), onMounted: fn => { mount = fn; }, onBeforeUnmount: fn => { unmount = fn; } }),
    exports, document, navigator, { location: { reload: () => { reloads++; } }, addEventListener() {}, removeEventListener() {} }, fetch, fn => { tick = fn; }, () => {},
  );
  const state = exports.useFrontendUpdate();
  const flush = () => new Promise(resolve => setImmediate(resolve));
  return { ...exports, state, document, navigator, mount, unmount, events, messages, registration, reloads: () => reloads, updates: () => updates, tick: async () => { tick();await flush(); }, flush };
}
const response = frontendVersion => ({ ok: true, json: async () => ({ version: '1.2.4-ALPHA', frontendVersion }) });
test('Frontend: gleiche Inhalte lösen trotz neuer App-Version kein Update aus', async () => {
  const app = setup(async (url, options) => {
    assert.equal(url.href, 'https://example.test/aquarium/dist/version.json');assert.equal(options.cache, 'no-store');return response(CURRENT);
  });
  app.mount();await app.flush();
  assert.equal(app.appVersion.value, '1.2.4-ALPHA');assert.equal(app.state.availableVersion.value, '');assert.equal(app.updates(), 0);
  for (const value of ['invalid', null, undefined, '', 12]) assert.equal(app.isFrontendVersion(value), false);
  app.unmount();
});
test('Frontend: andere Inhaltsversion einschließlich Rollback melden, Später gilt nur für diesen Hash', async () => {
  let version = NEXT;
  const app = setup(async () => response(version));app.mount();await app.flush();
  assert.equal(app.state.availableVersion.value, NEXT);assert.equal(app.reloads(), 0);
  app.state.dismiss();await app.tick();assert.equal(app.state.availableVersion.value, '');
  version = '0'.repeat(64);await app.tick();assert.equal(app.state.availableVersion.value, version);
  app.unmount();
});
test('Frontend: Update erst nach Vorbereitung und Klick aktivieren; andere Tabs werden nicht neu geladen', async () => {
  const app = setup(async () => response(NEXT));app.mount();await app.flush();
  assert.equal(app.state.ready.value, false);app.events.controllerchange();assert.equal(app.reloads(), 0);
  app.registration.waiting = { postMessage: message => app.messages.push(message) };app.events.updatefound();
  assert.equal(app.state.ready.value, false, 'A waiting worker must identify the offered build first');
  app.events.message({ source: app.registration.waiting, data: { type: 'FRONTEND_VERSION', version: NEXT } });
  assert.equal(app.state.ready.value, true);
  app.state.reload();assert.deepEqual(app.messages.at(-1), { type: 'ACTIVATE_UPDATE', version: NEXT });assert.equal(app.reloads(), 0);
  app.events.controllerchange();assert.equal(app.reloads(), 1);app.unmount();
});
test('Frontend: nach Aktivierung in einem anderen Tab erst nach Bestätigung neu laden', async () => {
  const app = setup(async () => response(NEXT));app.mount();await app.flush();
  app.events.controllerchange();
  app.events.message({ source: app.navigator.serviceWorker.controller, data: { type: 'FRONTEND_VERSION', version: NEXT } });
  assert.equal(app.state.ready.value, true);assert.equal(app.reloads(), 0);
  app.state.reload();assert.equal(app.reloads(), 1);app.unmount();
});
test('Frontend: ein anderer wartender Build ist nicht für das angebotene Update bereit', async () => {
  const app = setup(async () => response(NEXT));app.mount();await app.flush();
  app.registration.waiting = { postMessage: message => app.messages.push(message) };app.events.updatefound();
  app.events.message({ source: app.registration.waiting, data: { type: 'FRONTEND_VERSION', version: CURRENT } });
  assert.equal(app.state.ready.value, false);
  app.state.reload();assert.equal(app.reloads(), 0);assert.ok(!app.messages.some(message => message.type === 'ACTIVATE_UPDATE'));
  app.unmount();
});
test('Frontend: Netzwerkfehler erneut versuchen; offline, versteckte und abgebaute Ansichten prüfen nicht', async () => {
  let calls = 0;
  const app = setup(async () => { if (++calls === 1) throw new Error('offline');return response(NEXT); });
  app.mount();await app.flush();assert.equal(app.state.availableVersion.value, '');
  app.document.visibilityState = 'hidden';await app.tick();assert.equal(calls, 1);
  app.document.visibilityState = 'visible';app.navigator.onLine = false;await app.tick();assert.equal(calls, 1);
  app.navigator.onLine = true;await app.tick();assert.equal(app.state.availableVersion.value, NEXT);
  app.unmount();await app.tick();assert.equal(calls, 2);
});

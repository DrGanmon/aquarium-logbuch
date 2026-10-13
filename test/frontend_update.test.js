'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');

function setup(fetch) {
  let mount, unmount, tick;
  const document = { visibilityState: 'visible', baseURI: 'https://example.test/aquarium/', addEventListener() {}, removeEventListener() {} };
  const source = fs.readFileSync('public/frontend/composables/frontend-update.ts', 'utf8').replace('import.meta.env.DEV', 'false');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports = {};
  new Function('require', 'exports', 'document', 'navigator', 'window', 'fetch', '__APP_VERSION__', 'setInterval', 'clearInterval', code)(
    () => ({ ref: value => ({ value }), onMounted: fn => { mount = fn; }, onBeforeUnmount: fn => { unmount = fn; } }),
    exports, document, { onLine: true }, { addEventListener() {}, removeEventListener() {} }, fetch, '1.2.3-ALPHA', fn => { tick = fn; }, () => {},
  );
  const state = exports.useFrontendUpdate();
  const flush = () => new Promise(resolve => setImmediate(resolve));
  return { ...exports, state, document, mount, unmount, tick: async () => { tick(); await flush(); }, flush };
}

test('Frontend-Versionen werden numerisch verglichen, einschließlich Patch und ungültiger Antworten', () => {
  const { isNewerVersion } = setup();
  for (const version of ['1.2.4-ALPHA', '1.2.3-1-ALPHA', '1.10.0-ALPHA', '2.0.0-ALPHA']) assert.equal(isNewerVersion(version, '1.2.3-ALPHA'), true);
  for (const version of ['1.2.3-ALPHA', '1.2.2-9-ALPHA', '1.1.9-ALPHA', 'invalid', null, '1.2.3-0-ALPHA']) assert.equal(isNewerVersion(version, '1.2.3-ALPHA'), false);
});

test('Prüfung nutzt Unterpfad und no-store; Später unterdrückt dieselbe Version, weitere Updates erscheinen', async () => {
  let version = '1.2.4-ALPHA';
  const app = setup(async (url, options) => {
    assert.equal(url.href, 'https://example.test/aquarium/dist/version.json');
    assert.equal(options.cache, 'no-store');
    return { ok: true, json: async () => ({ version }) };
  });
  app.mount();await app.flush();
  assert.equal(app.state.availableVersion.value, version);
  app.state.dismiss();await app.tick();assert.equal(app.state.availableVersion.value, '');
  version = '1.2.5-ALPHA';await app.tick();assert.equal(app.state.availableVersion.value, version);
  app.unmount();
});

test('Netzwerkfehler werden erneut versucht; versteckte und abgebaute Ansichten prüfen nicht', async () => {
  let calls = 0;
  const app = setup(async () => {
    if (++calls === 1) throw new Error('offline');
    return { ok: true, json: async () => ({ version: '2.0.0-ALPHA' }) };
  });
  app.mount();await app.flush();assert.equal(app.state.availableVersion.value, '');
  app.document.visibilityState = 'hidden';await app.tick();assert.equal(calls, 1);
  app.document.visibilityState = 'visible';await app.tick();assert.equal(app.state.availableVersion.value, '2.0.0-ALPHA');
  app.unmount();await app.tick();assert.equal(calls, 2);
});

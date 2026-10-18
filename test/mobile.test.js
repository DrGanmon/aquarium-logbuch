'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
function load(file, globals = {}, imports = {}) {
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  const names = Object.keys(globals);
  new Function('exports', 'require', ...names, code)(exports, name => imports[name], ...Object.values(globals));
  return exports;
}
const runtime = () => load('public/frontend/mobile-runtime.ts');
test('Mobile: HTTPS-Server einschließlich Unterpfad normalisieren; unsichere Adressen ablehnen', () => {
  const { normalizeServer } = runtime();
  assert.equal(normalizeServer(' https://EXAMPLE.org/aquarium/// '), 'https://example.org/aquarium/');
  for (const value of ['http://example.org', 'https://user:secret@example.org', 'https://example.org/?token=a', 'https://example.org/#/login', 'javascript:alert(1)', 'example.org'])
    assert.throws(() => normalizeServer(value));
});
test('Mobile: nur API und Katalogbilder umleiten; lokale Chunks, externe URLs und Query erhalten', () => {
  const { serverRequestUrl } = runtime();
  const resolve = input => serverRequestUrl(input, 'https://example.org/aquarium/', 'https://localhost/');
  assert.equal(resolve('api/me'), 'https://example.org/aquarium/api/me');
  assert.equal(resolve(new URL('https://localhost/api/offline/state?lang=en')), 'https://example.org/aquarium/api/offline/state?lang=en');
  assert.equal(resolve('species-images/fish.webp'), 'https://example.org/aquarium/species-images/fish.webp');
  assert.equal(resolve('dist/chunk.js'), 'https://localhost/dist/chunk.js');
  assert.equal(resolve('https://external.test/api/me'), 'https://external.test/api/me');
  assert.equal(serverRequestUrl('/api/me', 'https://example.org/', 'https://localhost/sub/'), 'https://localhost/api/me');
});
test('Mobile: native Fetch-Anbindung erhält Body, Header und Abbruch; kein weiterer Serverwechsel im laufenden Prozess', async () => {
  const calls = [], document = { baseURI: 'https://localhost/', documentElement: { dataset: {} } };
  let finish;
  const window = { fetch: (input, init) => { calls.push({ input, init });return new Promise(resolve => { finish = resolve; }); } };
  const { installServerTransport } = load('public/frontend/mobile-runtime.ts', { window, document });
  installServerTransport('https://example.org/aquarium');
  const controller = new AbortController();
  const pending = window.fetch('api/login', { method: 'POST', body: '{"username":"demo"}', headers: { 'X-Requested-With': 'fetch' }, signal: controller.signal });
  assert.equal(calls[0].input, 'https://example.org/aquarium/api/login');
  assert.equal(calls[0].init.credentials, 'include');
  assert.equal(calls[0].init.body, '{"username":"demo"}');
  assert.equal(calls[0].init.headers['X-Requested-With'], 'fetch');
  controller.abort();
  await assert.rejects(pending, { name: 'AbortError' });
  finish(new Response('{}'));
  assert.equal(document.documentElement.dataset.mobileServer, 'https://example.org/aquarium/');
  assert.throws(() => installServerTransport('https://other.test/'), /neu laden/);
});
test('Mobile: Offline-Datenbanken nach Server und Unterpfad trennen; Web-Datenbank erhalten', async () => {
  async function name(server) {
    let result;
    const store = load('public/frontend/offline-store.ts', {
      navigator: { onLine: true }, document: { baseURI: 'https://localhost/a/', documentElement: { dataset: server ? { mobileServer: server } : {} } },
      indexedDB: { open(value) { result = value;const request = {};queueMicrotask(() => request.onerror());return request; } },
    }, { vue: { reactive: value => value } });
    await store.readLocal('activeOwner').catch(() => {});
    return result;
  }
  assert.equal(await name(), 'aquarium-offline:/a/');
  const first = await name('https://server-a.test/a/');
  assert.notEqual(first, await name('https://server-b.test/a/'));
  assert.notEqual(first, await name('https://server-a.test/b/'));
});
test('Mobile: native Netzwerkfehler aktivieren denselben Offline-Pfad wie Browser-Fetch', async () => {
  const document = { baseURI: 'https://localhost/', documentElement: { dataset: {} } };
  const failure = new Error('Unable to resolve host');
  const window = { fetch: async () => { throw failure; } };
  load('public/frontend/mobile-runtime.ts', { window, document }).installServerTransport('https://server.test/');
  await assert.rejects(window.fetch('api/me'), error => error instanceof TypeError && error.cause === failure);
});
test('Mobile: absolute eigene Server-URLs genauso behandeln, fremde Hosts und Installationen unverändert lassen', async () => {
  const calls = [], document = { baseURI: 'https://localhost/', documentElement: { dataset: {} } };
  const window = { fetch: async (input, options) => { calls.push({ input, options });return new Response('{}'); } };
  load('public/frontend/mobile-runtime.ts', { window, document }).installServerTransport('https://server.test/app/');
  await window.fetch('https://server.test/app/api/me', { credentials: 'same-origin' });
  assert.equal(calls[0].options.credentials, 'include');
  await window.fetch('https://other.test/api/me', { credentials: 'omit' });
  assert.equal(calls[1].options.credentials, 'omit');
  await window.fetch('https://server.test/other/api/me', { credentials: 'omit' });
  assert.equal(calls[2].options.credentials, 'omit');
});
test('Mobile: Chat nutzt JSON ohne vorgetäuschte Live-Statusmeldungen; Web-Chat streamt weiterhin', async () => {
  for (const mobile of [true, false]) {
    const stages = [];
    const chat = load('public/frontend/chat-request.ts', {
      document: { documentElement: { dataset: { mobile: String(mobile) } } },
      fetch: async (_url, options) => {
        const body = JSON.parse(options.body);
        assert.equal(body.progress, !mobile);
        return new Response(mobile ? '{"reply":"Antwort"}' : '{"type":"status","stage":"history"}\n{"type":"done","reply":"Antwort"}\n');
      },
    }, { './state': { session: { user: { id: 1 } }, language: { value: 'de' } }, './offline-store': { offlineState: {} } });
    const result = await chat.chatRequest('/aquariums/1/chat', { message: 'Hallo', progress: true }, new AbortController().signal, stage => stages.push(stage));
    assert.equal(result.reply, 'Antwort');
    assert.deepEqual(stages, [mobile ? 'generating' : 'history']);
  }
});
test('Mobile: eigenes Paket enthält alle Chunks, aber keine Shell-Caches, Katalogdaten oder Backenddateien', async () => {
  await require('../scripts/build-mobile').buildMobile();
  const files = fs.readdirSync('dist/mobile', { recursive: true });
  assert.ok(files.includes('index.html'));
  assert.ok(files.includes('dist/app.min.js'));
  assert.ok(files.some(file => /chunk-main-.*\.js$/.test(file)));
  assert.ok(!files.some(file => /(?:sw\.js|handbuch|species-images|plants-images|backend|species.*\.json)/.test(file)));
  assert.match(fs.readFileSync('dist/mobile/index.html', 'utf8'), /aquarium-app-version/);
});

'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const vue = require('vue');

function load(file, globals = {}, imports = {}) {
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports = {};
  new Function('exports', 'require', ...Object.keys(globals), code)(exports, name => imports[name], ...Object.values(globals));
  return exports;
}
function fixture() {
  const session = vue.reactive({ user: { id: 7 } });
  const records = new Map([['activeOwner', 7]]), pending = [], calls = [], urls = [], revoked = [];
  let request = async () => new Response('remote', { headers: { 'Content-Type': 'image/png', 'X-Aquarium-User': '7' } });
  const document = { baseURI: 'https://localhost/', documentElement: { dataset: { mobile: 'true', mobileServer: 'https://aquarium.test/sub/' } } };
  const window = new EventTarget();
  class ImageURL extends URL {
    static createObjectURL(blob) { urls.push(blob);return `blob:test-${urls.length}`; }
    static revokeObjectURL(url) { revoked.push(url); }
  }
  const images = load('public/frontend/mobile-images.ts', {
    document, window, URL: ImageURL,
    fetch: (...args) => { calls.push(args);return request(...args); },
  }, {
    vue, './state': { session },
    './mobile-runtime': load('public/frontend/mobile-runtime.ts'),
    './offline-store': {
      activeOwner: async () => records.get('activeOwner'),
      readLocal: async key => records.get(key), pendingFor: async () => pending,
      writeCatalogImage: async (path, blob) => records.set('catalog-image:' + path, blob),
    },
  });
  return { ...images, session, records, pending, calls, urls, revoked, window, request: fn => { request = fn; } };
}
const path = 'api/aquariums/1/image';
const key = 'private-image:7:aquariums/1/image';
const blob = text => new Blob([text], { type: 'image/png' });
const flush = () => new Promise(resolve => setImmediate(resolve));

test('Mobile Bilder: relative und absolute Serverpfade erkennen, fremde Server und Installationen nicht authentifiziert laden', () => {
  const f = fixture();
  assert.equal(f.mobileImageResource(path).kind, 'private');
  assert.equal(f.mobileImageResource('/api/me/avatar?t=1').request, 'api/me/avatar?t=1');
  assert.equal(f.mobileImageResource('https://aquarium.test/sub/species-images/a.webp').kind, 'catalog');
  assert.equal(f.mobileImageResource('api/social/posts/1/image').kind, 'social');
  for (const source of ['data:image/png;base64,AQID', 'blob:local', 'favicon.ico', 'https://other.test/api/me/avatar', 'https://aquarium.test/other/api/me/avatar', 'https://user:secret@aquarium.test/sub/api/me/avatar'])
    assert.equal(f.mobileImageResource(source), undefined);
});
test('Mobile Bilder: vorgemerkte lokale Bytes bevorzugen, verwaiste Marker nicht übernehmen', async () => {
  const f = fixture(), local = blob('local');
  f.records.set(key, local);f.records.set(key + ':pending', 'edit');f.pending.push({ id: 'edit', owner: 7 });
  assert.equal(await f.loadMobileImage(path, 7, new AbortController().signal), local);
  assert.equal(f.calls.length, 0);
  f.pending.length = 0;
  assert.equal(await (await f.loadMobileImage(path, 7, new AbortController().signal)).text(), 'remote');
  assert.equal(f.records.get(key), local, 'Display requests must not overwrite pending or synchronized private bytes');
});
test('Mobile Bilder: nur Netzwerkfehler erlauben Offline-Fallback; HTTP- und Kontofehler bleiben sichtbar', async () => {
  const f = fixture(), local = blob('cached');f.records.set(key, local);
  f.request(async () => { throw new TypeError('offline'); });
  assert.equal(await f.loadMobileImage(path, 7, new AbortController().signal), local);
  for (const status of [401, 403, 404, 500]) {
    f.request(async () => new Response('denied', { status }));
    await assert.rejects(f.loadMobileImage(path, 7, new AbortController().signal), new RegExp(`HTTP ${status}`));
  }
  f.request(async () => new Response('other account', { headers: { 'Content-Type': 'image/png', 'X-Aquarium-User': '8' } }));
  await assert.rejects(f.loadMobileImage(path, 7, new AbortController().signal), /aktiven Konto/);
  f.records.set('activeOwner', 8);
  await assert.rejects(f.loadMobileImage(path, 7, new AbortController().signal), /Konto/);
});
test('Mobile Bilder: während Download vorgemerkte Änderung erhalten; abgemeldetes Konto erhält keine verspäteten Bilder', async () => {
  const f = fixture();let finish;
  f.request(() => new Promise(resolve => { finish = resolve; }));
  const result = f.loadMobileImage(path, 7, new AbortController().signal);
  await flush();
  const local = blob('new local');f.records.set(key, local);f.records.set(key + ':pending', 'edit');f.pending.push({ id: 'edit', owner: 7 });
  finish(new Response('old remote', { headers: { 'Content-Type': 'image/png', 'X-Aquarium-User': '7' } }));
  assert.equal(await result, local);
  const late = f.loadMobileImage('api/me/avatar', 7, new AbortController().signal);
  await flush();
  f.session.user = null;
  finish(new Response('old account', { headers: { 'Content-Type': 'image/png', 'X-Aquarium-User': '7' } }));
  await assert.rejects(late, /Konto/);
});
test('Mobile Bilder: nur öffentliche Katalogbilder speichern; Social bleibt online und HTML ist kein Bild', async () => {
  const f = fixture();
  await f.loadMobileImage('plants-images/a.webp', undefined, new AbortController().signal);
  assert.ok(f.records.get('catalog-image:plants-images/a.webp') instanceof Blob);
  f.request(async () => { throw new TypeError('offline'); });
  assert.ok(await f.loadMobileImage('plants-images/a.webp', undefined, new AbortController().signal) instanceof Blob);
  f.records.set('catalog-image:api/social/posts/1/image', blob('private social'));
  await assert.rejects(f.loadMobileImage('api/social/posts/1/image', 7, new AbortController().signal), /offline/);
  f.request(async () => new Response('<html>login</html>', { headers: { 'Content-Type': 'text/html', 'X-Aquarium-User': '7' } }));
  await assert.rejects(f.loadMobileImage(path, 7, new AbortController().signal), /Bildformat/);
});
test('Mobile Bilder: Objekt-URLs beim Kontowechsel und Entfernen freigeben; späte Antworten verwerfen', async () => {
  const f = fixture(), events = [];
  const element = { src: '', removeAttribute() { this.src = ''; }, dispatchEvent(event) { events.push(event.type); } };
  const dispose = f.attachMobileImage(element, path);
  await flush();
  assert.equal(element.src, 'blob:test-1');
  f.session.user = null;
  assert.equal(element.src, '');
  assert.deepEqual(f.revoked, ['blob:test-1']);
  await flush();dispose();
  let finish;
  f.session.user = { id: 7 };
  f.request(() => new Promise(resolve => { finish = resolve; }));
  const cancel = f.attachMobileImage(element, path);
  await flush();cancel();
  finish(new Response('late', { headers: { 'Content-Type': 'image/png', 'X-Aquarium-User': '7' } }));
  await flush();
  assert.equal(element.src, '');assert.equal(f.urls.length, 1);
});
test('Mobile Katalogbildspeicher: höchstens 200 Bilder, Größenlimit und keine privaten Löschungen', async () => {
  const records = new Map([['private-image:7:me/avatar', blob('private')]]);
  const db = { transaction() {
    const tx = { objectStore: () => ({
      get(key) { const request = {};queueMicrotask(() => { request.result = records.get(key);request.onsuccess(); });return request; },
      put(value, key) { records.set(key, value); }, delete(key) { records.delete(key); },
    }) };
    setImmediate(() => tx.oncomplete());return tx;
  } };
  const store = load('public/frontend/offline-store.ts', {
    navigator: { onLine: true }, document: { baseURI: 'https://localhost/', documentElement: { dataset: { mobileServer: 'https://aquarium.test/' } } },
    indexedDB: { open() { const request = {};queueMicrotask(() => { request.result = db;request.onsuccess(); });return request; } },
  }, { vue });
  for (let index = 0; index < 201; index++) await store.writeCatalogImage(`species-images/${index}.webp`, blob('public'));
  assert.equal(records.get('catalog-image-index').length, 200);
  assert.equal(records.has('catalog-image:species-images/0.webp'), false);
  assert.ok(records.has('private-image:7:me/avatar'));
  await assert.rejects(store.writeCatalogImage('api/me/avatar', blob('no')), /Katalogbildpfad/);
  await store.writeCatalogImage('species-images/large.webp', new Blob([new Uint8Array(2 * 1024 * 1024 + 1)], { type: 'image/webp' }));
  assert.equal(records.has('catalog-image:species-images/large.webp'), false);
});
test('Mobile Bilddirektive: veraltete Importe verwerfen, Bildwechsel bereinigen und lokale Vorschau erhalten', async () => {
  const attached = [], disposed = [], element = { src: path, removeAttribute() { this.src = ''; }, dispatchEvent() {} };
  const { serverImage } = load('public/frontend/server-image.ts', { document: { documentElement: { dataset: { mobile: 'true' } } } }, {
    './mobile-images': { attachMobileImage(el, source) { attached.push(source);el.src = 'blob:rendered';return () => { disposed.push(source);el.removeAttribute('src'); }; } },
  });
  serverImage.beforeMount(element, {}, { props: { src: path } });
  serverImage.updated(element, {}, { props: { src: 'api/me/avatar' } });
  await flush();
  assert.deepEqual(attached, ['api/me/avatar']);
  serverImage.updated(element, {}, { props: { src: 'data:image/png;base64,AQID' } });
  assert.deepEqual(disposed, ['api/me/avatar']);
  assert.equal(element.src, 'data:image/png;base64,AQID');
  serverImage.beforeUnmount(element);
});

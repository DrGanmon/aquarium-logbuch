'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

function load(file, imports, globals = {}, transform = source => source) {
  const source = transform(fs.readFileSync(file, 'utf8'));
  const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  const exports = {};
  vm.runInNewContext(code, { exports, require: name => imports[name], console, TypeError, Error, AbortSignal, ...globals }, { filename: file });
  return exports;
}
function syncFixture() {
  const session = { user: { id: 7 } };
  const state = { pending: [], syncing: false, offline: false, error: '' };
  const queued = [{ id: 'phone', owner: 7, aquarium: '42', body: { operation_id: 'phone', operation_user_id: 7, values: { ph: 7.2 } } }];
  const calls = [], events = [];
  let failure;
  let currentUser = 7;
  class ApiError extends Error { constructor(message, status) { super(message);this.status = status; } }
  const imports = {
    vue: { watch() {} },
    './state': { session, t: key => key },
    './api': { ApiError, api: async (path, options) => { calls.push({ path, ...options });if (failure) throw failure;return { id: 123 }; } },
    './offline-store': {
      offlineState: state,
      pendingFor: async owner => queued.filter(item => item.owner === owner),
      storePending: async (item, remove) => { if (remove) queued.splice(queued.findIndex(row => row.id === item.id), 1); },
    },
  };
  const sync = load('public/frontend/offline-sync.ts', imports, {
    fetch: async () => ({ ok: true, json: async () => ({ id: currentUser }) }),
    window: { dispatchEvent: event => events.push(event.type) }, Event,
  });
  return { sync, session, state, queued, calls, events, ApiError, fail: value => { failure = value; }, user: value => { currentUser = value; } };
}

test('Offline-Sync: lost response retains operation ID; retry removes only acknowledged entries', async () => {
  const f = syncFixture();
  f.fail(new TypeError('Connection lost after commit'));
  await f.sync.synchronize();
  assert.equal(f.queued.length, 1);
  assert.equal(f.state.offline, true);
  f.fail(undefined);
  await f.sync.synchronize();
  assert.equal(f.queued.length, 0);
  assert.equal(f.calls.length, 2);
  assert.equal(f.calls[0].body.operation_id, f.calls[1].body.operation_id);
  assert.deepEqual(f.events, ['aquarium-synchronized']);
});

test('Offline-Sync: fresh session for another account must never upload queued data', async () => {
  const f = syncFixture();
  f.user(8);
  await f.sync.synchronize();
  assert.equal(f.calls.length, 0);
  assert.equal(f.queued.length, 1);
  assert.equal(f.state.error, 'offline.accountChanged');
});

test('Offline-Sync: rejected entries remain visible for review', async () => {
  const f = syncFixture();
  f.fail(new f.ApiError('Write permission revoked', 403));
  await f.sync.synchronize();
  assert.equal(f.queued.length, 1);
  assert.equal(f.queued[0].error, 'Write permission revoked');
  assert.equal(f.state.pending.length, 1);
  assert.equal(f.state.syncing, false);
});

test('Offline-Sync: even an empty outbox refreshes data from other devices', async () => {
  const f = syncFixture();
  f.queued.length = 0;
  await f.sync.synchronize();
  assert.deepEqual(f.events, ['aquarium-synchronized']);
  assert.equal(f.calls.length, 0);
});

test('Offline shell: restart works from cached HTML/CSS, APIs bypass the shared cache', async () => {
  const listeners = {};
  const scopeUrl = 'https://example.test/aquarium/';
  const store = new Map();
  let offline = false;
  const shell = new Map();
  const cache = {
    addAll: async requests => { for (const request of requests) shell.set(request.url, new Response(request.url.endsWith('.css') ? 'body{}' : '<html>App</html>')); },
    match: async request => shell.get(typeof request === 'string' ? request : request.url),
  };
  store.set(`aquarium-shell:${scopeUrl}:old`, cache);
  store.set('another-app', cache);
  load('public/frontend/service-worker.ts', {}, {
    self: { registration: { scope: scopeUrl }, location: { origin: 'https://example.test' },
      addEventListener: (type, listener) => { listeners[type] = listener; }, skipWaiting: async () => {}, clients: { claim: async () => {} } },
    URL, Request, Response, Map, Set,
    caches: { open: async key => { store.set(key, cache);return cache; }, keys: async () => [...store.keys()], delete: async key => store.delete(key) },
    fetch: async () => { if (offline) throw new TypeError('offline');return new Response('network'); },
  }, source => source.replace('/* OFFLINE_ASSETS */ []', JSON.stringify(['./', 'dist/app.js', 'dist/style.css'])).replace("/* OFFLINE_BUILD */ 'dev'", "'new'"));
  let task;
  listeners.install({ waitUntil: promise => { task = promise; } });
  await task;
  listeners.activate({ waitUntil: promise => { task = promise; } });
  await task;
  assert.equal(store.has(`aquarium-shell:${scopeUrl}:old`), false);
  assert.equal(store.has('another-app'), true);
  offline = true;
  listeners.fetch({ request: { method: 'GET', mode: 'navigate', url: scopeUrl }, respondWith: promise => { task = promise; } });
  assert.equal(await (await task).text(), '<html>App</html>');
  listeners.fetch({ request: new Request(scopeUrl + 'dist/style.css'), respondWith: promise => { task = promise; } });
  assert.equal(await (await task).text(), 'body{}');
  let intercepted = false;
  listeners.fetch({ request: new Request(scopeUrl + 'api/me'), respondWith: () => { intercepted = true; } });
  assert.equal(intercepted, false);
});

function apiFixture() {
  const session = { user: { id: 7 } };
  const records = new Map([['activeOwner', 7]]);
  const state = { offline: false };
  let response = new Response(JSON.stringify({ aquarium: { id: 42 } }), { headers: { 'X-Aquarium-User': '7', 'Content-Type': 'application/json' } });
  let failure;
  const api = load('public/frontend/api.ts', {
    './state': { session, language: { value: 'de' }, t: key => key },
    './offline-store': { activeOwner: async () => records.get('activeOwner'), readLocal: async key => records.get(key),
      writeLocal: async (key, value) => { if (value === undefined) records.delete(key);else records.set(key, value); },
      cacheable: path => ['/me', '/config', '/aquariums/42'].includes(path), offlineState: state },
  }, { fetch: async () => { if (failure) throw failure;return response; } });
  return { api, records, session, state, fail: value => { failure = value; }, respond: value => { response = value; } };
}

test('Offline reads: cached user data works after network failure but never masks HTTP 401', async () => {
  const f = apiFixture();
  const data = await f.api.api('/aquariums/42');
  f.fail(new TypeError('offline'));
  assert.equal(JSON.stringify(await f.api.api('/aquariums/42')), JSON.stringify(data));
  assert.equal(f.state.offline, true);
  f.fail(undefined);
  f.respond(new Response('{"error":"Session expired"}', { status: 401 }));
  await assert.rejects(f.api.api('/aquariums/42'), error => error.status === 401);
  assert.equal(f.records.has('activeOwner'), false);
});

test('Offline reads: data from a changed account never enters the previous account cache', async () => {
  const f = apiFixture();
  f.respond(new Response('{"aquarium":{"id":99}}', { headers: { 'X-Aquarium-User': '8' } }));
  await assert.rejects(f.api.api('/aquariums/42'), error => error.status === 409);
  assert.equal(f.records.size, 0);
  assert.equal(f.session.user, null);
});

test('Offline identity survives language changes without mixing accounts', async () => {
  const f = apiFixture();
  f.respond(new Response('{"id":7,"language":"en"}', { headers: { 'X-Aquarium-User': '7' } }));
  await f.api.api('/me');
  assert.equal(f.records.has('7:identity:/me'), true);
  f.session.user = null;
  f.fail(new TypeError('offline'));
  assert.equal((await f.api.api('/me')).id, 7);
  f.records.set('activeOwner', 8);
  await assert.rejects(f.api.api('/me'), TypeError);
});

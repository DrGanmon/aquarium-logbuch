'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const vue = require('vue');
const { createTestEnvironment } = require('./helpers/env');
function load(file, globals, imports = {}) {
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports = {};
  new Function('exports', 'require', ...Object.keys(globals), code)(exports, name => imports[name], ...Object.values(globals));
  return exports;
}

test('Mobile Serveranbindung: lokale Anmeldung, API, Chat, abgelaufene Sitzung und Logout gegen echtes Backend', async t => {
  const env = createTestEnvironment();
  t.after(() => env.cleanup());
  await env.createUserAndLogin('mobile_session', 'password123');
  const records = new Map(), jar = new Map(), calls = [];
  const session = vue.reactive({ user: null, config: null });
  const document = { baseURI: 'https://localhost/', documentElement: { dataset: {} } };
  const window = new EventTarget();
  // This adapter models the native cookie jar but uses a real local backend.
  // It deliberately does not claim to test Android/iOS WebView cookie behavior.
  window.fetch = async (input, options = {}) => {
    const url = new URL(typeof input === 'string' ? input : input.url);
    assert.equal(url.origin, 'https://aquarium.test');
    assert.ok(url.pathname.startsWith('/installation/api/'));
    assert.equal(options.credentials, 'include');
    calls.push(url.pathname);
    const headers = Object.fromEntries(new Headers(options.headers).entries());
    if (jar.size) headers.Cookie = [...jar].map(([key, value]) => `${key}=${value}`).join('; ');
    const response = await fetch(env.getBaseUrl() + url.pathname.slice('/installation'.length) + url.search, { ...options, headers, redirect: 'manual' });
    for (const cookie of response.headers.getSetCookie()) {
      const pair = cookie.split(';')[0], separator = pair.indexOf('=');
      const key = pair.slice(0, separator), value = pair.slice(separator + 1);
      if (value) jar.set(key, value);else jar.delete(key);
    }
    return response;
  };
  load('public/frontend/mobile-runtime.ts', { window, document }).installServerTransport('https://aquarium.test/installation/');
  const state = { session, language: { value: 'de' }, t: key => key, toast() {}, errorMessage: error => error.message };
  const store = {
    activeOwner: async () => records.get('activeOwner'), readLocal: async key => records.get(key),
    writeLocal: async (key, value) => { if (value === undefined) records.delete(key);else records.set(key, value); },
    cacheable: path => ['/me', '/config', '/aquariums'].includes(path), offlineState: {},
  };
  const globals = { document, window, navigator: { onLine: true }, fetch: (...args) => window.fetch(...args) };
  const client = load('public/frontend/api.ts', globals, {
    './state': state, './offline-store': store,
    './offline-workspace': { readWorkspace: async () => undefined, enqueueWorkspace: async () => undefined },
    './offline-catalogs': { readOfflineCatalog: async () => undefined },
    '../../src/shared/catalog-routing': { CatalogLookupError: class extends Error {} },
  });
  const chat = load('public/frontend/chat-request.ts', globals, { './state': state, './offline-store': store });
  const router = load('public/frontend/router.ts', { ...globals, location: { hash: '#/' } }, {
    vue, './state': state, './offline-store': store, './api': client, './offline-sync': { startOfflineSync() {} },
  });
  await assert.rejects(client.api('/login', { method: 'POST', body: { username: 'mobile_session', password: 'wrong' } }), error => error.status === 401);
  await client.api('/login', { method: 'POST', body: { username: 'mobile_session', password: 'password123' } });
  await client.refreshSession();
  assert.ok(session.user.id);
  assert.equal(records.get('activeOwner'), session.user.id);
  const aquarium = await client.api('/aquariums', { method: 'POST', body: { name: 'Mobile Demo', water_type: 'fresh', volume_l: 100 } });
  assert.ok((await client.api('/aquariums')).some(item => item.id === aquarium.id));
  const imageBytes = await require('sharp')({ create: { width: 2, height: 2, channels: 3, background: '#12343b' } }).png().toBuffer();
  await client.api('/me/avatar', { method: 'POST', body: { image: 'data:image/png;base64,' + imageBytes.toString('base64') } });
  const images = load('public/frontend/mobile-images.ts', globals, {
    vue, './state': state, './offline-store': { ...store, pendingFor: async () => [] },
    './mobile-runtime': load('public/frontend/mobile-runtime.ts', {}),
  });
  const avatar = await images.loadMobileImage('api/me/avatar', Number(session.user.id), new AbortController().signal);
  assert.equal(avatar.type, 'image/png');assert.ok(avatar.size > 0);
  await client.api('/me/openai', { method: 'PUT', body: { apiKey: 'sk-proj-mobile-test-key-123456', model: 'gpt-4o-mini', setAsActive: true } });
  const originalFetch = global.fetch;
  t.mock.method(global, 'fetch', (url, options) => String(url).includes('/chat/completions')
    ? Promise.resolve(new Response(JSON.stringify({ choices: [{ message: { content: 'Mobile Testantwort' } }], usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 } }), { headers: { 'Content-Type': 'application/json' } }))
    : originalFetch(url, options));
  const stages = [];
  const answer = await chat.chatRequest(`/aquariums/${aquarium.id}/chat`, { message: 'Wie geht es dem Becken?', progress: true }, new AbortController().signal, stage => stages.push(stage));
  assert.equal(answer.reply, 'Mobile Testantwort');
  assert.deepEqual(stages, ['generating']);
  const db = require('../dist/backend/src/db');
  const { sha } = require('../dist/backend/src/utils/crypto');
  await db.sessions.delete(sha(jar.get('session')));
  await assert.rejects(client.api('/me'), error => error.status === 401);
  assert.equal(session.user, null);
  assert.equal(records.get('activeOwner'), undefined);
  await client.api('/login', { method: 'POST', body: { username: 'mobile_session', password: 'password123' } });
  await client.refreshSession();
  await router.logout();
  assert.equal(jar.has('session'), false);
  assert.equal(session.user, null);assert.equal(session.config, null);
  assert.equal(records.get('activeOwner'), undefined);
  await assert.rejects(client.api('/me'), error => error.status === 401);
  assert.ok(calls.includes('/installation/api/logout'));
});

'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const vue = require('vue');

function fixture() {
  let props, mounted = 0, owner = 7;
  const session = vue.reactive({ user: { id: 7 } });
  const state = { offline: true };
  const window = new EventTarget();
  const imports = {
    vue: { ...vue, createApp: (_component, value) => { props = value;return { mount() { mounted++; }, unmount() { mounted--; } }; } },
    './components/OnlineRequestNotice.vue': {},
    './state': { session, language: { value: 'de' } },
    './offline-store': { offlineState: state, activeOwner: async () => owner },
  };
  const code = ts.transpileModule(fs.readFileSync('public/frontend/online-request.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports = {};
  new Function('require', 'exports', 'document', 'window', code)(name => imports[name], exports, {
    body: { append() {} }, createElement: () => ({ remove() {} }),
  }, window);
  return { ...exports, session, state, window, props: () => props, mounted: () => mounted, owner: value => { owner = value; } };
}
test('Online-Funktionen: keine automatische Wiederholung; Jetzt prüfen wiederholt exakt die Anfrage', async () => {
  const f = fixture();let calls = 0;
  const promise = f.retryOnlineRequest(async () => { calls++;if (calls === 1) throw new TypeError('offline');return new Response('ok'); }, undefined, false, 7);
  assert.equal(calls, 0);assert.equal(f.mounted(), 1);
  f.window.dispatchEvent(new Event('online'));assert.equal(calls, 0);
  assert.equal(await f.props().retry(), false);assert.equal(f.state.offline, true);
  assert.equal(await f.props().retry(), true);assert.equal(await (await promise).text(), 'ok');
  assert.equal(f.state.offline, false);assert.equal(f.mounted(), 0);
});
test('Online-Funktionen: HTTP-Fehler werden nicht als Offline-Verbindung verschluckt', async () => {
  const f = fixture();
  const promise = f.retryOnlineRequest(async () => new Response('{}', { status: 403 }), undefined, false, 7);
  await f.props().retry();assert.equal((await promise).status, 403);assert.equal(f.state.offline, false);
});
test('Online-Funktionen: Kontowechsel, Navigation und Abbruch verwerfen die Wiederholung', async () => {
  for (const action of ['session', 'owner', 'navigate', 'abort', 'cancel']) {
    const f = fixture(), controller = new AbortController();let calls = 0;
    const promise = f.retryOnlineRequest(async () => { calls++;return new Response(); }, controller.signal, true, 7);
    const rejected = assert.rejects(promise, /offline/);
    if (action === 'session') f.session.user = { id: 8 };
    if (action === 'owner') { f.owner(8);await f.props().retry(); }
    if (action === 'navigate') f.window.dispatchEvent(new Event('hashchange'));
    if (action === 'abort') controller.abort();
    if (action === 'cancel') f.props().cancel();
    await rejected;assert.equal(calls, 0);assert.equal(f.mounted(), 0);
    await f.props().retry();assert.equal(calls, 0);
  }
});

function chatFixture(fetch, retry) {
  const state = { offline: false };
  const imports = {
    './state': { session: { user: { id: 7 } }, language: { value: 'de' } },
    './offline-store': { offlineState: state },
    './online-request': { retryOnlineRequest: retry },
  };
  const code = ts.transpileModule(fs.readFileSync('public/frontend/chat-request.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports = {};
  new Function('require', 'exports', 'fetch', code)(name => imports[name], exports, fetch);
  return { ...exports, state };
}
test('KI: Offline-Anfrage nutzt Jetzt prüfen; Status und Antwort werden danach weiter verarbeitet', async () => {
  let online = false, retried = false;
  const f = chatFixture(async () => {
    if (!online) throw new TypeError('Failed to fetch');
    return new Response('{"type":"status","stage":"working"}\n{"type":"done","reply":"Fertig"}\n');
  }, async (request, signal, mutation, owner) => {
    retried = true;assert.equal(mutation, true);assert.equal(owner, 7);assert.equal(signal.aborted, false);
    online = true;return request();
  });
  const stages = [];
  assert.deepEqual(await f.chatRequest('/chat', {}, new AbortController().signal, stage => stages.push(stage)), { reply: 'Fertig' });
  assert.equal(retried, true);assert.deepEqual(stages, ['working']);
});
test('KI: abgerissener Stream zeigt eine verständliche Meldung und wird nicht automatisch wiederholt', async () => {
  const f = chatFixture(async () => new Response(new ReadableStream({ start(controller) { controller.error(new TypeError('network error')); } })), () => assert.fail('Keine unbemerkte zweite KI-Anfrage'));
  await assert.rejects(f.chatRequest('/chat', {}, new AbortController().signal, () => {}), /KI-Antwort wurde unterbrochen/);
  assert.equal(f.state.offline, true);
});

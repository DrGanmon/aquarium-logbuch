'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const vue = require('vue');

function setup() {
  let dispose;
  const observers = [];
  class Observer {
    constructor(callback) { this.callback = callback;this.disconnected = false;observers.push(this); }
    observe(element) { this.element = element; }
    disconnect() { this.disconnected = true; }
  }
  const source = fs.readFileSync('public/frontend/composables/progressive-list.ts', 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports = {};
  new Function('require', 'exports', 'window', 'IntersectionObserver', code)(
    () => ({ ...vue, onBeforeUnmount: callback => { dispose = callback; } }), exports, { IntersectionObserver: Observer }, Observer,
  );
  const items = vue.ref(Array.from({ length: 100 }, (_, i) => ({ id: i })));
  const search = vue.ref('');
  const matches = vue.computed(() => items.value.filter(item => !search.value || String(item.id) === search.value));
  const scope = vue.effectScope();
  const state = scope.run(() => exports.useProgressiveList(matches));
  return { items, search, matches, state, observers, dispose() { dispose();scope.stop(); } };
}

test('Kataloge rendern 24 Einträge und suchen weiterhin im gesamten Bestand', () => {
  const app = setup();
  assert.equal(app.state.visible.value.length, 24);
  assert.equal(app.matches.value.length, 100);
  app.state.more();assert.equal(app.state.visible.value.length, 48);
  app.search.value = '99';
  assert.deepEqual(app.state.visible.value.map(item => item.id), [99]);
  assert.equal(app.state.hasMore.value, false);
  app.search.value = '';assert.equal(app.state.visible.value.length, 24);
  for (let i = 0; i < 10; i++) app.state.more();
  assert.equal(app.state.visible.value.length, 100);
  assert.equal(app.state.hasMore.value, false);
  app.items.value = [{ id: 7 }];assert.equal(app.state.visible.value.length, 1);
  app.dispose();
});

test('Scroll-Nachladen startet am Sentinel und räumt Observer beim Verlassen auf', async () => {
  const app = setup();
  const first = {};
  app.state.sentinel.value = first;await vue.nextTick();
  assert.equal(app.observers.length, 1);
  assert.equal(vue.toRaw(app.observers[0].element), first);
  app.observers[0].callback([{ isIntersecting: false }]);assert.equal(app.state.visible.value.length, 24);
  app.observers[0].callback([{ isIntersecting: true }]);assert.equal(app.state.visible.value.length, 48);
  app.state.sentinel.value = {};await vue.nextTick();
  assert.equal(app.observers[0].disconnected, true);
  app.dispose();assert.equal(app.observers[1].disconnected, true);
});

test('Asynchrone Komponenten laden erst bei Bedarf, bündeln Anfragen und begrenzen Wiederholungen', async () => {
  const source = fs.readFileSync('public/frontend/composables/lazy-component.ts', 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports = {};
  new Function('require', 'exports', code)(name => name === 'vue' ? vue : { default: { render: () => null } }, exports);
  let calls = 0, resolve;
  const loaded = new Promise(done => { resolve = done; });
  const component = exports.lazyComponent(() => { calls++;return loaded; });
  assert.equal(calls, 0);
  const first = component.__asyncLoader(), second = component.__asyncLoader();
  assert.equal(calls, 1);
  const view = { render: () => null };
  resolve({ default: view, __esModule: true });
  assert.equal(await first, view);assert.equal(await second, view);
  assert.equal(await component.__asyncLoader(), view);assert.equal(calls, 1);
  let attempts = 0;
  const failing = exports.lazyComponent(async () => { attempts++;throw new Error('offline'); });
  await assert.rejects(failing.__asyncLoader(), /offline/);
  assert.equal(attempts, 2);
});

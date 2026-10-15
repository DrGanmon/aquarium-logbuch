'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const vue = require('vue');

function moduleFor(file, request = async () => {}) {
  const timers = new Map();let timerId = 0, dispose;
  const language = vue.ref('de');
  const revision = vue.ref(0);
  const code = ts.transpileModule(fs.readFileSync(`public/frontend/composables/${file}.ts`, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  new Function('require', 'exports', 'window', 'setTimeout', 'clearTimeout', code)(name => {
    if (name === 'vue') return { ...vue, onBeforeUnmount: fn => { dispose = fn; } };
    if (name === './catalog-revision') return { useCatalogRevision: () => revision };
    if (name === '../api') return { api: request };
    if (name === '../state') return { language, errorMessage: e => e.message };
    throw new Error(name);
  }, exports, {}, fn => { const id = ++timerId;timers.set(id, fn);return id; }, id => timers.delete(id));
  const scope = vue.effectScope();
  return { exports, language, revision, scope,
    async flush() { await vue.nextTick();const pending = [...timers.values()];timers.clear();pending.forEach(fn => fn());await new Promise(resolve => setImmediate(resolve));await vue.nextTick(); },
    dispose() { dispose();scope.stop(); }, timers };
}
function page(collection, id, next = null) { return { [collection]: [{ id }], total: 50, next, categories: ['A'] }; }
function deferred() { let resolve;const promise = new Promise(done => { resolve = done; });return { promise, resolve }; }

for (const collection of ['species', 'plants']) test(`${collection}: schnelle Eingaben bündeln, Karten behalten und wiederholte Suche ohne Netzwerkanfrage`, async () => {
  const calls = [];
  const module = moduleFor('catalog-search', async path => { calls.push(path);return page(collection, new URL(path, 'https://test').searchParams.get('q') || 'initial'); });
  const app = module.scope.run(() => module.exports.useCatalogSearch(collection));
  await module.flush();assert.equal(calls.length, 1);
  const initial = app.shown.value;
  app.search.value = 'a';await vue.nextTick();app.search.value = 'an';await vue.nextTick();app.search.value = 'anu';await vue.nextTick();
  assert.equal(app.shown.value, initial);assert.equal(calls.length, 1);assert.equal(module.timers.size, 1);
  await module.flush();assert.equal(calls.length, 2);assert.equal(app.shown.value[0].id, 'anu');
  app.search.value = '';await module.flush();assert.equal(calls.length, 2);assert.equal(app.shown.value, initial);
  app.search.value = 'anu';await module.flush();assert.equal(calls.length, 2);
  module.dispose();
});

test('Veraltete Antworten überschreiben weder neue Treffer noch den Seitencache', async () => {
  const calls = [], responses = [];
  const module = moduleFor('catalog-search', (path, options) => { const response = deferred();calls.push({ path, options });responses.push(response);return response.promise; });
  const app = module.scope.run(() => module.exports.useCatalogSearch('species'));
  await module.flush();app.search.value = 'new';await module.flush();
  assert.equal(calls[0].options.signal.aborted, true);
  responses[1].resolve(page('species', 'new'));await new Promise(resolve => setImmediate(resolve));
  responses[0].resolve(page('species', 'old'));await new Promise(resolve => setImmediate(resolve));
  assert.equal(app.shown.value[0].id, 'new');
  app.search.value = '';await module.flush();assert.equal(calls.length, 3);
  module.dispose();assert.equal(calls[2].options.signal.aborted, true);
});

test('Seiten, Filter und Sprachen bleiben getrennt; fehlgeschlagene Suche wiederholt die erste Seite', async () => {
  const calls = [];let fail = false;
  const module = moduleFor('catalog-search', async path => { calls.push(path);if (fail) throw new Error('offline');const query = new URL(path, 'https://test').searchParams;return page('plants', `${query.get('q')}:${query.get('offset')}`, query.get('offset') === '0' ? 24 : null); });
  const app = module.scope.run(() => module.exports.useCatalogSearch('plants'));
  await module.flush();await app.load(true);assert.equal(app.shown.value.length, 2);
  fail = true;app.search.value = 'changed';await module.flush();assert.equal(app.shown.value.length, 2);assert.equal(app.pageError.value, 'offline');
  fail = false;app.retry();await new Promise(resolve => setImmediate(resolve));assert.equal(app.shown.value.length, 1);assert.ok(calls.at(-1).includes('offset=0'));
  app.water.value = 'fresh';await module.flush();assert.ok(calls.at(-1).includes('water_type=fresh'));
  app.category.value = 'A';await module.flush();assert.ok(calls.at(-1).includes('category=A'));
  const before = calls.length;module.language.value = 'en';await module.flush();assert.equal(calls.length, before + 1);assert.equal(app.category.value, 'all');
  module.dispose();
});

test('Seitencache ist begrenzt und Verlassen der Seite verwirft ausstehende Suche', async () => {
  let calls = 0;
  const module = moduleFor('catalog-search', async () => { calls++;return page('species', calls); });
  const app = module.scope.run(() => module.exports.useCatalogSearch('species'));
  await module.flush();
  for (let i = 0; i < 21; i++) { app.search.value = `q${i}`;await module.flush(); }
  app.search.value = '';await module.flush();assert.equal(calls, 23);
  app.search.value = 'pending';await vue.nextTick();module.dispose();await module.flush();assert.equal(calls, 23);
});

test('Krankheitssuche indexiert einmal, bündelt Eingaben und berücksichtigt neue Katalogdaten', async () => {
  const module = moduleFor('indexed-search');let indexed = 0;
  const items = vue.shallowRef([{ name: 'Ichthyophthirius', signs: 'Weiße Punkte' }, { name: 'Flossenfäule', signs: 'ausgefranst' }]);
  const search = vue.ref('');
  const matches = module.scope.run(() => module.exports.useIndexedSearch(items, search, item => { indexed++;return `${item.name} ${item.signs}`; }));
  assert.equal(matches.value.length, 2);assert.equal(indexed, 0);
  search.value = 'WEI';await vue.nextTick();search.value = 'WEISSE';await vue.nextTick();search.value = 'WEIßE';await module.flush();
  assert.equal(matches.value[0].name, 'Ichthyophthirius');assert.equal(indexed, 2);
  search.value = 'Flossen';await module.flush();assert.equal(matches.value[0].name, 'Flossenfäule');assert.equal(indexed, 2);
  items.value = [{ name: 'Fin rot', signs: 'Flossen' }];assert.equal(matches.value[0].name, 'Fin rot');assert.equal(indexed, 3);
  search.value = '';await vue.nextTick();assert.equal(matches.value, items.value);
  search.value = 'pending';await vue.nextTick();module.dispose();await module.flush();assert.equal(matches.value, items.value);
});

test('Committed catalog updates invalidate cached search pages', async () => {
  let generation = 1;
  const module = moduleFor('catalog-search', async () => page('species', `generation-${generation}`));
  const app = module.scope.run(() => module.exports.useCatalogSearch('species'));
  await module.flush();assert.equal(app.shown.value[0].id, 'generation-1');
  generation = 2;module.revision.value++;
  await module.flush();assert.equal(app.shown.value[0].id, 'generation-2');
  module.dispose();
});

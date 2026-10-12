'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const vue = require('vue');

function resource(fetchData) {
  let dispose;
  const source = fs.readFileSync(path.join(__dirname, '../public/frontend/composables/lazy-resource.ts'), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports = {};
  new Function('require', 'exports', code)((name) => {
    if (name === 'vue') return { ...vue, onBeforeUnmount: (callback) => { dispose = callback; } };
    if (name === '../state') return { errorMessage: (error) => error.message };
    throw new Error(`Unexpected import: ${name}`);
  }, exports);
  return { state: exports.useLazyResource([], fetchData), dispose: () => dispose() };
}
function deferred() { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; }

test('Lazy-Ressource lädt erst bei Aktivierung und bündelt doppelte Anfragen', async () => {
  const response = deferred();let calls = 0;
  const { state } = resource(() => { calls++;return response.promise; });
  assert.equal(calls, 0);
  const first = state.load(), second = state.load();
  assert.equal(calls, 1);
  response.resolve([1]);await Promise.all([first, second]);
  await state.load();assert.equal(calls, 1);assert.deepEqual(state.data.value, [1]);
});

test('Neue Zeitraumanfragen brechen alte ab und verhindern veraltete Ergebnisse', async () => {
  const responses = [deferred(), deferred()];const signals = [];let count = 0;
  const { state } = resource((signal) => { signals.push(signal);return responses[count++].promise; });
  const first = state.load();const second = state.load(true);
  assert.equal(signals[0].aborted, true);
  responses[1].resolve(['new']);await second;
  responses[0].resolve(['old']);await first;
  assert.deepEqual(state.data.value, ['new']);assert.equal(state.loading.value, false);
});

test('Fehlgeschlagene Abschnitte können erneut geladen werden', async () => {
  let calls = 0;
  const { state } = resource(async () => { if (++calls === 1) throw new Error('offline');return ['retry']; });
  await state.load();assert.equal(state.error.value, 'offline');assert.equal(state.loaded.value, false);
  await state.load();assert.deepEqual(state.data.value, ['retry']);assert.equal(state.error.value, '');
});

test('Beim Verlassen der Ansicht werden laufende Anfragen abgebrochen', async () => {
  const response = deferred();let signal;
  const { state, dispose } = resource((s) => { signal = s;return response.promise; });
  const pending = state.load();dispose();assert.equal(signal.aborted, true);
  response.resolve(['late']);await pending;assert.deepEqual(state.data.value, []);
});

test('Synchrone Fetch-Fehler blockieren keinen erneuten Ladeversuch', async () => {
  let calls = 0;
  const { state } = resource(() => { if (++calls === 1) throw new Error('synchronous');return Promise.resolve(['retry']); });
  await state.load();assert.equal(state.error.value, 'synchronous');
  await state.load();assert.equal(calls, 2);assert.deepEqual(state.data.value, ['retry']);
});

test('Nach dem Verlassen der Ansicht startet kein weiterer Request', async () => {
  let calls = 0;
  const { state, dispose } = resource(async () => { calls++;return []; });
  dispose();await state.load();assert.equal(calls, 0);
});

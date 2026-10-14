'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const vue = require('vue');

function setup(request) {
  const source = fs.readFileSync('public/frontend/views/AquariumView.vue', 'utf8').match(/<script setup lang="ts">([\s\S]*?)<\/script>/)[1];
  const code = ts.transpileModule(source + '\nexports.state = { requestEntryDeletion, cancelEntryDeletion, confirmEntryDeletion, deleteEntry, deleteError, deletingEntry, logs, measurements, detail };', {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const calls = [];
  const exports = {};
  new Function('require', 'exports', 'defineProps', 'localStorage', 'confirm', code)((name) => {
    if (name === 'vue') return { ...vue, onMounted() {}, onBeforeUnmount() {} };
    if (name === '../api') return { api: async (path, options) => {
      calls.push({ path, options });
      if (options?.method === 'DELETE') return request(path, options);
      return { aquarium: { id: 7 }, role: 'owner' };
    } };
    if (name === '../state') return { session: {}, language: vue.ref('de'), errorMessage: error => error.message };
    if (name.endsWith('lazy-component')) return { lazyComponent: () => ({}) };
    if (name.endsWith('lazy-resource')) return { useLazyResource: initial => ({ data: vue.shallowRef(initial), active: vue.ref(false), load: async () => {} }) };
    if (name.endsWith('progressive-list')) return { useProgressiveList: value => ({ visible: value }) };
    return {};
  }, exports, () => ({ id: '7' }), { getItem: () => null }, () => { throw new Error('Browserbestätigung darf nicht verwendet werden'); });
  const state = exports.state;
  state.detail.value = { aquarium: { id: 7 }, role: 'owner' };
  state.logs.value = [{ kind: 'maintenance', id: 1 }, { kind: 'measurement', id: 1 }];
  state.measurements.value = [{ id: 1 }];
  return { ...state, calls };
}

test('Logbuch-Löschen benötigt die Anwendungsbestätigung; Abbrechen sendet keine Anfrage', async () => {
  const app = setup(async () => ({}));
  app.requestEntryDeletion({ kind: 'maintenance', id: 1 });
  assert.equal(app.calls.length, 0);
  app.cancelEntryDeletion();
  await app.confirmEntryDeletion();
  assert.equal(app.calls.length, 0);
  assert.equal(app.logs.value.length, 2);
});

for (const kind of ['maintenance', 'measurement']) test(`Bestätigtes Löschen von ${kind} verwendet die richtige API und aktualisiert die Ansicht`, async () => {
  const app = setup(async () => ({ ok: true }));
  app.requestEntryDeletion({ kind, id: 1 });
  await app.confirmEntryDeletion();
  assert.deepEqual(app.calls[0], { path: `/aquariums/7/${kind === 'measurement' ? 'measurements' : 'maintenance'}/1`, options: { method: 'DELETE' } });
  assert.deepEqual(app.logs.value, [{ kind: kind === 'measurement' ? 'maintenance' : 'measurement', id: 1 }]);
  assert.equal(app.measurements.value.length, kind === 'measurement' ? 0 : 1);
  assert.equal(app.deleteEntry.value, undefined);
  assert.equal(app.calls[1].path, '/aquariums/7?summary=true');
});

test('Löschfehler bleiben im Dialog sichtbar und lassen sich erneut versuchen', async () => {
  let attempts = 0;
  const app = setup(async () => { if (++attempts === 1) throw new Error('Löschen fehlgeschlagen');return { ok: true }; });
  app.requestEntryDeletion({ kind: 'maintenance', id: 1 });
  await app.confirmEntryDeletion();
  assert.equal(app.deleteError.value, 'Löschen fehlgeschlagen');
  assert.equal(app.deleteEntry.value.id, 1);
  assert.equal(app.logs.value.length, 2);
  assert.equal(app.deletingEntry.value, false);
  await app.confirmEntryDeletion();
  assert.equal(app.deleteEntry.value, undefined);
  assert.equal(app.deleteError.value, '');
});

test('Laufendes Löschen verhindert doppelte Anfragen; Leserechte erlauben kein Löschen', async () => {
  let resolve;
  const app = setup(() => new Promise(done => { resolve = done; }));
  app.requestEntryDeletion({ kind: 'maintenance', id: 1 });
  const pending = app.confirmEntryDeletion();
  await app.confirmEntryDeletion();
  app.cancelEntryDeletion();
  app.requestEntryDeletion({ kind: 'measurement', id: 1 });
  assert.equal(app.calls.length, 1);
  assert.equal(app.deleteEntry.value.kind, 'maintenance');
  resolve({ ok: true });await pending;
  app.detail.value.role = 'view';
  app.requestEntryDeletion({ kind: 'measurement', id: 1 });
  assert.equal(app.deleteEntry.value, undefined);
  assert.equal(app.calls.length, 2);
});

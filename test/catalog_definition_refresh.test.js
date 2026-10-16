'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const vue = require('vue');
const compile = source => ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const settle = async () => { await vue.nextTick();await new Promise(resolve => setImmediate(resolve)); };
function fixture(kind) {
  const revision = vue.ref(0), mounts = [], cleanup = [];
  const initial = { id: 'parent', name: 'Parent', waterType: 'fresh' };
  let current = initial, failure;
  const api = async path => {
    if (failure && path.startsWith('/' + kind + '/')) throw failure;
    if (path.startsWith('/' + kind + '/')) return { [kind === 'species' ? 'species' : 'plant']: current };
    if (path === '/aquariums') return [1, 2].map(id => ({ id, name: 'Tank ' + id, water_type: 'fresh', role: 'owner' }));
    if (path.endsWith('/plants')) return [];
    return {};
  };
  const hooks = { ...vue, onMounted: callback => mounts.push(callback), onBeforeUnmount: callback => cleanup.push(callback), watch: (...args) => { const stop = vue.watch(...args);cleanup.push(stop);return stop; } };
  const composable = {};
  new Function('require', 'exports', compile(fs.readFileSync('public/frontend/composables/catalog-definition.ts', 'utf8')))(name => name === 'vue' ? hooks : name.endsWith('/api') ? { api } : { useCatalogRevision: () => revision }, composable);
  const name = kind === 'species' ? 'AddSpeciesDialog' : 'AddPlantDialog';
  const source = fs.readFileSync('public/frontend/components/' + name + '.vue', 'utf8').match(/<script setup lang="ts">([\s\S]*?)<\/script>/)[1];
  const exports = {}, aquarium = kind === 'species' ? 'aquariumId' : 'selectedAquariumId';
  new Function('require', 'exports', 'defineProps', 'defineEmits', compile(source + '\nexport { definition, selectedId, count, error, ' + aquarium + ' };'))(name => {
    if (name === 'vue') return hooks;
    if (name.endsWith('/catalog-definition')) return composable;
    if (name.endsWith('/api')) return { api };
    return { t: key => key, errorMessage: error => error.message, toast: () => {} };
  }, exports, () => ({ [kind === 'species' ? 'species' : 'plant']: initial }), () => () => {});
  return { ...exports, aquarium: exports[aquarium], revision, mount: async () => { for (const callback of mounts) await callback(); }, replace: value => { current = value; }, fail: error => { failure = error; }, close: () => { for (const callback of cleanup) callback(); } };
}
for (const kind of ['species', 'plants']) test(`Open ${kind} dialog refreshes forms after catalog commit and preserves the user's choices`, async t => {
  const f = fixture(kind);t.after(f.close);await f.mount();
  f.aquarium.value = 2;f.selectedId.value = 'saved-form';await settle();f.count.value = 8;
  const updated = { id: 'parent', name: 'Parent', waterType: 'fresh', variants: [{ id: 'saved-form', name: 'Saved form', kind: 'cultivar' }, { id: 'new-form', name: 'New form', kind: 'cultivar' }] };
  f.replace(updated);f.revision.value++;await settle();
  assert.equal(f.definition.value.variants.length, 2);
  assert.equal(f.selectedId.value, 'saved-form');assert.equal(f.aquarium.value, 2);assert.equal(f.count.value, 8);
  f.fail(new Error('offline'));f.revision.value++;await settle();
  assert.equal(f.error.value, 'offline');assert.equal(f.definition.value.variants.length, 2);
});

'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const { parse, compileScript } = require('@vue/compiler-sfc');
const vue = require('vue');

test('Timer-FAB gruppiert nur laufende Timer je Becken, aktualisiert Restzeiten und verschwindet nach Ablauf', async () => {
  const { descriptor } = parse(fs.readFileSync('public/frontend/components/OpenTests.vue', 'utf8'));
  const js = ts.transpileModule(compileScript(descriptor, { id: 'active-timers' }).content,
    { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  const clock = Date.now(), drafts = vue.reactive({
    a: { aquariumId: 'a', aquariumName: 'Großes Becken', selected: [], values: {}, completed: {}, timers: { no3: clock + 120000, ph: clock + 60500, expired: clock - 1 } },
    b: { aquariumId: 'b', aquariumName: 'Garnelen', selected: [], values: {}, completed: {}, timers: { no3: clock + 45000 } },
    c: { aquariumId: 'c', aquariumName: 'Ohne Timer', selected: [], values: {}, completed: {}, timers: {} },
  });
  const exports = {}, opened = [], scope = vue.effectScope();
  new Function('require', 'exports', 'navigator', js)(id => {
    if (id === 'vue') return { ...vue, onMounted() {}, onBeforeUnmount() {} };
    if (id.endsWith('measurement-drafts')) return { measurementDrafts: drafts, draftSyncState: {} };
    if (id.endsWith('test-selection')) return { resolveTests: () => [{ key: 'ph', name: 'pH' }, { key: 'no3', name: 'Nitrat' }] };
    if (id.endsWith('measurement-timers')) return { openMeasurementTest: id => opened.push(id) };
    if (id.endsWith('state')) return { session: { user: { id: 1 }, config: {} } };
    return {};
  }, exports, {});
  const state = scope.run(() => exports.default.setup({}, { expose() {} }));
  try {
    state.now.value = clock;
    assert.equal(state.activeCount.value, 3);
    assert.deepEqual(state.activeGroups.value.map(g => g.draft.aquariumId), ['a', 'b']);
    assert.deepEqual(state.activeGroups.value[0].timers.map(t => [t.name, t.remaining]), [['pH', 61], ['Nitrat', 120]]);
    state.timersExpanded.value = true;
    state.now.value = clock + 61000;await vue.nextTick();
    assert.equal(state.activeCount.value, 1);
    assert.deepEqual(state.activeGroups.value.map(g => g.draft.aquariumId), ['a']);
    state.resume('a');assert.deepEqual(opened, ['a']);assert.equal(state.timersExpanded.value, false);
    state.timersExpanded.value = true;
    delete drafts.a.timers.no3;await vue.nextTick();
    assert.equal(state.activeCount.value, 0);assert.equal(state.timersExpanded.value, false);
    drafts.b.timers.no3 = clock + 200000;await vue.nextTick();
    assert.equal(state.activeCount.value, 1);assert.equal(state.timersExpanded.value, false);
    state.now.value = clock + 200000;await vue.nextTick();
    assert.equal(state.activeCount.value, 0);
    assert.equal(state.finished.value.length, 3, 'Finished timers still use the existing notifications');
  } finally { scope.stop(); }
});

'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const { parse, compileScript } = require('@vue/compiler-sfc');
const vue = require('vue');
const { suiteService } = require('../dist/backend/src/services/suite-service');

test('Geräteassistent: Bestätigung, Rücknavigation, Vorbenutzung, Abschluss und Kontowechsel', async () => {
  const { descriptor } = parse(fs.readFileSync('public/frontend/components/DeviceSetupWizard.vue', 'utf8'));
  const source = compileScript(descriptor, { id: 'test-device-guide' }).content;
  const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  const session = vue.reactive({ user: { id: 1 } });
  const exports = {};
  new Function('require', 'exports', js)(id => {
    if (id === 'vue') return vue;
    if (id.endsWith('state')) return { session, language: vue.ref('de'), t: key => key };
    if (id.endsWith('device-guide')) return require('../dist/backend/src/shared/device-guide');
    return {};
  }, exports);
  const emitted = [];
  const suite = suiteService.getSuite('yinmik-ez9908');
  const state = exports.default.setup({ suite, parameters: ['ph'] }, { expose() {}, emit: event => emitted.push(event) });
  assert.equal(state.current.value.id, 'identify');
  state.next();assert.equal(state.index.value, 0, 'Cannot advance without confirmation');
  state.confirmed.value = true;state.next();await vue.nextTick();
  assert.equal(state.index.value, 1);assert.equal(state.confirmed.value, false);
  state.index.value--;await vue.nextTick();assert.equal(state.confirmed.value, false);
  state.mode.value = 'beforeUse';await vue.nextTick();
  assert.equal(state.index.value, 0);
  assert.ok(state.steps.value.every(s => s.phase === 'beforeUse'));
  for (let i = 0; i < state.steps.value.length; i++) {
    state.confirmed.value = true;state.next();await vue.nextTick();
  }
  assert.equal(state.done.value, true);
  state.index.value = 0;await vue.nextTick();assert.equal(state.done.value, false);
  session.user = { id: 2 };await vue.nextTick();assert.deepEqual(emitted, ['close']);
});

test('Kalibrierung aus Messkarte: erst lokal sichern, dann pausieren; Daten und Timer erhalten', async () => {
  const { descriptor } = parse(fs.readFileSync('public/frontend/views/MeasureView.vue', 'utf8'));
  const source = compileScript(descriptor, { id: 'measure-calibration' }).content;
  const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  const scope = vue.effectScope();
  const suite = suiteService.getSuite('yinmik-ez9908');
  const draft = vue.reactive({ draftId: 'draft', aquariumId: '1', selected: ['yinmik-ez9908:ph'],
    values: { ph: '7,2' }, timers: { ph: Date.now() + 60000 }, completed: {}, when: '2026-10-18T12:00', note: 'Probe', suite: suite.id });
  const session = vue.reactive({ user: { id: 1 }, config: { suites: [suite] } });
  let release, fail = false;
  const gate = () => new Promise(resolve => { release = resolve; });
  let pending = gate();
  const exports = {};
  new Function('require', 'exports', 'navigator', js)(id => {
    if (id === 'vue') return { ...vue, onMounted() {}, onBeforeUnmount() {} };
    if (id.endsWith('measurement-drafts')) return { measurementDrafts: { 1: draft }, draftSyncState: {},
      flushMeasurementDrafts: async () => { await pending;if (fail) throw new Error('Speicher voll'); } };
    if (id.endsWith('test-selection')) return { resolveTests: () => [{ key: 'ph', suiteId: suite.id }] };
    if (id.endsWith('state')) return { session, localDateTime: () => '', errorMessage: e => e.message };
    if (id.endsWith('router')) return { route: vue.ref({ query: new URLSearchParams('resume=1') }) };
    if (id.endsWith('lazy-component')) return { lazyComponent: () => ({}) };
    return {};
  }, exports, {});
  const state = scope.run(() => exports.default.setup({ id: '1' }, { expose() {} }));
  try {
    const before = JSON.stringify(draft);
    const opening = state.startCalibration(suite);
    assert.equal(state.busy.value, true);
    assert.equal(state.calibrationSuite.value, null, 'Do not hide the test until durable saving succeeds');
    release();await opening;
    assert.equal(state.calibrationSuite.value.id, suite.id);
    assert.deepEqual(state.calibrationParameters.value, ['ph']);
    assert.equal(JSON.stringify(draft), before);
    state.calibrationSuite.value = null;await vue.nextTick();
    assert.equal(JSON.stringify(draft), before, 'Returning must preserve raw values, notes and absolute timer deadlines');
    fail = true;await state.startCalibration(suite);
    assert.equal(state.calibrationSuite.value, null);
    assert.equal(state.error.value, 'Speicher voll');
    fail = false;pending = gate();
    const stale = state.startCalibration(suite);
    session.user = { id: 2 };release();await stale;
    assert.equal(state.calibrationSuite.value, null, 'Do not reopen a former account’s test');
  } finally { scope.stop(); }
});

test('Kalibrierungsabschluss kehrt automatisch zum pausierten Test zurück', async () => {
  const { descriptor } = parse(fs.readFileSync('public/frontend/components/DeviceSetupWizard.vue', 'utf8'));
  const js = ts.transpileModule(compileScript(descriptor, { id: 'return-to-test' }).content,
    { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  const exports = {}, emitted = [], scope = vue.effectScope();
  new Function('require', 'exports', js)(id => id === 'vue' ? vue : id.endsWith('state') ? { session: vue.reactive({ user: { id: 1 } }) } :
    id.endsWith('device-guide') ? require('../dist/backend/src/shared/device-guide') : {}, exports);
  const state = scope.run(() => exports.default.setup({ suite: suiteService.getSuite('yinmik-ez9908'), parameters: ['ph'], returnToTest: true },
    { expose() {}, emit: event => emitted.push(event) }));
  try {
    state.index.value = state.steps.value.length - 1;await vue.nextTick();
    state.next();assert.deepEqual(emitted, []);
    state.confirmed.value = true;state.next();
    assert.deepEqual(emitted, ['close']);
  } finally { scope.stop(); }
});

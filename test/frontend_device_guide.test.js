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

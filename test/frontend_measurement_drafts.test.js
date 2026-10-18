'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const { reactive, nextTick } = require('vue');

test('Offene Messungen bleiben je Becken getrennt und werden beim Kontowechsel synchron entfernt', async () => {
  const session = reactive({ user: { id: 1 } });
  const code = ts.transpileModule(fs.readFileSync('public/frontend/composables/measurement-drafts.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  new Function('require', 'exports', code)(id => id === '../state' ? { session } : require(id), exports);
  const drafts = exports.measurementDrafts;
  const draft = id => ({ aquariumId: id, aquariumName: id, when: '2026-10-18T10:00', note: 'Probe', values: { ph: '7,2' }, selected: ['drops:ph'], suite: 'drops', timers: { ph: Date.now() + 60000 }, completed: {} });
  drafts.a = draft('a');
  drafts.b = draft('b');
  drafts.b.values.ph = '6,8';
  assert.equal(drafts.a.values.ph, '7,2');
  assert.equal(drafts.a.note, 'Probe');
  assert.equal(drafts.a.when, '2026-10-18T10:00');
  assert.ok(drafts.a.timers.ph > Date.now());
  delete drafts.a;
  assert.deepEqual(Object.keys(drafts), ['b']);
  session.user = { id: 2 };
  assert.deepEqual(Object.keys(drafts), []);
  drafts.c = draft('c');
  session.user = null;
  assert.deepEqual(Object.keys(drafts), []);
  await nextTick();
});

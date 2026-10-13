'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const source = fs.readFileSync('public/frontend/composables/test-selection.ts', 'utf8');
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const helpers = {};
new Function('exports', code)(helpers);
const suites = [
  { id: 'drops', tests: [{ key: 'ph', wait: 180 }, { key: 'no3', wait: 600 }] },
  { id: 'strips', tests: [{ key: 'ph', wait: 60 }] },
];

test('Alte und leere Testauswahlen werden ohne Verlust in suitebezogene Referenzen übernommen', () => {
  const config = selectedTests => ({ suites, currentSuite: suites[0], userPreferences: { selectedSuite: 'drops', selectedTests } });
  assert.deepEqual(helpers.initialTestSelection(config(null)), ['drops:ph', 'drops:no3']);
  assert.deepEqual(helpers.initialTestSelection(config([])), []);
  assert.deepEqual(helpers.initialTestSelection(config(['no3'])), ['drops:no3']);
  assert.deepEqual(helpers.initialTestSelection(config(['strips:ph', 'drops:no3'])), ['strips:ph', 'drops:no3']);
});

test('Methodenwechsel ersetzt denselben Parameter und erhält Tests aus anderen Suiten', () => {
  const selection = helpers.selectTest(['drops:ph', 'drops:no3'], 'strips:ph', true);
  assert.deepEqual(selection, ['drops:no3', 'strips:ph']);
  assert.deepEqual(helpers.resolveTests(suites, selection).map(test => [test.key, test.wait, test.suiteId]), [['no3', 600, 'drops'], ['ph', 60, 'strips']]);
  assert.deepEqual(helpers.selectTest(selection, 'drops:ph', false), selection);
  assert.deepEqual(helpers.selectTest(selection, 'strips:ph', false), ['drops:no3']);
});

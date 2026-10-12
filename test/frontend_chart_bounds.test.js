'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

function render(measurements) {
  const file = fs.readFileSync(path.join(__dirname, '../public/frontend/components/WaterChart.vue'), 'utf8');
  const script = file.match(/<script setup lang="ts">([\s\S]*?)<\/script>/)[1];
  const code = ts.transpileModule(script, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  let mount;
  let options;
  class Chart {
    static register() {}
    constructor(canvas, config) { options = config; }
    destroy() {}
  }
  new Function('require', 'defineProps', 'exports', code)((name) => {
    if (name === 'vue') return { ref: () => ({ value: {} }), onMounted: callback => { mount = callback; }, onBeforeUnmount() {}, watch() {} };
    if (name === 'chart.js') return { Chart, registerables: [] };
    if (name === '../state') return { dark: { value: false }, fmtDate: String, fmtNum: String };
    if (name === '../composables/values') return { evaluate: () => 'ok' };
    throw new Error(`Unexpected import: ${name}`);
  }, () => ({ parameter: { key: 'ph', min: 0, max: 14 }, measurements }), {});
  mount();
  return options;
}

test('Graphen verarbeiten große Historien ohne Überschreiten des Argumentlimits', () => {
  const options = render(Array(150000).fill({ measured_at: '2026-10-12', values: { ph: 7 } }));
  assert.equal(options.data.datasets[0].data.length, 150000);
  assert.ok(Number.isFinite(options.options.scales.x.min));
  assert.ok(Number.isFinite(options.options.scales.y.suggestedMin));
});

test('Leere oder ungültige Graphdaten erzeugen endliche Achsenbereiche', () => {
  const options = render([{ measured_at: 'invalid', values: { ph: NaN } }]);
  assert.equal(options.data.datasets[0].data.length, 0);
  assert.ok(Number.isFinite(options.options.scales.x.min));
  assert.ok(Number.isFinite(options.options.scales.x.max));
  assert.ok(Number.isFinite(options.options.scales.y.suggestedMin));
  assert.ok(Number.isFinite(options.options.scales.y.suggestedMax));
});

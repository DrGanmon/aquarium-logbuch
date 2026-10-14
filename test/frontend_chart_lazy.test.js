'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const vue = require('vue');
const { parse, compileScript } = require('vue/compiler-sfc');

function setup() {
  let mount, dispose, observe;
  const charts = [];
  class Chart {
    static register() {}
    constructor(canvas, options) { this.canvas = canvas;this.options = options;this.destroyed = false;charts.push(this); }
    destroy() { this.destroyed = true; }
  }
  class Observer {
    constructor(callback) { this.callback = callback;observe = this; }
    observe(root) { this.root = root; }
    disconnect() { this.disconnected = true; }
  }
  const source = fs.readFileSync('public/frontend/components/WaterChart.vue', 'utf8');
  const script = compileScript(parse(source).descriptor, { id: 'lazy-chart' }).content;
  const code = ts.transpileModule(script, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const dark = vue.ref(false);
  const exports = {};
  new Function('require', 'exports', 'window', 'IntersectionObserver', code)(name => {
    if (name === 'vue') return { ...vue, onMounted: callback => { mount = callback; }, onBeforeUnmount: callback => { dispose = callback; } };
    if (name === 'chart.js') return { Chart, LineController: {}, LineElement: {}, PointElement: {}, LinearScale: {}, Tooltip: {} };
    if (name === '../state') return { dark, fmtDate: String, fmtNum: String };
    if (name === '../composables/values') return { evaluate: () => 'ok' };
    throw new Error(`Unexpected import: ${name}`);
  }, exports, { IntersectionObserver: Observer }, Observer);
  const props = vue.reactive({ parameter: { key: 'ph', min: 0, max: 14, decimals: 1, unit: '' }, measurements: [] });
  const scope = vue.effectScope();
  const state = scope.run(() => exports.default.setup(props, { expose() {} }));
  state.root.value = {};state.canvas.value = {};
  mount();
  return { props, dark, charts, observer: observe, dispose() { dispose();scope.stop(); } };
}

test('Diagramme entstehen erst in Sichtnähe und verwenden die neuesten Messwerte', async () => {
  const app = setup();
  assert.equal(app.charts.length, 0);
  app.props.measurements = [{ measured_at: '2026-01-01T12:00:00Z', values: { ph: 7.2 } }];
  app.dark.value = true;await vue.nextTick();
  assert.equal(app.charts.length, 0, 'Offscreen updates must not construct charts');
  app.observer.callback([{ isIntersecting: true }]);
  assert.equal(app.charts.length, 1);
  assert.deepEqual(app.charts[0].options.data.datasets[0].data, [{ x: Date.parse('2026-01-01T12:00:00Z'), y: 7.2 }]);
  assert.equal(app.observer.disconnected, true);
  app.props.measurements = [{ measured_at: '2026-01-02T12:00:00Z', values: { ph: 7.5 } }];
  await vue.nextTick();
  assert.equal(app.charts.length, 2);
  assert.equal(app.charts[0].destroyed, true);
  assert.equal(app.charts[1].options.data.datasets[0].data[0].y, 7.5);
  app.dispose();assert.equal(app.charts[1].destroyed, true);
});

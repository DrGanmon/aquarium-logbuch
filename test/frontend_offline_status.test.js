'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vue = require('vue');
const { renderToString } = require('vue/server-renderer');
const { parse, compileScript } = require('vue/compiler-sfc');
const ts = require('typescript');

function fixture() {
  const state = vue.reactive({ offline: false, pending: [], workspaceUpdatedAt: '2026-10-16T08:00:00Z', workspaceError: '', catalogError: '', error: '', photoProgress: '', syncing: false, workspaceSyncing: false });
  const { descriptor } = parse(fs.readFileSync('public/frontend/components/OfflineStatus.vue', 'utf8'));
  const script = compileScript(descriptor, { id: 'offline-status-test', inlineTemplate: true });
  const code = ts.transpileModule(script.content, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports = {};
  const imports = {
    vue,
    '../offline-store': { offlineState: state },
    '../offline-catalogs': { synchronizeCatalogs() {} },
    '../offline-workspace': { discardWorkspace() {}, rebaseWorkspace() {} },
    '../state': { t: key => key, language: vue.ref('de'), session: { user: { id: 7 } } },
    '../offline-sync': { refreshPending() {}, synchronize() {} },
  };
  new Function('require', 'exports', code)(name => { assert.ok(imports[name], name);return imports[name]; }, exports);
  return { state, render: () => renderToString(vue.createSSRApp(exports.default)) };
}
test('Offline-Status: Datenstand und Synchronisieren nur ohne Serververbindung, online keine leere Karte', async () => {
  const f = fixture();
  assert.doesNotMatch(await f.render(), /<aside|offline\.workspaceReady|offline\.sync/);
  f.state.offline = true;
  let html = await f.render();
  assert.match(html, /offline\.workspaceReady/);assert.match(html, /offline\.sync/);
  f.state.workspaceUpdatedAt = '';
  html = await f.render();assert.match(html, /offline\.workspacePreparing/);
  f.state.offline = false;
  assert.doesNotMatch(await f.render(), /<aside|offline\.workspacePreparing|offline\.sync/);
});
test('Offline-Status: offene Änderungen und Fehler bleiben online sichtbar, Datenstand und Sync-Button nicht', async () => {
  const f = fixture();
  f.state.pending.push({ id: 'pending', owner: 7, aquarium: '42', body: { values: { ph: 7.1 }, note: 'Noch nicht übertragen' } });
  let html = await f.render();
  assert.match(html, /offline\.pending/);assert.match(html, /Noch nicht übertragen/);
  assert.doesNotMatch(html, /offline\.workspaceReady|offline\.workspacePreparing|offline\.sync/);
  f.state.pending = [{ id: 'conflict', owner: 7, kind: 'workspace', path: '/aquariums/42', method: 'PUT', body: { name: 'Lokal' }, createdAt: '2026-10-16T08:00:00Z', conflict: { current: { name: 'Serverstand' }, version: 'changed' } }];
  html = await f.render();assert.match(html, /offline\.keepLocal/);assert.match(html, /Serverstand/);
  assert.doesNotMatch(html, /offline\.workspaceReady|offline\.workspacePreparing|offline\.sync/);
  f.state.pending = [];
  for (const field of ['workspaceError', 'catalogError', 'error']) {
    f.state[field] = 'Abgleich fehlgeschlagen';
    html = await f.render();assert.match(html, /Abgleich fehlgeschlagen/);
    assert.doesNotMatch(html, /offline\.workspaceReady|offline\.workspacePreparing|offline\.sync/);
    f.state[field] = '';
  }
  assert.doesNotMatch(await f.render(), /<aside/);
});

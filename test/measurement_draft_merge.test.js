'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { mergeMeasurementDraft, draftField, setDraftField, pruneDraftFields } = require('../dist/backend/src/shared/measurement-draft');
const clone = value => JSON.parse(JSON.stringify(value));
const draft = () => ({ draftId: randomUUID(), when: '2026-10-18T12:00', timeZoneOffset: -120, suite: 'drops', selected: ['drops:ph', 'drops:no3', 'drops:kh'], note: '', values: {}, timers: {} });
test('Einseitige Ergänzungen verschiedener Wasserwerte werden ohne Konflikt zusammengeführt', () => {
  const base = draft(), local = clone(base), remote = clone(base);
  local.values.ph = '7,2';remote.values.no3 = '10';
  const result = mergeMeasurementDraft(base, local, remote);
  assert.deepEqual(result.fields, []);
  assert.deepEqual(result.merged.values, { no3: '10', ph: '7,2' });
  assert.deepEqual(remote.values, { no3: '10' });
});
test('Gleiche Werte einschließlich Komma, Punkt, Nullen und leerer Eingaben bleiben unverändert', () => {
  const base = draft(), local = clone(base), remote = clone(base);
  local.values = { ph: ' 7,20 ', kh: '0', no3: ' ' };remote.values = { ph: '7.2', kh: '0,0' };
  const result = mergeMeasurementDraft(base, local, remote);
  assert.deepEqual(result.fields, []);
  assert.deepEqual(result.merged.values, remote.values);
});
test('Nur widersprüchliche Werte benötigen eine Auswahl, andere Ergänzungen bleiben im Ergebnis', () => {
  const base = draft(), local = clone(base), remote = clone(base);
  local.values = { ph: '7,2', kh: '4' };remote.values = { ph: '7,4', no3: '10' };
  const result = mergeMeasurementDraft(base, local, remote);
  assert.deepEqual(result.fields, ['values.ph']);
  assert.deepEqual(result.merged.values, { ph: '7,4', no3: '10', kh: '4' });
  setDraftField(result.merged, 'values.ph', draftField(local, 'values.ph'));
  assert.deepEqual(result.merged.values, { ph: '7,2', no3: '10', kh: '4' });
});
test('Einseitige Korrekturen und bewusstes Leeren werden vom gemeinsamen Ausgangsstand unterschieden', () => {
  const base = draft();base.values.ph = '7,2';
  const local = clone(base), remote = clone(base);local.values.ph = '7,4';remote.values.no3 = '10';
  assert.deepEqual(mergeMeasurementDraft(base, local, remote).merged.values, { ph: '7,4', no3: '10' });
  delete local.values.ph;
  assert.equal(mergeMeasurementDraft(base, local, remote).merged.values.ph, undefined);
  remote.values.ph = '7,6';
  assert.deepEqual(mergeMeasurementDraft(base, local, remote).fields, ['values.ph']);
});
test('Unbekannter Ausgangsstand erhält fremde Werte und lässt nur echte Abweichungen entscheiden', () => {
  const local = draft(), remote = clone(local);local.values.ph = '7,2';remote.values.no3 = '10';
  assert.deepEqual(mergeMeasurementDraft(null, local, remote).merged.values, { no3: '10', ph: '7,2' });
  remote.values.ph = '7,4';assert.deepEqual(mergeMeasurementDraft(null, local, remote).fields, ['values.ph']);
});
test('Methodenwechsel dürfen gleichzeitig ergänzte Messwerte und Timer nicht still entfernen', () => {
  const base = draft(), local = clone(base), remote = clone(base);
  local.selected = ['drops:no3', 'drops:kh'];remote.values.ph = '7,2';remote.timers.ph = 123;
  const result = mergeMeasurementDraft(base, local, remote);
  assert.ok(result.fields.includes('selected'));
  assert.equal(result.merged.values.ph, '7,2');
  result.merged.selected = local.selected;pruneDraftFields(result.merged);
  assert.equal(result.merged.values.ph, undefined);assert.equal(result.merged.timers.ph, undefined);
});

function workspaceFixture(snapshot) {
  const ts = require('typescript'), fs = require('node:fs');
  const helpers = require('../dist/backend/src/shared/measurement-draft');
  const model = require('../dist/backend/src/shared/offline-workspace-model');
  let stored, acknowledgment;
  const offlineState = { pending: [] };
  const imports = {
    '../../src/shared/measurement-draft': helpers,
    '../../src/shared/offline-workspace-model': model,
    '../../src/shared/offline-workspace': require('../dist/backend/src/shared/offline-workspace'),
    '../../src/utils/app-error': require('../dist/backend/src/utils/app-error'),
    './offline-store': { readLocal: async key => key.startsWith('workspace-mapping:') ? {} : snapshot, storePending: async item => { stored = item; }, pendingFor: async () => stored ? [stored] : [], offlineState, commitWorkspaceAck: async (key, confirmed, item, mapping) => { acknowledgment = { key, confirmed, item, mapping }; } },
    './offline-catalogs': { readCatalogData: async () => undefined },
  };
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync('public/frontend/offline-workspace.ts', 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  new Function('require', 'exports', 'window', 'Event', 'location', code)(name => imports[name] || {}, exports, { dispatchEvent() {} }, Event, { hash: '#/a/42/messen' });
  return { ...exports, stored: () => stored, acknowledgment: () => acknowledgment };
}
test('Gezielte Konfliktauswahl erhält unabhängige Werte und persistiert den neuen Ausgangsstand', async () => {
  const base = draft(), local = clone(base), remote = clone(base);
  local.values = { ph: '7,2', kh: '4' };remote.values = { ph: '7,4', no3: '10' };
  const f = workspaceFixture();
  const command = { id: randomUUID(), owner: 1, kind: 'workspace', path: '/aquariums/42/measurement-draft', method: 'PUT', body: local, conflict: { current: { data: remote }, version: 'latest', draftMerge: mergeMeasurementDraft(base, local, remote) } };
  await assert.rejects(f.resolveDraftWorkspace(command, {}), /Auswahl/);
  assert.equal(f.stored(), undefined);
  await f.resolveDraftWorkspace(command, { 'values.ph': 'local' });
  assert.deepEqual(f.stored().body.values, { ph: '7,2', no3: '10', kh: '4' });
  assert.equal(f.stored().base, 'latest');assert.deepEqual(f.stored().draftBase, remote);
  assert.equal(f.stored().conflict, undefined);
});
test('Atomare Bestätigung übernimmt den tatsächlich zusammengeführten Serverentwurf, Folgeaktionen erhalten dessen Ergänzungen', async () => {
  const local = draft();local.values.ph = '7,2';
  const accepted = clone(local);accepted.values.no3 = '10';
  const path = '/aquariums/42/measurement-draft';
  const snapshot = { schema: 1, owner: 1, language: 'de', responses: { '/aquariums/42': { role: 'owner' }, '/config': { suites: [{ id: 'drops', tests: ['ph', 'no3', 'kh'].map(key => ({ key })) }] }, [path]: null }, versions: {} };
  const command = { id: randomUUID(), owner: 1, kind: 'workspace', path, method: 'PUT', body: local, base: 'old', draftBase: null, temporaryIds: [], createdAt: new Date().toISOString() };
  const f = workspaceFixture(snapshot);
  await f.acknowledgeWorkspace(command, { target: path, version: 'merged', deleteVersion: 'merged', result: { ok: true, draft: accepted, merged: true } }, 'de');
  const confirmed = f.acknowledgment().confirmed;
  assert.deepEqual(confirmed.responses[path].values, { ph: '7,2', no3: '10' });
  const { applyLocalOperation } = require('../dist/backend/src/shared/offline-workspace-model');
  applyLocalOperation(confirmed, { ...command, body: { ...local, values: { ph: '7,4' } }, draftBase: local });
  assert.deepEqual(confirmed.responses[path].values, { ph: '7,4', no3: '10' });
});

'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const { reactive, nextTick, effectScope } = require('vue');
const { randomUUID } = require('node:crypto');

function setup() {
  const scope = effectScope(), session = reactive({ user: null }), language = { value: 'de' }, events = {}, commands = [];
  let owner = 1, fail = false, gate;
  const snapshots = { 1: { responses: { '/aquariums': [{ id: 10, name: 'A' }, { id: 20, name: 'B' }], '/aquariums/10/measurement-draft': null, '/aquariums/20/measurement-draft': null }, versions: {} }, 2: { responses: { '/aquariums': [] }, versions: {} } };
  const exports = {};
  const clone = value => JSON.parse(JSON.stringify(value));
  const code = ts.transpileModule(fs.readFileSync('public/frontend/composables/measurement-drafts.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  scope.run(() => new Function('require', 'exports', 'window', 'Event', code)(id => {
    if (id === 'vue') return require(id);
    if (id === '../state') return { session, language, errorMessage: error => error.message };
    if (id === '../offline-store') return { activeOwner: async () => owner, pendingFor: async () => [] };
    if (id === '../offline-workspace') return {
      workspaceFor: async owner => snapshots[owner], synchronizeWorkspace: async () => {},
      localWorkspace: async owner => clone(snapshots[owner]),
      enqueueWorkspace: async (owner, lang, path, method, body, base, draftBase) => {
        if (gate) await gate;
        if (fail) throw new Error('Speicher voll');
        commands.push({ owner, path, method, body: clone(body), base, draftBase: clone(draftBase ?? null) });
        snapshots[owner].responses[path.replace('/complete', '')] = method === 'PUT' ? clone(body) : null;
        snapshots[owner].versions[path] = 'version-' + commands.length;
        return { result: { ok: true }, operationId: String(commands.length) };
      },
    };
    throw new Error(id);
  }, exports, { addEventListener: (type, callback) => { events[type] = callback; }, dispatchEvent() {} }, Event));
  const ready = async () => { await nextTick();await exports.ensureMeasurementDrafts(); };
  return { ...exports, session, commands, snapshots, events, ready, scope, hold: () => { let release;gate = new Promise(resolve => { release = resolve; });return () => { gate = undefined;release(); }; }, fail: value => { fail = value; }, owner: value => { owner = value; } };
}
const draft = id => ({ draftId: randomUUID(), aquariumId: String(id), aquariumName: id === 10 ? 'A' : 'B', when: '2026-10-18T10:00', timeZoneOffset: -120, note: 'Probe', values: { ph: '7,2' }, selected: ['drops:ph'], suite: 'drops', timers: { ph: Date.now() + 60000 }, completed: {} });

test('Testentwürfe werden dauerhaft je Becken gespeichert, nach Neuladen geladen und beim Kontowechsel getrennt', async t => {
  const app = setup();t.after(() => app.scope.stop());
  app.session.user = { id: 1 };await app.ready();
  app.measurementDrafts[10] = draft(10);app.measurementDrafts[20] = draft(20);
  await app.flushMeasurementDrafts();
  app.measurementDrafts[20].values.ph = '6,8';await app.flushMeasurementDrafts();
  assert.equal(app.measurementDrafts[10].values.ph, '7,2');
  assert.equal(app.commands.at(-1).body.values.ph, '6,8');
  assert.ok(app.commands.at(-1).base.startsWith('after:'), 'Follow-up uses its own acknowledged operation even when removed from outbox');
  app.session.user = null;assert.deepEqual(Object.keys(app.measurementDrafts), []);
  app.session.user = { id: 1 };await app.ready();
  assert.equal(app.measurementDrafts[20].values.ph, '6,8');
  app.owner(2);app.session.user = { id: 2 };await app.ready();
  assert.deepEqual(Object.keys(app.measurementDrafts), []);
  assert.equal(app.snapshots[1].responses['/aquariums/20/measurement-draft'].values.ph, '6,8');
});

test('Speicherfehler bleiben sichtbar und verwerfen keine ungesicherten Werte bei einem Geräteabgleich', async t => {
  const app = setup();t.after(() => app.scope.stop());
  app.session.user = { id: 1 };await app.ready();
  app.fail(true);app.measurementDrafts[10] = draft(10);
  await assert.rejects(app.flushMeasurementDrafts(), /Speicher voll/);
  await app.loadMeasurementDrafts();
  assert.equal(app.measurementDrafts[10].values.ph, '7,2');
  assert.equal(app.draftSyncState.error, 'Speicher voll');
  app.fail(false);await app.flushMeasurementDrafts();
  assert.equal(app.draftSyncState.error, '');
  await app.closeMeasurementDraft('10');
  assert.equal(app.measurementDrafts[10], undefined);
  assert.equal(app.commands.at(-1).method, 'DELETE');
});

test('Geräteabgleich aktualisiert offene Formulare in-place und erzeugt keine Echo-Schreibaktionen', async t => {
  const app = setup();t.after(() => app.scope.stop());
  app.session.user = { id: 1 };await app.ready();
  app.measurementDrafts[10] = draft(10);await app.flushMeasurementDrafts();
  const current = app.measurementDrafts[10], count = app.commands.length;
  app.snapshots[1].responses['/aquariums/10/measurement-draft'].values.ph = '7,6';
  await app.loadMeasurementDrafts();await nextTick();
  assert.equal(app.measurementDrafts[10], current);
  assert.equal(current.values.ph, '7,6');
  assert.equal(app.commands.length, count);
});

test('Schnelle Folgeeingaben behalten ihre Operationsabhängigkeit während ein lokaler Schreibvorgang noch läuft', async t => {
  const app = setup();t.after(() => app.scope.stop());
  app.session.user = { id: 1 };await app.ready();
  const release = app.hold();
  app.measurementDrafts[10] = draft(10);await nextTick();
  app.measurementDrafts[10].values.ph = '6,5';await nextTick();
  release();await app.flushMeasurementDrafts();
  assert.equal(app.commands[0].base, 'missing');
  assert.equal(app.commands[1].base, 'after:1');
  assert.equal(app.commands[0].draftBase, null);
  assert.equal(app.commands[1].draftBase.values.ph, '7,2');
  assert.equal(app.commands[1].body.values.ph, '6,5');
});

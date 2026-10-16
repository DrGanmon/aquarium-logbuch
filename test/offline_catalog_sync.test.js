'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const ts = require('typescript');
const shared = require('../dist/backend/src/shared/offline-catalog');
const query = require('../dist/backend/src/shared/offline-catalog-query');
function fixture() {
  const records = new Map(), writes = [], calls = [], events = [];
  const state = {};
  let owner = 7, fail, wrongOwner = false;
  const data = {
    species: { species: [{ id: 'test', name: 'Test fish', scientificName: 'Fish', waterType: 'fresh' }], categories: [] },
    plants: { plants: [], fieldDefinitions: {}, sources: {}, searchText: {} },
    health: { catalog: { diseases: [], species: [] }, diseases: [], associations: { fresh: {}, salt: {} }, diagnosis: { fresh: {}, salt: {} }, medications: { items: [] }, medicationDetails: [] },
  };
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync('public/frontend/offline-catalogs.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(code, {
    exports, URL, Error, DOMException, AbortSignal, Date,
    CustomEvent: class { constructor(type, options) { this.type = type;this.detail = options.detail; } },
    window: { dispatchEvent: event => events.push(event) },
    require: name => name.endsWith('offline-catalog') ? shared : (name.endsWith('offline-catalog-query') || name.endsWith('catalog-routing')) ? query : {
      activeOwner: async () => owner, readLocal: async key => records.get(key), offlineState: state,
      writeLocal: async (key, value) => { writes.push(key);records.set(key, value); },
    },
    fetch: async (path, options) => {
      calls.push({ path, options });
      const kind = path.match(/catalogs\/(\w+)/)[1];
      if (fail === 'transport') throw new TypeError('Download interrupted');
      const headers = { 'X-Aquarium-User': wrongOwner ? '8' : '7' };
      if (fail === 'malformed') return new Response(JSON.stringify({ schema: 1, kind, language: 'de', version: 'b'.repeat(64), data: {} }), { headers });
      if (options.headers['If-None-Match']) return new Response(null, { status: 304, headers });
      return new Response(JSON.stringify({ schema: 1, kind, language: path.includes('lang=en') ? 'en' : 'de', version: 'a'.repeat(64), data: data[kind] }), { headers });
    }, Response,
  });
  return { exports, records, writes, calls, events, state, fail: value => { fail = value; }, owner: value => { owner = value; }, wrongOwner: () => { wrongOwner = true; } };
}

test('Catalog sync: complete snapshots persist once, 12-hour throttle avoids polling payloads, 304 keeps data untouched', async () => {
  const f = fixture();
  await f.exports.synchronizeCatalogs(7, 'de');
  assert.equal(f.calls.length, 3);
  assert.equal(f.events.length, 3);
  assert.equal(f.state.catalogSyncing, false);
  const snapshotWrites = () => f.writes.filter(key => !key.endsWith(':checked')).length;
  assert.equal(snapshotWrites(), 3);
  await f.exports.synchronizeCatalogs(7, 'de');
  assert.equal(f.calls.length, 3);
  await f.exports.synchronizeCatalogs(7, 'de', true);
  assert.equal(f.calls.length, 6);
  assert.equal(f.calls[3].options.headers['If-None-Match'], '"' + 'a'.repeat(64) + '"');
  assert.equal(snapshotWrites(), 3);
  assert.equal(f.events.length, 3);
  assert.equal((await f.exports.readOfflineCatalog('/species?limit=24&q=fish', 'de')).total, 1);
  assert.equal(await f.exports.readOfflineCatalog('/health/aquariums/1/diagnosis', 'de'), undefined);
});

test('Catalog sync: failed or malformed replacements retain the complete previous snapshot', async () => {
  const f = fixture();
  await f.exports.synchronizeCatalogs(7, 'de');
  const previous = f.records.get('catalog:1:de:species');
  for (const failure of ['transport', 'malformed']) {
    f.fail(failure);
    await f.exports.synchronizeCatalogs(7, 'de', true);
    assert.equal(f.records.get('catalog:1:de:species'), previous);
    assert.ok(f.state.catalogError);
    const calls = f.calls.length;
    await f.exports.synchronizeCatalogs(7, 'de');
    assert.equal(f.calls.length, calls, 'Failures back off instead of redownloading every 30 seconds');
    assert.equal((await f.exports.readOfflineCatalog('/species/test', 'de')).species.id, 'test');
  }
});

test('Catalog sync: account changes prevent committing responses and parallel requests share a download', async () => {
  const f = fixture();
  await Promise.all([f.exports.synchronizeCatalogs(7, 'de'), f.exports.synchronizeCatalogs(7, 'de')]);
  assert.equal(f.calls.length, 3);
  f.wrongOwner();
  await f.exports.synchronizeCatalogs(7, 'en');
  assert.equal(f.records.has('catalog:1:en:species'), false);
  f.owner(8);
  const count = f.calls.length;
  await f.exports.synchronizeCatalogs(7, 'de', true);
  assert.equal(f.calls.length, count);
});

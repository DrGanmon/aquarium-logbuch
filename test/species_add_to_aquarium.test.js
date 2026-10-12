'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createTestEnvironment, createMongoTestEnvironment } = require('./helpers/env');

for (const type of ['sqlite', 'mongodb']) {
  test(`Artenkatalog: mehrere Tiere mit optionalen Namen hinzufügen (${type})`, async (t) => {
    const env = type === 'mongodb' ? await createMongoTestEnvironment() : createTestEnvironment();
    t.after(() => env.cleanup());
    const owner = await env.createUserAndLogin(`catalogowner${type}`);
    const outsider = await env.createUserAndLogin(`catalogoutsider${type}`);
    const headers = { Cookie: owner.cookie };
    const aq = await env.request('/api/aquariums', { method: 'POST', headers, body: { name: 'Catalog aquarium', water_type: 'fresh', volume_l: 100 } });
    const id = aq.data.id;
    const endpoint = `/api/aquariums/${id}/stock/catalog`;
    const body = { speciesId: 'poecilia-reticulata', count: 4, names: ['Bubbles', '', 'Nemo', '   '] };
    const added = await env.request(endpoint, { method: 'POST', headers, body });
    assert.equal(added.status, 200);
    assert.equal(added.data.added, 4);
    const stock = (await env.request(`/api/aquariums/${id}/stock`, { headers })).data;
    assert.equal(stock.reduce((sum, item) => sum + item.count, 0), 4);
    assert.equal(stock.find((item) => item.name === 'Bubbles').count, 1);
    assert.equal(stock.find((item) => item.name === 'Nemo').count, 1);
    assert.equal(stock.find((item) => !item.name).count, 2);
    assert.ok(stock.every((item) => item.profile === 'hartwasser' && item.speciesId === body.speciesId));
    for (const invalid of [
      { ...body, count: 1.5 }, { ...body, count: 0 }, { ...body, names: ['too few'] },
      { ...body, names: ['x'.repeat(81), '', '', ''] },
      { ...body, speciesId: 'amphiprion-ocellaris' }, { ...body, speciesId: 'unknown' },
    ]) assert.equal((await env.request(endpoint, { method: 'POST', headers, body: invalid })).status, 400);
    assert.equal((await env.request(endpoint, { method: 'POST', headers: { Cookie: outsider.cookie }, body })).status, 404);
    const afterInvalid = (await env.request(`/api/aquariums/${id}/stock`, { headers })).data;
    assert.equal(afterInvalid.length, 3);
    const unnamed = await env.request(endpoint, { method: 'POST', headers, body: { speciesId: body.speciesId, count: 12, names: [] } });
    assert.equal(unnamed.status, 200);
    assert.equal(unnamed.data.entries.length, 1);
  });
}

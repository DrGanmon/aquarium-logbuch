'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createTestEnvironment } = require('./helpers/env');

test('Lazy-Aquariumübersicht behält aktuelle Werte und Warnungen; Besatz wird geschützt nachgeladen', async (t) => {
  const env = createTestEnvironment();
  t.after(() => env.cleanup());
  const owner = await env.createUserAndLogin('lazyowner');
  const outsider = await env.createUserAndLogin('lazyoutsider');
  const reader = await env.createUserAndLogin('lazyreader');
  const headers = { Cookie: owner.cookie };
  const aq = await env.request('/api/aquariums', { method: 'POST', headers, body: { name: 'Lazy Aquarium', water_type: 'fresh', volume_l: 200 } });
  const id = aq.data.id;
  for (const species of ['Roter Neon', 'Guppy']) {
    const result = await env.request(`/api/aquariums/${id}/stock`, { method: 'POST', headers, body: { species, count: 10, profile: species === 'Guppy' ? 'hartwasser' : 'weichwasser' } });
    assert.equal(result.status, 200);
  }
  const measurement = await env.request(`/api/aquariums/${id}/measurements`, { method: 'POST', headers, body: { values: { ph: 7 } } });
  assert.equal(measurement.status, 200);
  const pump = await env.request(`/api/aquariums/${id}/dosing-pumps`, { method: 'POST', headers, body: { name: 'Pump', fertilizer_name: 'Fertilizer', amount_ml: 2, interval_days: 1 } });
  assert.equal(pump.status, 200);
  const full = await env.request(`/api/aquariums/${id}`, { headers });
  const summary = await env.request(`/api/aquariums/${id}?summary=true`, { headers });
  assert.equal(summary.status, 200);
  assert.equal(full.data.dosing_pumps.length, 1);
  assert.deepEqual(summary.data.stock, []);
  assert.deepEqual(summary.data.dosing_pumps, []);
  for (const key of ['latest', 'thresholds', 'conflicts', 'alerts', 'stockCompatibility']) assert.deepEqual(summary.data[key], full.data[key], key);
  assert.ok(summary.data.conflicts.length > 0);
  assert.ok(summary.data.latest.ph);
  const stock = await env.request(`/api/aquariums/${id}/stock`, { headers });
  assert.equal(stock.status, 200);
  assert.equal(stock.data.length, 2);
  assert.equal(stock.data.find((item) => item.species === 'Guppy').speciesId, 'poecilia-reticulata');
  assert.ok(stock.data.every((item) => item.scientificName));
  assert.equal((await env.request(`/api/aquariums/${id}/stock`, { headers: { Cookie: outsider.cookie } })).status, 404);
  assert.equal((await env.request(`/api/aquariums/${id}/stock`)).status, 401);
  const share = await env.request(`/api/aquariums/${id}/shares`, { method: 'POST', headers, body: { usernameOrEmail: reader.username, role: 'view' } });
  assert.equal(share.status, 200);
  const accept = await env.request('/api/shares/accept', { method: 'POST', headers: { Cookie: reader.cookie }, body: { aquarium_id: id } });
  assert.equal(accept.status, 200);
  assert.equal((await env.request(`/api/aquariums/${id}/stock`, { headers: { Cookie: reader.cookie } })).status, 200);
});

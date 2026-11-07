'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { parseDecimal } = require('../dist/backend/src/shared/input');
const { createTestEnvironment } = require('./helpers/env');

test('Dezimalzahlen werden mit deutschem Komma und englischem Punkt gelesen', () => {
  for (const [input, expected] of [['7,5', 7.5], ['7.5', 7.5], [' 0,02 ', 0.02], [',5', 0.5], ['.5', 0.5], ['8,', 8], ['-1,25', -1.25], ['−1,5', -1.5], ['12', 12], [6.8, 6.8]]) {
    assert.equal(parseDecimal(input), expected, String(input));
  }
  for (const input of ['', ' ', ',', '1,000.5', '1.000,5', '1,2,3', '1e3', '0x10', 'Infinity', 'abc', '7,5 mg', null, undefined, Number.NaN, {}]) {
    assert.equal(parseDecimal(input), null, String(input));
  }
});

test('Formulare bieten Dezimaleingaben als Text mit Dezimaltastatur an', () => {
  const read = file => fs.readFileSync(path.join(__dirname, '..', 'public/frontend', file), 'utf8');
  assert.match(read('views/MeasureView.vue'), /type="text"\s+inputmode="decimal"/);
  assert.match(read('components/TapWaterSettings.vue'), /type="text"\s+inputmode="decimal"/);
  assert.match(read('components/Fields.vue'), /field\.type === 'decimal'"[\s\S]*?type="text"\s+inputmode="decimal"/);
  assert.match(read('components/LogForm.vue'), /key: "percentage",[\s\S]*?type: "decimal"/);
  assert.match(read('components/AquariumForm.vue'), /key: "volume_l",[\s\S]*?type: "decimal"/);
  assert.match(read('components/FertilizerSection.vue'), /v-model="model\.amount_ml" type="text" inputmode="decimal"/);
  assert.match(read('composables/values.ts'), /parseDecimal/);
});

test('Server übernimmt Werte mit Komma oder Punkt und lehnt mehrdeutige Angaben ab', async t => {
  const env = createTestEnvironment();
  t.after(async () => await env.cleanup());
  const user = await env.createUserAndLogin('decimaluser', 'password123');
  const headers = { Cookie: user.cookie };

  const aquarium = await env.request('/api/aquariums', { method: 'POST', headers, body: { name: 'Komma', water_type: 'fresh', volume_l: '120,4' } });
  assert.equal(aquarium.status, 200);
  const id = aquarium.data.id;

  const comma = await env.request(`/api/aquariums/${id}/measurements`, { method: 'POST', headers, body: { values: { ph: '7,2', no2: '0,05' } } });
  assert.equal(comma.status, 200, JSON.stringify(comma.data));
  const point = await env.request(`/api/aquariums/${id}/measurements`, { method: 'POST', headers, body: { values: { ph: '6.8', kh: '4.5' } } });
  assert.equal(point.status, 200, JSON.stringify(point.data));
  for (const value of ['1,000.5', '1e1', '0x7']) {
    const rejected = await env.request(`/api/aquariums/${id}/measurements`, { method: 'POST', headers, body: { values: { ph: value } } });
    assert.equal(rejected.status, 400, value);
  }

  const measurements = await env.request(`/api/aquariums/${id}/measurements?all=true`, { headers });
  assert.equal(measurements.status, 200);
  const values = measurements.data.map(entry => entry.values);
  assert.ok(values.some(entry => entry.ph === 7.2 && entry.no2 === 0.05), JSON.stringify(values));
  assert.ok(values.some(entry => entry.ph === 6.8 && entry.kh === 4.5), JSON.stringify(values));

  const log = await env.request(`/api/aquariums/${id}/maintenance`, { method: 'POST', headers, body: { type: 'water_change', percentage: '25,5' } });
  assert.equal(log.status, 200, JSON.stringify(log.data));
  const pump = await env.request(`/api/aquariums/${id}/fertilizers`, { method: 'POST', headers, body: { name: 'Kanal 1', fertilizer_name: 'Eisen', amount_ml: '1,25', interval_days: 1, time_of_day: '08:00', mode: 'manual' } });
  assert.equal(pump.status, 200, JSON.stringify(pump.data));

  const detail = await env.request(`/api/aquariums/${id}`, { headers });
  assert.equal(detail.data.aquarium?.volume_l ?? detail.data.volume_l, 120);
});

'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { createTestEnvironment, createMongoTestEnvironment } = require('./helpers/env');

for (const backend of ['sqlite', 'mongodb']) {
  test(`Offline-Logbuch: Kategorien, Geräte, Wiederholungen und Restore (${backend})`, { timeout: 90000 }, async t => {
    const env = backend === 'mongodb' ? await createMongoTestEnvironment() : createTestEnvironment({ DB_TYPE: 'sqlite' });
    t.after(() => env.cleanup());
    const user = await env.createUserAndLogin('offline_logs');
    const headers = { Cookie: user.cookie };
    const me = (await env.request('/api/me', { headers })).data;
    const aq = (await env.request('/api/aquariums', { method: 'POST', headers, body: { name: 'Logbuch', volume_l: 100 } })).data;
    const path = `/api/aquariums/${aq.id}/maintenance`;
    const body = { operation_id: randomUUID(), operation_user_id: me.id, logged_at: new Date().toISOString(), type: 'water_change', percentage: 30, details: 'Bodengrund abgesaugt', note: 'Handy' };
    const post = data => env.request(path, { method: 'POST', headers, body: data });
    for (const invalid of [{ operation_id: 'invalid' }, { logged_at: undefined }, { type: 'dosing_pump' }, { percentage: 150 }, { logged_at: 'invalid' }]) {
      assert.equal((await post({ ...body, ...invalid })).status, 400);
    }
    assert.equal((await post({ ...body, operation_user_id: me.id + 1 })).status, 403);
    assert.equal((await post({ ...body, operation_user_id: undefined })).status, 403);
    const tablet = { ...body, operation_id: randomUUID(), note: 'Tablet' };
    const results = await Promise.all([post(body), post(tablet), post(body), post(tablet)]);
    for (const result of results) assert.equal(result.status, 200, JSON.stringify(result.data));
    assert.deepEqual(results[0].data, results[2].data);
    assert.deepEqual(results[1].data, results[3].data);
    assert.notEqual(results[0].data.id, results[1].data.id);
    let rows = (await env.request(path, { headers })).data;
    assert.equal(rows.length, 2);
    assert.equal(rows.find(row => row.id === results[0].data.id).details, body.details);
    assert.equal(rows.find(row => row.id === results[0].data.id).percentage, 30);
    assert.equal((await post({ ...body, details: 'Anderer Inhalt' })).status, 409);
    const aq2 = (await env.request('/api/aquariums', { method: 'POST', headers, body: { name: 'Other', volume_l: 50 } })).data;
    assert.equal((await env.request(`/api/aquariums/${aq2.id}/maintenance`, { method: 'POST', headers, body })).status, 409);
    const categories = ['filter_change', 'filter_clean', 'plants_cut', 'plants_new', 'care', 'fertilize', 'feeding', 'other'];
    for (const type of categories) {
      const entry = { ...body, operation_id: randomUUID(), type, percentage: null };
      const created = await post(entry);
      assert.equal(created.status, 200, type);
      assert.deepEqual((await post(entry)).data, created.data);
    }
    // Existing non-offline clients still work, and edits remain ordinary online updates.
    assert.equal((await post({ type: 'care', note: 'Legacy' })).status, 200);
    assert.equal((await env.request(`${path}/${results[0].data.id}`, { method: 'PUT', headers, body: { type: 'water_change', percentage: 40, logged_at: body.logged_at } })).status, 200);
    assert.deepEqual((await post(body)).data, results[0].data, 'Retry does not undo a subsequent edit');
    // The same UUID can independently identify a measurement and a log entry.
    const measurement = await env.request(`/api/aquariums/${aq.id}/measurements`, { method: 'POST', headers, body: { operation_id: body.operation_id, operation_user_id: me.id, measured_at: body.logged_at, values: { ph: 7.2 } } });
    assert.equal(measurement.status, 200);
    assert.equal((await env.request(`${path}/${results[0].data.id}`, { method: 'DELETE', headers })).status, 200);
    assert.deepEqual((await post(body)).data, results[0].data);
    rows = (await env.request(path, { headers })).data;
    assert.equal(rows.length, 10, 'Deleted entry stays deleted, independent categories stay intact');
    const db = require('../dist/backend/src/db');
    const snapshot = await db.exportAllData();
    assert.equal(snapshot.measurement_operations.length, 11);
    await db.importAllData(snapshot);
    assert.deepEqual((await post(body)).data, results[0].data);
    assert.equal((await env.request(path, { headers })).data.length, 10);
  });
}

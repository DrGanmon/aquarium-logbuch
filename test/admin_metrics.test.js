'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createTestEnvironment, createMongoTestEnvironment } = require('./helpers/env');

for (const backend of ['sqlite', 'mongodb']) {
  test(`Admin-Metriken: anonyme Summen und geschützter JSON-Endpunkt (${backend})`, { timeout: 60000 }, async (t) => {
    const env = backend === 'mongodb' ? await createMongoTestEnvironment() : createTestEnvironment();
    t.after(async () => env.cleanup());

    const admin = await env.createUserAndLogin('metrics_admin', 'password123', 'admin@example.com');
    const user = await env.createUserAndLogin('metrics_user', 'password123', 'metrics-user@example.com');
    const headers = { Cookie: user.cookie };
    const aquarium = await env.request('/api/aquariums', {
      method: 'POST', headers,
      body: { name: 'Metrics aquarium', water_type: 'fresh', volume_l: 120 },
    });
    assert.equal(aquarium.status, 200);
    const aquariumId = aquarium.data.id;
    const measurement = await env.request(`/api/aquariums/${aquariumId}/measurements`, {
      method: 'POST', headers, body: { values: { ph: 7 } },
    });
    assert.equal(measurement.status, 200);
    const log = await env.request(`/api/aquariums/${aquariumId}/maintenance`, {
      method: 'POST', headers, body: { type: 'water_change', percentage: 20 },
    });
    assert.equal(log.status, 200);

    const db = require('../../dist/backend/src/db');
    await db.recordAiUsage('openai', { prompt_tokens: 10, completion_tokens: 4, total_tokens: 14 });
    await db.recordAiUsage('openai', null);
    await db.recordAiUsage('gemini', { promptTokenCount: 5, candidatesTokenCount: 3, totalTokenCount: 8 });
    await db.recordAiUsage('claude', { input_tokens: 2, output_tokens: 6 });
    assert.equal(await db.recordAiUsage('unknown', { input_tokens: 100, output_tokens: 100 }), false);

    const forbidden = await env.request('/api/admin/metrics', { headers });
    assert.equal(forbidden.status, 403);
    const adminView = await env.request('/api/admin/metrics', { headers: { Cookie: admin.cookie } });
    assert.equal(adminView.status, 200);
    assert.equal(adminView.data.metrics.users.total, 2);
    assert.equal(adminView.data.metrics.aquariums.total, 1);
    assert.equal(adminView.data.metrics.aquariums.perUserAverage, 0.5);
    assert.equal(adminView.data.metrics.measurements.total, 1);
    assert.equal(adminView.data.metrics.logbookEntries.total, 1);
    assert.equal(adminView.data.metrics.ai.requests, 4);
    assert.equal(adminView.data.metrics.ai.totalTokens, 30);
    assert.equal(adminView.data.metrics.ai.providers.openai.requests, 2);
    assert.equal(adminView.data.metrics.ai.providers.openai.totalTokens, 14);
    assert.equal(adminView.data.metrics.ai.providers.gemini.totalTokens, 8);
    assert.equal(adminView.data.metrics.ai.providers.claude.totalTokens, 8);
    assert.equal(adminView.data.passwordConfigured, false);
    assert.equal(JSON.stringify(adminView.data).includes('metrics_user'), false);
    assert.equal(JSON.stringify(adminView.data).includes('metrics-user@example.com'), false);

    const scrapeBeforePassword = await env.request('/metrics');
    assert.equal(scrapeBeforePassword.status, 401);
    const shortPassword = await env.request('/api/admin/metrics', {
      method: 'PUT', headers: { Cookie: admin.cookie }, body: { password: 'too-short' },
    });
    assert.equal(shortPassword.status, 400);
    const password = 'metrics-scrape-secret-2026';
    const savePassword = await env.request('/api/admin/metrics', {
      method: 'PUT', headers: { Cookie: admin.cookie }, body: { password },
    });
    assert.equal(savePassword.status, 200);
    const passwordFile = path.join(env.getDataDir(), 'metrics-access.json');
    const passwordConfig = fs.readFileSync(passwordFile, 'utf8');
    assert.equal(passwordConfig.includes(password), false);
    assert.equal(fs.statSync(passwordFile).mode & 0o777, 0o600);

    assert.equal((await env.request('/metrics')).status, 401);
    assert.equal((await env.request('/metrics', { headers: { Authorization: 'Bearer wrong-password' } })).status, 401);
    const scrape = await env.request('/metrics', { headers: { Authorization: `Bearer ${password}` } });
    assert.equal(scrape.status, 200);
    assert.equal(scrape.headers.get('cache-control'), 'no-store');
    assert.deepEqual(scrape.data, adminView.data.metrics);
    assert.equal(JSON.stringify(scrape.data).includes('metrics_user'), false);
    assert.equal(JSON.stringify(scrape.data).includes('metrics-user@example.com'), false);

    const backupData = await db.exportAllData();
    assert.deepEqual(backupData.ai_usage_metrics.map(row => row.provider).sort(), ['claude', 'gemini', 'openai']);
    assert.ok(backupData.ai_usage_metrics.every(row => !('user_id' in row) && !('username' in row)));
    await db.importAllData(backupData);
    const restoredMetrics = await db.getAdminMetrics();
    assert.equal(restoredMetrics.ai.totalTokens, 30);
    assert.equal(restoredMetrics.ai.requests, 4);
  });
}
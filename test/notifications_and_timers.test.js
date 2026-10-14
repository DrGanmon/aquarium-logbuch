'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
require('fs');
require('path');
require('http');

const { createTestEnvironment } = require('./helpers/env');

test('Push-Benachrichtigungen & Timer-Service-Worker', async (t) => {
  const env = createTestEnvironment();
  await env.start();

  t.after(async () => {
    await env.cleanup();
  });

  await t.test('Service Worker (sw.js) wird ausgeliefert und enthält Timer-Logik', async () => {
    const res = await env.request('/sw.js');
    assert.equal(res.status, 200);
    const contentType = res.headers.get('content-type') || '';
    assert.ok(contentType.includes('javascript'));

    const content = res.text;
    assert.ok(/scope\.addEventListener\(["']install["']/.test(content), 'sw.js muss install-Handler enthalten');
    assert.ok(/scope\.addEventListener\(["']message["']/.test(content), 'sw.js muss message-Handler enthalten');
    assert.ok(content.includes('SCHEDULE_TIMER'), 'sw.js muss SCHEDULE_TIMER unterstützen');
    assert.ok(content.includes('CANCEL_TIMER'), 'sw.js muss CANCEL_TIMER unterstützen');
    assert.ok(content.includes('CLEAR_ALL_TIMERS'), 'sw.js muss CLEAR_ALL_TIMERS unterstützen');
    assert.ok(/scope\.addEventListener\(["']notificationclick["']/.test(content), 'sw.js muss notificationclick-Handler enthalten');
  });

  await t.test('Web App Manifest (manifest.json) wird korrekt ausgeliefert', async () => {
    const res = await env.request('/manifest.json');
    assert.equal(res.status, 200);
    const data = res.data;
    assert.equal(data.name, 'Aquarium-Logbuch');
    assert.ok(Array.isArray(data.icons));
  });

  await t.test('Content-Security-Policy erlaubt Service Worker und Scripts', async () => {
    const res = await env.request('/');
    assert.equal(res.status, 200);
    const csp = res.headers.get('content-security-policy') || '';
    assert.ok(csp.includes("worker-src 'self'"), 'CSP muss worker-src self erlauben');
    assert.ok(csp.includes("script-src 'self'"), 'CSP muss script-src self erlauben');
  });

  await t.test('Sprachdateien enthalten alle Übersetzungen für parallele Timer', async () => {
    const deRes = await env.request('/locales/de.json');
    assert.equal(deRes.status, 200);
    const de = deRes.data;

    const enRes = await env.request('/locales/en.json');
    assert.equal(enRes.status, 200);
    const en = enRes.data;

    const requiredKeys = [
      'activeTimersTitle',
      'timersRunningAndFinished',
      'timersOnlyRunning',
      'timersOnlyFinished',
      'timerReadyClick',
      'cancelAllTimers',
      'clearFinishedTimers',
      'timerRestart',
      'timerReset',
      'timerCancel',
    ];

    for (const key of requiredKeys) {
      assert.ok(de.measure && de.measure[key], `de.json muss measure.${key} enthalten`);
      assert.ok(en.measure && en.measure[key], `en.json muss measure.${key} enthalten`);
    }
  });
});

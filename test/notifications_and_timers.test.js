'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const http = require('http');

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
    assert.ok(content.includes("self.addEventListener('install'"), 'sw.js muss install-Handler enthalten');
    assert.ok(content.includes("self.addEventListener('message'"), 'sw.js muss message-Handler enthalten');
    assert.ok(content.includes('SCHEDULE_TIMER'), 'sw.js muss SCHEDULE_TIMER unterstützen');
    assert.ok(content.includes('CANCEL_TIMER'), 'sw.js muss CANCEL_TIMER unterstützen');
    assert.ok(content.includes('CLEAR_ALL_TIMERS'), 'sw.js muss CLEAR_ALL_TIMERS unterstützen');
    assert.ok(content.includes("self.addEventListener('notificationclick'"), 'sw.js muss notificationclick-Handler enthalten');
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

  await t.test('app.js integriert pushNotificationManager und Timer-Kopplung', async () => {
    const res = await env.request('/js/notifications.js');
    assert.equal(res.status, 200);
    const code = res.text;

    assert.ok(code.includes('pushNotificationManager'), 'notifications.js muss pushNotificationManager definieren');
    assert.ok(code.includes('scheduleTimer'), 'notifications.js muss Timer beim Start einplanen');
    assert.ok(code.includes('cancelTimer'), 'notifications.js muss Timer beim Abbrechen stornieren');
    assert.ok(code.includes('notificationBanner'), 'notifications.js muss Benachrichtigungs-Banner in der Messmaske rendern');
    assert.ok(code.includes('notificationsCard'), 'notifications.js muss Benachrichtigungs-Einstellungen im Profil bereitstellen');
  });

  await t.test('measure.js unterstützt parallele Timer, Multi-Timer-Dock und abgelaufene Timer', async () => {
    const res = await env.request('/js/views/measure.js');
    assert.equal(res.status, 200);
    const code = res.text;

    assert.ok(code.includes('multiTimerDock'), 'measure.js muss ein multiTimerDock für aktive/abgelaufene Timer enthalten');
    assert.ok(code.includes('cancelAllTimers'), 'measure.js muss cancelAllTimers unterstützen');
    assert.ok(code.includes('clearFinishedTimers'), 'measure.js muss clearFinishedTimers unterstützen');
    assert.ok(code.includes('multi-timer-chip'), 'measure.js muss Chips für parallele Timer rendern');
    assert.ok(code.includes('btnReset'), 'measure.js muss einen Reset-Button für abgelaufene/laufende Timer bereitstellen');
    assert.ok(code.includes('timer-flash'), 'measure.js muss Klick-Sprung mit Hervorhebung unterstützen');
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

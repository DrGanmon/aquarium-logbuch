'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const http = require('http');

const { createTestEnvironment } = require('./helpers/env');
const logger = require('../src/utils/logger');
const { Supervisor } = require('../src/services/supervisor');

test('Logging & Überwachungsprozess (Supervisor)', async (t) => {
  let env;

  t.beforeEach(async () => {
    env = createTestEnvironment();
  });

  t.afterEach(async () => {
    if (env) await env.cleanup();
  });

  await t.test('Logger schreibt formatierte Einträge und Fehler in .log Datei', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aquarium-log-test-'));
    const testLogFile = path.join(tempDir, 'test.log');
    process.env.LOG_FILE = testLogFile;

    try {
      logger.info('Test Info Nachricht', 'test-tag');
      logger.warn('Test Warnung', 'test-tag');
      logger.error('Test Fehler', 'test-tag');
      logger.error(new Error('Schwerer Ausnahmefehler mit Stack'), 'test-err');

      assert.ok(fs.existsSync(testLogFile), 'Log-Datei sollte existieren');
      const content = fs.readFileSync(testLogFile, 'utf8');

      assert.ok(content.includes('[INFO] [test-tag] Test Info Nachricht'));
      assert.ok(content.includes('[WARN] [test-tag] Test Warnung'));
      assert.ok(content.includes('[ERROR] [test-tag] Test Fehler'));
      assert.ok(content.includes('Schwerer Ausnahmefehler mit Stack'));

      const recent = logger.readRecentLogs(10);
      assert.ok(recent.length >= 4);

      const cleared = logger.clearLogs();
      assert.strictEqual(cleared, true);
      const afterClear = logger.readRecentLogs(10);
      assert.ok(afterClear.some((l) => l.includes('bereinigt')));
    } finally {
      delete process.env.LOG_FILE;
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch (e) {}
    }
  });

  await t.test('Express Error-Handler loggt 500er Fehler in die Log-Datei', async () => {
    const express = require('express');
    const testApp = express();
    const testLogFile = path.join(env.getDataDir(), 'aquarium.log');
    process.env.LOG_FILE = testLogFile;

    testApp.get('/test-error', (req, res, next) => {
      next(new Error('Kritischer Test-Fehler in API'));
    });

    testApp.use((err, req, res, next) => {
      logger.error(`Express-Fehler bei ${req.method} ${req.originalUrl || req.url}: ${err.stack || err.message}`, 'express');
      res.status(500).json({ error: 'Ein interner Serverfehler ist aufgetreten.' });
    });

    const server = http.createServer(testApp);
    await new Promise((resolve) => server.listen(0, resolve));
    const port = server.address().port;

    try {
      const res = await fetch(`http://127.0.0.1:${port}/test-error`);
      const data = await res.json();
      assert.strictEqual(res.status, 500);
      assert.ok(data.error.includes('Serverfehler'));

      assert.ok(fs.existsSync(testLogFile));
      const content = fs.readFileSync(testLogFile, 'utf8');
      assert.ok(content.includes('Kritischer Test-Fehler in API'));
      assert.ok(content.includes('[ERROR] [express]'));
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  await t.test('Admin-Endpunkte für Logs: Zugriffsschutz und Log-Verwaltung', async () => {
    const testLogFile = path.join(env.getDataDir(), 'aquarium.log');
    process.env.LOG_FILE = testLogFile;

    logger.info('Initialer Logeintrag vor Test', 'admin-test');

    const regular = await env.createUserAndLogin('reguser', 'password123', 'reg@example.com');
    const admin = await env.createUserAndLogin('adminuser', 'password123', 'admin@example.com');

    // 1. Nicht-Admin wird mit 403 abgewiesen
    const forbiddenGet = await env.request('/api/admin/logs', {
      headers: { Cookie: regular.cookie },
    });
    assert.strictEqual(forbiddenGet.status, 403);

    const forbiddenDel = await env.request('/api/admin/logs', {
      method: 'DELETE',
      headers: { Cookie: regular.cookie },
    });
    assert.strictEqual(forbiddenDel.status, 403);

    // 2. Admin kann Logs abrufen
    const adminGet = await env.request('/api/admin/logs', {
      headers: { Cookie: admin.cookie },
    });
    assert.strictEqual(adminGet.status, 200);
    assert.ok(Array.isArray(adminGet.data.logs));
    assert.ok(adminGet.data.logs.some((l) => l.includes('Initialer Logeintrag vor Test')));
    assert.strictEqual(adminGet.data.logPath, testLogFile);

    // 3. Admin kann Logs leeren
    const adminDel = await env.request('/api/admin/logs', {
      method: 'DELETE',
      headers: { Cookie: admin.cookie },
    });
    assert.strictEqual(adminDel.status, 200);
    assert.strictEqual(adminDel.data.ok, true);

    const afterDel = await env.request('/api/admin/logs', {
      headers: { Cookie: admin.cookie },
    });
    assert.strictEqual(afterDel.status, 200);
    assert.ok(afterDel.data.logs.some((l) => l.includes('bereinigt')));
  });

  await t.test('Supervisor startet Prozess, fängt Abstürze ab und startet automatisch neu', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aquarium-sup-test-'));
    const supLogFile = path.join(tempDir, 'supervisor.log');
    const dummyScript = path.join(tempDir, 'dummy-worker.js');

    // Erstelle ein Dummy-Workerskript, das einen HTTP-Server startet und auf Absturzbefehle reagieren kann
    const workerCode = `
      'use strict';
      const http = require('http');
      const port = process.env.DUMMY_PORT || 0;
      const server = http.createServer((req, res) => {
        if (req.url === '/crash') {
          res.end('crashing');
          setTimeout(() => process.exit(1), 50);
          return;
        }
        res.end('ok:' + process.pid);
      });
      server.listen(port, () => {
        const addr = server.address();
        if (typeof process.send === 'function') {
          process.send({ type: 'ready', port: addr.port, pid: process.pid });
        }
      });
    `;
    fs.writeFileSync(dummyScript, workerCode, 'utf8');

    const supervisor = new Supervisor({
      targetScript: dummyScript,
      env: {
        LOG_FILE: supLogFile,
        DATA_DIR: tempDir,
        NODE_ENV: 'test',
      },
    });

    try {
      supervisor.start();
      assert.strictEqual(supervisor.isRunning, true);

      // Warte kurz, bis der Child-Prozess gestartet ist
      await new Promise((resolve) => setTimeout(resolve, 300));
      assert.ok(supervisor.child, 'Child-Prozess sollte laufen');
      const firstPid = supervisor.child.pid;
      assert.ok(firstPid > 0);

      // Absturz simulieren: Child unerwartet beenden (Exit Code 1)
      supervisor.child.kill('SIGKILL');

      // Warte auf automatische Erkennung und Neustart durch Supervisor
      await new Promise((resolve) => setTimeout(resolve, 600));

      assert.strictEqual(supervisor.isRunning, true);
      assert.ok(supervisor.child, 'Neuer Child-Prozess sollte laufen');
      const secondPid = supervisor.child.pid;
      assert.notStrictEqual(secondPid, firstPid, 'Neuer Prozess sollte eine andere PID haben');
      assert.ok(supervisor.restartCount >= 1, 'Restart-Counter sollte erhöht sein');

      // Status-Prüfung
      const status = supervisor.getStatus();
      assert.strictEqual(status.running, true);
      assert.strictEqual(status.workerPid, secondPid);
      assert.ok(status.restarts >= 1);

      // Prüfe, ob der Absturz in die Log-Datei geschrieben wurde
      assert.ok(fs.existsSync(supLogFile), 'Supervisor Log-Datei sollte existieren');
      const logContent = fs.readFileSync(supLogFile, 'utf8');
      assert.ok(logContent.includes('unerwartet beendet'));
      assert.ok(logContent.includes('Neustart wird eingeleitet'));

      // Geordnetes Beenden
      await supervisor.stop();
      assert.strictEqual(supervisor.isRunning, false);
      assert.strictEqual(supervisor.child, null);

      // Nach geordnetem Stop darf kein automatischer Neustart mehr erfolgen
      await new Promise((resolve) => setTimeout(resolve, 400));
      assert.strictEqual(supervisor.child, null);
    } finally {
      if (supervisor && supervisor.isRunning) {
        await supervisor.stop();
      }
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch (e) {}
    }
  });
});

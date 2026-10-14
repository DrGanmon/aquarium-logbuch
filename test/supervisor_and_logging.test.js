'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const http = require('http');

const { createTestEnvironment } = require('./helpers/env');
const logger = require('../dist/backend/src/utils/logger');
const { Supervisor } = require('../dist/backend/src/services/supervisor');

test('Logging & Überwachungsprozess (Supervisor)', async (t) => {
  let env;

  t.afterEach(async () => {
    if (env) {
      await env.cleanup();
      env = null;
    }
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
      } catch { /* Temporary resources may already have been removed. */ }
    }
  });

  await t.test('Express Error-Handler loggt 500er Fehler in die Log-Datei', async () => {
    env = createTestEnvironment();
    const express = require('express');
    const testApp = express();
    const testLogFile = path.join(env.getDataDir(), 'aquarium.log');
    process.env.LOG_FILE = testLogFile;

    testApp.get('/test-error', (req, res, next) => {
      next(new Error('Kritischer Test-Fehler in API'));
    });

    testApp.use((err, req, res, _next) => {
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
    env = createTestEnvironment();
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

    // Pages remain chronological and stable while the log grows.
    fs.writeFileSync(testLogFile, Array.from({ length: 35 }, (_, index) => `[INFO] Zeile ${index + 1}`).join('\n') + '\n');
    const page1 = await env.request('/api/admin/logs?lines=10', { headers: { Cookie: admin.cookie } });
    assert.deepEqual(page1.data.logs, Array.from({ length: 10 }, (_, index) => `[INFO] Zeile ${index + 26}`));
    assert.equal(page1.data.count, 10);
    assert.equal(page1.headers.get('cache-control'), 'no-store');
    fs.appendFileSync(testLogFile, '[ERROR] Neuer Eintrag\n');
    const page2 = await env.request(`/api/admin/logs?lines=10&before=${page1.data.next}&fileId=${page1.data.fileId}`, { headers: { Cookie: admin.cookie } });
    assert.deepEqual(page2.data.logs, Array.from({ length: 10 }, (_, index) => `[INFO] Zeile ${index + 16}`));
    const filtered = await env.request('/api/admin/logs?level=INFO&search=Zeile%201', { headers: { Cookie: admin.cookie } });
    assert.deepEqual(filtered.data.logs, ['[INFO] Zeile 1', ...Array.from({ length: 10 }, (_, index) => `[INFO] Zeile ${index + 10}`)]);
    for (const before of ['-1', 'NaN', '1.5', 'Infinity']) {
      assert.equal((await env.request(`/api/admin/logs?before=${before}`, { headers: { Cookie: admin.cookie } })).status, 400);
    }
    assert.equal((await env.request('/api/admin/logs?level=UNKNOWN', { headers: { Cookie: admin.cookie } })).status, 400);

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
      } catch { /* Temporary resources may already have been removed. */ }
    }
  });
});

test('Log-Paginierung: Unicode, Fenstergrenzen, Filter und gekürzte Dateien', t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'aquarium-log-pages-'));
  const filename = path.join(directory, 'pages.log');
  const previous = process.env.LOG_FILE;
  process.env.LOG_FILE = filename;
  t.after(() => {
    if (previous === undefined) delete process.env.LOG_FILE;else process.env.LOG_FILE = previous;
    fs.rmSync(directory, { recursive: true, force: true });
  });
  assert.deepEqual(logger.readLogPage().logs, []);
  const expected = Array.from({ length: 37 }, (_, i) => `[${i % 2 ? 'ERROR' : 'INFO'}] Eintrag ${i} 🐟 äöü`);
  fs.writeFileSync(filename, expected.join('\r\n')); // Include final line without a newline.
  let page = logger.readLogPage({ limit: 10 });
  let all = page.logs;
  const firstPage = page;
  while (page.next !== null) {
    page = logger.readLogPage({ limit: 10, before: page.next, fileId: page.fileId });
    all = [...page.logs, ...all];
  }
  assert.deepEqual(all, expected);
  assert.deepEqual(logger.readLogPage({ level: 'ERROR', search: '🐟' }).logs, expected.filter(line => line.includes('[ERROR]')));
  fs.writeFileSync(filename, '[INFO] Neustart\n');
  const reset = logger.readLogPage({ before: firstPage.next, fileId: firstPage.fileId });
  assert.equal(reset.reset, true);
  assert.deepEqual(reset.logs, ['[INFO] Neustart']);
  fs.writeFileSync(filename, '[ERROR] very old match\n' + '[INFO] no match\n'.repeat(350000));
  page = logger.readLogPage({ level: 'ERROR' });
  assert.deepEqual(page.logs, []);
  assert.ok(page.next > 0, 'No matches in a bounded window must still allow loading older logs');
  const earlier = logger.readLogPage({ level: 'ERROR', before: page.next, fileId: page.fileId });
  assert.deepEqual(earlier.logs, ['[ERROR] very old match']);
  assert.equal(earlier.next, null);
});

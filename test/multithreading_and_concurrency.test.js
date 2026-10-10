'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const http = require('http');

const { createTestEnvironment } = require('./helpers/env');
const { WorkerPool } = require('../src/utils/worker-pool');
const { hashPassword, verifyPassword, hashPasswordSync, verifyPasswordSync } = require('../src/utils/crypto');
const { Supervisor } = require('../src/services/supervisor');
const { createOidc } = require('../oidc');

test('Multithreading & Nebenläufigkeit (Concurrency)', async (t) => {
  let env;

  t.beforeEach(async () => {
    env = createTestEnvironment();
  });

  t.afterEach(async () => {
    if (env) await env.cleanup();
  });

  await t.test('WorkerPool führt CPU-Tasks parallel in Worker Threads aus', async () => {
    const pool = new WorkerPool({ numWorkers: 2 });
    pool.init();

    try {
      // 1. Password Hashing Task
      const pw = 'GeheimesPasswort123!';
      const hash = await pool.exec('hashPassword', { pw });
      assert.ok(hash && hash.includes(':'), 'Hash sollte Salt und Hash getrennt enthalten');

      // 2. Password Verification Task (Gültig & Ungültig)
      const valid = await pool.exec('verifyPassword', { pw, stored: hash });
      assert.strictEqual(valid, true, 'Korrektes Passwort muss verifiziert werden');

      const invalid = await pool.exec('verifyPassword', { pw: 'FalschesPasswort', stored: hash });
      assert.strictEqual(invalid, false, 'Falsches Passwort muss abgelehnt werden');

      // 3. Image Inspection Task
      const fakePng = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52]);
      const imgInfo = await pool.exec('inspectImage', { buffer: fakePng });
      assert.strictEqual(imgInfo.ext, 'png');
      assert.strictEqual(imgInfo.mime, 'image/png');

      // 4. Compute Stats Task
      const measurements = [
        { values: { ph: 7.2, temp: 24.5 } },
        { values: { ph: 7.4, temp: 25.0 } },
        { values: { ph: 7.0, temp: 25.5 } },
      ];
      const stats = await pool.exec('computeStats', { measurements, params: ['ph', 'temp'] });
      assert.strictEqual(stats.ph.count, 3);
      assert.strictEqual(stats.ph.min, 7.0);
      assert.strictEqual(stats.ph.max, 7.4);
      assert.strictEqual(stats.temp.avg, 25.0);
    } finally {
      await pool.terminate();
    }
  });

  await t.test('Parallele Hashing- und Verifizierungs-Operationen unter hoher Last', async () => {
    const passwords = Array.from({ length: 15 }, (_, i) => `UserPassword_#${i}_Secure!`);

    // Parallel alle Passwörter hashen
    const hashes = await Promise.all(passwords.map((pw) => hashPassword(pw)));
    assert.strictEqual(hashes.length, 15);
    for (const h of hashes) {
      assert.ok(h && h.includes(':'));
    }

    // Parallel alle Passwörter gleichzeitig verifizieren
    const verifications = await Promise.all(
      passwords.map((pw, i) => verifyPassword(pw, hashes[i]))
    );
    assert.strictEqual(verifications.every((v) => v === true), true);

    // Synchronous Helpers zum Vergleich
    const syncHash = hashPasswordSync('SyncTest123');
    assert.strictEqual(verifyPasswordSync('SyncTest123', syncHash), true);
    assert.strictEqual(verifyPasswordSync('WrongSync', syncHash), false);
  });

  await t.test('Multi-User Concurrency: Mehrere Benutzer agieren gleichzeitig auf der API', async () => {
    // 1. Erstelle 5 Benutzer parallel
    const userPromises = Array.from({ length: 5 }, (_, i) =>
      env.createUserAndLogin(`concur_user_${i}_${Date.now()}`, `Password_${i}_12345!`, `user${i}_${Date.now()}@example.com`)
    );
    const users = await Promise.all(userPromises);
    assert.strictEqual(users.length, 5);

    // 2. Jeder Benutzer legt parallel Aquarien und Messwerte an
    const actionPromises = users.map(async (u, idx) => {
      // Aquarium anlegen
      const aqRes = await env.request('/api/aquariums', {
        method: 'POST',
        headers: { Cookie: u.cookie },
        body: {
          name: `Becken von ${u.username}`,
          volume_l: 100 + idx * 20,
          water_type: 'fresh',
        },
      });
      assert.strictEqual(aqRes.status, 200);
      const aqId = aqRes.data.id;

      // Messwerte parallel erfassen
      const measRes = await env.request(`/api/aquariums/${aqId}/measurements`, {
        method: 'POST',
        headers: { Cookie: u.cookie },
        body: {
          measured_at: new Date().toISOString(),
          note: `Routine-Check ${idx}`,
          values: { ph: 7.1 + idx * 0.1, temp: 24.0 + idx * 0.5 },
        },
      });
      assert.strictEqual(measRes.status, 200);

      // Wartungseintrag erfassen
      const maintRes = await env.request(`/api/aquariums/${aqId}/maintenance`, {
        method: 'POST',
        headers: { Cookie: u.cookie },
        body: {
          type: 'water_change',
          percentage: 30,
          details: 'Wöchentlicher Wasserwechsel',
        },
      });
      assert.strictEqual(maintRes.status, 200);

      // Profil abrufen
      const meRes = await env.request('/api/me', {
        headers: { Cookie: u.cookie },
      });
      assert.strictEqual(meRes.status, 200);
      assert.strictEqual(meRes.data.username, u.username);

      return aqId;
    });

    const aqIds = await Promise.all(actionPromises);
    assert.strictEqual(aqIds.length, 5);

    // 3. Gleichzeitiges Abfragen aller Becken
    const listPromises = users.map((u) =>
      env.request('/api/aquariums', { headers: { Cookie: u.cookie } })
    );
    const lists = await Promise.all(listPromises);
    for (const l of lists) {
      assert.strictEqual(l.status, 200);
      assert.strictEqual(l.data.length, 1);
    }
  });

  await t.test('Supervisor Multi-Worker Modus: Startet mehrere Worker und ersetzt abgestürzte Worker gezielt', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aquarium-multi-worker-test-'));
    const supLogFile = path.join(tempDir, 'supervisor.log');
    const dummyScript = path.join(tempDir, 'dummy-worker.js');

    const workerCode = `
      'use strict';
      const http = require('http');
      const server = http.createServer((req, res) => {
        res.end('ok:' + process.pid + ':' + (process.env.WORKER_ID || '1'));
      });
      server.listen(0, () => {
        if (typeof process.send === 'function') {
          process.send({ type: 'ready', port: server.address().port, pid: process.pid, workerId: process.env.WORKER_ID });
        }
      });
    `;
    fs.writeFileSync(dummyScript, workerCode, 'utf8');

    const supervisor = new Supervisor({
      targetScript: dummyScript,
      numWorkers: 2,
      env: {
        LOG_FILE: supLogFile,
        DATA_DIR: tempDir,
        NODE_ENV: 'test',
      },
    });

    try {
      supervisor.start();
      assert.strictEqual(supervisor.isRunning, true);

      // Warte auf Start aller 2 Worker
      await new Promise((resolve) => setTimeout(resolve, 400));

      const status = supervisor.getStatus();
      assert.strictEqual(status.running, true);
      assert.strictEqual(status.totalWorkers, 2);
      assert.strictEqual(status.targetWorkers, 2);
      assert.strictEqual(status.workerPids.length, 2);

      const [firstPid, secondPid] = status.workerPids;
      assert.notStrictEqual(firstPid, secondPid);

      // Absturz von Worker 1 simulieren
      const worker0 = supervisor.children.get(0);
      assert.ok(worker0, 'Worker Slot 0 sollte existieren');
      worker0.kill('SIGKILL');

      // Warte auf Neustart des abgestürzten Workers
      await new Promise((resolve) => setTimeout(resolve, 600));

      const statusAfter = supervisor.getStatus();
      assert.strictEqual(statusAfter.totalWorkers, 2);
      assert.ok(statusAfter.restarts >= 1);
      assert.ok(statusAfter.workerPids.includes(secondPid), 'Worker 2 muss unberührt weitergelaufen sein');
      assert.ok(!statusAfter.workerPids.includes(firstPid), 'Worker 1 muss durch eine neue PID ersetzt worden sein');

      // Geordnetes Beenden aller Worker
      await supervisor.stop();
      assert.strictEqual(supervisor.isRunning, false);
      assert.strictEqual(supervisor.children.size, 0);
    } finally {
      if (supervisor.isRunning) await supervisor.stop();
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch (e) {}
    }
  });

  await t.test('Zustandslose OIDC-Zustandssignierung: Login und Callback funktionieren prozessübergreifend', async () => {
    let mockOidcServer;
    let issuerUrl;

    await new Promise((resolve) => {
      mockOidcServer = http.createServer((req, res) => {
        if (req.url === '/.well-known/openid-configuration') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          return res.end(
            JSON.stringify({
              issuer: issuerUrl,
              authorization_endpoint: `${issuerUrl}/auth`,
              token_endpoint: `${issuerUrl}/token`,
              jwks_uri: `${issuerUrl}/jwks`,
              end_session_endpoint: `${issuerUrl}/logout`,
            })
          );
        }
        res.writeHead(404);
        res.end();
      });
      mockOidcServer.listen(0, '127.0.0.1', () => {
        const port = mockOidcServer.address().port;
        issuerUrl = `http://127.0.0.1:${port}`;
        resolve();
      });
    });

    try {
      // Instanz 1 startet den Login-Flow (simuliert Worker 1)
      const oidcInstance1 = createOidc({
        issuer: issuerUrl,
        clientId: 'multi-worker-client',
        clientSecret: 'super-secret-key-1234',
        redirectUri: 'http://localhost:3000/auth/callback',
      });

      const { url, state } = await oidcInstance1.startLogin();
      assert.ok(url.includes('client_id=multi-worker-client'));
      assert.ok(state.includes('.'), 'State muss signiert sein');

      // Instanz 2 empfängt den Callback (simuliert Worker 2 ohne geteilten Speicher)
      const oidcInstance2 = createOidc({
        issuer: issuerUrl,
        clientId: 'multi-worker-client',
        clientSecret: 'super-secret-key-1234',
        redirectUri: 'http://localhost:3000/auth/callback',
      });

      // Manipulierter State wird abgewiesen
      const tamperedState = state.slice(0, -4) + 'abcd';
      await assert.rejects(
        () => oidcInstance2.finishLogin({ state: tamperedState, code: 'mock-code' }, tamperedState),
        /ungültig|lange gedauert/i
      );

      // Nicht manipulierter State wird vom 2. Worker akzeptiert (selbst wenn kein Code erhalten)
      await assert.rejects(
        () => oidcInstance2.finishLogin({ state, code: '' }, state),
        /Kein Autorisierungscode/i
      );
    } finally {
      if (mockOidcServer) {
        await new Promise((resolve) => mockOidcServer.close(resolve));
      }
    }
  });
});

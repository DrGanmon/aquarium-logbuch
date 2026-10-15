'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const secret = 'ab'.repeat(32);

test('Ein Controller-Spawn-Fehler löst Wiederholungen aus und lässt Web-Worker weiterlaufen', { timeout: 15000 }, async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'aquarium-rate-spawn-error-'));
  const workerScript = path.join(directory, 'rate-worker.js');
  fs.writeFileSync(workerScript, `
    'use strict';
    process.on('message', message => {
      if (message.type === 'attempt') process.send({ type: 'rate-limit:request', requestId: 'spawn-error-' + process.pid, operation: 'check-and-note', key: message.key, limit: message.limit });
      else if (message.type === 'rate-limit:response') process.send({ type: 'test-result', requestId: message.requestId, error: message.error });
    });
    process.send({ type: 'ready', pid: process.pid });
    setInterval(() => {}, 1000);
  `);
  const { Supervisor } = require('../dist/backend/src/services/supervisor');
  const supervisor = new Supervisor({ targetScript: workerScript, controllerScript: path.join(directory, 'missing-controller.js'), numWorkers: 2,
    env: { DATA_DIR: directory, NODE_ENV: 'test', RATE_LIMIT_CONTROLLER_SECRET: secret } });
  const waitFor = async predicate => {
    const deadline = Date.now() + 6000;
    while (!predicate()) {
      if (Date.now() >= deadline) throw new Error(`Zeitüberschreitung beim Warten auf Controller-Neustarts: ${JSON.stringify(supervisor.getStatus())}`);
      await new Promise(resolve => setTimeout(resolve, 25));
    }
  };
  try {
    supervisor.start();
    await waitFor(() => supervisor.getStatus().rateLimitControllerRestarts >= 2 && supervisor.children.size === 2);
    const workers = Array.from(supervisor.children.values());
    const workerPids = workers.map(worker => worker.pid);
    const reply = await new Promise((resolve, reject) => {
      const child = workers[0];
      const listener = (source, message) => {
        if (source !== child || message?.type !== 'test-result') return;
        clearTimeout(timeout);supervisor.events.removeListener('worker-message', listener);resolve(message);
      };
      const timeout = setTimeout(() => {
        supervisor.events.removeListener('worker-message', listener);
        reject(new Error('Keine Fail-Closed-Antwort vom Worker erhalten.'));
      }, 3000);
      supervisor.events.on('worker-message', listener);
      child.send({ type: 'attempt', key: 'spawn-error-key', limit: 1 });
    });
    assert.equal(reply.error, 'controller-restarting');
    assert.deepEqual(Array.from(supervisor.children.values()).map(worker => worker.pid), workerPids);
  } finally {
    await supervisor.stop();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('Rate-Limit-Speicher arbeitet atomar, persistent und speichert keine Klartextschlüssel', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'aquarium-rate-store-'));
  const filename = path.join(directory, 'limits.sqlite');
  const { RateLimitStore } = require('../dist/backend/src/services/rate-limit-controller');
  try {
    let store = new RateLimitStore({ filename, secret });
    assert.equal(store.checkAndNote('login|192.0.2.4|alice', 2, 1000), false);
    assert.equal(store.checkAndNote('login|192.0.2.4|alice', 2, 1001), false);
    assert.equal(store.checkAndNote('login|192.0.2.4|alice', 2, 1002), true);
    store.close();
    assert.equal(fs.readFileSync(filename).includes(Buffer.from('192.0.2.4')), false);
    if (process.platform !== 'win32') assert.equal(fs.statSync(filename).mode & 0o777, 0o600);
    store = new RateLimitStore({ filename, secret });
    assert.equal(store.checkAndNote('login|192.0.2.4|alice', 2, 1003), true, 'Limit überlebt Controller-Neustart');
    store.clear('login|192.0.2.4|alice');
    assert.equal(store.checkAndNote('login|192.0.2.4|alice', 2, 1004), false);
    store.close();
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test('Ein zentraler Controller begrenzt Worker gemeinsam und startet ohne Worker-Ausfall neu', { timeout: 15000 }, async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'aquarium-rate-supervisor-'));
  const workerScript = path.join(directory, 'rate-worker.js');
  fs.writeFileSync(workerScript, `
    'use strict';
    let sequence = 0;
    const pending = new Map();
    process.on('message', message => {
      if (message.type === 'attempt') {
        const requestId = process.pid + '-' + (++sequence);
        pending.set(requestId, message.commandId);
        process.send({ type: 'rate-limit:request', requestId, operation: 'check-and-note', key: message.key, limit: message.limit });
      } else if (message.type === 'rate-limit:response') {
        const commandId = pending.get(message.requestId);
        if (!commandId) return;
        pending.delete(message.requestId);
        process.send({ type: 'test-result', commandId, blocked: message.blocked, error: message.error });
      }
    });
    process.send({ type: 'ready', pid: process.pid });
    setInterval(() => {}, 1000);
  `);
  const { Supervisor } = require('../dist/backend/src/services/supervisor');
  const supervisor = new Supervisor({ targetScript: workerScript, numWorkers: 2, gracefulTimeout: 500,
    env: { DATA_DIR: directory, NODE_ENV: 'test', RATE_LIMIT_CONTROLLER_SECRET: secret } });
  const waitFor = async predicate => {
    const deadline = Date.now() + 6000;
    while (!predicate()) {
      if (Date.now() >= deadline) throw new Error(`Zeitüberschreitung beim Warten auf Supervisor-Zustand: ${JSON.stringify(supervisor.getStatus())}`);
      await new Promise(resolve => setTimeout(resolve, 25));
    }
  };
  let command = 0;
  const attempt = (child, key, limit) => new Promise((resolve, reject) => {
    const commandId = `command-${++command}`;
    const listener = (source, message) => {
      if (source !== child) return;
      if (message?.type !== 'test-result' || message.commandId !== commandId) return;
      clearTimeout(timeout);supervisor.events.removeListener('worker-message', listener);resolve(message);
    };
    const timeout = setTimeout(() => {
      supervisor.events.removeListener('worker-message', listener);
      reject(new Error('Keine Rate-Limit-Antwort erhalten.'));
    }, 3000);
    supervisor.events.on('worker-message', listener);child.send({ type: 'attempt', commandId, key, limit });
  });
  try {
    supervisor.start();
    await waitFor(() => supervisor.getStatus().rateLimitControllerReady && supervisor.children.size === 2);
    const workers = Array.from(supervisor.children.values());
    const workerPids = workers.map(worker => worker.pid);
    assert.equal((await attempt(workers[0], 'shared-login-key', 2)).blocked, false);
    assert.equal((await attempt(workers[1], 'shared-login-key', 2)).blocked, false);
    assert.equal((await attempt(workers[0], 'shared-login-key', 2)).blocked, true, 'Versuche beider Worker werden gemeinsam gezählt');

    const firstControllerPid = supervisor.getStatus().rateLimitControllerPid;
    supervisor.rateLimitController.kill('SIGKILL');
    await waitFor(() => supervisor.getStatus().rateLimitControllerReady && supervisor.getStatus().rateLimitControllerPid !== firstControllerPid);
    assert.deepEqual(Array.from(supervisor.children.values()).map(worker => worker.pid), workerPids, 'Web-Worker laufen unverändert weiter');
    assert.equal((await attempt(workers[1], 'shared-login-key', 2)).blocked, true, 'Persistiertes Limit gilt nach Controller-Neustart weiter');
  } finally {
    await supervisor.stop();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

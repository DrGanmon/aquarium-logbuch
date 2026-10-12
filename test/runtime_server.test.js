'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const net = require('node:net');
const { spawn } = require('node:child_process');
const { setTimeout: delay } = require('node:timers/promises');

test('Echter Supervisor: zwei Worker teilen den HTTP-Port und beenden sich sauber', { skip: process.platform !== 'linux', timeout: 20000 }, async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aquarium-runtime-server-'));
  const reserve = net.createServer();
  await new Promise((resolve) => reserve.listen(0, '127.0.0.1', resolve));
  const port = reserve.address().port;
  await new Promise((resolve) => reserve.close(resolve));
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  delete env.BUN_TEST_DRAIN_EVENT_LOOP;
  delete env.NODE_UNIQUE_ID;
  delete env.LOG_FILE;
  const logPath = path.join(dir, 'server-output.log');
  const logFd = fs.openSync(logPath, 'w');
  const child = spawn(process.execPath, [...(process.versions.bun ? ['run'] : []), path.resolve(__dirname, '../server.js')], {
    cwd: path.resolve(__dirname, '..'),
    env: { ...env, NODE_ENV: 'development', CONSOLE_LOG: 'true', DATA_DIR: dir, PORT: String(port), NO_SUPERVISOR: '0', SUPERVISOR: 'true',
      IS_SUPERVISED_WORKER: '0', WORKERS: '2', WORKER_THREADS: '1', DB_TYPE: 'sqlite', ADMIN_EMAIL: 'runtime-test@example.com' },
    stdio: ['ignore', logFd, logFd],
  });
  fs.closeSync(logFd);
  let logs = '';
  const readLogs = () => { logs = fs.readFileSync(logPath, 'utf8'); return logs; };
  child.on('error', (error) => { logs += error.stack; });
  let exitResult;
  const exited = new Promise((resolve) => child.once('exit', (code, signal) => { exitResult = { code, signal }; resolve(exitResult); }));
  t.after(async () => {
    if (!exitResult) {
      child.kill('SIGTERM');
      const force = setTimeout(() => child.kill('SIGKILL'), 6000);
      await exited;
      clearTimeout(force);
    }
    fs.rmSync(dir, { recursive: true, force: true });
  });
  const deadline = Date.now() + 12000;
  while ((readLogs().match(/signalisiert Betriebsbereitschaft/g) || []).length < 2 && !exitResult && Date.now() < deadline) await delay(50);
  assert.equal((logs.match(/signalisiert Betriebsbereitschaft/g) || []).length, 2, logs);
  assert.doesNotMatch(logs, /EADDRINUSE|\[FATAL\]/);
  for (let i = 0; i < 8; i++) {
    const response = await fetch(`http://127.0.0.1:${port}/api/registration`);
    assert.equal(response.status, 200);
    await response.json();
  }
  child.kill('SIGTERM');
  const result = await Promise.race([exited, delay(6000).then(() => null)]);
  assert.deepEqual(result, { code: 0, signal: null }, logs);
  assert.equal((readLogs().match(/Beende HTTP-Server/g) || []).length, 2, logs);
});

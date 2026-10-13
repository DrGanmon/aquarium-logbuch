'use strict';
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

async function runTestPool(files, { info, jobs, options = [], dataDir, env = process.env, exclusiveFiles = [path.resolve(__dirname, "../test/build_dist.test.js")] }) {
  const root = path.resolve(__dirname, '..');
  const exclusivePaths = new Set(exclusiveFiles.map(file => path.resolve(file)));
  const counts = { tests: 0, suites: 0, passed: 0, failed: 0, cancelled: 0, skipped: 0, todo: 0 };
  const active = new Map();
  const start = Date.now();
  let cursor = 0, exclusive = false, interrupted = null;
  const isExclusive = file => exclusivePaths.has(path.resolve(file));
  const signalChild = (child, signal) => {
    try {
      if (process.platform === 'win32') child.kill(signal);
      else process.kill(-child.pid, signal);
    } catch (error) { if (error.code !== 'ESRCH') throw error; }
  };
  let force;
  const stop = signal => {
    if (interrupted) return;
    interrupted = signal;
    for (const child of active.values()) signalChild(child, signal);
    force = setTimeout(() => { for (const child of active.values()) signalChild(child, 'SIGKILL'); }, 5000);
    force.unref();
  };
  const handlers = ['SIGINT', 'SIGTERM'].map(signal => { const handler = () => stop(signal);process.on(signal, handler);return handler; });
  try {
    await new Promise(resolve => {
      function schedule() {
        while (!interrupted && cursor < files.length && active.size < jobs && !exclusive) {
          const file = files[cursor];
          if (isExclusive(file) && active.size) break;
          const index = cursor++;
          const alone = isExclusive(file);exclusive = alone;
          launch(file, index, alone);
        }
        if (!active.size && (interrupted || cursor === files.length)) resolve();
      }
      function launch(file, index, alone) {
        const relative = path.relative(process.cwd(), file);
        const directory = fs.mkdtempSync(path.join(dataDir, 'file-'));
        const workerEnv = { ...env, DATA_DIR: directory, AQUARIUM_TEST_BACKEND_BUILT: path.join(root, 'dist/backend') };
        delete workerEnv.LOG_FILE;delete workerEnv.NODE_TEST_CONTEXT;
        const args = process.versions.bun ? [path.join(__dirname, 'bun-test-runner.js'), file]
          : ['--test', '--test-concurrency=1', `--test-reporter=${path.join(__dirname, 'test-events.js')}`, ...options, file];
        const child = spawn(process.execPath, args, { env: workerEnv, detached: process.platform !== 'win32', stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
        active.set(index, child);
        let summary, output = '', failure = false;
        const progress = name => {
          if (!info) console.log(`[Testdatei ${index + 1}/${files.length}] ${String(name).replace(/[\r\n\t]/g, ' ')} · ${relative}`);
        };
        const capture = (message, stream = 'stdout') => {
          output = (output + message).slice(-16384);
          if (info) process[stream].write(message);
        };
        const fail = (name, error) => {
          failure = true;
          if (!info && output) { console.log(`Letzte Testausgaben (${relative}):\n${output}`);output = ''; }
          console.log(`✖ ${name}\n${error}`);
        };
        progress(relative);
        child.stdout.on('data', chunk => capture(chunk.toString()));
        child.stderr.on('data', chunk => capture(chunk.toString(), 'stderr'));
        child.on('message', event => {
          if (event.type === 'output') capture(event.message, event.stream);
          else if (event.type === 'progress') progress(event.name);
          else if (event.type === 'pass' && info) console.log(`✔ ${event.name}`);
          else if (event.type === 'fail') fail(event.name, event.error);
          else if (event.type === 'summary') summary = event.counts;
        });
        child.on('error', error => fail(relative, error.stack || String(error)));
        child.on('close', (code, signal) => {
          if (summary) for (const key of Object.keys(counts)) counts[key] += summary[key] || 0;
          if (!summary || ((code !== 0 || signal || failure) && !summary.failed && !summary.cancelled)) {
            counts.tests++;counts.failed++;
            if (!failure) fail(relative, `Testworker wurde ohne erfolgreiche Zusammenfassung beendet (Exit ${code}, Signal ${signal || 'keines'}).`);
          }
          fs.rmSync(directory, { recursive: true, force: true });
          active.delete(index);if (alone) exclusive = false;schedule();
        });
      }
      schedule();
    });
    for (const [key, value] of Object.entries(counts)) console.log(`ℹ ${key === 'passed' ? 'pass' : key === 'failed' ? 'fail' : key} ${value}`);
    console.log(`ℹ duration_ms ${Date.now() - start}`);
    return interrupted ? (interrupted === 'SIGINT' ? 130 : 143) : counts.failed || counts.cancelled ? 1 : 0;
  } finally {
    clearTimeout(force);
    ['SIGINT', 'SIGTERM'].forEach((signal, index) => process.removeListener(signal, handlers[index]));
  }
}
module.exports = { runTestPool };

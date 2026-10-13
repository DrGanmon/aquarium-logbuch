#!/usr/bin/env node
'use strict';
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { parseTestOptions } = require('./test-options');
const { runTestPool } = require('./test-pool');
const { spawn } = require('node:child_process');

async function runNative(options, files, dataDir) {
  const reporter = options.some(arg => /^--test-reporter(?:=|$)/.test(arg)) ? [] : ['--test-reporter=spec'];
  const env = { ...process.env, DATA_DIR: dataDir };delete env.LOG_FILE;delete env.NODE_TEST_CONTEXT;
  const child = spawn(process.execPath, ['--test', '--test-concurrency=1', ...reporter, ...options, ...files], {
    env, stdio: 'inherit', detached: process.platform !== 'win32',
  });
  let interrupted;
  const handlers = ['SIGINT', 'SIGTERM'].map(signal => {
    const handler = () => {
      interrupted = signal;
      try { if (process.platform === 'win32') child.kill(signal);else process.kill(-child.pid, signal); }
      catch (error) { if (error.code !== 'ESRCH') throw error; }
    };
    process.on(signal, handler);return handler;
  });
  try {
    const code = await new Promise((resolve, reject) => { child.once('error', reject);child.once('close', code => resolve(code ?? 1)); });
    return interrupted ? (interrupted === 'SIGINT' ? 130 : 143) : code;
  } finally { ['SIGINT', 'SIGTERM'].forEach((signal, index) => process.removeListener(signal, handlers[index])); }
}

async function main() {
  const settings = parseTestOptions(process.argv.slice(2));
  if (process.versions.bun && settings.options.length)
    throw new Error(`Nicht unterstützte Bun-Testoptionen: ${settings.options.join(' ')}. Für native Optionen direkt bun test verwenden.`);
  const native = settings.options.some(arg => /^--(?:test-reporter|watch|test-isolation|experimental-test-coverage|test-coverage)/.test(arg));
  const root = path.resolve(__dirname, '..');
  const files = [...new Set(fs.globSync(settings.patterns, { cwd: root }))].map(file => path.resolve(root, file)).sort();
  if (!files.length) throw new Error('Keine passenden Testdateien gefunden.');
  const backend = path.join(root, 'dist/backend');
  // Nested runner fixtures reuse the build completed by their parent, without deleting files used by other workers.
  if (process.env.AQUARIUM_TEST_BACKEND_BUILT !== backend || !fs.existsSync(path.join(backend, 'server.js')))
    require('./build-backend').buildBackend();
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aquarium-test-run-'));
  try {
    if (native) {
      console.log('Native Node-Testoptionen: serieller Lauf mit vollständiger Reporter-/Coverage-Unterstützung.');
      process.exitCode = await runNative(settings.options, files, dataDir);
    } else {
      console.log(`Testlauf: ${files.length} Dateien, maximal ${settings.jobs} parallel.`);
      process.exitCode = await runTestPool(files, { ...settings, dataDir });
    }
  } finally { fs.rmSync(dataDir, { recursive: true, force: true }); }
}
main().catch(error => { console.error(error.message);process.exitCode = 1; });

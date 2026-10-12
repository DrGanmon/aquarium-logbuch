#!/usr/bin/env node
'use strict';
const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

try { require('./build-backend').buildBackend(); }
catch (error) { console.error(error.message); process.exit(1); }

const args = process.argv.slice(2);
const info = args.includes('--info');
const forwarded = args.filter((arg) => arg !== '--info');
const hasFiles = forwarded.some((arg) => !arg.startsWith('-') && /\.(?:js|mjs|cjs)$/.test(arg));
const rootDir = path.resolve(__dirname, '..');
const patterns = hasFiles
  ? forwarded.filter((arg) => !arg.startsWith('-') && /\.(?:js|mjs|cjs)$/.test(arg))
  : ['test/**/*.test.js'];
const files = [...new Set(fs.globSync(patterns, { cwd: rootDir }))];
// Also isolate modules imported before createTestEnvironment() is called.
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aquarium-test-run-'));
const env = { ...process.env, DATA_DIR: dataDir };
env.AQUARIUM_TEST_FILE_COUNT = String(files.length);
env.AQUARIUM_TEST_PROGRESS_TTY = process.stdout.isTTY ? '1' : '0';
env.AQUARIUM_TEST_PROGRESS_COLUMNS = String(process.stdout.columns || 80);
delete env.LOG_FILE;
const cleanup = () => fs.rmSync(dataDir, { recursive: true, force: true });
if (process.versions.bun) {
  Object.assign(process.env, env);
  const { runBunTests } = require('./bun-test-runner');
  runBunTests(files.map((file) => path.resolve(rootDir, file)), {
    info, options: forwarded.filter((arg) => !/\.(?:js|mjs|cjs)$/.test(arg)),
  }).then((code) => { process.exitCode = code; })
    .catch((error) => { console.error(error); process.exitCode = 1; })
    .finally(cleanup);
} else {
  const child = spawn(process.execPath, [
    '--test',
    '--test-concurrency=1',
    `--test-reporter=${info ? 'spec' : path.join(__dirname, 'test-reporter.js')}`,
    ...forwarded,
    ...(hasFiles ? [] : ['test/**/*.test.js']),
  ], {
    cwd: rootDir,
    stdio: 'inherit',
    env,
  });
  child.on('error', (error) => {
    cleanup();
    console.error(error);
    process.exitCode = 1;
  });
  child.on('exit', (code, signal) => {
    cleanup();
    if (signal) {
      process.removeAllListeners(signal);
      process.kill(process.pid, signal);
    } else process.exitCode = code ?? 1;
  });
  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.on(signal, () => child.kill(signal));
  }

}

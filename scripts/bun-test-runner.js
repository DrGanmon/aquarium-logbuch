'use strict';
const { run } = require('node:test');
const { inspect } = require('node:util');
const path = require('node:path');

async function runBunTests(files, { info, options = [] }) {
  // run({files}) exposes structured node:test events through Bun's native runner.
  // Run each file separately to retain isolation and deterministic progress.
  if (options.length) throw new Error(`Nicht unterstützte Bun-Testoptionen: ${options.join(' ')}. Für native Optionen direkt bun test verwenden.`);
  const counts = { tests: 0, suites: 0, passed: 0, failed: 0, cancelled: 0, skipped: 0, todo: 0 };
  const start = Date.now();
  let current;
  const signals = ['SIGINT', 'SIGTERM'];
  const handlers = signals.map((signal) => {
    const handler = () => current?.destroy(new Error(`Testlauf durch ${signal} beendet.`));
    process.once(signal, handler);
    return handler;
  });
  try {
    for (const [index, file] of files.entries()) {
      const relative = path.relative(process.cwd(), file);
      const progress = (name) => {
        if (!info) console.log(`[Testdatei ${index + 1}/${files.length}] ${String(name).replace(/[\r\n\t]/g, ' ')} · ${relative}`);
      };
      progress(relative);
      let output = '';
      current = run({ files: [file], timeout: 60000 });
      for await (const { type, data } of current) {
        if (type === 'test:stdout' || type === 'test:stderr') {
          output = (output + data.message).slice(-16384);
          if (info) process[type === 'test:stdout' ? 'stdout' : 'stderr'].write(data.message);
        } else if (type === 'test:pass' || type === 'test:fail') {
          progress(data.name);
          if (info) console.log(`${type === 'test:pass' ? '✔' : '✖'} ${data.name}`);
          if (type === 'test:fail') {
            if (!info && output) console.log(`Letzte Testausgaben (${relative}):\n${output}`);
            console.log(`✖ ${data.name}\n${inspect(data.details?.error, { depth: 6 })}`);
          }
        } else if (type === 'test:summary' && !data.file) {
          for (const key of Object.keys(counts)) counts[key] += data.counts[key] || 0;
        }
      }
    }
    for (const [key, value] of Object.entries(counts)) {
      console.log(`ℹ ${key === 'passed' ? 'pass' : key === 'failed' ? 'fail' : key} ${value}`);
    }
    console.log(`ℹ duration_ms ${Date.now() - start}`);
    return counts.failed || counts.cancelled ? 1 : 0;
  } finally {
    current = undefined;
    signals.forEach((signal, index) => process.removeListener(signal, handlers[index]));
  }
}
module.exports = { runBunTests };

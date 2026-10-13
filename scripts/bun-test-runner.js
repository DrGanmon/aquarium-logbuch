'use strict';
const { run } = require('node:test');
const { forwardEvent } = require('./test-events');

async function runBunTests(files, { options = [] } = {}) {
  if (options.length) throw new Error(`Nicht unterstützte Bun-Testoptionen: ${options.join(' ')}. Für native Optionen direkt bun test verwenden.`);
  // The parent schedules isolated worker processes; Bun's node:test run() launches the file.
  const stream = run({ files, timeout: 60000 });
  let counts;
  const stop = () => stream.destroy(new Error('Testlauf beendet.'));
  process.once('SIGINT', stop);process.once('SIGTERM', stop);
  try {
    for await (const event of stream) {
      if (event.type === 'test:summary' && !event.data.file) counts = event.data.counts;
      await forwardEvent(event);
    }
    return !counts || counts.failed || counts.cancelled ? 1 : 0;
  } finally { process.removeListener('SIGINT', stop);process.removeListener('SIGTERM', stop); }
}
if (require.main === module) {
  runBunTests([process.argv[2]]).then(code => { process.exitCode = code; })
    .catch(error => { console.error(error);process.exitCode = 1; });
}
module.exports = { runBunTests };

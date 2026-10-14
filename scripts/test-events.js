'use strict';
const { inspect } = require('node:util');
async function send(message) {
  if (!process.connected) throw new Error('Der Testworker benötigt eine Verbindung zum Teststarter.');
  await new Promise((resolve, reject) => process.send(message, error => error ? reject(error) : resolve()));
}
async function forwardEvent({ type, data }) {
  if (type === 'test:stdout' || type === 'test:stderr')
    await send({ type: 'output', stream: type === 'test:stderr' ? 'stderr' : 'stdout', message: data.message });
  else if (type === 'test:dequeue') await send({ type: 'progress', name: data.name });
  else if (type === 'test:pass' || type === 'test:fail') {
    if (process.versions.bun) await send({ type: 'progress', name: data.name });
    await send({ type: type === 'test:pass' ? 'pass' : 'fail', name: data.name,
      error: type === 'test:fail' ? inspect(data.details?.error, { depth: 6 }) : undefined });
  }
  else if (type === 'test:summary' && !data.file) await send({ type: 'summary', counts: data.counts });
}
// Node custom reporter; IPC keeps summaries and failure logs separate from human output.
module.exports = async function* (source) {
  for await (const event of source) await forwardEvent(event);
  yield* []; // Events are sent through IPC; this reporter produces no text.
};
module.exports.forwardEvent = forwardEvent;

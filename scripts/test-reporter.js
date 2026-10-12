'use strict';
const { spec } = require('node:test/reporters');
const { Readable } = require('node:stream');
const path = require('node:path');

// Keep test logs available for failures without flooding successful runs.
async function* conciseEvents(source) {
  const output = new Map();
  const runningFiles = new Map();
  const total = Number(process.env.AQUARIUM_TEST_FILE_COUNT) || '?';
  const tty = process.env.AQUARIUM_TEST_PROGRESS_TTY === '1';
  const columns = Math.max(20, Number(process.env.AQUARIUM_TEST_PROGRESS_COLUMNS) || 80);
  let progressVisible = false;
  for await (const event of source) {
    const { type, data } = event;
    const file = data.file;
    if (type === 'test:dequeue' && file) {
      if (!runningFiles.has(file)) runningFiles.set(file, runningFiles.size + 1);
      const name = String(data.name).replace(/[\r\n\t]/g, ' ');
      const progress = `[Testdatei ${runningFiles.get(file)}/${total}] ${name} · ${path.relative(process.cwd(), file)}`;
      const visible = tty && Array.from(progress).length >= columns
        ? Array.from(progress).slice(0, columns - 2).join('') + '…'
        : progress;
      yield { type: 'test:stdout', data: { file, message: tty ? `\r\x1b[2K${visible}` : `${progress}\n` } };
      progressVisible = tty;
      continue;
    }
    if (type === 'test:stdout' || type === 'test:stderr') {
      output.set(file, ((output.get(file) || '') + data.message).slice(-16384));
      continue;
    }
    if (type === 'test:fail') {
      if (progressVisible) {
        yield { type: 'test:stdout', data: { message: '\n' } };
        progressVisible = false;
      }
      const captured = output.get(file);
      if (captured) {
        yield { type: 'test:stderr', data: { file, message: `\nLetzte Testausgaben (${file}):\n${captured}` } };
        output.delete(file);
      }
      yield event;
    } else if (type === 'test:diagnostic' && data.nesting === 0) {
      if (progressVisible) {
        yield { type: 'test:stdout', data: { message: '\n' } };
        progressVisible = false;
      }
      yield event;
    } else if (type === 'test:summary') {
      output.delete(file);
    }
  }
}
module.exports = async function* (source) {
  yield* Readable.from(conciseEvents(source)).pipe(spec());
};

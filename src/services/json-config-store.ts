import { asError } from '../utils/app-error';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { asRecord, errorMessage } from '../utils/validation';
/** Atomic replacement prevents other workers from reading incomplete JSON. */
export function writeJsonFile(filename: string, value: unknown): void {
  const contents = JSON.stringify(value, null, 2);
  fs.mkdirSync(path.dirname(filename), { recursive: true });
  const temporary = `${filename}.${process.pid}.${randomUUID()}.tmp`;
  try {
    fs.writeFileSync(temporary, contents, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
    fs.renameSync(temporary, filename);
  } finally {
    fs.rmSync(temporary, { force: true });
  }
}
/** File persistence only; each service owns normalization and business rules. */
export class JsonConfigStore<T extends object> {
  constructor(public readonly filename: string, private readonly onError: (message: string) => void) {}
  read(): Record<string, unknown> {
    try {
      if (!fs.existsSync(this.filename)) return {};
      return asRecord(JSON.parse(fs.readFileSync(this.filename, 'utf8')) as unknown);
    } catch (caught: unknown) {
      const error = asError(caught); this.onError(errorMessage(error)); return {}; }
  }
  write(value: T): void {
    writeJsonFile(this.filename, value);
  }
}

import { asError } from '../utils/app-error';
import fs from 'node:fs';
import path from 'node:path';
import { asRecord, errorMessage } from '../utils/validation';
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
    fs.mkdirSync(path.dirname(this.filename), { recursive: true });
    fs.writeFileSync(this.filename, JSON.stringify(value, null, 2), 'utf8');
  }
}

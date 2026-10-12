import { asRecord } from './validation';
export class AppError extends Error {
  constructor(message: string, public readonly status = 500, public readonly code?: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'AppError';
  }
}
export type ErrorDetails = Error & { status?: number; code?: string; provider?: string; userMessage?: string; apiError?: unknown };
/** Preserve native error identity and metadata; safely handle non-Error throws. */
export function asError(value: unknown): ErrorDetails {
  if (value instanceof Error) return value;
  const record = asRecord(value);
  return Object.assign(new Error(typeof record.message === 'string' ? record.message : String(value)), {
    status: typeof record.status === 'number' ? record.status : undefined,
    code: typeof record.code === 'string' ? record.code : undefined,
    provider: typeof record.provider === 'string' ? record.provider : undefined,
    userMessage: typeof record.userMessage === 'string' ? record.userMessage : undefined,
    apiError: record.apiError,
  });
}

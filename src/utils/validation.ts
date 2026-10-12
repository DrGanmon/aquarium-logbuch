/** Untrusted JSON enters the application as unknown, never as any. */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
export function asRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}
export function errorMessage(value: unknown): string {
  return value instanceof Error ? value.message : String(value);
}

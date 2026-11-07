export const str = (value: unknown, max: number): string => typeof value === 'string' ? value.trim().slice(0, max) : '';

const DECIMAL = /^[+-]?(?:\d+(?:[.,]\d*)?|[.,]\d+)$/;

/**
 * Reads a decimal number typed with either a German comma (`7,5`) or an English point (`7.5`).
 * Numbers pass through unchanged. Empty input, thousands separators, exponents, hexadecimal and
 * other non-decimal notations return `null`, so a mistyped value is rejected instead of misread.
 */
export function parseDecimal(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string') return null;
  const text = value.trim().replace(/^−/, '-');
  if (!DECIMAL.test(text)) return null;
  const parsed = Number(text.replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : null;
}

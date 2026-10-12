import type { Range } from "../types";
export function evaluate(
  range: Range | undefined,
  value: number | null,
): string {
  if (
    !range ||
    value === null ||
    !Number.isFinite(value) ||
    Object.values(range).every((v) => v == null)
  )
    return "none";
  if (
    (range.critMin != null && value < range.critMin) ||
    (range.critMax != null && value > range.critMax)
  )
    return "crit";
  if (
    (range.okMin != null && value < range.okMin) ||
    (range.okMax != null && value > range.okMax)
  )
    return "warn";
  return "ok";
}
export function parseNumber(value: string): number | null {
  if (!value.trim()) return null;
  const parsed = Number(value.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}
export function mmss(seconds: number) {
  return `${Math.floor(Math.max(0, seconds) / 60)}:${String(Math.ceil(Math.max(0, seconds) % 60)).padStart(2, "0")}`;
}

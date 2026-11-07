/** Stored calendar selection: IDs of aquariums excluded from the user's iCal/CalDAV calendar. */
export const MAX_CALENDAR_EXCLUSIONS = 500;

export function parseCalendarSelection(value: unknown): number[] {
  let list: unknown = value;
  if (typeof value === 'string') { try { list = JSON.parse(value); } catch { return []; } }
  if (!Array.isArray(list)) return [];
  return [...new Set(list.map(Number).filter(id => Number.isSafeInteger(id) && id > 0))].slice(0, MAX_CALENDAR_EXCLUSIONS).sort((a, b) => a - b);
}
export function serializeCalendarSelection(ids: number[]): string | null {
  return ids.length ? JSON.stringify(ids) : null;
}

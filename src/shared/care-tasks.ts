import { str } from './input';

/** Recurring care tasks for maintenance work that has no own schedule yet. */
export const CARE_TASK_UNITS = ['days', 'weeks', 'months'] as const;
export type CareTaskUnit = typeof CARE_TASK_UNITS[number];
/** Fertilizing has dedicated plans and measurements the aquarium measuring cycle; dosing pumps log automatically. */
export const CARE_TASK_EXCLUDED_TYPES = ['dosing_pump', 'fertilize'];
export const MAX_CARE_TASKS_PER_AQUARIUM = 50;

export interface CareTaskInput {
  type: string; title: string | null; note: string | null; interval: number; unit: CareTaskUnit;
  start_date: string; time_of_day: string | null; is_active: boolean;
}
export interface CareTaskRecord extends CareTaskInput { id: number; aquarium_id: number; created_at: string }
export interface CareTaskStatus { last_done_at: string | null; next_due_date: string | null; is_due: boolean; is_overdue: boolean; days_remaining: number | null }

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Calendar date (YYYY-MM-DD) of a moment in the server/browser time zone. */
export function localDate(value: Date): string {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
}
function parseDate(value: string): Date {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year!, month! - 1, day!);
}
export function validDate(value: unknown): value is string {
  if (typeof value !== 'string' || !DATE.test(value)) return false;
  const date = parseDate(value);
  return localDate(date) === value && date.getFullYear() >= 2000 && date.getFullYear() <= 2100;
}
/** Adds an interval; months keep the day of month where possible (31 Jan + 1 month = 28/29 Feb). */
export function addInterval(value: string, interval: number, unit: CareTaskUnit): string {
  const date = parseDate(value);
  if (unit === 'months') {
    const day = date.getDate();
    date.setDate(1);date.setMonth(date.getMonth() + interval);
    date.setDate(Math.min(day, new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate()));
  } else date.setDate(date.getDate() + interval * (unit === 'weeks' ? 7 : 1));
  return localDate(date);
}
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.UTC(...ymd(to)) - Date.UTC(...ymd(from))) / 86400000);
}
const ymd = (value: string): [number, number, number] => { const [y, m, d] = value.split('-').map(Number);return [y!, m! - 1, d!]; };

export function validateCareTaskInput(body: Record<string, any> = {}, types: Record<string, unknown>): { error: string; value?: undefined } | { error?: undefined; value: CareTaskInput } {
  const type = typeof body.type === 'string' ? body.type : '';
  if (!Object.hasOwn(types, type) || CARE_TASK_EXCLUDED_TYPES.includes(type)) {
    return { error: 'Bitte eine gültige Pflegeart wählen. Düngungen werden im Düngerbereich und Messungen über den Messzyklus geplant.' };
  }
  const interval = Number(body.interval);
  if (!Number.isInteger(interval) || interval < 1 || interval > 365) return { error: 'Intervall: bitte eine ganze Zahl zwischen 1 und 365 angeben.' };
  const unit = CARE_TASK_UNITS.includes(body.unit) ? body.unit as CareTaskUnit : null;
  if (!unit) return { error: 'Ungültige Intervalleinheit.' };
  if (unit === 'months' && interval > 24) return { error: 'Monatliche Intervalle sind auf höchstens 24 Monate begrenzt.' };
  if (!validDate(body.start_date)) return { error: 'Bitte ein gültiges Startdatum angeben.' };
  const time = body.time_of_day === '' || body.time_of_day == null ? null : String(body.time_of_day);
  if (time !== null && !TIME.test(time)) return { error: 'Uhrzeit bitte im Format HH:MM angeben.' };
  return { value: { type, title: str(body.title, 80) || null, note: str(body.note, 500) || null, interval, unit, start_date: body.start_date,
    time_of_day: time, is_active: body.is_active === undefined ? true : Boolean(body.is_active) && body.is_active !== 0 && body.is_active !== '0' } };
}

/**
 * The next due date follows the last logged maintenance of the same type; before the first
 * completion (or when the start date lies after it) the start date applies.
 */
export function careTaskStatus(task: Pick<CareTaskInput, 'interval' | 'unit' | 'start_date' | 'is_active'>, lastDoneAt: string | null, now = new Date()): CareTaskStatus {
  const today = localDate(now);
  const lastDone = lastDoneAt && Number.isFinite(Date.parse(lastDoneAt)) ? localDate(new Date(lastDoneAt)) : null;
  if (!task.is_active) return { last_done_at: lastDoneAt, next_due_date: null, is_due: false, is_overdue: false, days_remaining: null };
  let next = lastDone ? addInterval(lastDone, task.interval, task.unit) : task.start_date;
  if (next < task.start_date) next = task.start_date;
  const remaining = daysBetween(today, next);
  return { last_done_at: lastDoneAt, next_due_date: next, is_due: remaining <= 0, is_overdue: remaining < 0, days_remaining: remaining };
}

/** Latest log entry per maintenance type, used for task status online and offline. */
export function lastMaintenanceByType(logs: { type?: string; logged_at?: string }[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (const log of logs) if (log.type && log.logged_at && (!result[log.type] || log.logged_at > result[log.type]!)) result[log.type] = log.logged_at;
  return result;
}

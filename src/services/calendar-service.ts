import { createHash } from 'node:crypto';
import db = require('../db');
import envModule = require('../config/env');
import { MAINTENANCE_TYPES } from '../shared/maintenance';
import { careTaskStatus, lastMaintenanceByType, localDate, addInterval, type CareTaskUnit } from '../shared/care-tasks';
import { manualDosingStatus } from '../shared/dosing';
import type { DosingPump } from '../types/domain';
import { parseCalendarSelection } from './calendar-selection';

const { APP_URL } = envModule;

/** One calendar entry (recurring, or a single overdue reminder without frequency); every entry becomes its own CalDAV resource. */
export interface CalendarEntry {
  uid: string; summary: string; description: string; start: string; time: string | null;
  frequency: 'DAILY' | 'WEEKLY' | 'MONTHLY' | null; interval: number; byDay?: string; stamp: string; url?: string;
}
export interface UserCalendar { name: string; entries: CalendarEntry[]; until: string; version: string }

const MAINTENANCE_EN: Record<string, string> = {
  water_change: 'Water change', filter_change: 'Change filter', filter_clean: 'Clean filter', plants_cut: 'Prune plants', plants_new: 'New plants',
  care: 'Care & cleaning', feeding: 'Special feeding', other: 'Other work',
};
const WEEKDAYS = ['', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'];

type Frequency = NonNullable<CalendarEntry['frequency']>;
const frequencyOf = (unit: CareTaskUnit | string): Frequency => unit === 'months' ? 'MONTHLY' : unit === 'weeks' ? 'WEEKLY' : 'DAILY';
const unitOf = (frequency: Frequency): CareTaskUnit => frequency === 'MONTHLY' ? 'months' : frequency === 'WEEKLY' ? 'weeks' : 'days';
const stampOf = (value: unknown) => {
  // SQLite stores "YYYY-MM-DD HH:MM:SS" in UTC without a zone designator.
  const text = typeof value === 'string' && /^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/.test(value) ? value.replace(' ', 'T') + 'Z' : value;
  const date = new Date(typeof text === 'string' && Number.isFinite(Date.parse(text)) ? text : '2026-01-01T00:00:00Z');
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
};

/** Aquariums that can appear in the user's calendar (own and shared with write access). */
async function calendarEligibleAquariums(userId: number): Promise<any[]> {
  return (await db.aquariums.listForUser(userId)).filter((aquarium: any) => aquarium.role === 'owner' || aquarium.role === 'write');
}
async function excludedAquariums(userId: number): Promise<Set<number>> {
  return new Set(parseCalendarSelection((await db.users.findById(userId))?.calendar_excluded_aquariums));
}

/** Calendar selection for the profile: every eligible aquarium with its inclusion state. */
export async function calendarAquariumSelection(userId: number) {
  const excluded = await excludedAquariums(userId);
  return (await calendarEligibleAquariums(userId)).map((aquarium: any) => ({ id: Number(aquarium.id), name: String(aquarium.name || ''), role: aquarium.role as 'owner' | 'write',
    owner: aquarium.role === 'owner' ? null : aquarium.owner_username || null, included: !excluded.has(Number(aquarium.id)) }));
}

/**
 * Builds the read-only care calendar of a user: measuring cycles, manual fertilizers and recurring
 * care tasks of all own aquariums and aquariums shared with write access, except those the user deselected. Entries start at the next
 * due date and recur in their own rhythm until the end of the following year; an overdue item additionally appears once today.
 */
export async function buildUserCalendar(userId: number, language = 'de', now = new Date()): Promise<UserCalendar> {
  const en = language === 'en';
  const today = localDate(now);
  const until = `${now.getFullYear() + 1}-12-31`;
  const entries: CalendarEntry[] = [];
  const excluded = await excludedAquariums(userId);
  const aquariums = (await calendarEligibleAquariums(userId)).filter((aquarium: any) => !excluded.has(Number(aquarium.id)));
  const link = (id: number) => APP_URL ? `${APP_URL}/#/a/${id}` : undefined;
  const push = (entry: Omit<CalendarEntry, 'start' | 'frequency'> & { start: string | null; frequency: Frequency }) => {
    if (!entry.start) return;
    let start = entry.start;
    // Overdue items keep their rhythm (e.g. Saturdays): the series continues with the next regular date, and a
    // single reminder marks the overdue item today. Moving the series start to today would shift every later date.
    if (start < today) {
      const step = Math.max(1, Math.trunc(entry.interval) || 1);
      while (start < today) start = addInterval(start, step, unitOf(entry.frequency));
      entries.push({ ...entry, uid: `${entry.uid}-overdue`, summary: `${en ? 'Overdue' : 'Überfällig'}: ${entry.summary}`, start: today, time: null, frequency: null, byDay: undefined });
    }
    if (start <= until) entries.push({ ...entry, start });
  };
  for (const aquarium of aquariums as any[]) {
    const name = String(aquarium.name || '').trim() || (en ? 'Aquarium' : 'Aquarium');
    const url = link(aquarium.id);
    const measure = aquarium.measure_cycle_status;
    if (aquarium.measure_cycle_interval && measure?.next_due_at) {
      const unit = aquarium.measure_cycle_unit === 'weeks' ? 'weeks' : 'days';
      const day = Number(aquarium.measure_cycle_day_of_week);
      push({ uid: `measure-${aquarium.id}`, summary: `🧪 ${en ? 'Test water' : 'Wasserwerte messen'} – ${name}`,
        description: en ? 'Measuring cycle of the aquarium.' : 'Messzyklus des Aquariums.', start: localDate(new Date(measure.next_due_at)), time: null,
        frequency: frequencyOf(unit), interval: Number(aquarium.measure_cycle_interval), byDay: unit === 'weeks' && day >= 1 && day <= 7 ? WEEKDAYS[day] : undefined,
        stamp: stampOf(aquarium.created_at), url });
    }
    for (const plan of await db.dosingPumps.listForAquarium(aquarium.id) as DosingPump[]) {
      if (plan.mode !== 'manual' || !plan.is_active) continue;
      const due = manualDosingStatus(plan, now, language).next_due_at;
      push({ uid: `fertilizer-${plan.id}`, summary: `🌿 ${plan.fertilizer_name}${plan.amount_ml ? ` (${plan.amount_ml} ml)` : ''} – ${name}`,
        description: [plan.name, plan.note].filter(Boolean).join('\n'), start: due ? localDate(new Date(due)) : null, time: plan.time_of_day || null,
        frequency: 'DAILY', interval: Number(plan.interval_days) || 1, stamp: stampOf(plan.created_at), url });
    }
    const tasks = await db.careTasks.listForAquarium(aquarium.id);
    if (!tasks.length) continue;
    const last = lastMaintenanceByType(await db.maintenance.listForAquarium(aquarium.id));
    for (const task of tasks) {
      const status = careTaskStatus(task, last[task.type] || null, now);
      const type = MAINTENANCE_TYPES[task.type];
      const label = task.title || (en ? MAINTENANCE_EN[task.type] : type?.label) || task.type;
      push({ uid: `task-${task.id}`, summary: `${type?.icon || '📝'} ${label} – ${name}`, description: task.note || '', start: status.next_due_date,
        time: task.time_of_day, frequency: frequencyOf(task.unit), interval: task.interval, stamp: stampOf(task.created_at), url });
    }
  }
  entries.sort((a, b) => a.uid.localeCompare(b.uid));
  const calendar = { name: en ? 'Aquarium care' : 'Aquarienpflege', entries, until, version: '' };
  calendar.version = createHash('sha256').update(JSON.stringify(calendar)).digest('hex');
  return calendar;
}

const escape = (value: string) => value.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
/** Folds content lines at 75 octets without splitting UTF-8 sequences (RFC 5545, 3.1). */
function fold(line: string) {
  const parts: string[] = [];
  let current = '', size = 0;
  for (const character of line) {
    const bytes = Buffer.byteLength(character);
    if (size + bytes > (parts.length ? 74 : 75)) { parts.push(current);current = '';size = 0; }
    current += character;size += bytes;
  }
  parts.push(current);
  return parts.join('\r\n ');
}
const compact = (date: string) => date.replace(/-/g, '');

function eventLines(entry: CalendarEntry, until: string): string[] {
  const lines = ['BEGIN:VEVENT', `UID:${entry.uid}@aquarium-logbuch`, `DTSTAMP:${entry.stamp}`, `SUMMARY:${escape(entry.summary)}`];
  if (entry.time) {
    lines.push(`DTSTART:${compact(entry.start)}T${entry.time.replace(':', '')}00`, 'DURATION:PT30M');
  } else lines.push(`DTSTART;VALUE=DATE:${compact(entry.start)}`, `DTEND;VALUE=DATE:${compact(addInterval(entry.start, 1, 'days'))}`, 'TRANSP:TRANSPARENT');
  if (entry.frequency) {
    const rule = [`FREQ=${entry.frequency}`, `INTERVAL=${entry.interval}`, ...(entry.byDay ? [`BYDAY=${entry.byDay}`] : []),
      `UNTIL=${compact(until)}${entry.time ? 'T235959' : ''}`];
    lines.push(`RRULE:${rule.join(';')}`);
  }
  if (entry.description) lines.push(`DESCRIPTION:${escape(entry.description)}`);
  if (entry.url) lines.push(`URL:${entry.url}`);
  lines.push('END:VEVENT');
  return lines;
}
function wrap(name: string, body: string[], method: boolean) {
  return [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Aquarium-Logbuch//Pflegekalender//DE', 'CALSCALE:GREGORIAN',
    ...(method ? ['METHOD:PUBLISH', `X-WR-CALNAME:${escape(name)}`] : []), ...body, 'END:VCALENDAR',
  ].map(fold).join('\r\n') + '\r\n';
}
/** Complete calendar for downloads and calendar subscriptions. */
export function calendarIcs(calendar: UserCalendar) {
  return wrap(calendar.name, calendar.entries.flatMap(entry => eventLines(entry, calendar.until)), true);
}
/** One CalDAV calendar object resource. */
export function entryIcs(calendar: UserCalendar, entry: CalendarEntry) {
  return wrap(calendar.name, eventLines(entry, calendar.until), false);
}
export const etagOf = (content: string) => `"${createHash('sha256').update(content).digest('hex').slice(0, 32)}"`;

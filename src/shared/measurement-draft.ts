import { AppError } from '../utils/app-error';
export interface MeasurementDraftData {
  draftId: string;
  when: string;
  timeZoneOffset: number;
  note: string;
  values: Record<string, string>;
  suite: string;
  selected: string[];
  timers: Record<string, number>;
}
/** Drafts retain unfinished text inputs; final measurement validation happens on completion. */
export function validateMeasurementDraft(input: any, suites: { id: string; tests: { key: string }[] }[]): MeasurementDraftData {
  const invalid = () => { throw new AppError('Ungültiger Testentwurf.', 400); };
  if (!input || typeof input !== 'object' || Array.isArray(input)) return invalid();
  if (typeof input.draftId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.draftId) || typeof input.when !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d$/.test(input.when) || !Number.isFinite(Date.parse(input.when))) return invalid();
  if (!Number.isInteger(input.timeZoneOffset) || Math.abs(input.timeZoneOffset) > 840) return invalid();
  if (typeof input.note !== 'string' || input.note.length > 500 || typeof input.suite !== 'string' || !suites.some(suite => suite.id === input.suite)) return invalid();
  if (!Array.isArray(input.selected) || input.selected.length > 100 || new Set(input.selected).size !== input.selected.length) return invalid();
  const keys = new Set<string>();
  for (const reference of input.selected) {
    if (typeof reference !== 'string') return invalid();
    const test = suites.flatMap(suite => suite.tests.map(test => ({ reference: `${suite.id}:${test.key}`, key: test.key }))).find(test => test.reference === reference);
    if (!test || keys.has(test.key)) return invalid();
    keys.add(test.key);
  }
  const values: Record<string, string> = {}, timers: Record<string, number> = {};
  for (const [name, object] of [['values', values], ['timers', timers]] as const) {
    const source = input[name];
    if (!source || typeof source !== 'object' || Array.isArray(source) || Object.keys(source).length > 100) return invalid();
    for (const [key, value] of Object.entries(source)) {
      if (!keys.has(key)) return invalid();
      if (name === 'values') {
        if (typeof value !== 'string' || value.length > 80) return invalid();
        (object as Record<string, string>)[key] = value;
      } else {
        if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0 || value > 8640000000000000) return invalid();
        (object as Record<string, number>)[key] = value;
      }
    }
  }
  return { draftId: input.draftId, when: input.when, timeZoneOffset: input.timeZoneOffset, note: input.note, suite: input.suite, selected: [...input.selected], values, timers };
}

export interface DraftMerge {
  merged: MeasurementDraftData;
  fields: string[];
}
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
function comparableValue(value: string | undefined) {
  const text = (value || '').trim();
  if (!text) return '';
  const number = Number(text.replace(',', '.'));
  if (Number.isFinite(number)) return number;
  return text;
}
export function draftField(draft: MeasurementDraftData, field: string): unknown {
  if (field === 'time') return { when: draft.when, timeZoneOffset: draft.timeZoneOffset };
  if (field.startsWith('values.')) return draft.values[field.slice(7)];
  if (field.startsWith('timers.')) return draft.timers[field.slice(7)];
  return draft[field as 'note' | 'suite' | 'selected'];
}
export function setDraftField(draft: MeasurementDraftData, field: string, value: unknown) {
  if (field === 'time') Object.assign(draft, value);
  else if (field.startsWith('values.') || field.startsWith('timers.')) {
    const object = field.startsWith('values.') ? draft.values : draft.timers;
    const key = field.slice(7);
    if (value === undefined) delete object[key];else (object as Record<string, unknown>)[key] = value;
  } else (draft as unknown as Record<string, unknown>)[field] = value;
}
export function pruneDraftFields(draft: MeasurementDraftData) {
  const keys = new Set(draft.selected.map(reference => reference.slice(reference.indexOf(':') + 1)));
  for (const object of [draft.values, draft.timers]) for (const key of Object.keys(object)) if (!keys.has(key)) delete object[key];
  return draft;
}
/** Compare changes with the locally observed starting point, including queued predecessors. */
export function mergeMeasurementDraft(base: MeasurementDraftData | null, local: MeasurementDraftData, remote: MeasurementDraftData): DraftMerge {
  const merged: MeasurementDraftData = JSON.parse(JSON.stringify(remote));
  const fields: string[] = [];
  const choose = (field: string, previous: unknown, mine: unknown, theirs: unknown, equal = same) => {
    if (equal(mine, theirs) || (base && equal(mine, previous))) return theirs;
    if ((base && equal(theirs, previous)) || (!base && (theirs === undefined || theirs === ''))) return mine;
    fields.push(field);return theirs;
  };
  const selectedEqual = (a: unknown, b: unknown) => same([...(a as string[] || [])].sort(), [...(b as string[] || [])].sort());
  for (const field of ['time', 'note', 'suite', 'selected']) {
    setDraftField(merged, field, choose(field, base ? draftField(base, field) : undefined, draftField(local, field), draftField(remote, field), field === 'selected' ? selectedEqual : same));
  }
  for (const collection of ['values', 'timers'] as const) {
    const keys = new Set([...Object.keys(base?.[collection] || {}), ...Object.keys(local[collection]), ...Object.keys(remote[collection])]);
    for (const key of keys) {
      const equal = collection === 'values' ? (a: unknown, b: unknown) => comparableValue(a as string | undefined) === comparableValue(b as string | undefined) : same;
      if (collection === 'values' && !base && comparableValue(local.values[key]) === '') continue;
      const value = choose(`${collection}.${key}`, base?.[collection][key], local[collection][key], remote[collection][key], equal);
      setDraftField(merged, `${collection}.${key}`, value);
    }
  }
  const selected = new Set(merged.selected.map(reference => reference.slice(reference.indexOf(':') + 1)));
  // A method removal must never silently remove a value concurrently filled on another device.
  if (Object.keys(merged.values).some(key => !selected.has(key) && comparableValue(merged.values[key]) !== '') || Object.keys(merged.timers).some(key => !selected.has(key))) {
    if (!fields.includes('selected')) fields.push('selected');
    merged.selected = [...remote.selected];
  }
  if (!fields.length) pruneDraftFields(merged);
  return { merged, fields };
}

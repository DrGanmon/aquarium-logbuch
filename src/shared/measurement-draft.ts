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

import { parseDecimal, str } from './input';

/** Lighting schedule of an aquarium: RGBW channel levels and a daily photoperiod with dimming ramps. */
export const LIGHT_CHANNELS = ['red', 'green', 'blue', 'white'] as const;
export type LightChannel = typeof LIGHT_CHANNELS[number];
export const MAX_RAMP_MINUTES = 240;

export interface LightingInput {
  red: number; green: number; blue: number; white: number;
  start_time: string; end_time: string; sunrise_minutes: number; sunset_minutes: number; note: string | null;
}
export interface LightingRecord extends LightingInput { aquarium_id: number; updated_at: string }

const TIME = /^([01]\d|2[0-3]):([0-5]\d)$/;
export const minutesOf = (time: string) => { const [, h, m] = TIME.exec(time) || [];return Number(h) * 60 + Number(m); };
export const timeOf = (minutes: number) => { const value = ((Math.round(minutes) % 1440) + 1440) % 1440;return `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`; };
/** Length of the photoperiod in minutes; an end time before the start time continues past midnight. */
export const photoperiodMinutes = (input: Pick<LightingInput, 'start_time' | 'end_time'>) => ((minutesOf(input.end_time) - minutesOf(input.start_time)) + 1440) % 1440;

export function validateLightingInput(body: Record<string, any> = {}): { error: string; value?: undefined } | { error?: undefined; value: LightingInput } {
  const channels = {} as Record<LightChannel, number>;
  for (const channel of LIGHT_CHANNELS) {
    const value = parseDecimal(body[channel]);
    if (value === null || value < 0 || value > 100) return { error: 'Kanalwerte für R, G, B und W bitte zwischen 0 und 100 % angeben.' };
    channels[channel] = Math.round(value * 10) / 10;
  }
  if (LIGHT_CHANNELS.every(channel => channels[channel] === 0)) return { error: 'Mindestens ein Lichtkanal muss eingeschaltet sein.' };
  const start = typeof body.start_time === 'string' ? body.start_time : '', end = typeof body.end_time === 'string' ? body.end_time : '';
  if (!TIME.test(start) || !TIME.test(end)) return { error: 'Start- und Endzeit bitte im Format HH:MM angeben.' };
  const period = photoperiodMinutes({ start_time: start, end_time: end });
  if (period === 0) return { error: 'Start- und Endzeit dürfen nicht gleich sein.' };
  const ramps: number[] = [];
  for (const key of ['sunrise_minutes', 'sunset_minutes']) {
    const value = body[key] === '' || body[key] == null ? 0 : Number(body[key]);
    if (!Number.isInteger(value) || value < 0 || value > MAX_RAMP_MINUTES) return { error: `Sonnenauf- und -untergang bitte als ganze Minuten zwischen 0 und ${MAX_RAMP_MINUTES} angeben.` };
    ramps.push(value);
  }
  if (ramps[0]! + ramps[1]! > period) return { error: 'Sonnenaufgang und -untergang zusammen dürfen nicht länger als die Beleuchtungsdauer sein.' };
  return { value: { ...channels, start_time: start, end_time: end, sunrise_minutes: ramps[0]!, sunset_minutes: ramps[1]!, note: str(body.note, 500) || null } };
}

/** Relative brightness (0–1) at a minute of the day, with linear sunrise and sunset ramps. */
export function brightnessAt(lighting: Pick<LightingInput, 'start_time' | 'end_time' | 'sunrise_minutes' | 'sunset_minutes'>, minute: number): number {
  const period = photoperiodMinutes(lighting);
  const offset = ((minute - minutesOf(lighting.start_time)) % 1440 + 1440) % 1440;
  if (offset >= period) return 0;
  if (lighting.sunrise_minutes && offset < lighting.sunrise_minutes) return offset / lighting.sunrise_minutes;
  const left = period - offset;
  if (lighting.sunset_minutes && left < lighting.sunset_minutes) return left / lighting.sunset_minutes;
  return 1;
}

/** Summary for display and the AI context: full-brightness window and total light hours. */
export function lightingSummary(lighting: LightingInput) {
  const period = photoperiodMinutes(lighting);
  const start = minutesOf(lighting.start_time);
  return { photoperiod_minutes: period, full_from: timeOf(start + lighting.sunrise_minutes), full_until: timeOf(start + period - lighting.sunset_minutes),
    full_minutes: period - lighting.sunrise_minutes - lighting.sunset_minutes };
}

/** Approximate on-screen colour of the RGBW mix at full brightness (white adds to all channels). */
export function previewColor(lighting: Pick<LightingInput, LightChannel>): string {
  const scale = (value: number) => Math.min(255, Math.round(value * 2.55));
  const white = lighting.white * 0.85;
  const rgb = [lighting.red + white, lighting.green + white, lighting.blue + white];
  const peak = Math.max(...rgb, 1);
  return '#' + rgb.map(value => scale(value / peak * 100).toString(16).padStart(2, '0')).join('');
}

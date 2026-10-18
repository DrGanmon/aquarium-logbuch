/** Public, browser-safe guide data, delivered through the suite/config API. */
export interface GuideText { de: string; en: string }
export interface DeviceGuideStep {
  id: string;
  phase: 'setup' | 'calibration' | 'beforeUse';
  title: GuideText;
  text: GuideText;
  /** Empty applies to every selected measurement mode. */
  parameters: string[];
}
export interface DeviceGuide {
  model: string;
  revision: string;
  sources: { title: string; url: string }[];
  steps: DeviceGuideStep[];
}
export function parseDeviceGuide(value: unknown): DeviceGuide | undefined {
  if (!value || typeof value !== 'object') return;
  const guide = value as Partial<DeviceGuide>;
  const text = (v: unknown): v is GuideText => !!v && typeof v === 'object' &&
    typeof (v as GuideText).de === 'string' && typeof (v as GuideText).en === 'string';
  if (typeof guide.model !== 'string' || typeof guide.revision !== 'string' || !Array.isArray(guide.sources) ||
      !guide.sources.length || !guide.sources.every(s => s && typeof s.title === 'string' && typeof s.url === 'string' && /^https:\/\//.test(s.url)) ||
      !Array.isArray(guide.steps) || !guide.steps.length || !guide.steps.every(s => s && typeof s.id === 'string' &&
        ['setup', 'calibration', 'beforeUse'].includes(s.phase) && text(s.title) && text(s.text) &&
        Array.isArray(s.parameters) && s.parameters.every(p => typeof p === 'string'))) return;
  if (new Set(guide.steps.map(s => s.id)).size !== guide.steps.length) return;
  return guide as DeviceGuide;
}
export function deviceGuideSteps(guide: DeviceGuide, parameters: string[]): DeviceGuideStep[] {
  return guide.steps.filter(step => !step.parameters.length || step.parameters.some(key => parameters.includes(key)));
}

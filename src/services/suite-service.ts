import { parseDeviceGuide } from '../shared/device-guide';
import { APP_ROOT } from '../utils/paths';
import fs from 'node:fs';
import path from 'node:path';
import { asRecord, isRecord, errorMessage } from '../utils/validation';
import type { Thresholds, WaterTest, TestSuite, StoredTestSuite } from '../types/catalog';
const BUILTIN_SUITES_DIR = path.join(__dirname, '../config/suites');
const CUSTOM_SUITES_DIR = path.join(APP_ROOT, 'data/suites');
function thresholds(value: unknown): Thresholds {
  const range = asRecord(value);
  const number = (key: keyof Thresholds) => range[key] != null ? Number(range[key]) : null;
  return { okMin: number('okMin'), okMax: number('okMax'), critMin: number('critMin'), critMax: number('critMax') };
}
function normalizeTest(raw: Record<string, unknown>, lang: string): WaterTest {
  const english = lang.toLowerCase().startsWith('en');
  const nameDe = String(raw.name_de || raw.name || raw.key || '');
  const nameEn = String(raw.name_en || raw.name || raw.key || '');
  const hintDe = String(raw.hint_de || raw.hint || '');
  const hintEn = String(raw.hint_en || raw.hint || '');
  const consumable = isRecord(raw.consumable) ? raw.consumable : null;
  return {
    key: String(raw.key || '').trim().toLowerCase(), name: english ? nameEn : nameDe, name_de: nameDe, name_en: nameEn,
    unit: raw.unit != null ? String(raw.unit) : '', decimals: typeof raw.decimals === 'number' && Number.isInteger(raw.decimals) ? raw.decimals : 1,
    step: Number(raw.step) || 0.1, min: raw.min != null ? Number(raw.min) : 0, max: raw.max != null ? Number(raw.max) : 100,
    wait: Number(raw.wait) || 0, verified: Boolean(raw.verified), hint: english ? hintEn : hintDe, hint_de: hintDe, hint_en: hintEn,
    fresh: thresholds(raw.fresh), salt: thresholds(raw.salt),
    consumable: consumable ? {
      ...consumable, capacity: consumable.capacity != null ? Number(consumable.capacity) : null,
      note: String((english ? consumable.note_en || consumable.note : consumable.note) || ''),
      variants: (Array.isArray(consumable.variants) ? consumable.variants : []).filter(isRecord).map(variant => ({
        ...variant, id: String(variant.id || ''), name: String((english ? variant.name_en || variant.name : variant.name) || ''),
        ...(typeof variant.name_en === 'string' ? { name_en: variant.name_en } : {}),
        capacity: variant.capacity != null ? Number(variant.capacity) : null,
        ...(typeof variant.trackUsage === 'boolean' ? { trackUsage: variant.trackUsage } : {}),
      })),
    } : null,
  };
}
/** Owns the catalog cache; directory injection keeps instances and tests independent. */
class SuiteService {
  private cache: Map<string, StoredTestSuite> | null = null;
  constructor(private readonly builtinDir = BUILTIN_SUITES_DIR, private readonly customDir = CUSTOM_SUITES_DIR) {}
  loadSuites(forceReload = false): Map<string, StoredTestSuite> {
    if (this.cache && !forceReload) return this.cache;
    fs.mkdirSync(this.builtinDir, { recursive: true });
    const suites = new Map<string, StoredTestSuite>();
    for (const dir of [this.builtinDir, this.customDir]) {
      if (!fs.existsSync(dir)) continue;
      for (const file of fs.readdirSync(dir).filter(name => name.endsWith('.json'))) {
        const filename = path.join(dir, file);
        try {
          const data = asRecord(JSON.parse(fs.readFileSync(filename, 'utf8')) as unknown);
          if (!data.id || !Array.isArray(data.tests)) continue;
          const rawTests = data.tests.filter(isRecord);
          const tests = rawTests.map(raw => normalizeTest(raw, 'de')).filter(test => test.key);
          const suite: StoredTestSuite = {
            id: String(data.id).trim(), name: String(data.name || data.id).trim(), name_de: String(data.name_de || data.name || data.id).trim(), name_en: String(data.name_en || data.name || data.id).trim(),
            description: String(data.description || '').trim(), description_de: String(data.description_de || data.description || '').trim(), description_en: String(data.description_en || data.description || '').trim(),
            deviceGuide: parseDeviceGuide(data.deviceGuide),
            isDefault: Boolean(data.isDefault || data.id === 'jbl-pro'), tests, testCount: tests.length, rawTests, file,
          };
          suites.set(suite.id, suite);
        } catch (error) { console.error(`[SuiteService] Fehler beim Laden von ${filename}:`, errorMessage(error)); }
      }
    }
    this.cache = suites;
    return suites;
  }
  private localize(suite: StoredTestSuite, lang: string): TestSuite {
    const english = lang.toLowerCase().startsWith('en');
    const tests = suite.rawTests.map(raw => normalizeTest(raw, lang)).filter(test => test.key);
    return { id: suite.id, name: english ? suite.name_en : suite.name_de, name_de: suite.name_de, name_en: suite.name_en,
      description: english ? suite.description_en : suite.description_de, description_de: suite.description_de, description_en: suite.description_en,
      ...(suite.deviceGuide ? { deviceGuide: suite.deviceGuide } : {}),
      isDefault: suite.isDefault, testCount: tests.length, tests };
  }
  getSuites(lang = 'de'): TestSuite[] { return [...this.loadSuites().values()].map(suite => this.localize(suite, lang)); }
  getDefaultSuite(lang = 'de'): TestSuite | null {
    const suites = this.loadSuites();
    const suite = [...suites.values()].find(entry => entry.isDefault) || suites.get('jbl-pro') || suites.values().next().value;
    return suite ? this.localize(suite, lang) : null;
  }
  getSuite(id?: string | null, lang = 'de'): TestSuite | null {
    const suite = id ? this.loadSuites().get(id) : undefined;
    return suite ? this.localize(suite, lang) : id ? null : this.getDefaultSuite(lang);
  }
  getParameters(id: string | null = null, lang = 'de'): WaterTest[] { return this.getSuite(id, lang)?.tests || []; }
  resolveSelection(selection: unknown, fallbackSuite?: string | null, lang = 'de') {
    let parsed = selection;
    if (typeof parsed === 'string') {
      try { parsed = JSON.parse(parsed) as unknown; } catch { parsed = null; }
    }
    const fallback = this.getSuite(fallbackSuite, lang) || this.getDefaultSuite(lang);
    const references = Array.isArray(parsed) ? parsed : (fallback?.tests || []).map(test => test.key);
    const result = new Map<string, WaterTest & { suiteId: string; reference: string }>();
    for (const reference of references) {
      if (typeof reference !== 'string') continue;
      const separator = reference.indexOf(':');
      const suiteId = separator >= 0 ? reference.slice(0, separator) : fallback?.id;
      const key = separator >= 0 ? reference.slice(separator + 1) : reference;
      const test = suiteId ? this.getSuite(suiteId, lang)?.tests.find(item => item.key === key) : null;
      if (test && suiteId) result.set(key, { ...test, suiteId, reference: `${suiteId}:${key}` });
    }
    return [...result.values()];
  }
  validateSelection(selection: unknown, fallbackSuite?: string | null): selection is string[] {
    if (!Array.isArray(selection) || selection.some(reference => typeof reference !== 'string')) return false;
    return this.resolveSelection(selection, fallbackSuite).length === selection.length;
  }
  getAllKnownParameters(lang = 'de'): WaterTest[] {
    const parameters = new Map<string, WaterTest>();
    for (const test of this.getDefaultSuite(lang)?.tests || []) parameters.set(test.key, test);
    for (const suite of this.getSuites(lang)) for (const test of suite.tests) if (!parameters.has(test.key)) parameters.set(test.key, test);
    return [...parameters.values()];
  }
}
const suiteService = new SuiteService();
export = { SuiteService, suiteService,
  loadSuites: suiteService.loadSuites.bind(suiteService), getSuites: suiteService.getSuites.bind(suiteService), getSuite: suiteService.getSuite.bind(suiteService),
  getDefaultSuite: suiteService.getDefaultSuite.bind(suiteService), getParameters: suiteService.getParameters.bind(suiteService), getAllKnownParameters: suiteService.getAllKnownParameters.bind(suiteService),
  resolveSelection: suiteService.resolveSelection.bind(suiteService), validateSelection: suiteService.validateSelection.bind(suiteService),
  BUILTIN_SUITES_DIR, CUSTOM_SUITES_DIR };

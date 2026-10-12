'use strict';
const fs = require('fs');
const path = require('path');

const BUILTIN_SUITES_DIR = path.join(__dirname, '../config/suites');
const CUSTOM_SUITES_DIR = path.join(__dirname, '../../data/suites');

let cache = null;

function ensureDirs() {
  if (!fs.existsSync(BUILTIN_SUITES_DIR)) {
    fs.mkdirSync(BUILTIN_SUITES_DIR, { recursive: true });
  }
}

function normalizeTest(t, lang = 'de') {
  const isEn = String(lang).toLowerCase().startsWith('en');
  const nameDe = String(t.name_de || t.name || t.key || '');
  const nameEn = String(t.name_en || t.name || t.key || '');
  const hintDe = String(t.hint_de || t.hint || '');
  const hintEn = String(t.hint_en || t.hint || '');

  return {
    key: String(t.key || '').trim().toLowerCase(),
    name: isEn ? nameEn : nameDe,
    name_de: nameDe,
    name_en: nameEn,
    unit: t.unit != null ? String(t.unit) : '',
    decimals: Number.isInteger(t.decimals) ? t.decimals : 1,
    step: Number(t.step) || 0.1,
    min: t.min != null ? Number(t.min) : 0,
    max: t.max != null ? Number(t.max) : 100,
    wait: Number(t.wait) || 0,
    verified: Boolean(t.verified),
    hint: isEn ? hintEn : hintDe,
    hint_de: hintDe,
    hint_en: hintEn,
    consumable: t.consumable ? {
      ...t.consumable,
      note: isEn ? (t.consumable.note_en || t.consumable.note) : t.consumable.note,
      variants: (t.consumable.variants || []).map((variant) => ({
        ...variant,
        name: isEn ? (variant.name_en || variant.name) : variant.name,
      })),
    } : null,
    fresh: {
      okMin: t.fresh?.okMin != null ? Number(t.fresh.okMin) : null,
      okMax: t.fresh?.okMax != null ? Number(t.fresh.okMax) : null,
      critMin: t.fresh?.critMin != null ? Number(t.fresh.critMin) : null,
      critMax: t.fresh?.critMax != null ? Number(t.fresh.critMax) : null,
    },
    salt: {
      okMin: t.salt?.okMin != null ? Number(t.salt.okMin) : null,
      okMax: t.salt?.okMax != null ? Number(t.salt.okMax) : null,
      critMin: t.salt?.critMin != null ? Number(t.salt.critMin) : null,
      critMax: t.salt?.critMax != null ? Number(t.salt.critMax) : null,
    },
  };
}

function loadSuites(forceReload = false) {
  if (cache && !forceReload) {
    return cache;
  }

  ensureDirs();
  const suites = new Map();

  const scanDir = (dir) => {
    if (!fs.existsSync(dir)) return;
    const files = fs.readdirSync(dir);
    for (const file of files) {
      if (!file.endsWith('.json')) continue;
      const fullPath = path.join(dir, file);
      try {
        const raw = fs.readFileSync(fullPath, 'utf8');
        const data = JSON.parse(raw);
        if (!data || !data.id || !Array.isArray(data.tests)) continue;

        const suite = {
          id: String(data.id).trim(),
          name: String(data.name || data.id).trim(),
          name_de: String(data.name_de || data.name || data.id).trim(),
          name_en: String(data.name_en || data.name || data.id).trim(),
          description: String(data.description || '').trim(),
          description_de: String(data.description_de || data.description || '').trim(),
          description_en: String(data.description_en || data.description || '').trim(),
          isDefault: Boolean(data.isDefault || data.id === 'jbl-pro'),
          rawTests: data.tests,
          tests: data.tests.map((t) => normalizeTest(t, 'de')).filter((t) => t.key),
          file: file,
        };
        suite.testCount = suite.tests.length;
        suites.set(suite.id, suite);
      } catch (err) {
        console.error(`[SuiteService] Fehler beim Laden von ${fullPath}:`, err.message);
      }
    }
  };

  scanDir(BUILTIN_SUITES_DIR);
  scanDir(CUSTOM_SUITES_DIR);

  cache = suites;
  return cache;
}

function localizeSuite(suite, lang = 'de') {
  if (!suite) return null;
  const isEn = String(lang).toLowerCase().startsWith('en');
  const localizedTests = (suite.rawTests || suite.tests).map((t) => normalizeTest(t, lang)).filter((t) => t.key);
  return {
    id: suite.id,
    name: isEn ? (suite.name_en || suite.name) : (suite.name_de || suite.name),
    name_de: suite.name_de || suite.name,
    name_en: suite.name_en || suite.name,
    description: isEn ? (suite.description_en || suite.description) : (suite.description_de || suite.description),
    description_de: suite.description_de || suite.description,
    description_en: suite.description_en || suite.description,
    isDefault: suite.isDefault,
    testCount: localizedTests.length,
    tests: localizedTests,
  };
}

function getSuites(lang = 'de') {
  const map = loadSuites();
  return Array.from(map.values()).map((s) => localizeSuite(s, lang));
}

function getDefaultSuite(lang = 'de') {
  const map = loadSuites();
  for (const s of map.values()) {
    if (s.isDefault) return localizeSuite(s, lang);
  }
  if (map.has('jbl-pro')) return localizeSuite(map.get('jbl-pro'), lang);
  const first = map.values().next().value;
  return first ? localizeSuite(first, lang) : null;
}

function getSuite(id, lang = 'de') {
  const map = loadSuites();
  if (id && map.has(id)) return localizeSuite(map.get(id), lang);
  return getDefaultSuite(lang);
}

function getParameters(suiteId = null, lang = 'de') {
  const suite = suiteId ? getSuite(suiteId, lang) : getDefaultSuite(lang);
  if (suite && Array.isArray(suite.tests) && suite.tests.length) {
    return suite.tests;
  }
  return [];
}

function getAllKnownParameters(lang = 'de') {
  const map = loadSuites();
  const paramsMap = new Map();
  // Standard-Suite zuerst
  const def = getDefaultSuite(lang);
  if (def) {
    for (const t of def.tests) paramsMap.set(t.key, t);
  }
  for (const s of map.values()) {
    const loc = localizeSuite(s, lang);
    for (const t of loc.tests) {
      if (!paramsMap.has(t.key)) {
        paramsMap.set(t.key, t);
      }
    }
  }
  return Array.from(paramsMap.values());
}

module.exports = {
  loadSuites,
  getSuites,
  getSuite,
  getDefaultSuite,
  getParameters,
  getAllKnownParameters,
  BUILTIN_SUITES_DIR,
  CUSTOM_SUITES_DIR,
};

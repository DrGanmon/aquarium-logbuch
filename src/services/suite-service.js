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

function normalizeTest(t) {
  return {
    key: String(t.key || '').trim().toLowerCase(),
    name: String(t.name || t.key || ''),
    unit: t.unit != null ? String(t.unit) : '',
    decimals: Number.isInteger(t.decimals) ? t.decimals : 1,
    step: Number(t.step) || 0.1,
    min: t.min != null ? Number(t.min) : 0,
    max: t.max != null ? Number(t.max) : 100,
    wait: Number(t.wait) || 0,
    verified: Boolean(t.verified),
    hint: String(t.hint || ''),
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
          description: String(data.description || '').trim(),
          isDefault: Boolean(data.isDefault || data.id === 'jbl-pro'),
          tests: data.tests.map(normalizeTest).filter((t) => t.key),
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

function getSuites() {
  const map = loadSuites();
  return Array.from(map.values()).map((s) => ({
    id: s.id,
    name: s.name,
    description: s.description,
    isDefault: s.isDefault,
    testCount: s.testCount,
    tests: s.tests,
  }));
}

function getDefaultSuite() {
  const map = loadSuites();
  for (const s of map.values()) {
    if (s.isDefault) return s;
  }
  if (map.has('jbl-pro')) return map.get('jbl-pro');
  const first = map.values().next().value;
  return first || null;
}

function getSuite(id) {
  const map = loadSuites();
  if (id && map.has(id)) return map.get(id);
  return getDefaultSuite();
}

function getParameters(suiteId = null) {
  const suite = suiteId ? getSuite(suiteId) : getDefaultSuite();
  if (suite && Array.isArray(suite.tests) && suite.tests.length) {
    return suite.tests;
  }
  return [];
}

function getAllKnownParameters() {
  const map = loadSuites();
  const paramsMap = new Map();
  // Standard-Suite zuerst
  const def = getDefaultSuite();
  if (def) {
    for (const t of def.tests) paramsMap.set(t.key, t);
  }
  for (const s of map.values()) {
    for (const t of s.tests) {
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

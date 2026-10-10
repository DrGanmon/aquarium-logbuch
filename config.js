'use strict';
/*
 * Testparameter, Wartezeiten (Timer) und Grenzwerte.
 *
 * Die Parameter und Testsuiten werden aus JSON-Dateien (unter src/config/suites/ bzw. data/suites/)
 * geladen. Standard-Suite ist der "JBL Pro Tröpfchentest" (jbl-pro-aquatest.json) nach der
 * offiziellen JBL Testlab-Gebrauchsanweisung mit konsolidiertem pH-Wert und verifizierten Zeiten.
 *
 * Grenzwerte: ok = Wohlfühlbereich, crit = Bereich, ab dem akute Gefahr besteht.
 * Zwischen ok und crit gibt es eine Warnung. null = keine Grenze auf dieser Seite.
 */

const suiteService = require('./src/services/suite-service');
const speciesService = require('./src/services/species-service');
const maintenanceService = require('./src/services/maintenance-service');

const PARAMETERS = suiteService.getAllKnownParameters();

/*
 * Besatzprofile. Überschreiben die Grenzwerte (nur die genannten Felder).
 * Sind mehrere Profile im Becken, wird der Schnitt der Bereiche verwendet.
 * Ist der Schnitt leer, zeigt die App den Hinweis "Besatz passt nicht zusammen".
 */
const PROFILES = {
  allgemein: { label: 'Allgemein (Gesellschaftsfische)', fresh: {} },
  weichwasser: {
    label: 'Weichwasserfische (z. B. Neon, Diskus, Kardinal)',
    fresh: {
      ph: { okMin: 5.5, okMax: 7.0, critMin: 4.8, critMax: 7.8 },
      kh: { okMin: 1, okMax: 6, critMin: 0, critMax: 12 },
      gh: { okMin: 2, okMax: 8, critMin: 1, critMax: 15 },
    },
  },
  hartwasser: {
    label: 'Hartwasserfische (z. B. Malawi, Tanganjika, Platy)',
    fresh: {
      ph: { okMin: 7.5, okMax: 8.6, critMin: 6.8, critMax: 9.2 },
      kh: { okMin: 8, okMax: 16, critMin: 4, critMax: 25 },
      gh: { okMin: 10, okMax: 20, critMin: 6, critMax: 30 },
    },
  },
  garnelen: {
    label: 'Garnelen und Wirbellose',
    fresh: {
      ph: { okMin: 6.5, okMax: 7.8, critMin: 6.0, critMax: 8.3 },
      nh4: { okMin: 0, okMax: 0.05, critMin: null, critMax: 0.25 },
      no2: { okMin: 0, okMax: 0.05, critMin: null, critMax: 0.2 },
      no3: { okMin: 0, okMax: 20, critMin: null, critMax: 50 },
      cu: { okMin: 0, okMax: 0.005, critMin: null, critMax: 0.02 },
    },
  },
};

// Vorschläge für die Eingabe im Besatz (aus Artenkatalogen generiert, freie Eingabe bleibt möglich).
function getSpeciesSuggestions() {
  const loaded = speciesService.getAllSpecies();
  if (loaded && loaded.length) {
    return loaded.map((s) => [s.name, s.profile]);
  }
  return [
    ['Siamesischer Kampffisch', 'weichwasser'],
    ['Neon-Salmler', 'weichwasser'], ['Roter Neon', 'weichwasser'], ['Kardinalfisch', 'allgemein'],
    ['Diskusfisch', 'weichwasser'], ['Skalar', 'weichwasser'], ['Zwergfadenfisch', 'weichwasser'],
    ['Panzerwels', 'allgemein'], ['Guppy', 'hartwasser'], ['Platy', 'hartwasser'], ['Molly', 'hartwasser'],
    ['Malawi-Buntbarsch', 'hartwasser'], ['Tanganjika-Buntbarsch', 'hartwasser'],
    ['Zebrabärbling', 'allgemein'], ['Antennenwels', 'allgemein'],
    ['Red-Fire-Garnele', 'garnelen'], ['Amano-Garnele', 'garnelen'], ['Posthornschnecke', 'allgemein'],
  ];
}

const SPECIES = getSpeciesSuggestions();

const WATER_TYPES = { fresh: 'Süßwasser', salt: 'Meerwasser' };

function isBounded(r) {
  return r && (r.okMin != null || r.okMax != null || r.critMin != null || r.critMax != null);
}

const maxN = (a, b) => (a == null ? b : b == null ? a : Math.max(a, b));
const minN = (a, b) => (a == null ? b : b == null ? a : Math.min(a, b));

/**
 * Grenzwerte für ein Becken berechnen (Wassertyp + Besatzprofile).
 * Gibt { thresholds: {param: range}, conflicts: [param keys] } zurück.
 */
function thresholdsFor(waterType, profileKeys, customParams = null) {
  const type = waterType === 'salt' ? 'salt' : 'fresh';
  const thresholds = {};
  const conflicts = [];
  const params = customParams || suiteService.getAllKnownParameters();
  for (const p of params) {
    let range = { ...(p[type] || {}) };
    if (type === 'fresh') {
      for (const key of new Set(profileKeys)) {
        const ov = PROFILES[key] && PROFILES[key].fresh && PROFILES[key].fresh[p.key];
        if (!ov) continue;
        range = {
          okMin: maxN(range.okMin, ov.okMin), okMax: minN(range.okMax, ov.okMax),
          critMin: maxN(range.critMin, ov.critMin), critMax: minN(range.critMax, ov.critMax),
        };
      }
      if (range.okMin != null && range.okMax != null && range.okMin > range.okMax) {
        conflicts.push(p.key);
        // Fallback auf Grundwerte, damit trotzdem bewertet werden kann
        range = { ...(p[type] || {}) };
      }
    }
    thresholds[p.key] = range;
  }
  return { thresholds, conflicts };
}

/** Bewertet einen Wert: 'ok' | 'warn' | 'crit' (oder null, wenn keine Grenzen existieren). */
function evaluate(range, value) {
  if (!isBounded(range)) return null;
  if ((range.critMin != null && value < range.critMin) || (range.critMax != null && value > range.critMax)) return 'crit';
  if ((range.okMin != null && value < range.okMin) || (range.okMax != null && value > range.okMax)) return 'warn';
  return 'ok';
}

// E-Mail-Adresse(n) des Administrators (mehrere mit Komma trennen)
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || '';

module.exports = {
  PARAMETERS,
  PROFILES,
  SPECIES,
  WATER_TYPES,
  ADMIN_EMAIL,
  thresholdsFor,
  evaluate,
  suiteService,
  speciesService,
  maintenanceService,
  MAINTENANCE_TYPES: maintenanceService.MAINTENANCE_TYPES,
};

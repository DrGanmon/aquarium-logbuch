import type { WaterType } from '../types/domain';
import type { WaterTest, Thresholds } from '../types/catalog';
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

import suiteService = require('../services/suite-service');
import speciesService = require('../services/species-service');
import maintenanceService = require('../services/maintenance-service');

const PARAMETERS = suiteService.getAllKnownParameters();

/*
 * Besatzprofile. Überschreiben die Grenzwerte (nur die genannten Felder).
 * Sind mehrere Profile im Becken, wird der Schnitt der Bereiche verwendet.
 * Ist der Schnitt leer, zeigt die App den Hinweis "Besatz passt nicht zusammen".
 */
const PROFILES: Record<string, { label: string; fresh: Record<string, Partial<Thresholds>> }> = {
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
  // Ranges derived from the supplied Sulawesi catalog entries (shared ideal range).
  sulawesi: {
    label: 'Sulawesi-Wirbellose (Kardinalsgarnele, Tylomelania)',
    fresh: {
      temp: { okMin: 27, okMax: 29, critMin: 26, critMax: 30 },
      ph: { okMin: 7.8, okMax: 8.2, critMin: 7.5, critMax: 8.5 },
      gh: { okMin: 6, okMax: 8, critMin: 5, critMax: 10 },
      kh: { okMin: 4, okMax: 5, critMin: 3, critMax: 7 },
      cu: { okMin: 0, okMax: 0.005, critMin: null, critMax: 0.02 },
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

const WATER_TYPES: Record<WaterType, string> = { fresh: 'Süßwasser', salt: 'Meerwasser' };

function isBounded(r: Partial<Thresholds> | null | undefined) {
  return r && (r.okMin != null || r.okMax != null || r.critMin != null || r.critMax != null);
}

const maxN = (a: number | null | undefined, b: number | null | undefined) => (a == null ? b ?? null : b == null ? a : Math.max(a, b));
const minN = (a: number | null | undefined, b: number | null | undefined) => (a == null ? b ?? null : b == null ? a : Math.min(a, b));

/**
 * Grenzwerte für ein Becken berechnen (Wassertyp + Besatzprofile).
 * Gibt { thresholds: {param: range}, conflicts: [param keys] } zurück.
 */
function thresholdsFor(waterType: WaterType, profileKeys: string[], customParams: WaterTest[] | null = null) {
  const type = waterType === 'salt' ? 'salt' : 'fresh';
  const thresholds: Record<string, Thresholds> = {};
  const conflicts = [];
  const params = customParams || suiteService.getAllKnownParameters();
  for (const p of params) {
    const baseRange = type === 'fresh' && profileKeys.includes('sulawesi')
      ? { ...(p[type] || {}), ...(PROFILES.sulawesi.fresh[p.key] || {}) }
      : { ...(p[type] || {}) };
    let range: Thresholds = { ...baseRange };
    if (type === 'fresh') {
      for (const key of new Set<string>(profileKeys)) {
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
function evaluate(range: Partial<Thresholds> | null | undefined, value: number): 'ok' | 'warn' | 'crit' | null {
  if (!range || !isBounded(range)) return null;
  if ((range.critMin != null && value < range.critMin) || (range.critMax != null && value > range.critMax)) return 'crit';
  if ((range.okMin != null && value < range.okMin) || (range.okMax != null && value > range.okMax)) return 'warn';
  return 'ok';
}

// E-Mail-Adresse(n) des Administrators (mehrere mit Komma trennen)
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'dr@ganmon.org';

// Konfigurierbare E-Mail-Adressen für Kontakt und Impressum
const CONTACT_EMAIL = process.env.CONTACT_EMAIL || process.env.ADMIN_EMAIL || 'dr@ganmon.org';
const IMPRINT_EMAIL = process.env.IMPRINT_EMAIL || process.env.IMPRESSUM_EMAIL || process.env.CONTACT_EMAIL || process.env.ADMIN_EMAIL || 'dr@ganmon.org';

export = {
  PARAMETERS,
  PROFILES,
  SPECIES,
  WATER_TYPES,
  ADMIN_EMAIL,
  CONTACT_EMAIL,
  IMPRINT_EMAIL,
  thresholdsFor,
  evaluate,
  suiteService,
  speciesService,
  maintenanceService,
  MAINTENANCE_TYPES: maintenanceService.MAINTENANCE_TYPES,
};

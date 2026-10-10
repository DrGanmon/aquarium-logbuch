'use strict';
/*
 * Testparameter, Wartezeiten (Timer) und Grenzwerte.
 *
 * WICHTIG: Nur die Zeiten mit verified:true wurden gegen die JBL-Anleitung geprüft
 * (PRO AQUATEST K: 30 s schwenken + 1 min stehen lassen = 90 s).
 * Alle anderen Zeiten sind Startwerte und MÜSSEN mit der Packungsbeilage des
 * jeweiligen Tests abgeglichen werden. Hier einfach "wait" (Sekunden) anpassen.
 *
 * Grenzwerte: ok = Wohlfühlbereich, crit = Bereich, ab dem akute Gefahr besteht.
 * Zwischen ok und crit gibt es eine Warnung. null = keine Grenze auf dieser Seite.
 */

const R = (okMin, okMax, critMin, critMax) => ({ okMin, okMax, critMin, critMax });

const PARAMETERS = [
  {
    key: 'temp', name: 'Temperatur', unit: '°C', decimals: 1, step: 0.1, min: 0, max: 40,
    wait: 0, verified: true, hint: 'Mit dem Thermometer messen, kein Timer nötig.',
    fresh: R(23, 27, 18, 31), salt: R(24, 26, 22, 29),
  },
  {
    key: 'ph', name: 'pH-Wert', unit: '', decimals: 1, step: 0.1, min: 3, max: 10,
    wait: 60, verified: false, hint: 'Reagenz zugeben, schwenken, danach mit Farbkarte vergleichen.',
    fresh: R(6.5, 7.5, 5.5, 8.5), salt: R(8.0, 8.4, 7.6, 8.7),
  },
  {
    key: 'kh', name: 'Karbonathärte (KH)', unit: '°dH', decimals: 1, step: 0.5, min: 0, max: 40,
    wait: 0, verified: false, hint: 'Tropfentest: Tropfen zählen bis zum Farbumschlag.',
    fresh: R(3, 10, 1, 20), salt: R(6.5, 9.5, 5, 13),
  },
  {
    key: 'gh', name: 'Gesamthärte (GH)', unit: '°dH', decimals: 1, step: 0.5, min: 0, max: 50,
    wait: 0, verified: false, hint: 'Tropfentest: Tropfen zählen bis zum Farbumschlag.',
    fresh: R(6, 14, 3, 25), salt: R(null, null, null, null),
  },
  {
    key: 'nh4', name: 'Ammonium (NH4)', unit: 'mg/l', decimals: 2, step: 0.05, min: 0, max: 10,
    wait: 900, verified: false, hint: 'Sollte nahe 0 liegen.',
    fresh: R(0, 0.1, null, 0.5), salt: R(0, 0.05, null, 0.25),
  },
  {
    key: 'no2', name: 'Nitrit (NO2)', unit: 'mg/l', decimals: 2, step: 0.01, min: 0, max: 5,
    wait: 180, verified: false, hint: 'Nitrit ist ein Fischgift. Sollte nahe 0 liegen.',
    fresh: R(0, 0.1, null, 0.5), salt: R(0, 0.05, null, 0.2),
  },
  {
    key: 'no3', name: 'Nitrat (NO3)', unit: 'mg/l', decimals: 0, step: 1, min: 0, max: 250,
    wait: 180, verified: false, hint: 'Bei Überschreitung Teilwasserwechsel.',
    fresh: R(0, 25, null, 100), salt: R(0, 10, null, 40),
  },
  {
    key: 'po4', name: 'Phosphat (PO4)', unit: 'mg/l', decimals: 2, step: 0.05, min: 0, max: 10,
    wait: 180, verified: false, hint: 'Hohe Werte fördern Algen.',
    fresh: R(0, 0.5, null, 2), salt: R(0, 0.05, null, 0.3),
  },
  {
    key: 'fe', name: 'Eisen (Fe)', unit: 'mg/l', decimals: 2, step: 0.01, min: 0, max: 3,
    wait: 180, verified: false, hint: 'Für Pflanzenaquarien relevant.',
    fresh: R(0, 0.2, null, 1), salt: R(0, 0.02, null, 0.1),
  },
  {
    key: 'k', name: 'Kalium (K)', unit: 'mg/l', decimals: 0, step: 1, min: 0, max: 600,
    wait: 90, verified: true,
    hint: '15 ml Probe, 10 Tropfen Reagenz 1, 1 Löffel Reagenz 2, 30 s schwenken, 1 min stehen lassen. Meerwasser: Ergebnis mal 30.',
    fresh: R(5, 30, 2, 40), salt: R(380, 400, 300, 450),
  },
  {
    key: 'co2', name: 'Kohlendioxid (CO2)', unit: 'mg/l', decimals: 0, step: 1, min: 0, max: 100,
    wait: 300, verified: false, hint: 'Bei CO2-Düngung relevant, Fische reagieren ab etwa 40 mg/l.',
    fresh: R(10, 30, null, 60), salt: R(null, null, null, null),
  },
  {
    key: 'o2', name: 'Sauerstoff (O2)', unit: 'mg/l', decimals: 1, step: 0.1, min: 0, max: 20,
    wait: 300, verified: false, hint: 'Zu wenig Sauerstoff ist besonders nachts kritisch.',
    fresh: R(6, null, 3, null), salt: R(6, null, 4, null),
  },
  {
    key: 'cu', name: 'Kupfer (Cu)', unit: 'mg/l', decimals: 3, step: 0.005, min: 0, max: 2,
    wait: 300, verified: false, hint: 'Sollte 0 sein. Für Garnelen und Wirbellose schon in Spuren giftig.',
    fresh: R(0, 0.02, null, 0.1), salt: R(0, 0.01, null, 0.05),
  },
  {
    key: 'ca', name: 'Calcium (Ca)', unit: 'mg/l', decimals: 0, step: 5, min: 0, max: 1000,
    wait: 120, verified: false, hint: 'Vor allem im Meerwasser wichtig.',
    fresh: R(20, 80, 10, 150), salt: R(400, 450, 340, 500),
  },
  {
    key: 'mg', name: 'Magnesium (Mg)', unit: 'mg/l', decimals: 0, step: 10, min: 0, max: 2000,
    wait: 120, verified: false, hint: 'Vor allem im Meerwasser wichtig.',
    fresh: R(5, 30, 2, 60), salt: R(1250, 1400, 1050, 1600),
  },
];

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

// Vorschläge für die Eingabe im Besatz (frei erweiterbar, freie Eingabe bleibt möglich).
const SPECIES = [
  ['Neon-Salmler', 'weichwasser'], ['Roter Neon', 'weichwasser'], ['Kardinalfisch', 'weichwasser'],
  ['Diskusfisch', 'weichwasser'], ['Skalar', 'weichwasser'], ['Zwergfadenfisch', 'weichwasser'],
  ['Panzerwels', 'allgemein'], ['Guppy', 'hartwasser'], ['Platy', 'hartwasser'], ['Molly', 'hartwasser'],
  ['Malawi-Buntbarsch', 'hartwasser'], ['Tanganjika-Buntbarsch', 'hartwasser'],
  ['Zebrabärbling', 'allgemein'], ['Antennenwels', 'allgemein'],
  ['Red-Fire-Garnele', 'garnelen'], ['Amano-Garnele', 'garnelen'], ['Posthornschnecke', 'garnelen'],
];

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
function thresholdsFor(waterType, profileKeys) {
  const type = waterType === 'salt' ? 'salt' : 'fresh';
  const thresholds = {};
  const conflicts = [];
  for (const p of PARAMETERS) {
    let range = { ...p[type] };
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
        range = { ...p[type] };
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

module.exports = { PARAMETERS, PROFILES, SPECIES, WATER_TYPES, ADMIN_EMAIL, thresholdsFor, evaluate };

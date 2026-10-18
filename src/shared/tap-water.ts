import type { Thresholds } from '../types/catalog';

export type TapWaterRange = Partial<Thresholds>;

export interface TapWaterData {
  values: Record<string, number | null>;
  note?: string | null;
  measured_at?: string | null;
  measuredAt?: string | null;
}

export interface TapWaterWarning {
  key: string;
  level: 'warn' | 'crit';
  message: string;
  title?: string;
  value: number;
  unit?: string;
}

/**
 * Standard-Grenzwerte für Leitungswasser (Ausgangswasser für Aquarien).
 * Werte außerhalb dieser Bereiche stellen potenzielle Gefahren oder Herausforderungen dar.
 */
export const DEFAULT_TAP_WATER_THRESHOLDS: Record<string, TapWaterRange> = {
  // Chlor & Desinfektion (im Aquarium toxisch)
  cl2: { okMin: 0, okMax: 0, critMax: 0.05 },
  cl: { okMin: 0, okMax: 0, critMax: 0.05 },
  // Schwermetalle
  cu: { okMin: 0, okMax: 0.005, critMax: 0.02 },
  fe: { okMin: 0, okMax: 0.1, critMax: 0.5 },
  // Stickstoffverbindungen
  no2: { okMin: 0, okMax: 0.05, critMax: 0.2 },
  no3: { okMin: 0, okMax: 20, critMax: 50 },
  nh4: { okMin: 0, okMax: 0.05, critMax: 0.25 },
  nh3: { okMin: 0, okMax: 0.01, critMax: 0.05 },
  // Nährstoffe & Algenförderer
  po4: { okMin: 0, okMax: 0.2, critMax: 0.8 },
  sio2: { okMin: 0, okMax: 1.0, critMax: 2.0 },
  si: { okMin: 0, okMax: 1.0, critMax: 2.0 },
  // Wasserhärte & Säuregrad (Standard-Trinkwasserbereich für Süßwasser)
  ph: { okMin: 6.5, okMax: 8.0, critMin: 5.5, critMax: 8.5 },
  gh: { okMin: 4, okMax: 16, critMin: 2, critMax: 25 },
  kh: { okMin: 3, okMax: 12, critMin: 1, critMax: 20 },
  // Leitwert & Salze
  ec: { okMin: 150, okMax: 800, critMin: 50, critMax: 1500 },
  tds: { okMin: 100, okMax: 500, critMin: 30, critMax: 1000 },
};

/**
 * Bewertet einen einzelnen Leitungswasserwert anhand der Schwellenwerte.
 */
export function evaluateTapWaterValue(
  key: string,
  value: number | null | undefined,
  customThresholds?: Record<string, TapWaterRange>
): 'ok' | 'warn' | 'crit' | 'none' {
  if (value == null || !Number.isFinite(value)) return 'none';
  const range = (customThresholds && customThresholds[key]) || DEFAULT_TAP_WATER_THRESHOLDS[key];
  if (!range) return 'none';

  if (
    (range.critMin != null && value < range.critMin) ||
    (range.critMax != null && value > range.critMax)
  ) {
    return 'crit';
  }
  if (
    (range.okMin != null && value < range.okMin) ||
    (range.okMax != null && value > range.okMax)
  ) {
    return 'warn';
  }
  return 'ok';
}

/**
 * Erzeugt bei bedenklichen Werten eine verständliche, praxisnahe Erklärung für den Benutzer.
 */
export function getTapWaterWarning(
  key: string,
  value: number | null | undefined,
  lang: string = 'de',
  customThresholds?: Record<string, TapWaterRange>
): TapWaterWarning | null {
  if (value == null || !Number.isFinite(value)) return null;
  const status = evaluateTapWaterValue(key, value, customThresholds);
  if (status !== 'warn' && status !== 'crit') return null;

  const isEn = lang.startsWith('en');
  const level = status;

  switch (key) {
    case 'cl2':
    case 'cl':
      return {
        key,
        level,
        value,
        message: isEn
          ? 'Chlorine detected in tap water. It damages fish gills and kills filter bacteria. Use a water conditioner or aerate the water thoroughly.'
          : 'Chlor im Leitungswasser nachgewiesen. Es schädigt Fischkiemen und zerstört Filterbakterien. Zwingend Wasseraufbereiter verwenden oder Wasser abstehen lassen/kräftig belüften.',
      };
    case 'cu':
      return {
        key,
        level,
        value,
        message: isEn
          ? 'Copper detected in tap water (often from household pipes). Highly toxic to shrimp, snails, and fish. Flush pipes before water change or use RO/conditioner.'
          : 'Kupfer im Leitungswasser nachgewiesen (häufig aus Hausleitungen). Hochgiftig für Garnelen, Krebse, Schnecken und Fische. Vor Entnahme Leitungen gut spülen oder Wasseraufbereiter/Osmose nutzen.',
      };
    case 'no2':
      return {
        key,
        level,
        value,
        message: isEn
          ? 'Elevated nitrite in tap water. Nitrite inhibits oxygen transport in fish blood.'
          : 'Erhöhtes Nitrit im Ausgangswasser. Nitrit hemmt den Sauerstofftransport im Blut der Fische.',
      };
    case 'no3':
      return {
        key,
        level,
        value,
        message: isEn
          ? 'Elevated nitrate in tap water. This promotes algae growth and hinders nitrate reduction through regular water changes.'
          : 'Erhöhter Nitratgehalt im Ausgangswasser. Begünstigt Algenwachstum und erschwert die Senkung von Nitrat im Becken durch Wasserwechsel.',
      };
    case 'nh4':
    case 'nh3':
      return {
        key,
        level,
        value,
        message: isEn
          ? 'Ammonium/ammonia detected in tap water. At pH values above 7.5, toxic ammonia forms quickly.'
          : 'Ammonium/Ammoniak im Leitungswasser. Bei alkalischem pH-Wert (> 7,5) entsteht daraus fischgiftiges Ammoniak.',
      };
    case 'po4':
      return {
        key,
        level,
        value,
        message: isEn
          ? 'Elevated phosphate in tap water. Can promote brush, beard, and spot algae.'
          : 'Erhöhtes Phosphat im Ausgangswasser. Kann das Wachstum von Pinsel-, Bart- und Punktalgen begünstigen.',
      };
    case 'sio2':
    case 'si':
      return {
        key,
        level,
        value,
        message: isEn
          ? 'High silicate in tap water. Strongly promotes diatom (brown) algae. Consider a silicate filter or mixed-bed resin after RO.'
          : 'Hoher Silikatgehalt im Leitungswasser. Begünstigt Kieselalgen (Braunalgen). Bei Osmose ggf. Mischbettharz/Silikatfilter nachschalten.',
      };
    case 'ph':
      if (value < 6.5) {
        return {
          key,
          level,
          value,
          message: isEn
            ? 'Very acidic tap water. Check buffering capacity (KH).'
            : 'Sehr saures Ausgangswasser. Karbonathärte (KH) und Pufferung prüfen.',
        };
      }
      return {
        key,
        level,
        value,
        message: isEn
          ? 'Very alkaline tap water. For softwater or South American fish, mixing with RO water or conditioning is recommended.'
          : 'Sehr alkalisches Ausgangswasser. Für Weichwasser- oder Südamerika-Arten empfiehlt sich Verschneiden mit Osmosewasser.',
      };
    case 'gh':
      if (value > 16) {
        return {
          key,
          level,
          value,
          message: isEn
            ? 'Hard to very hard tap water. For softwater species, dilution with reverse osmosis (RO) water is recommended.'
            : 'Hartes bis sehr hartes Ausgangswasser. Für Weichwasserfische empfiehlt sich das Verschneiden mit Osmosewasser.',
        };
      }
      return {
        key,
        level,
        value,
        message: isEn
          ? 'Very soft tap water. Remineralization salts may be necessary for species requiring higher hardness.'
          : 'Sehr weiches Ausgangswasser. Für Arten mit höherem Härtebedarf ggf. Aufhärtesalze nutzen.',
      };
    case 'kh':
      if (value < 3) {
        return {
          key,
          level,
          value,
          message: isEn
            ? 'Low carbonate hardness. Low acid-buffering capacity (risk of pH drops).'
            : 'Niedrige Karbonathärte. Geringe Säurepufferkapazität (Gefahr von pH-Schwankungen/Säuresturz).',
        };
      }
      return {
        key,
        level,
        value,
        message: isEn
          ? 'High carbonate hardness. Makes lowering pH difficult without RO water.'
          : 'Hohe Karbonathärte. Erschwert das Absenken des pH-Werts ohne Osmosewasser.',
      };
    case 'fe':
      return {
        key,
        level,
        value,
        message: isEn
          ? 'Elevated iron in tap water. Can lead to deposits or promote certain algae types.'
          : 'Erhöhter Eisengehalt im Ausgangswasser. Kann zu Ausfällungen führen oder Algenwachstum begünstigen.',
      };
    default:
      return {
        key,
        level,
        value,
        message: isEn
          ? `Value is outside the normal tap water range (${value}).`
          : `Wert liegt außerhalb des üblichen Bereichs für Ausgangswasser (${value}).`,
      };
  }
}

/**
 * Sammelt alle Warnungen für ein Leitungswasser-Profil.
 */
export function getTapWaterWarnings(
  values: Record<string, number | null | undefined> | null | undefined,
  lang: string = 'de',
  customThresholds?: Record<string, TapWaterRange>
): TapWaterWarning[] {
  if (!values || typeof values !== 'object') return [];
  const warnings: TapWaterWarning[] = [];
  for (const [key, rawVal] of Object.entries(values)) {
    if (rawVal == null) continue;
    const val = typeof rawVal === 'number' ? rawVal : Number(rawVal);
    if (!Number.isFinite(val)) continue;
    const warning = getTapWaterWarning(key, val, lang, customThresholds);
    if (warning) warnings.push(warning);
  }
  return warnings;
}

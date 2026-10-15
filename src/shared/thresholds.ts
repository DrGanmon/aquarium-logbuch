import type { WaterType } from '../types/domain';
import type { WaterTest, Thresholds } from '../types/catalog';
const maxN = (a: number | null | undefined, b: number | null | undefined) => (a == null ? b ?? null : b == null ? a : Math.max(a, b));
const minN = (a: number | null | undefined, b: number | null | undefined) => (a == null ? b ?? null : b == null ? a : Math.min(a, b));

/**
 * Grenzwerte für ein Becken berechnen (Wassertyp + Besatzprofile).
 * Gibt { thresholds: {param: range}, conflicts: [param keys] } zurück.
 */
export function calculateThresholds(waterType: WaterType, profileKeys: string[], PROFILES: Record<string, any>, params: WaterTest[]) {
  const type = waterType === 'salt' ? 'salt' : 'fresh';
  const thresholds: Record<string, Thresholds> = {};
  const conflicts = [];
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


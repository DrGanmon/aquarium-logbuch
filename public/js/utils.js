'use strict';

import { CONFIG } from './state.js';
import { h } from './dom.js';

export const param = (key) =>
  (CONFIG?.allParameters || CONFIG?.parameters || []).find((p) => p.key === key) || {
    key,
    name: key,
    unit: '',
    decimals: 1,
  };

export const fmtNum = (p, v) =>
  Number(v).toLocaleString('de-DE', {
    minimumFractionDigits: p.decimals,
    maximumFractionDigits: p.decimals,
  });

export const fmtDate = (iso) =>
  new Date(iso).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' });

export const sqlDate = (s) => new Date(s.replace(' ', 'T') + 'Z').toISOString();

export const STATUS_LABEL = { ok: 'im Bereich', warn: 'auffällig', crit: 'kritisch' };

export function evaluate(range, v) {
  if (
    !range ||
    (range.okMin == null &&
      range.okMax == null &&
      range.critMin == null &&
      range.critMax == null)
  )
    return null;
  if ((range.critMin != null && v < range.critMin) || (range.critMax != null && v > range.critMax))
    return 'crit';
  if ((range.okMin != null && v < range.okMin) || (range.okMax != null && v > range.okMax))
    return 'warn';
  return 'ok';
}

export const chip = (status) =>
  h('span', { class: 'chip ' + (status || 'none') }, status ? STATUS_LABEL[status] : 'keine Grenzwerte');

export function localInputValue(d = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function mmss(sec) {
  sec = Math.max(0, Math.ceil(sec));
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
}

export function socialLabel(type, minCount) {
  if (type === 'solitary') return 'Einzelhaltung';
  if (type === 'pair') return 'Paarhaltung';
  if (type === 'harem') return 'Haremshaltung';
  if (type === 'school') return `Schwarmfisch (ab ${minCount || 8})`;
  if (type === 'group') return `Gruppe (ab ${minCount || 5})`;
  return 'Gruppenhaltung';
}

export function territorialLabel(t) {
  if (t === 'solitary_aggressive') return 'Strikt territorial / Einzelgänger';
  if (t === 'strong') return 'Stark territorial';
  if (t === 'breeding') return 'Revierbildend bei Brut';
  if (t === 'territorial_bottom') return 'Bodenrevierbildend';
  if (t === 'mild') return 'Leicht territorial';
  return 'Friedlich';
}

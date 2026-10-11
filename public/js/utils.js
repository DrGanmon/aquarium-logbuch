'use strict';

import { CONFIG } from './state.js';
import { h } from './dom.js';
import { t, formatDate, formatNumber } from './i18n.js';

export const param = (key) =>
  (CONFIG?.allParameters || CONFIG?.parameters || []).find((p) => p.key === key) || {
    key,
    name: key,
    unit: '',
    decimals: 1,
  };

export const fmtNum = (p, v) => formatNumber(v, p?.decimals ?? 1);

export const fmtDate = (iso) => formatDate(iso);

export const sqlDate = (s) => {
  if (!s) return '';
  if (s instanceof Date) return s.toISOString();
  if (typeof s !== 'string') {
    try {
      return new Date(s).toISOString();
    } catch (e) {
      return String(s);
    }
  }
  const str = s.trim();
  if (!str) return '';
  if (str.endsWith('Z') || /[+-]\d{2}:?\d{2}$/.test(str)) {
    return str;
  }
  try {
    const iso = str.includes('T') ? str + 'Z' : str.replace(' ', 'T') + 'Z';
    const d = new Date(iso);
    if (!isNaN(d.getTime())) return d.toISOString();
  } catch (e) {}
  try {
    const d = new Date(str);
    if (!isNaN(d.getTime())) return d.toISOString();
  } catch (e) {}
  return str;
};

export const getStatusLabel = (status) => {
  if (status === 'ok') return t('common.statusOk');
  if (status === 'warn') return t('common.statusWarn');
  if (status === 'crit') return t('common.statusCrit');
  return t('common.noLimits');
};

export const STATUS_LABEL = new Proxy({}, {
  get(target, prop) {
    if (prop === 'ok') return t('common.statusOk');
    if (prop === 'warn') return t('common.statusWarn');
    if (prop === 'crit') return t('common.statusCrit');
    return t('common.noLimits');
  }
});

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
  h('span', { class: 'chip ' + (status || 'none') }, status ? getStatusLabel(status) : t('common.noLimits'));

export function localInputValue(d = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function mmss(sec) {
  sec = Math.max(0, Math.ceil(sec));
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
}

export function socialLabel(type, minCount) {
  if (type === 'solitary') return t('species.socialSolitary');
  if (type === 'pair') return t('species.socialPair');
  if (type === 'harem') return t('species.socialHarem');
  if (type === 'school') return t('species.socialSchool', { count: minCount || 8 });
  if (type === 'group') return t('species.socialGroup', { count: minCount || 5 });
  return t('species.socialGroup', { count: minCount || 5 });
}

export function territorialLabel(tKey) {
  if (tKey === 'solitary_aggressive') return t('species.terrAggressive');
  if (tKey === 'strong') return t('species.terrStrong');
  if (tKey === 'breeding') return t('species.terrBreeding');
  if (tKey === 'territorial_bottom') return t('species.terrBottom');
  if (tKey === 'mild') return t('species.terrMild');
  return t('species.terrPeaceful');
}

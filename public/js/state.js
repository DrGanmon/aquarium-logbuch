'use strict';

export const $app = document.getElementById('app');
export const $topbar = document.getElementById('topbar');
export const $topbarBrandName = document.getElementById('topbar-brand-name');
export const $whoami = document.getElementById('whoami');
export const $topbarAvatar = document.getElementById('topbar-avatar');
export const $btnProfile = document.getElementById('btn-profile');
export const $btnAdmin = document.getElementById('btn-admin');
export const $btnSpecies = document.getElementById('btn-species');
export const $btnLangTopbar = document.getElementById('btn-lang-topbar');
export const $topbarLangText = document.getElementById('topbar-lang-text');
export const $btnThemeTopbar = document.getElementById('btn-theme-topbar');
export const $topbarThemeIcon = document.getElementById('topbar-theme-icon');
export const $btnLogout = document.getElementById('btn-logout');

export let CONFIG = null;
export function setConfig(c) {
  CONFIG = c;
}

export let ME = null;
export function setMe(m) {
  ME = m;
}

export let cleanups = [];
export function addCleanup(fn) {
  if (typeof fn === 'function') cleanups.push(fn);
}
export function runCleanups() {
  cleanups.forEach((fn) => {
    try {
      fn();
    } catch (e) {
      /* ignorieren */
    }
  });
  cleanups = [];
}

export const GRAPH_RANGE_STORAGE_KEY = 'aquarium_graph_range';
export const GRAPH_CUSTOM_FROM_KEY = 'aquarium_graph_custom_from';
export const GRAPH_CUSTOM_TO_KEY = 'aquarium_graph_custom_to';

export function getInitialGraphRange() {
  const saved = localStorage.getItem(GRAPH_RANGE_STORAGE_KEY);
  if (saved) return saved;
  if (ME?.defaultGraphRange) return String(ME.defaultGraphRange);
  return '90'; // 3 Monate Standard
}

export let RANGE = getInitialGraphRange();
export function setRange(r) {
  RANGE = r;
}

export let CUSTOM_FROM = localStorage.getItem(GRAPH_CUSTOM_FROM_KEY) || '';
export function setCustomFrom(f) {
  CUSTOM_FROM = f;
}

export let CUSTOM_TO = localStorage.getItem(GRAPH_CUSTOM_TO_KEY) || '';
export function setCustomTo(t) {
  CUSTOM_TO = t;
}

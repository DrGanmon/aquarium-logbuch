'use strict';

import { toast } from './dom.js';

export const THEME_KEY = 'aquarium_theme';
export let activeCharts = [];

export function getThemeSetting() {
  return localStorage.getItem(THEME_KEY) || localStorage.getItem('theme') || 'system';
}

export function isSystemDark() {
  return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
}

export function isEffectiveDark() {
  const t = getThemeSetting();
  if (t === 'dark') return true;
  if (t === 'light') return false;
  return isSystemDark();
}

export function updateThemeUI(setting = getThemeSetting()) {
  const effectiveDark = isEffectiveDark();
  const iconSpan = document.getElementById('topbar-theme-icon');
  const topbarBtn = document.getElementById('btn-theme-topbar');

  const icon = setting === 'system' ? (effectiveDark ? '🌓' : '🌓') : (setting === 'dark' ? '🌙' : '☀️');
  const label = setting === 'system' ? 'Systemstandard' : (setting === 'dark' ? 'Dunkel' : 'Hell');

  if (iconSpan) iconSpan.textContent = icon;
  if (topbarBtn) {
    topbarBtn.title = `Farbschema: ${label} (klicken zum Umschalten)`;
    topbarBtn.setAttribute('aria-label', topbarBtn.title);
  }

  const metaTheme = document.getElementById('meta-theme-color');
  if (metaTheme) {
    metaTheme.setAttribute('content', effectiveDark ? '#091315' : '#12343b');
  }
}

export function applyTheme(setting, showNotification = false) {
  if (setting === 'light' || setting === 'dark') {
    document.documentElement.setAttribute('data-theme', setting);
  } else {
    document.documentElement.removeAttribute('data-theme');
    setting = 'system';
  }
  localStorage.setItem(THEME_KEY, setting);
  updateThemeUI(setting);

  if (showNotification) {
    const text = setting === 'system'
      ? `Farbschema: Systemstandard (${isSystemDark() ? 'Dunkel' : 'Hell'})`
      : (setting === 'dark' ? 'Farbschema: Dunkel' : 'Farbschema: Hell');
    toast(text);
  }

  // Aktive Charts dynamisch anpassen
  if (activeCharts.length > 0) {
    const isDark = isEffectiveDark();
    for (const chart of activeCharts) {
      if (chart && typeof chart.update === 'function') {
        if (chart.options && chart.options.scales) {
          if (chart.options.scales.x) {
            chart.options.scales.x.ticks = chart.options.scales.x.ticks || {};
            chart.options.scales.x.ticks.color = isDark ? '#8fa9ad' : '#4a6a70';
            chart.options.scales.x.grid = chart.options.scales.x.grid || {};
            chart.options.scales.x.grid.color = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)';
          }
          if (chart.options.scales.y) {
            chart.options.scales.y.ticks = chart.options.scales.y.ticks || {};
            chart.options.scales.y.ticks.color = isDark ? '#8fa9ad' : '#4a6a70';
            chart.options.scales.y.grid = chart.options.scales.y.grid || {};
            chart.options.scales.y.grid.color = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)';
            if (chart.options.scales.y.title) {
              chart.options.scales.y.title.color = isDark ? '#8fa9ad' : '#4a6a70';
            }
          }
        }
        if (chart.options && chart.options.plugins && chart.options.plugins.tooltip) {
          chart.options.plugins.tooltip.backgroundColor = isDark ? '#091315' : '#12343b';
          chart.options.plugins.tooltip.titleColor = isDark ? '#e2eeed' : '#ffffff';
          chart.options.plugins.tooltip.bodyColor = isDark ? '#e2eeed' : '#ffffff';
          chart.options.plugins.tooltip.borderColor = isDark ? '#22383c' : '#bccfcc';
        }
        if (chart.data && chart.data.datasets && chart.data.datasets[0]) {
          chart.data.datasets[0].borderColor = isDark ? '#38bdf8' : '#12343b';
          chart.data.datasets[0].backgroundColor = isDark ? '#38bdf8' : '#12343b';
        }
        chart.update('none');
      }
    }
  }
}

export function toggleTheme(onThemeToggled) {
  const current = getThemeSetting();
  const next = current === 'system' ? 'light' : (current === 'light' ? 'dark' : 'system');
  applyTheme(next, true);
  if (typeof onThemeToggled === 'function') {
    onThemeToggled(next);
  } else if (location.hash === '#/profile') {
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  }
}

export function initTheme() {
  if (window.matchMedia) {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
      if (getThemeSetting() === 'system') {
        applyTheme('system', false);
      }
    });
  }

  // Initiales Farbschema anwenden
  applyTheme(getThemeSetting(), false);

  const btnThemeTopbar = document.getElementById('btn-theme-topbar');
  if (btnThemeTopbar) {
    btnThemeTopbar.addEventListener('click', () => toggleTheme());
  }
}

/**
 * Aquarium-Logbuch - Modular i18n & Localization Engine
 * Standardisierte JSON-basierte Mehrsprachigkeit (Deutsch & Englisch)
 */
'use strict';

import deLocale from '../locales/de.json';
import enLocale from '../locales/en.json';

export const LOCALES = {
  de: deLocale,
  en: enLocale,
};

export const AVAILABLE_LANGUAGES = [
  { code: 'de', label: 'Deutsch', flag: '🇩🇪', locale: 'de-DE' },
  { code: 'en', label: 'English', flag: '🇬🇧', locale: 'en-US' },
];

export const LANGUAGE_STORAGE_KEY = 'aquarium_lang';

let currentLang = 'de';

/**
 * Ermittelt den IETF-Locale-String (z. B. 'de-DE' oder 'en-US') für die aktuelle Sprache.
 */
export function getLocale(lang = currentLang) {
  const match = AVAILABLE_LANGUAGES.find((l) => l.code === lang);
  return match ? match.locale : 'de-DE';
}

/**
 * Gibt den aktuellen Sprachcode zurück ('de' oder 'en').
 */
export function getLanguage() {
  return currentLang;
}

/**
 * Liest einen verschachtelten Übersetzungsschlüssel aus (z. B. 'common.save' oder 'auth.loginTitle').
 * Unterstützt Token-Interpolation wie {name} oder {{name}}.
 */
export function t(key, params = {}) {
  if (!key) return '';

  const langDict = LOCALES[currentLang] || LOCALES.de;
  let val = resolveNestedKey(langDict, key);

  // Fallback auf Deutsch, falls in der aktuellen Sprache nicht vorhanden
  if (val === undefined && currentLang !== 'de') {
    val = resolveNestedKey(LOCALES.de, key);
  }

  // Fallback auf Schlüsselnamen, falls nirgendwo gefunden
  if (val === undefined) {
    return key;
  }

  if (typeof val !== 'string') {
    return val;
  }

  // Parameter-Interpolation {param} & {{param}}
  if (params && typeof params === 'object') {
    return val.replace(/\{\{?([a-zA-Z0-9_]+)\}?\}/g, (match, paramKey) => {
      if (params[paramKey] !== undefined) {
        return String(params[paramKey]);
      }
      return match;
    });
  }

  return val;
}

function resolveNestedKey(obj, keyPath) {
  if (!obj || typeof obj !== 'object') return undefined;
  const parts = keyPath.split('.');
  let curr = obj;
  for (const p of parts) {
    if (curr == null || typeof curr !== 'object') return undefined;
    curr = curr[p];
  }
  return curr;
}

/**
 * Setzt die aktive Sprache, speichert sie im LocalStorage, aktualisiert das HTML-Attribut
 * und löst ein globales 'languagechange' Event aus.
 */
export function setLanguage(lang) {
  const validLang = LOCALES[lang] ? lang : 'de';
  currentLang = validLang;

  try {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, validLang);
  } catch (e) {
    /* localStorage eventuell nicht verfügbar */
  }

  if (typeof document !== 'undefined' && document.documentElement) {
    document.documentElement.setAttribute('lang', validLang);
    const titleEl = document.querySelector('title');
    if (titleEl) {
      titleEl.textContent = t('common.appName');
    }
  }

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('languagechange', { detail: { lang: validLang } }));
  }

  return validLang;
}

/**
 * Initialisiert die Sprache anhand:
 * 1. Expliziter Übergabe (z. B. aus Benutzerprofil ME.language)
 * 2. Gespeichertem Wert in localStorage
 * 3. Browser-Einstellung (navigator.language)
 * 4. Fallback 'de'
 */
export function initI18n(userPreferredLang = null) {
  let lang = 'de';

  if (userPreferredLang && LOCALES[userPreferredLang]) {
    lang = userPreferredLang;
  } else {
    let saved = null;
    try {
      saved = localStorage.getItem(LANGUAGE_STORAGE_KEY);
    } catch (e) {
      /* ignore */
    }

    if (saved && LOCALES[saved]) {
      lang = saved;
    } else if (typeof navigator !== 'undefined' && navigator.language) {
      const browserLang = navigator.language.slice(0, 2).toLowerCase();
      if (browserLang === 'en') {
        lang = 'en';
      } else {
        lang = 'de';
      }
    }
  }

  setLanguage(lang);
  return lang;
}

/**
 * Formatiert eine Zahl nach den Regeln der aktuellen Sprache.
 */
export function formatNumber(val, decimals = 1) {
  if (val == null || isNaN(val)) return '-';
  return Number(val).toLocaleString(getLocale(), {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/**
 * Formatiert ein Datum nach den Regeln der aktuellen Sprache.
 */
export function formatDate(isoOrDate, options = { dateStyle: 'short', timeStyle: 'short' }) {
  if (!isoOrDate) return '-';
  try {
    const d = typeof isoOrDate === 'string' ? new Date(isoOrDate) : isoOrDate;
    if (isNaN(d.getTime())) return String(isoOrDate);
    return d.toLocaleString(getLocale(), options);
  } catch (e) {
    return String(isoOrDate);
  }
}

/**
 * Formatiert nur das Datum (ohne Uhrzeit).
 */
export function formatDateOnly(isoOrDate) {
  return formatDate(isoOrDate, { dateStyle: 'medium' });
}

/**
 * Formatiert nur die Uhrzeit.
 */
export function formatTimeOnly(isoOrDate) {
  return formatDate(isoOrDate, { timeStyle: 'short' });
}

import fs = require('fs');
import path = require('path');
import { APP_ROOT } from '../utils/paths';
// Increase this version whenever the DE/EN terms in public/locales change substantively.
export const TERMS_VERSION = '2026-10-13-v1';
export const acceptsCurrentTerms = (input: { acceptTerms?: unknown; termsVersion?: unknown }) =>
  input?.acceptTerms === true && input.termsVersion === TERMS_VERSION;

const content: Record<'de' | 'en', Record<string, string>> = {
  de: JSON.parse(fs.readFileSync(path.join(APP_ROOT, 'public/locales/de.json'), 'utf8')).terms,
  en: JSON.parse(fs.readFileSync(path.join(APP_ROOT, 'public/locales/en.json'), 'utf8')).terms,
};
// Serve the text with its version so cached frontend bundles cannot display outdated terms.
export const currentTerms = (language: 'de' | 'en') => ({ version: TERMS_VERSION, terms: content[language] });

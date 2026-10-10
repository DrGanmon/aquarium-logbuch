'use strict';
const path = require('path');
const cfg = require('../../config');

const env = process.env;
const PORT = Number(env.PORT || 3000);
const DATA_DIR = env.DATA_DIR || path.join(__dirname, '../../data');
const ALLOW_REGISTRATION = (env.ALLOW_REGISTRATION || 'true') !== 'false';

// Öffentliche Adresse der App, z. B. https://aquarium.example.com oder https://example.com/aquarium
const APP_URL = (env.APP_URL || '').trim().replace(/\/+$/, '');
if (APP_URL && !/^https?:\/\/[^/]+/i.test(APP_URL)) {
  console.error('APP_URL muss mit http:// oder https:// beginnen.');
  process.exit(1);
}
const APP_PATH = APP_URL ? new URL(APP_URL).pathname.replace(/\/+$/, '') : '';
const COOKIE_SECURE = env.COOKIE_SECURE != null && env.COOKIE_SECURE !== '' ? env.COOKIE_SECURE === 'true' : APP_URL.startsWith('https://');
const COOKIE_PATH = APP_PATH || '/';
const SESSION_DAYS = 30;

// OIDC (z. B. Pocket ID)
const OIDC_ENABLED = !!env.OIDC_ISSUER;
const OIDC_PROVIDER_NAME = env.OIDC_PROVIDER_NAME || 'Pocket ID';
const OIDC_LINK_BY_USERNAME = env.OIDC_LINK_BY_USERNAME === 'true';
const OIDC_ISSUER = env.OIDC_ISSUER || '';
const OIDC_CLIENT_ID = env.OIDC_CLIENT_ID || '';
const OIDC_CLIENT_SECRET = env.OIDC_CLIENT_SECRET || '';
const OIDC_SCOPES = env.OIDC_SCOPES || 'openid profile email';

if (OIDC_ENABLED && (!APP_URL || !OIDC_CLIENT_ID)) {
  console.error('Für OIDC müssen APP_URL, OIDC_ISSUER und OIDC_CLIENT_ID gesetzt sein.');
  process.exit(1);
}

// Lokale Anmeldung mit Passwort: Standard an ohne OIDC, aus mit OIDC
const LOCAL_LOGIN = env.LOCAL_LOGIN != null && env.LOCAL_LOGIN !== '' ? env.LOCAL_LOGIN === 'true' : !OIDC_ENABLED;

// Admin-E-Mail(s) aus Umgebung oder config.js (mehrere durch Komma getrennt)
const ADMIN_EMAIL = (env.ADMIN_EMAIL || cfg.ADMIN_EMAIL || '').trim();
const ADMIN_EMAILS = ADMIN_EMAIL.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
const isEmailAdmin = (email) => !!email && ADMIN_EMAILS.includes(String(email).trim().toLowerCase());

module.exports = {
  PORT,
  DATA_DIR,
  ALLOW_REGISTRATION,
  APP_URL,
  APP_PATH,
  COOKIE_SECURE,
  COOKIE_PATH,
  SESSION_DAYS,
  OIDC_ENABLED,
  OIDC_PROVIDER_NAME,
  OIDC_LINK_BY_USERNAME,
  OIDC_ISSUER,
  OIDC_CLIENT_ID,
  OIDC_CLIENT_SECRET,
  OIDC_SCOPES,
  LOCAL_LOGIN,
  ADMIN_EMAIL,
  ADMIN_EMAILS,
  isEmailAdmin,
};

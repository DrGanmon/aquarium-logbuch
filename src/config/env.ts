import { APP_ROOT } from '../utils/paths';
'use strict';
import path = require('path');
import os = require('os');
import cfg = require('../../config');

const env = process.env;
const PORT = Number(env.PORT || 3000);
const DATA_DIR = env.DATA_DIR || path.join(APP_ROOT, 'data');
const ALLOW_REGISTRATION = (env.ALLOW_REGISTRATION || 'true') !== 'false';

// Multithreading / Concurrency Konfiguration
const WORKERS_RAW = (env.WORKERS || env.WEB_CONCURRENCY || '1').toLowerCase();
const WORKERS = WORKERS_RAW === 'auto'
  ? Math.max(1, os.availableParallelism ? os.availableParallelism() : os.cpus().length)
  : Math.max(1, Number(WORKERS_RAW) || 1);

const WORKER_THREADS_RAW = (env.WORKER_THREADS || '').toLowerCase();
const WORKER_THREADS = WORKER_THREADS_RAW === 'auto'
  ? Math.max(1, os.availableParallelism ? os.availableParallelism() : os.cpus().length)
  : (Number(WORKER_THREADS_RAW) || Math.min(4, Math.max(1, os.availableParallelism ? os.availableParallelism() : os.cpus().length)));

// Datenbankkonfiguration: 'sqlite' (Standard) oder 'mongodb'
const DB_TYPE = (env.DB_TYPE || (env.MONGODB_URI ? 'mongodb' : 'sqlite')).toLowerCase();
const MONGODB_URI = env.MONGODB_URI || 'mongodb://localhost:27017/aquarium';
const MONGODB_DB_NAME = env.MONGODB_DB_NAME || '';

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
const ADMIN_EMAILS = ADMIN_EMAIL.split(',').map((s: any) => s.trim().toLowerCase()).filter(Boolean);
const isEmailAdmin = (email: any) => !!email && ADMIN_EMAILS.includes(String(email).trim().toLowerCase());

// Kontakt- und Impressums-E-Mail-Adressen
const CONTACT_EMAIL = (env.CONTACT_EMAIL || cfg.CONTACT_EMAIL || ADMIN_EMAIL || 'dr@ganmon.org').trim();
const IMPRINT_EMAIL = (env.IMPRINT_EMAIL || env.IMPRESSUM_EMAIL || cfg.IMPRINT_EMAIL || CONTACT_EMAIL || 'dr@ganmon.org').trim();

// KI-Assistent & Sprachmodelle Konfiguration (OpenAI, Gemini, Claude)
const DEFAULT_AI_PROVIDER = (env.DEFAULT_AI_PROVIDER || 'openai').toLowerCase().trim();

// OpenAI / ChatGPT
const OPENAI_API_KEY = (env.OPENAI_API_KEY || '').trim();
const OPENAI_MODEL = (env.OPENAI_MODEL || 'gpt-4o-mini').trim();
const OPENAI_BASE_URL = (env.OPENAI_BASE_URL || 'https://api.openai.com/v1').trim();

// Google Gemini
const GEMINI_API_KEY = (env.GEMINI_API_KEY || env.GOOGLE_API_KEY || '').trim();
const GEMINI_MODEL = (env.GEMINI_MODEL || 'gemini-2.5-flash').trim();

// Anthropic Claude
const CLAUDE_API_KEY = (env.CLAUDE_API_KEY || env.ANTHROPIC_API_KEY || '').trim();
const CLAUDE_MODEL = (env.CLAUDE_MODEL || 'claude-3-5-haiku-20241022').trim();

export = {
  PORT,
  DATA_DIR,
  ALLOW_REGISTRATION,
  WORKERS,
  WORKER_THREADS,
  DB_TYPE,
  MONGODB_URI,
  MONGODB_DB_NAME,
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
  CONTACT_EMAIL,
  IMPRINT_EMAIL,
  DEFAULT_AI_PROVIDER,
  OPENAI_API_KEY,
  OPENAI_MODEL,
  OPENAI_BASE_URL,
  GEMINI_API_KEY,
  GEMINI_MODEL,
  CLAUDE_API_KEY,
  CLAUDE_MODEL,
};

'use strict';
const express = require('express');
const Database = require('better-sqlite3');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const cfg = require('./config');
const { createOidc } = require('./oidc');

const env = process.env;
const PORT = Number(env.PORT || 3000);
const DATA_DIR = env.DATA_DIR || path.join(__dirname, 'data');
const ALLOW_REGISTRATION = (env.ALLOW_REGISTRATION || 'true') !== 'false';
// Öffentliche Adresse der App, z. B. https://aquarium.example.com oder https://example.com/aquarium
const APP_URL = (env.APP_URL || '').trim().replace(/\/+$/, '');
if (APP_URL && !/^https?:\/\/[^/]+/i.test(APP_URL)) { console.error('APP_URL muss mit http:// oder https:// beginnen.'); process.exit(1); }
const APP_PATH = APP_URL ? new URL(APP_URL).pathname.replace(/\/+$/, '') : '';
const COOKIE_SECURE = env.COOKIE_SECURE != null && env.COOKIE_SECURE !== '' ? env.COOKIE_SECURE === 'true' : APP_URL.startsWith('https://');
const COOKIE_PATH = APP_PATH || '/';
const SESSION_DAYS = 30;

// OIDC (z. B. Pocket ID)
const OIDC_ENABLED = !!env.OIDC_ISSUER;
const OIDC_PROVIDER_NAME = env.OIDC_PROVIDER_NAME || 'Pocket ID';
const OIDC_LINK_BY_USERNAME = env.OIDC_LINK_BY_USERNAME === 'true';
if (OIDC_ENABLED && (!APP_URL || !env.OIDC_CLIENT_ID)) {
  console.error('Für OIDC müssen APP_URL, OIDC_ISSUER und OIDC_CLIENT_ID gesetzt sein.');
  process.exit(1);
}
const oidc = OIDC_ENABLED ? createOidc({
  issuer: env.OIDC_ISSUER,
  clientId: env.OIDC_CLIENT_ID,
  clientSecret: env.OIDC_CLIENT_SECRET || '',
  redirectUri: `${APP_URL}/auth/callback`,
  scopes: env.OIDC_SCOPES || 'openid profile email',
}) : null;
// Lokale Anmeldung mit Passwort: Standard an ohne OIDC, aus mit OIDC
const LOCAL_LOGIN = env.LOCAL_LOGIN != null && env.LOCAL_LOGIN !== '' ? env.LOCAL_LOGIN === 'true' : !OIDC_ENABLED;

// Admin-E-Mail(s) aus Umgebung oder config.js (mehrere durch Komma getrennt)
const ADMIN_EMAIL = (env.ADMIN_EMAIL || cfg.ADMIN_EMAIL || '').trim();
const ADMIN_EMAILS = ADMIN_EMAIL.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
const isEmailAdmin = (email) => !!email && ADMIN_EMAILS.includes(String(email).trim().toLowerCase());

fs.mkdirSync(DATA_DIR, { recursive: true });
const db = new Database(path.join(DATA_DIR, 'aquarium.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  username TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS aquariums (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  volume_l INTEGER,
  water_type TEXT NOT NULL DEFAULT 'fresh',
  reminder_days INTEGER NOT NULL DEFAULT 7,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS stock (
  id INTEGER PRIMARY KEY,
  aquarium_id INTEGER NOT NULL REFERENCES aquariums(id) ON DELETE CASCADE,
  species TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 1,
  profile TEXT NOT NULL DEFAULT 'allgemein'
);
CREATE TABLE IF NOT EXISTS measurements (
  id INTEGER PRIMARY KEY,
  aquarium_id INTEGER NOT NULL REFERENCES aquariums(id) ON DELETE CASCADE,
  measured_at TEXT NOT NULL,
  note TEXT,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_meas_aq ON measurements(aquarium_id, measured_at);
CREATE TABLE IF NOT EXISTS measurement_values (
  measurement_id INTEGER NOT NULL REFERENCES measurements(id) ON DELETE CASCADE,
  param TEXT NOT NULL,
  value REAL NOT NULL,
  PRIMARY KEY (measurement_id, param)
);
CREATE TABLE IF NOT EXISTS alerts (
  id INTEGER PRIMARY KEY,
  aquarium_id INTEGER NOT NULL REFERENCES aquariums(id) ON DELETE CASCADE,
  measurement_id INTEGER REFERENCES measurements(id) ON DELETE CASCADE,
  param TEXT NOT NULL,
  level TEXT NOT NULL,
  value REAL NOT NULL,
  message TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  acked_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_alert_aq ON alerts(aquarium_id, acked_at);
`);

// Migration für OIDC & E-Mail
const hasColumn = (table, col) => db.prepare(`PRAGMA table_info(${table})`).all().some((c) => c.name === col);
if (!hasColumn('users', 'oidc_sub')) db.exec('ALTER TABLE users ADD COLUMN oidc_sub TEXT');
if (!hasColumn('users', 'email')) db.exec('ALTER TABLE users ADD COLUMN email TEXT COLLATE NOCASE');
if (!hasColumn('sessions', 'id_token')) db.exec('ALTER TABLE sessions ADD COLUMN id_token TEXT');
db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_users_oidc ON users(oidc_sub) WHERE oidc_sub IS NOT NULL');
db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(email) WHERE email IS NOT NULL AND email != \'\'');

const app = express();
app.disable('x-powered-by');
// Hinter einem Reverse Proxy: TRUST_PROXY=1 setzen, damit die echte Client-IP für die Login-Begrenzung genutzt wird
if (process.env.TRUST_PROXY) app.set('trust proxy', Number(process.env.TRUST_PROXY));
app.use(express.json({ limit: '50kb' }));

// Sicherheits-Header
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('Content-Security-Policy', "default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; frame-ancestors 'none'");
  next();
});

// CSRF-Schutz: Schreibende Anfragen müssen JSON sein (Formulare fremder Seiten können das nicht senden)
app.use('/api', (req, res, next) => {
  if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    const hasBody = Number(req.headers['content-length'] || 0) > 0;
    if (hasBody && !req.is('application/json')) return res.status(415).json({ error: 'Nur JSON erlaubt.' });
    if (!req.headers['x-requested-with']) return res.status(403).json({ error: 'Anfrage abgelehnt.' });
  }
  next();
});

// ---------- Hilfsfunktionen ----------
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');

function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(pw, salt, 64);
  return `${salt.toString('hex')}:${hash.toString('hex')}`;
}
function verifyPassword(pw, stored) {
  const [saltHex, hashHex] = String(stored || '').split(':');
  if (!saltHex || !hashHex) return false; // Konto ohne lokales Passwort (nur OIDC)
  const hash = crypto.scryptSync(pw, Buffer.from(saltHex, 'hex'), 64);
  return crypto.timingSafeEqual(hash, Buffer.from(hashHex, 'hex'));
}
const DUMMY_HASH = hashPassword('dummy-password-for-timing');

function parseCookies(req) {
  const out = {};
  (req.headers.cookie || '').split(';').forEach((p) => {
    const i = p.indexOf('=');
    if (i > 0) out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim());
  });
  return out;
}
function setCookie(res, name, value, maxAgeSec) {
  const parts = [`${name}=${encodeURIComponent(value)}`, `Path=${COOKIE_PATH}`, 'HttpOnly', 'SameSite=Lax', `Max-Age=${maxAgeSec}`];
  if (COOKIE_SECURE) parts.push('Secure');
  const prev = res.getHeader('Set-Cookie');
  res.setHeader('Set-Cookie', [...(prev ? [].concat(prev) : []), parts.join('; ')]);
}
const setSessionCookie = (res, token, maxAgeSec) => setCookie(res, 'session', token, maxAgeSec);

// Einfache Begrenzung gegen Passwort-Raten
const attempts = new Map();
function tooManyAttempts(key) {
  const now = Date.now();
  const rec = (attempts.get(key) || []).filter((t) => now - t < 15 * 60 * 1000);
  attempts.set(key, rec);
  return rec.length >= 8;
}
function noteAttempt(key) { attempts.set(key, [...(attempts.get(key) || []), Date.now()]); }

function auth(req, res, next) {
  const token = parseCookies(req).session;
  if (!token) return res.status(401).json({ error: 'Nicht angemeldet.' });
  const row = db.prepare(`SELECT u.id, u.username, u.email, s.expires_at FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?`).get(sha(token));
  if (!row || row.expires_at < Date.now()) return res.status(401).json({ error: 'Sitzung abgelaufen.' });
  req.user = { id: row.id, username: row.username, email: row.email || null, isAdmin: isEmailAdmin(row.email) };
  next();
}

function requireAdmin(req, res, next) {
  if (!req.user || !req.user.isAdmin) return res.status(403).json({ error: 'Zugriff verweigert. Administrator-Rechte erforderlich.' });
  next();
}

function ownAquarium(req, res, next) {
  const id = Number(req.params.id);
  const aq = db.prepare('SELECT * FROM aquariums WHERE id = ? AND user_id = ?').get(id, req.user.id);
  if (!aq) return res.status(404).json({ error: 'Aquarium nicht gefunden.' });
  req.aq = aq;
  next();
}

const wrap = (fn) => (req, res, next) => { try { fn(req, res, next); } catch (e) { console.error(e); res.status(500).json({ error: 'Interner Fehler.' }); } };
const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

function thresholdsOfAquarium(aq) {
  const profiles = db.prepare('SELECT DISTINCT profile FROM stock WHERE aquarium_id = ?').all(aq.id).map((r) => r.profile);
  return { profiles, ...cfg.thresholdsFor(aq.water_type, profiles) };
}

// ---------- Hinweise zu Alarmen ----------
const ADVICE = {
  nh4: 'Ammonium/Ammoniak ist giftig: 30–50 % Wasser wechseln, Fütterung aussetzen, Filter prüfen.',
  no2: 'Nitrit ist ein Fischgift: Teilwasserwechsel, Fütterung reduzieren, Filterbakterien schonen.',
  no3: 'Teilwasserwechsel durchführen, Besatz und Fütterung überprüfen.',
  po4: 'Teilwasserwechsel, Fütterung prüfen, Algenwachstum beobachten.',
  cu: 'Kupfer ist für Wirbellose und Fische giftig: Wasserwechsel, Quelle suchen (Leitungen, Medikamente).',
  o2: 'Wasseroberfläche stärker bewegen oder belüften, Temperatur prüfen.',
  co2: 'CO2-Zufuhr drosseln und für Belüftung sorgen.',
  temp: 'Heizung bzw. Kühlung prüfen.',
  ph: 'Ursache prüfen (KH, CO2, Dekoration). Änderungen nur langsam vornehmen.',
};

function fmt(p, v) { return `${Number(v).toFixed(p.decimals).replace('.', ',')}${p.unit ? ' ' + p.unit : ''}`; }

function buildMessage(p, range, level, value) {
  const dir = (range.critMin != null && value < range.critMin) || (level === 'warn' && range.okMin != null && value < range.okMin) ? 'low' : 'high';
  const limit = level === 'crit' ? (dir === 'low' ? range.critMin : range.critMax) : (dir === 'low' ? range.okMin : range.okMax);
  const word = level === 'crit' ? 'kritisch' : 'auffällig';
  let msg = `${p.name} ist mit ${fmt(p, value)} ${word} (${dir === 'low' ? 'unter' : 'über'} ${fmt(p, limit)}).`;
  if (level === 'crit' && ADVICE[p.key]) msg += ' ' + ADVICE[p.key];
  return msg;
}

// ---------- Auth ----------
app.post('/api/register', wrap((req, res) => {
  if (!LOCAL_LOGIN || !ALLOW_REGISTRATION) return res.status(403).json({ error: 'Registrierung ist deaktiviert.' });
  const username = str(req.body.username, 40);
  const email = req.body.email ? str(req.body.email, 120).toLowerCase() : null;
  const password = typeof req.body.password === 'string' ? req.body.password : '';
  if (!/^[\p{L}\p{N}_.-]{3,40}$/u.test(username)) return res.status(400).json({ error: 'Benutzername: 3–40 Zeichen (Buchstaben, Zahlen, _ . -).' });
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'Ungültige E-Mail-Adresse.' });
  if (password.length < 8 || password.length > 200) return res.status(400).json({ error: 'Das Passwort braucht mindestens 8 Zeichen.' });
  if (db.prepare('SELECT 1 FROM users WHERE username = ?').get(username)) return res.status(409).json({ error: 'Dieser Benutzername ist vergeben.' });
  if (email && db.prepare('SELECT 1 FROM users WHERE email = ?').get(email)) return res.status(409).json({ error: 'Diese E-Mail-Adresse ist bereits vergeben.' });
  const info = db.prepare('INSERT INTO users (username, password_hash, email) VALUES (?, ?, ?)').run(username, hashPassword(password), email);
  startSession(res, info.lastInsertRowid);
  res.json({ id: info.lastInsertRowid, username, email });
}));

function startSession(res, userId, idToken = null) {
  const token = crypto.randomBytes(32).toString('hex');
  const maxAge = SESSION_DAYS * 86400;
  db.prepare('INSERT INTO sessions (token_hash, user_id, expires_at, id_token) VALUES (?, ?, ?, ?)').run(sha(token), userId, Date.now() + maxAge * 1000, idToken);
  db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(Date.now());
  setSessionCookie(res, token, maxAge);
}

app.post('/api/login', wrap((req, res) => {
  if (!LOCAL_LOGIN) return res.status(403).json({ error: `Bitte über ${OIDC_PROVIDER_NAME} anmelden.` });
  const username = str(req.body.username, 40);
  const password = typeof req.body.password === 'string' ? req.body.password : '';
  const key = `${req.ip}|${username.toLowerCase()}`;
  if (tooManyAttempts(key)) return res.status(429).json({ error: 'Zu viele Versuche. Bitte in ein paar Minuten erneut probieren.' });
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  const ok = verifyPassword(password, user ? user.password_hash : DUMMY_HASH) && !!user;
  if (!ok) { noteAttempt(key); return res.status(401).json({ error: 'Benutzername oder Passwort stimmt nicht.' }); }
  attempts.delete(key);
  startSession(res, user.id);
  res.json({ id: user.id, username: user.username });
}));

app.post('/api/logout', async (req, res) => {
  try {
    const token = parseCookies(req).session;
    let idToken = null;
    if (token) {
      idToken = db.prepare('SELECT id_token FROM sessions WHERE token_hash = ?').get(sha(token))?.id_token || null;
      db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(sha(token));
    }
    setSessionCookie(res, '', 0);
    // Bei OIDC-Sitzungen auch beim Anbieter abmelden
    const redirect = idToken && oidc ? await oidc.logoutUrl(idToken, `${APP_URL}/`) : null;
    res.json({ ok: true, redirect });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Interner Fehler.' }); }
});

const hasLocalPassword = (userId) => !!db.prepare('SELECT password_hash FROM users WHERE id = ?').get(userId)?.password_hash?.includes(':');
app.get('/api/me', auth, (req, res) => res.json({
  ...req.user,
  registration: ALLOW_REGISTRATION,
  hasPassword: LOCAL_LOGIN && hasLocalPassword(req.user.id),
  isAdmin: req.user.isAdmin,
}));
app.get('/api/registration', (req, res) => res.json({
  registration: LOCAL_LOGIN && ALLOW_REGISTRATION,
  localLogin: LOCAL_LOGIN,
  oidc: OIDC_ENABLED,
  oidcName: OIDC_PROVIDER_NAME,
}));

app.post('/api/password', auth, wrap((req, res) => {
  if (!LOCAL_LOGIN) return res.status(403).json({ error: 'Passwörter werden über den Anmeldedienst verwaltet.' });
  const { current, next } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!String(user.password_hash).includes(':')) return res.status(400).json({ error: 'Dieses Konto hat kein lokales Passwort.' });
  if (typeof current !== 'string' || !verifyPassword(current, user.password_hash)) return res.status(400).json({ error: 'Das aktuelle Passwort stimmt nicht.' });
  if (typeof next !== 'string' || next.length < 8) return res.status(400).json({ error: 'Das neue Passwort braucht mindestens 8 Zeichen.' });
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(next), req.user.id);
  res.json({ ok: true });
}));

// ---------- Konfiguration ----------
app.get('/api/config', auth, (req, res) => {
  res.json({
    parameters: cfg.PARAMETERS.map(({ key, name, unit, decimals, step, min, max, wait, verified, hint }) => ({ key, name, unit, decimals, step, min, max, wait, verified, hint })),
    profiles: Object.fromEntries(Object.entries(cfg.PROFILES).map(([k, v]) => [k, v.label])),
    species: cfg.SPECIES.map(([name, profile]) => ({ name, profile })),
    waterTypes: cfg.WATER_TYPES,
  });
});

// ---------- Aquarien ----------
function aquariumInput(body) {
  const name = str(body.name, 80);
  if (!name) return { error: 'Bitte einen Namen eingeben.' };
  const water_type = body.water_type === 'salt' ? 'salt' : 'fresh';
  let volume_l = body.volume_l === '' || body.volume_l == null ? null : Math.round(Number(body.volume_l));
  if (volume_l != null && (!Number.isFinite(volume_l) || volume_l < 1 || volume_l > 100000)) return { error: 'Volumen: bitte eine Zahl zwischen 1 und 100000 Litern angeben.' };
  let reminder_days = Math.round(Number(body.reminder_days ?? 7));
  if (!Number.isFinite(reminder_days) || reminder_days < 0 || reminder_days > 365) return { error: 'Erinnerung: 0–365 Tage (0 = aus).' };
  return { value: { name, water_type, volume_l, reminder_days, notes: str(body.notes, 1000) } };
}

function aquariumSummary(aq) {
  const last = db.prepare('SELECT measured_at FROM measurements WHERE aquarium_id = ? ORDER BY measured_at DESC LIMIT 1').get(aq.id);
  const alerts = db.prepare(`SELECT level, COUNT(*) n FROM alerts WHERE aquarium_id = ? AND acked_at IS NULL GROUP BY level`).all(aq.id);
  const crit = alerts.find((a) => a.level === 'crit')?.n || 0;
  const warn = alerts.find((a) => a.level === 'warn')?.n || 0;
  return { ...aq, last_measured_at: last ? last.measured_at : null, open_crit: crit, open_warn: warn, overdue: isOverdue(aq, last) };
}

function isOverdue(aq, last) {
  if (!aq.reminder_days) return false;
  if (!last) return false;
  return Date.now() - new Date(last.measured_at).getTime() > aq.reminder_days * 86400000;
}

app.get('/api/aquariums', auth, wrap((req, res) => {
  const rows = db.prepare('SELECT * FROM aquariums WHERE user_id = ? ORDER BY name').all(req.user.id);
  res.json(rows.map(aquariumSummary));
}));

app.post('/api/aquariums', auth, wrap((req, res) => {
  const { error, value } = aquariumInput(req.body);
  if (error) return res.status(400).json({ error });
  const info = db.prepare('INSERT INTO aquariums (user_id, name, volume_l, water_type, reminder_days, notes) VALUES (?, ?, ?, ?, ?, ?)')
    .run(req.user.id, value.name, value.volume_l, value.water_type, value.reminder_days, value.notes);
  res.json({ id: info.lastInsertRowid });
}));

app.get('/api/aquariums/:id', auth, ownAquarium, wrap((req, res) => {
  const aq = req.aq;
  const { profiles, thresholds, conflicts } = thresholdsOfAquarium(aq);
  const stock = db.prepare('SELECT id, species, count, profile FROM stock WHERE aquarium_id = ? ORDER BY species').all(aq.id);
  const alerts = db.prepare(`SELECT id, param, level, value, message, created_at FROM alerts WHERE aquarium_id = ? AND acked_at IS NULL ORDER BY (level = 'crit') DESC, created_at DESC`).all(aq.id);
  // aktuellster Wert je Parameter mit Bewertung nach heutigen Grenzwerten
  const latest = {};
  const rows = db.prepare(`
    SELECT mv.param, mv.value, m.measured_at FROM measurement_values mv
    JOIN measurements m ON m.id = mv.measurement_id
    WHERE m.aquarium_id = ? AND m.measured_at = (
      SELECT MAX(m2.measured_at) FROM measurements m2 JOIN measurement_values v2 ON v2.measurement_id = m2.id
      WHERE m2.aquarium_id = m.aquarium_id AND v2.param = mv.param)`).all(aq.id);
  for (const r of rows) latest[r.param] = { value: r.value, measured_at: r.measured_at, status: cfg.evaluate(thresholds[r.param], r.value) };
  res.json({ aquarium: aquariumSummary(aq), stock, profiles, thresholds, conflicts, alerts, latest });
}));

app.put('/api/aquariums/:id', auth, ownAquarium, wrap((req, res) => {
  const { error, value } = aquariumInput(req.body);
  if (error) return res.status(400).json({ error });
  db.prepare('UPDATE aquariums SET name = ?, volume_l = ?, water_type = ?, reminder_days = ?, notes = ? WHERE id = ?')
    .run(value.name, value.volume_l, value.water_type, value.reminder_days, value.notes, req.aq.id);
  res.json({ ok: true });
}));

app.delete('/api/aquariums/:id', auth, ownAquarium, wrap((req, res) => {
  db.prepare('DELETE FROM aquariums WHERE id = ?').run(req.aq.id);
  res.json({ ok: true });
}));

// ---------- Besatz ----------
app.post('/api/aquariums/:id/stock', auth, ownAquarium, wrap((req, res) => {
  const species = str(req.body.species, 80);
  const count = Math.round(Number(req.body.count ?? 1));
  const profile = cfg.PROFILES[req.body.profile] ? req.body.profile : 'allgemein';
  if (!species) return res.status(400).json({ error: 'Bitte eine Art eingeben.' });
  if (!Number.isFinite(count) || count < 1 || count > 10000) return res.status(400).json({ error: 'Anzahl: 1–10000.' });
  const info = db.prepare('INSERT INTO stock (aquarium_id, species, count, profile) VALUES (?, ?, ?, ?)').run(req.aq.id, species, count, profile);
  res.json({ id: info.lastInsertRowid });
}));

app.delete('/api/aquariums/:id/stock/:sid', auth, ownAquarium, wrap((req, res) => {
  db.prepare('DELETE FROM stock WHERE id = ? AND aquarium_id = ?').run(Number(req.params.sid), req.aq.id);
  res.json({ ok: true });
}));

// ---------- Messwerte ----------
app.post('/api/aquariums/:id/measurements', auth, ownAquarium, wrap((req, res) => {
  const values = req.body.values && typeof req.body.values === 'object' ? req.body.values : {};
  const params = new Map(cfg.PARAMETERS.map((p) => [p.key, p]));
  const clean = [];
  for (const [key, raw] of Object.entries(values)) {
    if (raw === '' || raw == null) continue;
    const p = params.get(key);
    if (!p) return res.status(400).json({ error: `Unbekannter Parameter: ${key}` });
    const v = Number(typeof raw === 'string' ? raw.replace(',', '.') : raw);
    if (!Number.isFinite(v) || v < p.min || v > p.max) return res.status(400).json({ error: `${p.name}: Bitte einen Wert zwischen ${p.min} und ${p.max} eingeben.` });
    clean.push([p, v]);
  }
  if (!clean.length) return res.status(400).json({ error: 'Bitte mindestens einen Wert eintragen.' });

  let measuredAt = new Date();
  if (req.body.measured_at) {
    measuredAt = new Date(req.body.measured_at);
    if (Number.isNaN(measuredAt.getTime()) || measuredAt.getTime() > Date.now() + 5 * 60000) return res.status(400).json({ error: 'Das Messdatum ist ungültig oder liegt in der Zukunft.' });
  }
  const iso = measuredAt.toISOString();
  const { thresholds } = thresholdsOfAquarium(req.aq);
  const created = [];

  db.transaction(() => {
    const info = db.prepare('INSERT INTO measurements (aquarium_id, measured_at, note, created_by) VALUES (?, ?, ?, ?)').run(req.aq.id, iso, str(req.body.note, 500), req.user.id);
    const mid = info.lastInsertRowid;
    const insV = db.prepare('INSERT INTO measurement_values (measurement_id, param, value) VALUES (?, ?, ?)');
    const insA = db.prepare('INSERT INTO alerts (aquarium_id, measurement_id, param, level, value, message) VALUES (?, ?, ?, ?, ?, ?)');
    for (const [p, v] of clean) {
      insV.run(mid, p.key, v);
      const range = thresholds[p.key];
      const level = cfg.evaluate(range, v);
      if (level === 'warn' || level === 'crit') {
        const message = buildMessage(p, range, level, v);
        insA.run(req.aq.id, mid, p.key, level, v, message);
        created.push({ param: p.key, level, message });
      }
    }
    created.mid = mid;
  })();
  res.json({ id: created.mid, alerts: created });
}));

app.get('/api/aquariums/:id/measurements', auth, ownAquarium, wrap((req, res) => {
  const days = Math.min(Math.max(Number(req.query.days) || 90, 1), 3650);
  const since = new Date(Date.now() - days * 86400000).toISOString();
  const ms = db.prepare('SELECT id, measured_at, note FROM measurements WHERE aquarium_id = ? AND measured_at >= ? ORDER BY measured_at').all(req.aq.id, since);
  const vals = db.prepare(`SELECT mv.measurement_id, mv.param, mv.value FROM measurement_values mv JOIN measurements m ON m.id = mv.measurement_id WHERE m.aquarium_id = ? AND m.measured_at >= ?`).all(req.aq.id, since);
  const byId = new Map(ms.map((m) => [m.id, { ...m, values: {} }]));
  for (const v of vals) byId.get(v.measurement_id).values[v.param] = v.value;
  res.json([...byId.values()]);
}));

app.delete('/api/aquariums/:id/measurements/:mid', auth, ownAquarium, wrap((req, res) => {
  db.prepare('DELETE FROM measurements WHERE id = ? AND aquarium_id = ?').run(Number(req.params.mid), req.aq.id);
  res.json({ ok: true });
}));

// ---------- Alarme ----------
app.post('/api/aquariums/:id/alerts/ack', auth, ownAquarium, wrap((req, res) => {
  const ids = Array.isArray(req.body.ids) ? req.body.ids.map(Number).filter(Number.isInteger) : null;
  if (ids) {
    const stmt = db.prepare("UPDATE alerts SET acked_at = datetime('now') WHERE id = ? AND aquarium_id = ? AND acked_at IS NULL");
    db.transaction(() => ids.forEach((id) => stmt.run(id, req.aq.id)))();
  } else {
    db.prepare("UPDATE alerts SET acked_at = datetime('now') WHERE aquarium_id = ? AND acked_at IS NULL").run(req.aq.id);
  }
  res.json({ ok: true });
}));

// ---------- OIDC-Anmeldung ----------
function appRedirect(res, error) {
  res.redirect(302, `${APP_URL}/${error ? '?auth_error=' + encodeURIComponent(error) : ''}`);
}

// Freien, gültigen Benutzernamen aus den OIDC-Claims ableiten
function usernameFromClaims(claims) {
  const raw = claims.preferred_username || (claims.email ? String(claims.email).split('@')[0] : '') || claims.name || 'benutzer';
  let base = String(raw).normalize('NFC').replace(/[^\p{L}\p{N}_.-]+/gu, '_').slice(0, 36);
  if (base.length < 3) base = (base + '_user').slice(0, 36);
  let name = base;
  for (let i = 2; db.prepare('SELECT 1 FROM users WHERE username = ?').get(name); i++) name = `${base}-${i}`;
  return name;
}

function userForClaims(claims) {
  const sub = String(claims.sub);
  const email = claims.email ? String(claims.email).trim().toLowerCase() : null;
  const existing = db.prepare('SELECT id, username, email FROM users WHERE oidc_sub = ?').get(sub);
  if (existing) {
    if (email && existing.email !== email) {
      db.prepare('UPDATE users SET email = ? WHERE id = ?').run(email, existing.id);
      existing.email = email;
    }
    return existing;
  }
  // Optional: vorhandenes lokales Konto mit gleichem Benutzernamen übernehmen (Migration)
  if (OIDC_LINK_BY_USERNAME && claims.preferred_username) {
    const local = db.prepare('SELECT id, username, email FROM users WHERE username = ? AND oidc_sub IS NULL').get(String(claims.preferred_username));
    if (local) {
      db.prepare('UPDATE users SET oidc_sub = ?, email = COALESCE(?, email) WHERE id = ?').run(sub, email, local.id);
      return { ...local, email: email || local.email };
    }
  }
  if (!ALLOW_REGISTRATION) return null;
  const username = usernameFromClaims(claims);
  const info = db.prepare('INSERT INTO users (username, password_hash, oidc_sub, email) VALUES (?, ?, ?, ?)').run(username, '', sub, email);
  return { id: info.lastInsertRowid, username, email };
}

// ---------- Admin / Benutzerverwaltung ----------
app.get('/api/admin/users', auth, requireAdmin, wrap((req, res) => {
  const rows = db.prepare(`
    SELECT u.id, u.username, u.email, u.oidc_sub, u.password_hash, u.created_at,
           COUNT(a.id) AS aquarium_count
    FROM users u
    LEFT JOIN aquariums a ON a.user_id = u.id
    GROUP BY u.id
    ORDER BY u.created_at ASC, u.id ASC
  `).all();
  res.json(rows.map((u) => ({
    id: u.id,
    username: u.username,
    email: u.email || null,
    hasPassword: !!(u.password_hash && u.password_hash.includes(':')),
    hasOidc: !!u.oidc_sub,
    isAdmin: isEmailAdmin(u.email),
    aquariumCount: u.aquarium_count,
    createdAt: u.created_at,
  })));
}));

app.post('/api/admin/users', auth, requireAdmin, wrap((req, res) => {
  const username = str(req.body.username, 40);
  const email = req.body.email ? str(req.body.email, 120).toLowerCase() : null;
  const password = typeof req.body.password === 'string' && req.body.password.length > 0 ? req.body.password : null;
  if (!/^[\p{L}\p{N}_.-]{3,40}$/u.test(username)) return res.status(400).json({ error: 'Benutzername: 3–40 Zeichen (Buchstaben, Zahlen, _ . -).' });
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'Ungültige E-Mail-Adresse.' });
  if (password && (password.length < 8 || password.length > 200)) return res.status(400).json({ error: 'Das Passwort braucht mindestens 8 Zeichen.' });
  if (db.prepare('SELECT 1 FROM users WHERE username = ?').get(username)) return res.status(409).json({ error: 'Dieser Benutzername ist vergeben.' });
  if (email && db.prepare('SELECT 1 FROM users WHERE email = ?').get(email)) return res.status(409).json({ error: 'Diese E-Mail-Adresse ist bereits vergeben.' });
  const passHash = password ? hashPassword(password) : '';
  const info = db.prepare('INSERT INTO users (username, password_hash, email) VALUES (?, ?, ?)').run(username, passHash, email);
  res.json({ id: info.lastInsertRowid, username, email, isAdmin: isEmailAdmin(email) });
}));

app.put('/api/admin/users/:id', auth, requireAdmin, wrap((req, res) => {
  const id = Number(req.params.id);
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  if (!user) return res.status(404).json({ error: 'Benutzer nicht gefunden.' });
  const username = str(req.body.username, 40);
  const email = req.body.email ? str(req.body.email, 120).toLowerCase() : null;
  const password = typeof req.body.password === 'string' && req.body.password.length > 0 ? req.body.password : null;
  if (!/^[\p{L}\p{N}_.-]{3,40}$/u.test(username)) return res.status(400).json({ error: 'Benutzername: 3–40 Zeichen (Buchstaben, Zahlen, _ . -).' });
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'Ungültige E-Mail-Adresse.' });
  if (password && (password.length < 8 || password.length > 200)) return res.status(400).json({ error: 'Das neue Passwort braucht mindestens 8 Zeichen.' });
  const existingName = db.prepare('SELECT 1 FROM users WHERE username = ? AND id != ?').get(username, id);
  if (existingName) return res.status(409).json({ error: 'Dieser Benutzername ist bereits vergeben.' });
  if (email) {
    const existingEmail = db.prepare('SELECT 1 FROM users WHERE email = ? AND id != ?').get(email, id);
    if (existingEmail) return res.status(409).json({ error: 'Diese E-Mail-Adresse ist bereits vergeben.' });
  }
  if (password) {
    db.prepare('UPDATE users SET username = ?, email = ?, password_hash = ? WHERE id = ?').run(username, email, hashPassword(password), id);
  } else {
    db.prepare('UPDATE users SET username = ?, email = ? WHERE id = ?').run(username, email, id);
  }
  res.json({ ok: true });
}));

app.delete('/api/admin/users/:id', auth, requireAdmin, wrap((req, res) => {
  const id = Number(req.params.id);
  if (req.user.id === id) return res.status(400).json({ error: 'Der eigene Administrator-Account kann nicht gelöscht werden.' });
  const user = db.prepare('SELECT 1 FROM users WHERE id = ?').get(id);
  if (!user) return res.status(404).json({ error: 'Benutzer nicht gefunden.' });
  db.prepare('DELETE FROM users WHERE id = ?').run(id);
  res.json({ ok: true });
}));

app.get('/auth/login', async (req, res) => {
  if (!oidc) return res.status(404).end();
  try {
    const { url, state } = await oidc.startLogin();
    setCookie(res, 'oidc_state', state, 600);
    res.redirect(302, url);
  } catch (e) {
    console.error('OIDC-Login fehlgeschlagen:', e.message);
    appRedirect(res, `${OIDC_PROVIDER_NAME} ist nicht erreichbar.`);
  }
});

app.get('/auth/callback', async (req, res) => {
  if (!oidc) return res.status(404).end();
  const cookieState = parseCookies(req).oidc_state;
  setCookie(res, 'oidc_state', '', 0);
  try {
    const { claims, idToken } = await oidc.finishLogin(req.query, cookieState);
    const user = userForClaims(claims);
    if (!user) return appRedirect(res, 'Für dieses Konto ist kein Zugang eingerichtet (Registrierung ist deaktiviert).');
    startSession(res, user.id, idToken);
    appRedirect(res);
  } catch (e) {
    console.error('OIDC-Callback fehlgeschlagen:', e.message);
    appRedirect(res, e.message.startsWith('Anmeldung abgebrochen') ? e.message : 'Die Anmeldung ist fehlgeschlagen. Bitte erneut versuchen.');
  }
});

// ---------- Frontend ----------
// index.html mit <base href>, damit die App auch unter einem Unterpfad (APP_URL mit Pfad) läuft
const INDEX_HTML = fs.readFileSync(path.join(__dirname, 'public', 'index.html'), 'utf8')
  .replace('<head>', `<head>\n  <base href="${APP_PATH.replace(/["<>&]/g, '')}/">`);
const sendIndex = (req, res) => res.type('html').setHeader('Cache-Control', 'no-cache').send(INDEX_HTML);
app.get(['/', '/index.html'], sendIndex);
app.get('/vendor/chart.js', (req, res) => res.sendFile(path.join(__dirname, 'node_modules/chart.js/dist/chart.umd.js')));
app.use(express.static(path.join(__dirname, 'public'), { maxAge: 0 }));
app.use('/api', (req, res) => res.status(404).json({ error: 'Nicht gefunden.' }));
app.use((req, res) => (req.method === 'GET' ? sendIndex(req, res) : res.status(404).end()));

if (require.main === module) {
  app.listen(PORT, () => console.log(`Aquarium-Logbuch läuft auf http://localhost:${PORT}`));
}
module.exports = app;

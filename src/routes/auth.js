'use strict';
const express = require('express');
const db = require('../db');
const {
  LOCAL_LOGIN,
  ALLOW_REGISTRATION,
  OIDC_ENABLED,
  OIDC_PROVIDER_NAME,
  isEmailAdmin,
  APP_URL,
} = require('../config/env');
const { oidc } = require('../services/oidc-service');
const { hashPassword, verifyPassword, DUMMY_HASH, hasLocalPassword, sha } = require('../utils/crypto');
const { tooManyAttempts, noteAttempt, clearAttempts } = require('../utils/rate-limit');
const { parseCookies, setSessionCookie, startSession } = require('../utils/cookies');
const { wrap, str } = require('../utils/helpers');
const { auth } = require('../middleware/auth');

const router = express.Router();

router.post(
  '/register',
  wrap((req, res) => {
    if (!LOCAL_LOGIN || !ALLOW_REGISTRATION) {
      return res.status(403).json({ error: 'Registrierung ist deaktiviert.' });
    }
    const username = str(req.body.username, 40);
    const email = req.body.email ? str(req.body.email, 120).toLowerCase() : null;
    const password = typeof req.body.password === 'string' ? req.body.password : '';
    if (!/^[\p{L}\p{N}_.-]{3,40}$/u.test(username)) {
      return res.status(400).json({ error: 'Benutzername: 3–40 Zeichen (Buchstaben, Zahlen, _ . -).' });
    }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'Ungültige E-Mail-Adresse.' });
    }
    if (password.length < 8 || password.length > 200) {
      return res.status(400).json({ error: 'Das Passwort braucht mindestens 8 Zeichen.' });
    }
    if (db.prepare('SELECT 1 FROM users WHERE username = ?').get(username)) {
      return res.status(409).json({ error: 'Dieser Benutzername ist vergeben.' });
    }
    if (email && db.prepare('SELECT 1 FROM users WHERE email = ?').get(email)) {
      return res.status(409).json({ error: 'Diese E-Mail-Adresse ist bereits vergeben.' });
    }
    const info = db
      .prepare('INSERT INTO users (username, password_hash, email) VALUES (?, ?, ?)')
      .run(username, hashPassword(password), email);
    startSession(res, db, info.lastInsertRowid);
    res.json({ id: info.lastInsertRowid, username, email });
  })
);

router.post(
  '/login',
  wrap((req, res) => {
    if (!LOCAL_LOGIN) {
      return res.status(403).json({ error: `Bitte über ${OIDC_PROVIDER_NAME} anmelden.` });
    }
    const username = str(req.body.username, 40);
    const password = typeof req.body.password === 'string' ? req.body.password : '';
    const key = `${req.ip}|${username.toLowerCase()}`;
    if (tooManyAttempts(key)) {
      return res.status(429).json({ error: 'Zu viele Versuche. Bitte in ein paar Minuten erneut probieren.' });
    }
    const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
    const ok = verifyPassword(password, user ? user.password_hash : DUMMY_HASH) && !!user;
    if (!ok) {
      noteAttempt(key);
      return res.status(401).json({ error: 'Benutzername oder Passwort stimmt nicht.' });
    }
    clearAttempts(key);
    startSession(res, db, user.id);
    res.json({ id: user.id, username: user.username });
  })
);

router.post(
  '/logout',
  wrap(async (req, res) => {
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
  })
);

router.get('/me', auth, (req, res) => {
  const u = db.prepare('SELECT id, username, email, oidc_sub FROM users WHERE id = ?').get(req.user.id);
  res.json({
    id: u.id,
    username: u.username,
    email: u.email || null,
    registration: ALLOW_REGISTRATION,
    hasPassword: LOCAL_LOGIN && hasLocalPassword(u.id, db),
    hasOidc: !!u.oidc_sub,
    oidcEnabled: OIDC_ENABLED,
    oidcProviderName: OIDC_PROVIDER_NAME,
    isAdmin: isEmailAdmin(u.email),
  });
});

router.post(
  '/me/unlink-oidc',
  auth,
  wrap((req, res) => {
    const hasPw = hasLocalPassword(req.user.id, db);
    if (!hasPw) {
      return res.status(400).json({ error: 'Ohne lokales Passwort kann die OIDC-Verknüpfung nicht getrennt werden.' });
    }
    db.prepare('UPDATE users SET oidc_sub = NULL WHERE id = ?').run(req.user.id);
    res.json({ ok: true });
  })
);

router.get('/registration', (req, res) =>
  res.json({
    registration: LOCAL_LOGIN && ALLOW_REGISTRATION,
    localLogin: LOCAL_LOGIN,
    oidc: OIDC_ENABLED,
    oidcName: OIDC_PROVIDER_NAME,
  })
);

router.post(
  '/password',
  auth,
  wrap((req, res) => {
    if (!LOCAL_LOGIN) {
      return res.status(403).json({ error: 'Passwörter werden über den Anmeldedienst verwaltet.' });
    }
    const { current, next } = req.body;
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
    if (!String(user.password_hash).includes(':')) {
      return res.status(400).json({ error: 'Dieses Konto hat kein lokales Passwort.' });
    }
    if (typeof current !== 'string' || !verifyPassword(current, user.password_hash)) {
      return res.status(400).json({ error: 'Das aktuelle Passwort stimmt nicht.' });
    }
    if (typeof next !== 'string' || next.length < 8) {
      return res.status(400).json({ error: 'Das neue Passwort braucht mindestens 8 Zeichen.' });
    }
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(next), req.user.id);
    res.json({ ok: true });
  })
);

module.exports = router;

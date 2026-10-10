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
const { saveAvatar, deleteImage, getImagePath, getMimeType } = require('../services/image-service');

const router = express.Router();

function serializeMe(u) {
  return {
    id: u.id,
    username: u.username,
    firstName: u.first_name || '',
    lastName: u.last_name || '',
    bio: u.bio || '',
    hasAvatar: !!u.avatar_file,
    avatarUrl: u.avatar_file ? `api/me/avatar` : null,
    email: u.email || null,
    registration: ALLOW_REGISTRATION,
    hasPassword: LOCAL_LOGIN && hasLocalPassword(u.id, db),
    hasOidc: !!u.oidc_sub,
    oidcSub: u.oidc_sub || null,
    oidcEnabled: OIDC_ENABLED,
    oidcProviderName: OIDC_PROVIDER_NAME,
    isAdmin: isEmailAdmin(u.email),
  };
}

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
  const u = db.prepare('SELECT id, username, first_name, last_name, bio, avatar_file, email, oidc_sub FROM users WHERE id = ?').get(req.user.id);
  if (!u) return res.status(404).json({ error: 'Benutzer nicht gefunden.' });
  res.json(serializeMe(u));
});

router.put(
  ['/me', '/me/profile'],
  auth,
  wrap((req, res) => {
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
    if (!user) return res.status(404).json({ error: 'Benutzer nicht gefunden.' });

    const username = req.body.username !== undefined ? str(req.body.username, 40) : user.username;
    const firstName = req.body.firstName !== undefined ? (req.body.firstName ? str(req.body.firstName, 100) : null) : user.first_name;
    const lastName = req.body.lastName !== undefined ? (req.body.lastName ? str(req.body.lastName, 100) : null) : user.last_name;
    const bio = req.body.bio !== undefined ? (req.body.bio ? str(req.body.bio, 1000) : null) : user.bio;
    const email = req.body.email !== undefined ? (req.body.email ? str(req.body.email, 120).toLowerCase() : null) : user.email;

    if (!/^[\p{L}\p{N}_.-]{3,40}$/u.test(username)) {
      return res.status(400).json({ error: 'Benutzername: 3–40 Zeichen (Buchstaben, Zahlen, _ . -).' });
    }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'Ungültige E-Mail-Adresse.' });
    }

    const dupName = db.prepare('SELECT 1 FROM users WHERE username = ? AND id != ?').get(username, req.user.id);
    if (dupName) {
      return res.status(409).json({ error: 'Dieser Benutzername ist bereits vergeben.' });
    }

    if (email) {
      const dupEmail = db.prepare('SELECT 1 FROM users WHERE email = ? AND id != ?').get(email, req.user.id);
      if (dupEmail) {
        return res.status(409).json({ error: 'Diese E-Mail-Adresse ist bereits vergeben.' });
      }
    }

    db.prepare('UPDATE users SET username = ?, first_name = ?, last_name = ?, bio = ?, email = ? WHERE id = ?').run(
      username,
      firstName,
      lastName,
      bio,
      email,
      req.user.id
    );

    const updated = db.prepare('SELECT id, username, first_name, last_name, bio, avatar_file, email, oidc_sub FROM users WHERE id = ?').get(req.user.id);
    res.json({ ok: true, user: serializeMe(updated) });
  })
);

router.get(
  '/me/avatar',
  auth,
  wrap((req, res) => {
    const user = db.prepare('SELECT avatar_file FROM users WHERE id = ?').get(req.user.id);
    if (!user || !user.avatar_file) {
      return res.status(404).json({ error: 'Kein Profilbild vorhanden.' });
    }
    const imgPath = getImagePath(user.avatar_file);
    if (!imgPath) {
      return res.status(404).json({ error: 'Bilddatei nicht gefunden.' });
    }
    const mime = getMimeType(user.avatar_file);
    res.setHeader('Content-Type', mime);
    res.setHeader('Cache-Control', 'private, max-age=86400');
    res.sendFile(imgPath);
  })
);

router.get(
  '/users/:id/avatar',
  auth,
  wrap((req, res) => {
    const userId = Number(req.params.id);
    if (!Number.isInteger(userId)) return res.status(400).json({ error: 'Ungültige Benutzer-ID.' });
    const user = db.prepare('SELECT avatar_file FROM users WHERE id = ?').get(userId);
    if (!user || !user.avatar_file) {
      return res.status(404).json({ error: 'Kein Profilbild vorhanden.' });
    }
    const imgPath = getImagePath(user.avatar_file);
    if (!imgPath) {
      return res.status(404).json({ error: 'Bilddatei nicht gefunden.' });
    }
    const mime = getMimeType(user.avatar_file);
    res.setHeader('Content-Type', mime);
    res.setHeader('Cache-Control', 'private, max-age=86400');
    res.sendFile(imgPath);
  })
);

router.post(
  '/me/avatar',
  auth,
  wrap((req, res) => {
    const user = db.prepare('SELECT avatar_file FROM users WHERE id = ?').get(req.user.id);
    const { error, value } = saveAvatar(req.user.id, req.body.image, user ? user.avatar_file : null);
    if (error) return res.status(400).json({ error });
    db.prepare('UPDATE users SET avatar_file = ? WHERE id = ?').run(value.filename, req.user.id);
    res.json({ ok: true, avatarUrl: `api/me/avatar?t=${Date.now()}` });
  })
);

router.delete(
  '/me/avatar',
  auth,
  wrap((req, res) => {
    const user = db.prepare('SELECT avatar_file FROM users WHERE id = ?').get(req.user.id);
    if (user && user.avatar_file) {
      deleteImage(user.avatar_file);
      db.prepare('UPDATE users SET avatar_file = NULL WHERE id = ?').run(req.user.id);
    }
    res.json({ ok: true });
  })
);

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

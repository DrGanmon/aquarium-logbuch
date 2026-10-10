'use strict';
const express = require('express');
const db = require('../db');
const { isEmailAdmin } = require('../config/env');
const { hashPassword } = require('../utils/crypto');
const { wrap, str } = require('../utils/helpers');
const { auth, requireAdmin } = require('../middleware/auth');
const { deleteImage } = require('../services/image-service');
const logger = require('../utils/logger');

const router = express.Router();

router.get(
  '/users',
  auth,
  requireAdmin,
  wrap((req, res) => {
    const rows = db
      .prepare(
        `
    SELECT u.id, u.username, u.email, u.oidc_sub, u.password_hash, u.created_at,
           COUNT(a.id) AS aquarium_count
    FROM users u
    LEFT JOIN aquariums a ON a.user_id = u.id
    GROUP BY u.id
    ORDER BY u.created_at ASC, u.id ASC
  `
      )
      .all();
    res.json(
      rows.map((u) => ({
        id: u.id,
        username: u.username,
        email: u.email || null,
        oidcSub: u.oidc_sub || null,
        hasPassword: !!(u.password_hash && u.password_hash.includes(':')),
        hasOidc: !!u.oidc_sub,
        isAdmin: isEmailAdmin(u.email),
        aquariumCount: u.aquarium_count,
        createdAt: u.created_at,
      }))
    );
  })
);

router.post(
  '/users',
  auth,
  requireAdmin,
  wrap((req, res) => {
    const username = str(req.body.username, 40);
    const email = req.body.email ? str(req.body.email, 120).toLowerCase() : null;
    const oidcSub = req.body.oidcSub ? str(req.body.oidcSub, 255) : null;
    const password = typeof req.body.password === 'string' && req.body.password.length > 0 ? req.body.password : null;
    if (!/^[\p{L}\p{N}_.-]{3,40}$/u.test(username)) {
      return res.status(400).json({ error: 'Benutzername: 3–40 Zeichen (Buchstaben, Zahlen, _ . -).' });
    }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'Ungültige E-Mail-Adresse.' });
    }
    if (password && (password.length < 8 || password.length > 200)) {
      return res.status(400).json({ error: 'Das Passwort braucht mindestens 8 Zeichen.' });
    }
    if (db.prepare('SELECT 1 FROM users WHERE username = ?').get(username)) {
      return res.status(409).json({ error: 'Dieser Benutzername ist vergeben.' });
    }
    if (email && db.prepare('SELECT 1 FROM users WHERE email = ?').get(email)) {
      return res.status(409).json({ error: 'Diese E-Mail-Adresse ist bereits vergeben.' });
    }
    if (oidcSub && db.prepare('SELECT 1 FROM users WHERE oidc_sub = ?').get(oidcSub)) {
      return res.status(409).json({ error: 'Diese OIDC-Benutzer-ID (sub) ist bereits vergeben.' });
    }
    const passHash = password ? hashPassword(password) : '';
    const info = db
      .prepare('INSERT INTO users (username, password_hash, oidc_sub, email) VALUES (?, ?, ?, ?)')
      .run(username, passHash, oidcSub, email);
    res.json({ id: info.lastInsertRowid, username, email, oidcSub, isAdmin: isEmailAdmin(email) });
  })
);

router.put(
  '/users/:id',
  auth,
  requireAdmin,
  wrap((req, res) => {
    const id = Number(req.params.id);
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
    if (!user) return res.status(404).json({ error: 'Benutzer nicht gefunden.' });
    const username = str(req.body.username, 40);
    const email = req.body.email ? str(req.body.email, 120).toLowerCase() : null;
    const oidcSub = req.body.oidcSub !== undefined ? (req.body.oidcSub ? str(req.body.oidcSub, 255) : null) : undefined;
    const password = typeof req.body.password === 'string' && req.body.password.length > 0 ? req.body.password : null;
    if (!/^[\p{L}\p{N}_.-]{3,40}$/u.test(username)) {
      return res.status(400).json({ error: 'Benutzername: 3–40 Zeichen (Buchstaben, Zahlen, _ . -).' });
    }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'Ungültige E-Mail-Adresse.' });
    }
    if (password && (password.length < 8 || password.length > 200)) {
      return res.status(400).json({ error: 'Das neue Passwort braucht mindestens 8 Zeichen.' });
    }
    const existingName = db.prepare('SELECT 1 FROM users WHERE username = ? AND id != ?').get(username, id);
    if (existingName) return res.status(409).json({ error: 'Dieser Benutzername ist bereits vergeben.' });
    if (email) {
      const existingEmail = db.prepare('SELECT 1 FROM users WHERE email = ? AND id != ?').get(email, id);
      if (existingEmail) return res.status(409).json({ error: 'Diese E-Mail-Adresse ist bereits vergeben.' });
    }
    if (oidcSub) {
      const existingSub = db.prepare('SELECT 1 FROM users WHERE oidc_sub = ? AND id != ?').get(oidcSub, id);
      if (existingSub) {
        return res.status(409).json({ error: 'Diese OIDC-Benutzer-ID (sub) ist bereits einem anderen Benutzer zugeordnet.' });
      }
    }

    const finalOidcSub = oidcSub !== undefined ? oidcSub : user.oidc_sub;
    if (password) {
      db.prepare('UPDATE users SET username = ?, email = ?, oidc_sub = ?, password_hash = ? WHERE id = ?').run(
        username,
        email,
        finalOidcSub,
        hashPassword(password),
        id
      );
    } else {
      db.prepare('UPDATE users SET username = ?, email = ?, oidc_sub = ? WHERE id = ?').run(
        username,
        email,
        finalOidcSub,
        id
      );
    }
    res.json({ ok: true });
  })
);

router.delete(
  '/users/:id',
  auth,
  requireAdmin,
  wrap((req, res) => {
    const id = Number(req.params.id);
    if (req.user.id === id) {
      return res.status(400).json({ error: 'Der eigene Administrator-Account kann nicht gelöscht werden.' });
    }
    const user = db.prepare('SELECT avatar_file FROM users WHERE id = ?').get(id);
    if (!user) return res.status(404).json({ error: 'Benutzer nicht gefunden.' });
    if (user.avatar_file) {
      deleteImage(user.avatar_file);
    }
    const aqs = db.prepare('SELECT image_file FROM aquariums WHERE user_id = ? AND image_file IS NOT NULL').all(id);
    for (const a of aqs) {
      deleteImage(a.image_file);
    }
    db.prepare('DELETE FROM users WHERE id = ?').run(id);
    res.json({ ok: true });
  })
);

router.get(
  '/logs',
  auth,
  requireAdmin,
  wrap((req, res) => {
    const limit = Math.min(Math.max(Number(req.query.lines) || 200, 10), 1000);
    const logs = logger.readRecentLogs(limit);
    res.json({
      logPath: logger.getLogPath(),
      count: logs.length,
      logs,
    });
  })
);

router.delete(
  '/logs',
  auth,
  requireAdmin,
  wrap((req, res) => {
    const success = logger.clearLogs();
    if (success) {
      res.json({ ok: true, message: 'Log-Datei erfolgreich bereinigt.' });
    } else {
      res.status(500).json({ error: 'Log-Datei konnte nicht bereinigt werden.' });
    }
  })
);

module.exports = router;

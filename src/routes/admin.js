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
  wrap(async (req, res) => {
    const rows = await db.users.listForAdmin();
    res.json(
      rows.map((u) => ({
        id: u.id,
        username: u.username,
        email: u.email || null,
        oidcSub: u.oidc_sub || null,
        hasPassword: !!(u.password_hash && u.password_hash.includes(':')),
        hasOidc: !!u.oidc_sub,
        isAdmin: isEmailAdmin(u.email),
        aquariumCount: u.aquarium_count || 0,
        createdAt: u.created_at,
      }))
    );
  })
);

router.post(
  '/users',
  auth,
  requireAdmin,
  wrap(async (req, res) => {
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
    if (await db.users.findByUsername(username)) {
      return res.status(409).json({ error: 'Dieser Benutzername ist vergeben.' });
    }
    if (email && (await db.users.findByEmail(email))) {
      return res.status(409).json({ error: 'Diese E-Mail-Adresse ist bereits vergeben.' });
    }
    if (oidcSub && (await db.users.findByOidcSub(oidcSub))) {
      return res.status(409).json({ error: 'Diese OIDC-Benutzer-ID (sub) ist bereits vergeben.' });
    }
    const passHash = password ? await hashPassword(password) : '';
    const created = await db.users.create({
      username,
      password_hash: passHash,
      oidc_sub: oidcSub,
      email,
    });
    res.json({ id: created.id, username, email, oidcSub, isAdmin: isEmailAdmin(email) });
  })
);

router.put(
  '/users/:id',
  auth,
  requireAdmin,
  wrap(async (req, res) => {
    const id = Number(req.params.id);
    const user = await db.users.findById(id);
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
    const existingName = await db.users.findByUsername(username, id);
    if (existingName) return res.status(409).json({ error: 'Dieser Benutzername ist bereits vergeben.' });
    if (email) {
      const existingEmail = await db.users.findByEmail(email, id);
      if (existingEmail) return res.status(409).json({ error: 'Diese E-Mail-Adresse ist bereits vergeben.' });
    }
    if (oidcSub) {
      const existingSub = await db.users.findByOidcSub(oidcSub, id);
      if (existingSub) {
        return res.status(409).json({ error: 'Diese OIDC-Benutzer-ID (sub) ist bereits einem anderen Benutzer zugeordnet.' });
      }
    }

    const finalOidcSub = oidcSub !== undefined ? oidcSub : user.oidc_sub;
    const updateFields = {
      username,
      email,
      oidc_sub: finalOidcSub,
    };
    if (password) {
      updateFields.password_hash = await hashPassword(password);
    }
    await db.users.update(id, updateFields);
    res.json({ ok: true });
  })
);

router.delete(
  '/users/:id',
  auth,
  requireAdmin,
  wrap(async (req, res) => {
    const id = Number(req.params.id);
    if (req.user.id === id) {
      return res.status(400).json({ error: 'Der eigene Administrator-Account kann nicht gelöscht werden.' });
    }
    const user = await db.users.findById(id);
    if (!user) return res.status(404).json({ error: 'Benutzer nicht gefunden.' });
    if (user.avatar_file) {
      deleteImage(user.avatar_file);
    }
    const aqs = await db.aquariums.listForUser(id);
    for (const a of aqs) {
      if (a.image_file) {
        deleteImage(a.image_file);
      }
    }
    await db.users.delete(id);
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

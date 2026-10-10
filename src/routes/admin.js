'use strict';
const express = require('express');
const db = require('../db');
const { isEmailAdmin } = require('../config/env');
const { hashPassword } = require('../utils/crypto');
const { wrap, str } = require('../utils/helpers');
const { auth, requireAdmin } = require('../middleware/auth');
const { deleteImage } = require('../services/image-service');
const { backupService } = require('../services/backup-service');
const { mailService } = require('../services/mail-service');
const path = require('path');
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
        emailVerified: Boolean(u.email_verified),
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
    const emailVerified = req.body.emailVerified !== undefined ? Boolean(req.body.emailVerified) : true;
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
      email_verified: emailVerified ? 1 : 0,
    });
    res.json({ id: created.id, username, email, oidcSub, emailVerified: Boolean(created.email_verified), isAdmin: isEmailAdmin(email) });
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
    const emailVerified = req.body.emailVerified !== undefined ? Boolean(req.body.emailVerified) : undefined;
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
    if (emailVerified !== undefined) {
      updateFields.email_verified = emailVerified ? 1 : 0;
    }
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

/* ---------- Backup & Restore Endpunkte ---------- */

router.get(
  '/backups',
  auth,
  requireAdmin,
  wrap(async (req, res) => {
    const backups = backupService.listBackups();
    const config = backupService.getConfig();
    res.json({ backups, config });
  })
);

router.post(
  '/backups/create',
  auth,
  requireAdmin,
  wrap(async (req, res) => {
    const isDownload = req.query.download === '1' || req.body?.download === true;
    const includeFiles = req.body?.includeFiles !== undefined ? Boolean(req.body.includeFiles) : null;
    const result = await backupService.createBackup({ includeFiles });

    if (isDownload) {
      res.setHeader('Content-Type', 'application/gzip');
      res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
      return res.send(result.gzippedBuffer);
    }

    res.json({
      ok: true,
      filename: result.filename,
      size: result.size,
      createdAt: result.createdAt,
    });
  })
);

router.get(
  '/backups/:filename/download',
  auth,
  requireAdmin,
  wrap((req, res) => {
    const filename = path.basename(req.params.filename);
    const buf = backupService.getBackupBuffer(filename);
    const isGzip = filename.endsWith('.json.gz') || (buf.length >= 2 && buf[0] === 0x1f && buf[1] === 0x8b);
    res.setHeader('Content-Type', isGzip ? 'application/gzip' : 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buf);
  })
);

router.post(
  '/backups/:filename/restore',
  auth,
  requireAdmin,
  wrap(async (req, res) => {
    const filename = path.basename(req.params.filename);
    const result = await backupService.restoreFromLocalFile(filename);
    res.json({ ok: true, stats: result.stats });
  })
);

router.delete(
  '/backups/:filename',
  auth,
  requireAdmin,
  wrap((req, res) => {
    const filename = path.basename(req.params.filename);
    backupService.deleteBackup(filename);
    res.json({ ok: true });
  })
);

router.post(
  '/backups/restore-upload',
  auth,
  requireAdmin,
  wrap(async (req, res) => {
    let input = req.body;
    if (req.body && typeof req.body === 'object') {
      if (req.body.backupBase64) {
        input = Buffer.from(req.body.backupBase64, 'base64');
      } else if (req.body.backupData) {
        input = req.body.backupData;
      }
    }
    const result = await backupService.restoreBackup(input);
    res.json({ ok: true, stats: result.stats });
  })
);

router.put(
  '/backups/config',
  auth,
  requireAdmin,
  wrap((req, res) => {
    const updated = backupService.saveConfig(req.body || {});
    res.json({ ok: true, config: updated });
  })
);

/* ---------- E-Mail / SMTP Konfigurations-Endpunkte ---------- */

router.get(
  '/mail',
  auth,
  requireAdmin,
  wrap((req, res) => {
    res.json({
      config: mailService.getConfig(),
      queue: mailService.getQueueStatus(),
    });
  })
);

router.put(
  '/mail',
  auth,
  requireAdmin,
  wrap((req, res) => {
    const updated = mailService.saveConfig(req.body || {});
    res.json({ ok: true, config: updated, queue: mailService.getQueueStatus() });
  })
);

router.post(
  '/mail/test',
  auth,
  requireAdmin,
  wrap(async (req, res) => {
    const toEmail = str(req.body?.to || req.user.email, 120);
    if (!toEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(toEmail)) {
      return res.status(400).json({ error: 'Bitte gib eine gültige Empfänger-E-Mail-Adresse für den Test an.' });
    }
    try {
      const result = await mailService.sendTestEmail(toEmail, req.user.username);
      res.json({ ok: true, message: `Test-E-Mail erfolgreich an ${toEmail} gesendet.`, result });
    } catch (err) {
      res.status(500).json({ error: `SMTP-Fehler: ${err.message}` });
    }
  })
);

module.exports = router;

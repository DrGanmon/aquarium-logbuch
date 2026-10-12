import { asError } from '../utils/app-error';
import type { Request, Response } from 'express';
'use strict';
import express = require('express');
import db = require('../db');
import envModule = require('../config/env');
const { isEmailAdmin } = envModule;
import cryptoModule = require('../utils/crypto');
const { hashPassword } = cryptoModule;
import helpersModule = require('../utils/helpers');
const { wrap, str } = helpersModule;
import authModule = require('../middleware/auth');
const { auth, requireAdmin } = authModule;
import image_serviceModule = require('../services/image-service');
const { deleteImage } = image_serviceModule;
import backup_serviceModule = require('../services/backup-service');
const { backupService } = backup_serviceModule;
import mail_serviceModule = require('../services/mail-service');
const { mailService } = mail_serviceModule;
import registration_serviceModule = require('../services/registration-service');
const { registrationService } = registration_serviceModule;
import legal_config_serviceModule = require('../services/legal-config-service');
const { legalConfigService } = legal_config_serviceModule;
import path = require('path');
import logger = require('../utils/logger');

const router = express.Router();

router.get(
  '/users',
  auth,
  requireAdmin,
  wrap(async (req: Request, res: Response) => {
    const rows = await db.users.listForAdmin();
    res.json(
      rows.map((u: any) => ({
        id: u.id,
        username: u.username,
        email: u.email || null,
        emailVerified: Boolean(u.email_verified),
        oidcSub: u.oidc_sub || null,
        hasPassword: !!(u.password_hash && u.password_hash.includes(':')),
        hasOidc: !!u.oidc_sub,
        isAdmin: Boolean(u.email_verified) && isEmailAdmin(u.email),
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
  wrap(async (req: Request, res: Response) => {
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
    res.json({ id: created.id, username, email, oidcSub, emailVerified: Boolean(created.email_verified), isAdmin: Boolean(created.email_verified) && isEmailAdmin(email) });
  })
);

router.put(
  '/users/:id',
  auth,
  requireAdmin,
  wrap(async (req: Request, res: Response) => {
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
    const updateFields: Record<string, any> = {
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
  wrap(async (req: Request, res: Response) => {
    const id = Number(req.params.id);
    if (req.user.id === id) {
      return res.status(400).json({ error: 'Der eigene Administrator-Account kann nicht gelöscht werden.' });
    }
    const user = await db.users.findById(id);
    if (!user) return res.status(404).json({ error: 'Benutzer nicht gefunden.' });
    await db.users.delete(id);
    res.json({ ok: true });
  })
);

router.get(
  '/logs',
  auth,
  requireAdmin,
  wrap((req: Request, res: Response) => {
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
  wrap((req: Request, res: Response) => {
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
  wrap(async (req: Request, res: Response) => {
    const backups = backupService.listBackups();
    const config = backupService.getConfig();
    res.json({ backups, config });
  })
);

router.post(
  '/backups/create',
  auth,
  requireAdmin,
  wrap(async (req: Request, res: Response) => {
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
  wrap((req: Request, res: Response) => {
    const filename = path.basename(String(req.params.filename));
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
  wrap(async (req: Request, res: Response) => {
    const filename = path.basename(String(req.params.filename));
    const result = await backupService.restoreFromLocalFile(filename);
    res.json({ ok: true, stats: result.stats });
  })
);

router.delete(
  '/backups/:filename',
  auth,
  requireAdmin,
  wrap((req: Request, res: Response) => {
    const filename = path.basename(String(req.params.filename));
    backupService.deleteBackup(filename);
    res.json({ ok: true });
  })
);

router.post(
  '/backups/restore-upload',
  auth,
  requireAdmin,
  wrap(async (req: Request, res: Response) => {
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
  wrap((req: Request, res: Response) => {
    const updated = backupService.saveConfig(req.body || {});
    res.json({ ok: true, config: updated });
  })
);

/* ---------- E-Mail / SMTP Konfigurations-Endpunkte ---------- */

router.get(
  '/mail',
  auth,
  requireAdmin,
  wrap((req: Request, res: Response) => {
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
  wrap((req: Request, res: Response) => {
    const updated = mailService.saveConfig(req.body || {});
    res.json({ ok: true, config: updated, queue: mailService.getQueueStatus() });
  })
);

router.post(
  '/mail/test',
  auth,
  requireAdmin,
  wrap(async (req: Request, res: Response) => {
    const toEmail = str(req.body?.to || req.user.email, 120);
    if (!toEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(toEmail)) {
      return res.status(400).json({ error: 'Bitte gib eine gültige Empfänger-E-Mail-Adresse für den Test an.' });
    }
    try {
      const lang = req.body?.language || req.user.language || 'de';
      const result = await mailService.sendTestEmail(toEmail, req.user.username, lang);
      res.json({ ok: true, message: `Test-E-Mail erfolgreich an ${toEmail} gesendet.`, result });
    } catch (caught: unknown) {
      const err = asError(caught);
      res.status(500).json({ error: `SMTP-Fehler: ${err.message}` });
    }
  })
);

/* ---------- Registrierungs- & Einladungs-Verwaltung ---------- */

router.get(
  '/registration',
  auth,
  requireAdmin,
  wrap(async (req: Request, res: Response) => {
    const config = registrationService.getConfig();
    const rows = await db.invitations.listAll();
    const now = Date.now();
    const invitations = rows.map((inv: any) => {
      const isExpired = inv.expires_at < now;
      const isExhausted = inv.max_uses != null && inv.max_uses > 0 && inv.used_count >= inv.max_uses;
      let status = 'active';
      if (isExhausted) status = 'exhausted';
      else if (isExpired) status = 'expired';

      return {
        id: inv.id,
        code: inv.code,
        type: inv.type,
        email: inv.email || null,
        createdBy: inv.created_by,
        createdByUsername: inv.created_by_username || (inv.created_by ? `User #${inv.created_by}` : 'System'),
        maxUses: inv.max_uses,
        usedCount: inv.used_count,
        expiresAt: inv.expires_at,
        note: inv.note || null,
        createdAt: inv.created_at,
        status,
      };
    });

    res.json({ config, invitations });
  })
);

router.put(
  '/registration/config',
  auth,
  requireAdmin,
  wrap((req: Request, res: Response) => {
    const updated = registrationService.saveConfig(req.body || {});
    res.json({ ok: true, config: updated });
  })
);

router.post(
  '/invitations',
  auth,
  requireAdmin,
  wrap(async (req: Request, res: Response) => {
    const type = req.body.type === 'mail' ? 'mail' : 'code';
    const customCode = req.body.code ? str(req.body.code, 64).trim().toUpperCase() : null;
    const email = req.body.email ? str(req.body.email, 120).trim().toLowerCase() : null;
    const maxUses = req.body.maxUses !== undefined ? Math.max(0, Number(req.body.maxUses)) : 1;
    const days = Math.max(1, Math.min(3650, Number(req.body.days) || 14));
    const note = req.body.note ? str(req.body.note, 200).trim() : null;

    if (type === 'mail') {
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return res.status(400).json({ error: 'Gültige Empfänger-E-Mail-Adresse erforderlich.' });
      }
      const existingUser = await db.users.findByEmail(email);
      if (existingUser) {
        return res.status(409).json({ error: 'Ein Benutzer mit dieser E-Mail-Adresse ist bereits registriert.' });
      }

      // Mail Einladungen sind maximal 14 Tage gültig
      const mailDays = Math.min(14, days);
      const expiresAt = Date.now() + mailDays * 24 * 3600 * 1000;
      const code = customCode || registrationService.generateInviteToken();

      const inv = await db.invitations.create({
        code,
        type: 'mail',
        email,
        created_by: req.user.id,
        max_uses: 1,
        used_count: 0,
        expires_at: expiresAt,
        note,
      });
    if (!inv) return res.status(500).json({ error: 'Einladung konnte nicht geladen werden.' });

      const inviteLang = req.body.language || req.user.language || 'de';
      const expiresDateStr = new Date(expiresAt).toLocaleDateString(inviteLang === 'en' ? 'en-US' : 'de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
      mailService.sendInvitationEmail({
        to: email,
        inviterName: [req.user.first_name, req.user.last_name].filter(Boolean).join(' ') || req.user.username || 'Administrator',
        inviteCode: code,
        expiresDays: mailDays,
        expiresDate: expiresDateStr,
        lang: inviteLang,
      });

      return res.json({
        ok: true,
        invitation: {
          id: inv.id,
          code: inv.code,
          type: inv.type,
          email: inv.email,
          maxUses: inv.max_uses,
          usedCount: inv.used_count,
          expiresAt: inv.expires_at,
          status: 'active',
          createdAt: inv.created_at,
        },
        message: `Einladungs-E-Mail erfolgreich an ${email} versendet.`,
      });
    }

    // Type === 'code'
    if (customCode) {
      const existing = await db.invitations.findByCode(customCode);
      if (existing) {
        return res.status(409).json({ error: 'Dieser Einladungscode existiert bereits.' });
      }
    }

    const code = customCode || registrationService.generateInviteCode();
    const expiresAt = Date.now() + days * 24 * 3600 * 1000;

    const inv = await db.invitations.create({
      code,
      type: 'code',
      email: null,
      created_by: req.user.id,
      max_uses: maxUses, // 0 = unbegrenzt, sonst feste Anzahl
      used_count: 0,
      expires_at: expiresAt,
      note,
    });
    if (!inv) return res.status(500).json({ error: 'Einladung konnte nicht geladen werden.' });

    res.json({
      ok: true,
      invitation: {
        id: inv.id,
        code: inv.code,
        type: inv.type,
        email: null,
        maxUses: inv.max_uses,
        usedCount: inv.used_count,
        expiresAt: inv.expires_at,
        status: 'active',
        createdAt: inv.created_at,
      },
      message: 'Einladungscode erfolgreich erstellt.',
    });
  })
);

router.delete(
  '/invitations/:id',
  auth,
  requireAdmin,
  wrap(async (req: Request, res: Response) => {
    const id = Number(req.params.id);
    const deleted = await db.invitations.delete(id);
    if (!deleted) {
      return res.status(404).json({ error: 'Einladung nicht gefunden.' });
    }
    res.json({ ok: true });
  })
);

/* ---------- Rechtliches & Kontakt-E-Mails Konfiguration ---------- */

router.get(
  '/legal-config',
  auth,
  requireAdmin,
  wrap((req: Request, res: Response) => {
    res.json({
      config: legalConfigService.getConfig(),
    });
  })
);

router.put(
  '/legal-config',
  auth,
  requireAdmin,
  wrap((req: Request, res: Response) => {
    try {
      const updated = legalConfigService.saveConfig(req.body || {});
      res.json({ ok: true, config: updated });
    } catch (caught: unknown) {
      const err = asError(caught);
      res.status(400).json({ error: err.message });
    }
  })
);

export = router;

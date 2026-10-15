import express from 'express';
import type { Request, Response, RequestHandler } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import db = require('../db');
import envModule = require('../config/env');
import cryptoModule = require('../utils/crypto');
import cookiesModule = require('../utils/cookies');
import mailModule = require('../services/mail-service');
import backupModule = require('../services/backup-service');
import registrationModule = require('../services/registration-service');
import { TERMS_VERSION } from '../services/terms-service';
import { AppError } from '../utils/app-error';

const { DATA_DIR, LOCAL_LOGIN } = envModule;
const { hashPassword } = cryptoModule;
const { startSession } = cookiesModule;
const { mailService } = mailModule;
const { backupService } = backupModule;
const { registrationService, VALID_MODES } = registrationModule;
const router = express.Router();
const lockFile = path.join(DATA_DIR, '.setup.lock');
const wrap = (handler: RequestHandler): RequestHandler => async (req, res, next) => { try { await handler(req, res, next); } catch (error) { next(error); } };

router.get('/status', wrap(async (_req: Request, res: Response) => {
  res.setHeader('Cache-Control', 'no-store').json({ required: Number(await db.users.count()) === 0, localLogin: LOCAL_LOGIN, termsVersion: TERMS_VERSION });
}));

router.post('/complete', wrap(async (req: Request, res: Response) => {
  const username = typeof req.body.username === 'string' ? req.body.username.trim() : '';
  const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  const password = typeof req.body.password === 'string' ? req.body.password : '';
  const language = req.body.language === 'en' ? 'en' : 'de';
  const smtp = req.body.smtp && typeof req.body.smtp === 'object' ? req.body.smtp : {};
  const backup = req.body.backup && typeof req.body.backup === 'object' ? req.body.backup : {};
  const registration = req.body.registration && typeof req.body.registration === 'object' ? req.body.registration : {};
  if (!LOCAL_LOGIN) throw new AppError('Für die Ersteinrichtung muss LOCAL_LOGIN aktiviert sein.', 400);
  if (!/^[\p{L}\p{N}_.-]{3,40}$/u.test(username)) throw new AppError('Benutzername: 3–40 Zeichen (Buchstaben, Zahlen, _ . -).', 400);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new AppError('Ungültige E-Mail-Adresse.', 400);
  if (password.length < 8 || password.length > 200) throw new AppError('Das Passwort braucht 8 bis 200 Zeichen.', 400);
  if (req.body.acceptTerms !== true || req.body.termsVersion !== TERMS_VERSION) throw new AppError('Bitte die aktuellen AGB akzeptieren.', 400);
  if (smtp.enabled && (!String(smtp.host || '').trim() || !String(smtp.from || '').trim())) throw new AppError('Für aktives SMTP werden Host und Absender benötigt.', 400);
  if (smtp.enabled && (!Number.isInteger(Number(smtp.port)) || Number(smtp.port) < 1 || Number(smtp.port) > 65535)) throw new AppError('Ungültiger SMTP-Port.', 400);
  if (backup.enabled && (typeof backup.password !== 'string' || backup.password.length < 12)) throw new AppError('Für automatische Backups wird ein Passwort mit mindestens 12 Zeichen benötigt.', 400);
  if (!VALID_MODES.includes(registration.mode)) throw new AppError('Bitte einen gültigen Registrierungsmodus auswählen.', 400);

  fs.mkdirSync(DATA_DIR, { recursive: true });
  let lock: number;
  try { lock = fs.openSync(lockFile, 'wx', 0o600); }
  catch { throw new AppError('Die Ersteinrichtung wird bereits ausgeführt.', 409); }
  try {
    if (Number(await db.users.count()) !== 0) throw new AppError('Die Ersteinrichtung wurde bereits abgeschlossen.', 409);
    mailService.saveConfig({ enabled: Boolean(smtp.enabled), host: smtp.host, port: smtp.port, secure: smtp.secure,
      requireTls: smtp.requireTls, rejectUnauthorized: smtp.rejectUnauthorized, user: smtp.user, pass: smtp.pass, from: smtp.from });
    await backupService.saveAdminConfig({ enabled: Boolean(backup.enabled), intervalHours: backup.intervalHours,
      retentionCount: backup.retentionCount, includeFiles: backup.includeFiles, password: backup.password });
    registrationService.saveConfig({ mode: registration.mode });
    const user = await db.users.create({ username, email, password_hash: await hashPassword(password), email_verified: 1, is_admin: 1,
      language, terms_version: TERMS_VERSION, terms_accepted_at: new Date().toISOString() });
    await startSession(res, db, user.id);
    res.status(201).json({ ok: true });
  } finally {
    fs.closeSync(lock); try { fs.unlinkSync(lockFile); } catch { /* Lock is best-effort cleanup. */ }
  }
}));

export = router;

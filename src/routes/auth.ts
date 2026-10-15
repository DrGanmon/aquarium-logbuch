import { personalAiToken, personalAiMask } from '../services/ai-token-crypto';
import { asRecord } from '../utils/validation';
import { asError } from '../utils/app-error';
import type { Request, Response } from 'express';
import express = require('express');
import crypto = require('crypto');
import db = require('../db');
const {
  LOCAL_LOGIN,
  ALLOW_REGISTRATION,
  OIDC_ENABLED,
  OIDC_PROVIDER_NAME,
  isEmailAdmin,
  APP_URL,
  DEFAULT_AI_PROVIDER,
  OPENAI_API_KEY,
  OPENAI_MODEL,
  GEMINI_API_KEY,
  GEMINI_MODEL,
  CLAUDE_API_KEY,
  CLAUDE_MODEL,
} = require('../config/env');
import oidc_serviceModule = require('../services/oidc-service');
const { oidc } = oidc_serviceModule;
import cryptoModule = require('../utils/crypto');
const { hashPassword, verifyPassword, DUMMY_HASH, hasLocalPassword, sha } = cryptoModule;
import rate_limitModule = require('../utils/rate-limit');
const { checkAndNoteAttempt, clearAttempts } = rate_limitModule;
import cookiesModule = require('../utils/cookies');
const { parseCookies, setSessionCookie, clearSessionCookie, startSession, setCookie } = cookiesModule;
import helpersModule = require('../utils/helpers');
const { wrap, str } = helpersModule;
import authModule = require('../middleware/auth');
const { auth } = authModule;
import image_serviceModule = require('../services/image-service');
const { saveAvatar, deleteImage, getImagePath, getMimeType } = image_serviceModule;
import mail_serviceModule = require('../services/mail-service');
const { mailService } = mail_serviceModule;
import { TERMS_VERSION, acceptsCurrentTerms, currentTerms } from '../services/terms-service';
import registration_serviceModule = require('../services/registration-service');
const { registrationService } = registration_serviceModule;
const {
  testAiConnection,
  testOpenAiConnection,
  testGeminiConnection,
  testClaudeConnection,
  fetchOpenAiModels,
  fetchGeminiModels,
  fetchClaudeModels,
  fetchProviderModels,
} = require('../services/ai-chat-service');

const router = express.Router();

function serializeMe(u?: any) {
  let selectedTests = null;
  if (u.selected_tests) {
    try {
      selectedTests = typeof u.selected_tests === 'string' ? JSON.parse(u.selected_tests) : u.selected_tests;
    } catch {
      selectedTests = null;
    }
  }
  const regConfig = registrationService.getConfig();
  const isAdmin = Boolean(u.email_verified) && isEmailAdmin(u.email);

  const storedOpenaiKey = (u.openai_api_key || '').trim();
  const storedGeminiKey = (u.gemini_api_key || '').trim();
  const storedClaudeKey = (u.claude_api_key || '').trim();

  const activeProvider = u.ai_provider || (storedClaudeKey ? 'claude' : (storedGeminiKey ? 'gemini' : (storedOpenaiKey ? 'openai' : (DEFAULT_AI_PROVIDER || 'openai'))));

  const hasOpenai = Boolean(storedOpenaiKey || OPENAI_API_KEY);
  const hasGemini = Boolean(storedGeminiKey || GEMINI_API_KEY);
  const hasClaude = Boolean(storedClaudeKey || CLAUDE_API_KEY);
  const hasAnyKey = Boolean(hasOpenai || hasGemini || hasClaude);

  return {
    termsRequired: u.terms_version !== TERMS_VERSION || !u.terms_accepted_at,
    id: u.id,
    username: u.username,
    firstName: u.first_name || '',
    lastName: u.last_name || '',
    bio: u.bio || '',
    hasAvatar: !!u.avatar_file,
    avatarUrl: u.avatar_file ? `api/me/avatar` : null,
    selectedSuite: u.selected_suite || 'jbl-pro',
    selectedTests: selectedTests,
    defaultGraphRange: u.default_graph_range || '90',
    language: u.language || 'de',
    email: u.email || null,
    emailVerified: Boolean(u.email_verified),
    registration: ALLOW_REGISTRATION && !regConfig.isClosed,
    registrationMode: regConfig.mode,
    canInvite: registrationService.canUserInvite(u, isAdmin),
    userCodeMaxDays: regConfig.userCodeMaxDays,
    hasPassword: LOCAL_LOGIN && hasLocalPassword(u),
    hasOidc: !!u.oidc_sub,
    oidcSub: u.oidc_sub || null,
    oidcEnabled: OIDC_ENABLED,
    oidcProviderName: OIDC_PROVIDER_NAME,

    // KI-Assistent & Multi-Provider Status
    aiProvider: activeProvider,
    hasAiKey: hasAnyKey,
    hasAnyAiKey: hasAnyKey,

    // OpenAI
    hasOpenaiKey: hasOpenai,
    openaiKeySet: Boolean(storedOpenaiKey),
    openaiKeyMasked: personalAiMask(u, 'openai', OPENAI_API_KEY),
    openaiModel: u.openai_model || OPENAI_MODEL || 'gpt-4o-mini',
    serverHasOpenaiKey: Boolean(OPENAI_API_KEY),

    // Google Gemini
    hasGeminiKey: hasGemini,
    geminiKeySet: Boolean(storedGeminiKey),
    geminiKeyMasked: personalAiMask(u, 'gemini', GEMINI_API_KEY),
    geminiModel: u.gemini_model || GEMINI_MODEL || 'gemini-2.5-flash',
    serverHasGeminiKey: Boolean(GEMINI_API_KEY),

    // Anthropic Claude
    hasClaudeKey: hasClaude,
    claudeKeySet: Boolean(storedClaudeKey),
    claudeKeyMasked: personalAiMask(u, 'claude', CLAUDE_API_KEY),
    claudeModel: u.claude_model || CLAUDE_MODEL || 'claude-3-5-haiku-20241022',
    serverHasClaudeKey: Boolean(CLAUDE_API_KEY),

    isAdmin,
  };
}

router.post(
  '/register',
  wrap(async (req: Request, res: Response) => {
    const regConfig = registrationService.getConfig();
    if (regConfig.isClosed || !ALLOW_REGISTRATION) {
      return res.status(403).json({ error: 'Die Registrierung ist derzeit geschlossen.' });
    }
    if (!LOCAL_LOGIN) {
      return res.status(403).json({ error: 'Lokale Registrierung ist deaktiviert.' });
    }

    if (!acceptsCurrentTerms(req.body)) return res.status(400).json({ error: 'Bitte die aktuellen AGB ausdrücklich akzeptieren.' });

    const registerKey = `register|${req.ip}`;
    if (await checkAndNoteAttempt(registerKey, 30)) return res.status(429).json({ error: 'Zu viele Registrierungsversuche. Bitte später erneut versuchen.' });
    const username = str(req.body.username, 40);
    const email = req.body.email ? str(req.body.email, 120).toLowerCase() : null;
    const password = typeof req.body.password === 'string' ? req.body.password : '';
    const inviteCodeRaw = req.body.inviteCode || req.body.code || req.body.invite || req.body.inviteToken || '';
    const inviteCode = str(inviteCodeRaw, 128).trim();

    if (!/^[\p{L}\p{N}_.-]{3,40}$/u.test(username)) {
      return res.status(400).json({ error: 'Benutzername: 3–40 Zeichen (Buchstaben, Zahlen, _ . -).' });
    }
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'Gültige E-Mail-Adresse ist erforderlich.' });
    }
    if (password.length < 8 || password.length > 200) {
      return res.status(400).json({ error: 'Das Passwort braucht mindestens 8 Zeichen.' });
    }
    if (await db.users.findByUsername(username)) {
      return res.status(409).json({ error: 'Dieser Benutzername ist vergeben.' });
    }
    if (await db.users.findByEmail(email)) {
      return res.status(409).json({ error: 'Diese E-Mail-Adresse ist bereits vergeben.' });
    }

    let invitation = null;
    if (regConfig.isInviteOnly) {
      if (!inviteCode) {
        return res.status(400).json({ error: 'Ein gültiger Einladungscode ist für die Registrierung erforderlich.' });
      }
      invitation = await db.invitations.findByCode(inviteCode);
      if (!invitation) {
        return res.status(400).json({ error: 'Ungültiger Einladungscode.' });
      }
      if (invitation.expires_at < Date.now()) {
        return res.status(400).json({ error: 'Dieser Einladungscode ist abgelaufen.' });
      }
      if (invitation.max_uses != null && invitation.max_uses > 0 && invitation.used_count >= invitation.max_uses) {
        return res.status(400).json({ error: 'Dieser Einladungscode wurde bereits vollständig eingelöst.' });
      }
      if (invitation.type === 'mail' && invitation.email) {
        if (invitation.email.toLowerCase() !== email.toLowerCase()) {
          return res.status(400).json({ error: `Dieser Einladungscode ist nur für die E-Mail-Adresse ${invitation.email} gültig.` });
        }
      }
    } else if (inviteCode) {
      // Auch im offenen Modus optionalen Einladungscode prüfen und anrechnen
      invitation = await db.invitations.findByCode(inviteCode);
      if (invitation) {
        if (invitation.expires_at < Date.now() || (invitation.max_uses != null && invitation.max_uses > 0 && invitation.used_count >= invitation.max_uses)) {
          invitation = null;
        } else if (invitation.type === 'mail' && invitation.email && invitation.email.toLowerCase() !== email.toLowerCase()) {
          invitation = null;
        }
      }
    }

    const inviter = invitation?.created_by ? await db.users.findById(invitation.created_by) : null;
    const trustedInvite = inviter && inviter.email_verified && isEmailAdmin(inviter.email);
    const isMailInviteVerified = trustedInvite && invitation && invitation.type === 'mail' && invitation.email && invitation.email.toLowerCase() === email.toLowerCase();
    const emailVerified = isMailInviteVerified ? 1 : 0;
    let verifyToken = null;
    let verifyExpires = null;

    if (!emailVerified) {
      verifyToken = crypto.randomBytes(32).toString('hex');
      verifyExpires = Date.now() + 24 * 3600 * 1000; // 24 Stunden
    }

    const language = (req.body.language === 'en' || String(req.headers['x-language']).toLowerCase() === 'en' || (req.headers['accept-language'] && req.headers['accept-language'].startsWith('en'))) ? 'en' : 'de';

    const passwordHash = await hashPassword(password);
    if (invitation && !(await db.invitations.use(invitation.id))) {
      return res.status(400).json({ error: 'Dieser Einladungscode wurde bereits eingelöst oder ist abgelaufen.' });
    }
    let user;
    try { user = await db.users.create({
      username,
      password_hash: passwordHash,
      email,
      email_verified: emailVerified,
      email_verify_token: verifyToken,
      email_verify_expires: verifyExpires,
      language, terms_version: TERMS_VERSION, terms_accepted_at: new Date().toISOString(),
    }); } catch (error) {
      if (invitation) await db.invitations.releaseUse(invitation.id);
      const code = asRecord(error).code;
      if (code === 11000 || code === 'SQLITE_CONSTRAINT_UNIQUE') {
        return res.status(409).json({ error: 'Benutzername oder E-Mail-Adresse bereits vergeben.' });
      }
      throw error;
    }

    if (emailVerified) {
      await startSession(res, db, user.id);
      return res.json({ id: user.id, username, email, needsVerification: false });
    }

    // Bestätigungs-E-Mail versenden
    mailService.sendVerificationEmail(user, verifyToken, language);

    res.json({
      id: user.id,
      username,
      email,
      needsVerification: true,
      message: 'Konto erfolgreich erstellt! Wir haben dir einen Bestätigungslink per E-Mail gesendet. Bitte bestätige deine E-Mail-Adresse vor der ersten Anmeldung.',
    });
  })
);

router.post(
  '/login',
  wrap(async (req: Request, res: Response) => {
    if (!LOCAL_LOGIN) {
      return res.status(403).json({ error: `Bitte über ${OIDC_PROVIDER_NAME} anmelden.` });
    }
    const username = str(req.body.username, 120);
    const password = typeof req.body.password === 'string' ? req.body.password : '';
    if (password.length > 200) return res.status(400).json({ error: 'Das Passwort darf höchstens 200 Zeichen enthalten.' });
    const key = `${req.ip}|${username.toLowerCase()}`;
    if (await checkAndNoteAttempt(key)) {
      return res.status(429).json({ error: 'Zu viele Versuche. Bitte in ein paar Minuten erneut probieren.' });
    }
    const user = (await db.users.findByUsername(username)) || (await db.users.findByEmail(username));
    const ok = (await verifyPassword(password, user ? user.password_hash : DUMMY_HASH)) && !!user;
    if (!ok) {
      return res.status(401).json({ error: 'Benutzername oder Passwort stimmt nicht.' });
    }

    // Auch Administratoren müssen ihre E-Mail-Adresse bestätigen.
    if (!user.email_verified) {
      return res.status(403).json({
        error: 'Bitte bestätige zuerst deine E-Mail-Adresse über den Link in deiner E-Mail.',
        unverified: true,
        email: user.email,
      });
    }

    await clearAttempts(key);
    await startSession(res, db, user.id);
    res.json({ id: user.id, username: user.username });
  })
);

router.post(
  '/logout',
  wrap(async (req: Request, res: Response) => {
    const token = parseCookies(req).session;
    let idToken = null;
    if (token) {
      const session = await db.sessions.find(sha(token));
      idToken = session?.id_token || null;
      await db.sessions.delete(sha(token));
    }
    setSessionCookie(res, '', 0);
    // Bei OIDC-Sitzungen auch beim Anbieter abmelden
    const redirect = idToken && oidc ? await oidc.logoutUrl(idToken, `${APP_URL}/`) : null;
    res.json({ ok: true, redirect });
  })
);

router.get(
  '/me',
  auth,
  wrap(async (req: Request, res: Response) => {
    const u = await db.users.findById(req.user.id);
    if (!u) return res.status(404).json({ error: 'Benutzer nicht gefunden.' });
    res.json(serializeMe(u));
  })
);

router.post('/me/terms', auth, wrap(async (req: Request, res: Response) => {
  if (!acceptsCurrentTerms(req.body)) return res.status(400).json({ error: 'Bitte den aktuellen AGB ausdrücklich zustimmen.' });
  const user = await db.users.findById(req.user.id);
  if (!user) return res.status(401).json({ error: 'Benutzer nicht gefunden.' });
  if (user.terms_version !== TERMS_VERSION || !user.terms_accepted_at)
    await db.users.update(req.user.id, { terms_version: TERMS_VERSION, terms_accepted_at: new Date().toISOString() });
  res.json({ user: serializeMe(await db.users.findById(req.user.id)) });
}));

router.put(
  ['/me', '/me/profile'],
  auth,
  wrap(async (req: Request, res: Response) => {
    const user = await db.users.findById(req.user.id);
    if (!user) return res.status(404).json({ error: 'Benutzer nicht gefunden.' });

    const username = req.body.username !== undefined ? str(req.body.username, 40) : user.username;
    const firstName = req.body.firstName !== undefined ? (req.body.firstName ? str(req.body.firstName, 100) : null) : user.first_name;
    const lastName = req.body.lastName !== undefined ? (req.body.lastName ? str(req.body.lastName, 100) : null) : user.last_name;
    const bio = req.body.bio !== undefined ? (req.body.bio ? str(req.body.bio, 1000) : null) : user.bio;
    const email = req.body.email !== undefined ? (req.body.email ? str(req.body.email, 120).toLowerCase() : null) : user.email;
    const defaultGraphRange = req.body.defaultGraphRange !== undefined ? (req.body.defaultGraphRange ? str(req.body.defaultGraphRange, 10) : '90') : user.default_graph_range;
    const language = req.body.language !== undefined ? (req.body.language === 'en' ? 'en' : 'de') : user.language;

    if (!/^[\p{L}\p{N}_.-]{3,40}$/u.test(username)) {
      return res.status(400).json({ error: 'Benutzername: 3–40 Zeichen (Buchstaben, Zahlen, _ . -).' });
    }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'Ungültige E-Mail-Adresse.' });
    }

    const dupName = await db.users.findByUsername(username, req.user.id);
    if (dupName) {
      return res.status(409).json({ error: 'Dieser Benutzername ist bereits vergeben.' });
    }

    if (email) {
      const dupEmail = await db.users.findByEmail(email, req.user.id);
      if (dupEmail) {
        return res.status(409).json({ error: 'Diese E-Mail-Adresse ist bereits vergeben.' });
      }
    }

    const emailChanged = email !== user.email;
    const verifyToken = emailChanged && email ? crypto.randomBytes(32).toString('hex') : null;
    await db.users.update(req.user.id, {
      ...(emailChanged ? { email_verified: 0, email_verify_token: verifyToken, email_verify_expires: verifyToken ? Date.now() + 24 * 3600 * 1000 : null } : {}),
      username,
      first_name: firstName,
      last_name: lastName,
      bio,
      email,
      default_graph_range: defaultGraphRange,
      language,
    });

    const updated = await db.users.findById(req.user.id);
    if (verifyToken) mailService.sendVerificationEmail(updated, verifyToken, language);
    res.json({ ok: true, user: serializeMe(updated), needsVerification: Boolean(verifyToken), ...(verifyToken ? { message: language === 'en' ? 'Profile saved. Please confirm your new email address using the email link.' : 'Profil gespeichert. Bitte bestätige deine neue E-Mail-Adresse über den Link in der E-Mail.' } : {}) });
  })
);

router.get(
  '/me/avatar',
  auth,
  wrap(async (req: Request, res: Response) => {
    const user = await db.users.findById(req.user.id);
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
  wrap(async (req: Request, res: Response) => {
    const userId = Number(req.params.id);
    if (!Number.isInteger(userId)) return res.status(400).json({ error: 'Ungültige Benutzer-ID.' });
    const user = await db.users.findById(userId);
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
  wrap(async (req: Request, res: Response) => {
    const user = await db.users.findById(req.user.id);
    const { error, value } = await saveAvatar(req.user.id, req.body.image, user ? user.avatar_file : null);
    if (error !== undefined) return res.status(400).json({ error });
    await db.users.update(req.user.id, { avatar_file: value.filename });
    res.json({ ok: true, avatarUrl: `api/me/avatar?t=${Date.now()}` });
  })
);

router.delete(
  '/me/avatar',
  auth,
  wrap(async (req: Request, res: Response) => {
    const user = await db.users.findById(req.user.id);
    if (user && user.avatar_file) {
      deleteImage(user.avatar_file);
      await db.users.update(req.user.id, { avatar_file: null });
    }
    res.json({ ok: true });
  })
);

router.post(
  '/me/unlink-oidc',
  auth,
  wrap(async (req: Request, res: Response) => {
    const user = await db.users.findById(req.user.id);
    const hasPw = hasLocalPassword(user);
    if (!hasPw) {
      return res.status(400).json({ error: 'Ohne lokales Passwort kann die OIDC-Verknüpfung nicht getrennt werden.' });
    }
    await db.users.update(req.user.id, { oidc_sub: null });
    res.json({ ok: true });
  })
);

/* ---------- KI-Assistent & Sprachmodelle API-Schlüssel & Modellverwaltung ---------- */

router.put(
  ['/me/ai', '/me/ai-settings'],
  auth,
  wrap(async (req: Request, res: Response) => {
    const user = await db.users.findById(req.user.id);
    if (!user) return res.status(404).json({ error: 'Benutzer nicht gefunden.' });

    const updates: Record<string, any> = {};

    if (req.body.provider !== undefined) {
      const p = req.body.provider === null || req.body.provider === '' ? null : str(req.body.provider, 20).toLowerCase().trim();
      if (p && !['openai', 'gemini', 'claude'].includes(p)) {
        return res.status(400).json({ error: 'Ungültiger KI-Anbieter. Erlaubt sind openai, gemini oder claude.' });
      }
      updates.ai_provider = p;
    }

    // OpenAI
    if (req.body.openaiApiKey !== undefined) {
      updates.openai_api_key = req.body.openaiApiKey ? str(req.body.openaiApiKey, 500).trim() : null;
    }
    if (req.body.openaiModel !== undefined) {
      updates.openai_model = req.body.openaiModel ? str(req.body.openaiModel, 100).trim() : null;
    }

    // Google Gemini
    if (req.body.geminiApiKey !== undefined) {
      updates.gemini_api_key = req.body.geminiApiKey ? str(req.body.geminiApiKey, 500).trim() : null;
    }
    if (req.body.geminiModel !== undefined) {
      updates.gemini_model = req.body.geminiModel ? str(req.body.geminiModel, 100).trim() : null;
    }

    // Anthropic Claude
    if (req.body.claudeApiKey !== undefined) {
      updates.claude_api_key = req.body.claudeApiKey ? str(req.body.claudeApiKey, 500).trim() : null;
    }
    if (req.body.claudeModel !== undefined) {
      updates.claude_model = req.body.claudeModel ? str(req.body.claudeModel, 100).trim() : null;
    }

    if (Object.keys(updates).length > 0) {
      await db.users.update(req.user.id, updates);
    }

    const updated = await db.users.findById(req.user.id);
    res.json({
      ok: true,
      message: 'KI-Einstellungen erfolgreich gespeichert.',
      user: serializeMe(updated),
    });
  })
);

router.put(
  ['/me/openai', '/me/openai-key'],
  auth,
  wrap(async (req: Request, res: Response) => {
    const user = await db.users.findById(req.user.id);
    if (!user) return res.status(404).json({ error: 'Benutzer nicht gefunden.' });

    const rawKey = req.body.apiKey !== undefined ? req.body.apiKey : req.body.key;
    let apiKey = undefined;
    if (rawKey !== undefined) {
      apiKey = rawKey === null || rawKey === '' ? null : str(rawKey, 500).trim();
    }

    const rawModel = req.body.model;
    let model = undefined;
    if (rawModel !== undefined) {
      model = rawModel === null || rawModel === '' ? null : str(rawModel, 100).trim();
    }

    const updates: Record<string, any> = {};
    if (apiKey !== undefined) updates.openai_api_key = apiKey;
    if (model !== undefined) updates.openai_model = model;
    if (req.body.setAsActive) updates.ai_provider = 'openai';

    if (Object.keys(updates).length > 0) {
      await db.users.update(req.user.id, updates);
    }

    const updated = await db.users.findById(req.user.id);
    res.json({
      ok: true,
      message: 'OpenAI-Einstellungen erfolgreich gespeichert.',
      user: serializeMe(updated),
    });
  })
);

router.delete(
  ['/me/openai', '/me/openai-key'],
  auth,
  wrap(async (req: Request, res: Response) => {
    const user = await db.users.findById(req.user.id);
    if (!user) return res.status(404).json({ error: 'Benutzer nicht gefunden.' });

    await db.users.update(req.user.id, {
      openai_api_key: null,
      openai_model: null,
    });

    const updated = await db.users.findById(req.user.id);
    res.json({
      ok: true,
      message: 'OpenAI API-Schlüssel entfernt.',
      user: serializeMe(updated),
    });
  })
);

router.post(
  '/me/openai/test',
  auth,
  wrap(async (req: Request, res: Response) => {
    const user = await db.users.findById(req.user.id);
    const keyToTest = (req.body?.apiKey || personalAiToken(user, 'openai') || OPENAI_API_KEY || '').trim();
    const modelToTest = (req.body?.model || user?.openai_model || OPENAI_MODEL || 'gpt-4o-mini').trim();

    if (!keyToTest) {
      return res.status(400).json({ error: 'Kein OpenAI API-Schlüssel zum Testen übergeben oder hinterlegt.' });
    }

    try {
      const result = await testOpenAiConnection(keyToTest, modelToTest);
      res.json(result);
    } catch (caught: unknown) {
      const err = asError(caught);
      res.status(400).json({ error: err.message });
    }
  })
);

router.post(
  '/me/openai/models',
  auth,
  wrap(async (req: Request, res: Response) => {
    const user = await db.users.findById(req.user.id);
    const keyToUse = (req.body?.apiKey || personalAiToken(user, 'openai') || OPENAI_API_KEY || '').trim();
    if (!keyToUse) {
      return res.status(400).json({ error: 'Bitte gib zuerst einen OpenAI API-Schlüssel ein, um die verfügbaren Modelle abzufragen.' });
    }
    try {
      const models = await fetchOpenAiModels(keyToUse);
      res.json({ ok: true, provider: 'openai', models });
    } catch (caught: unknown) {
      const err = asError(caught);
      res.status(400).json({ error: err.message });
    }
  })
);

// Google Gemini
router.put(
  ['/me/gemini', '/me/gemini-key'],
  auth,
  wrap(async (req: Request, res: Response) => {
    const user = await db.users.findById(req.user.id);
    if (!user) return res.status(404).json({ error: 'Benutzer nicht gefunden.' });

    const rawKey = req.body.apiKey !== undefined ? req.body.apiKey : req.body.key;
    let apiKey = undefined;
    if (rawKey !== undefined) {
      apiKey = rawKey === null || rawKey === '' ? null : str(rawKey, 500).trim();
    }

    const rawModel = req.body.model;
    let model = undefined;
    if (rawModel !== undefined) {
      model = rawModel === null || rawModel === '' ? null : str(rawModel, 100).trim();
    }

    const updates: Record<string, any> = {};
    if (apiKey !== undefined) updates.gemini_api_key = apiKey;
    if (model !== undefined) updates.gemini_model = model;
    if (req.body.setAsActive) updates.ai_provider = 'gemini';

    if (Object.keys(updates).length > 0) {
      await db.users.update(req.user.id, updates);
    }

    const updated = await db.users.findById(req.user.id);
    res.json({
      ok: true,
      message: 'Google Gemini Einstellungen erfolgreich gespeichert.',
      user: serializeMe(updated),
    });
  })
);

router.delete(
  ['/me/gemini', '/me/gemini-key'],
  auth,
  wrap(async (req: Request, res: Response) => {
    const user = await db.users.findById(req.user.id);
    if (!user) return res.status(404).json({ error: 'Benutzer nicht gefunden.' });

    await db.users.update(req.user.id, {
      gemini_api_key: null,
      gemini_model: null,
    });

    const updated = await db.users.findById(req.user.id);
    res.json({
      ok: true,
      message: 'Google Gemini API-Schlüssel entfernt.',
      user: serializeMe(updated),
    });
  })
);

router.post(
  '/me/gemini/test',
  auth,
  wrap(async (req: Request, res: Response) => {
    const user = await db.users.findById(req.user.id);
    const keyToTest = (req.body?.apiKey || personalAiToken(user, 'gemini') || GEMINI_API_KEY || '').trim();
    const modelToTest = (req.body?.model || user?.gemini_model || GEMINI_MODEL || 'gemini-2.5-flash').trim();

    if (!keyToTest) {
      return res.status(400).json({ error: 'Kein Google Gemini API-Schlüssel zum Testen übergeben oder hinterlegt.' });
    }

    try {
      const result = await testGeminiConnection(keyToTest, modelToTest);
      res.json(result);
    } catch (caught: unknown) {
      const err = asError(caught);
      res.status(400).json({ error: err.message });
    }
  })
);

router.post(
  '/me/gemini/models',
  auth,
  wrap(async (req: Request, res: Response) => {
    const user = await db.users.findById(req.user.id);
    const keyToUse = (req.body?.apiKey || personalAiToken(user, 'gemini') || GEMINI_API_KEY || '').trim();
    if (!keyToUse) {
      return res.status(400).json({ error: 'Bitte gib zuerst einen Google Gemini API-Schlüssel ein, um die verfügbaren Modelle abzufragen.' });
    }
    try {
      const models = await fetchGeminiModels(keyToUse);
      res.json({ ok: true, provider: 'gemini', models });
    } catch (caught: unknown) {
      const err = asError(caught);
      res.status(400).json({ error: err.message });
    }
  })
);

// Anthropic Claude
router.put(
  ['/me/claude', '/me/claude-key'],
  auth,
  wrap(async (req: Request, res: Response) => {
    const user = await db.users.findById(req.user.id);
    if (!user) return res.status(404).json({ error: 'Benutzer nicht gefunden.' });

    const rawKey = req.body.apiKey !== undefined ? req.body.apiKey : req.body.key;
    let apiKey = undefined;
    if (rawKey !== undefined) {
      apiKey = rawKey === null || rawKey === '' ? null : str(rawKey, 500).trim();
    }

    const rawModel = req.body.model;
    let model = undefined;
    if (rawModel !== undefined) {
      model = rawModel === null || rawModel === '' ? null : str(rawModel, 100).trim();
    }

    const updates: Record<string, any> = {};
    if (apiKey !== undefined) updates.claude_api_key = apiKey;
    if (model !== undefined) updates.claude_model = model;
    if (req.body.setAsActive) updates.ai_provider = 'claude';

    if (Object.keys(updates).length > 0) {
      await db.users.update(req.user.id, updates);
    }

    const updated = await db.users.findById(req.user.id);
    res.json({
      ok: true,
      message: 'Anthropic Claude Einstellungen erfolgreich gespeichert.',
      user: serializeMe(updated),
    });
  })
);

router.delete(
  ['/me/claude', '/me/claude-key'],
  auth,
  wrap(async (req: Request, res: Response) => {
    const user = await db.users.findById(req.user.id);
    if (!user) return res.status(404).json({ error: 'Benutzer nicht gefunden.' });

    await db.users.update(req.user.id, {
      claude_api_key: null,
      claude_model: null,
    });

    const updated = await db.users.findById(req.user.id);
    res.json({
      ok: true,
      message: 'Anthropic Claude API-Schlüssel entfernt.',
      user: serializeMe(updated),
    });
  })
);

router.post(
  '/me/claude/test',
  auth,
  wrap(async (req: Request, res: Response) => {
    const user = await db.users.findById(req.user.id);
    const keyToTest = (req.body?.apiKey || personalAiToken(user, 'claude') || CLAUDE_API_KEY || '').trim();
    const modelToTest = (req.body?.model || user?.claude_model || CLAUDE_MODEL || 'claude-3-5-haiku-20241022').trim();

    if (!keyToTest) {
      return res.status(400).json({ error: 'Kein Anthropic Claude API-Schlüssel zum Testen übergeben oder hinterlegt.' });
    }

    try {
      const result = await testClaudeConnection(keyToTest, modelToTest);
      res.json(result);
    } catch (caught: unknown) {
      const err = asError(caught);
      res.status(400).json({ error: err.message });
    }
  })
);

router.post(
  '/me/claude/models',
  auth,
  wrap(async (req: Request, res: Response) => {
    const user = await db.users.findById(req.user.id);
    const keyToUse = (req.body?.apiKey || personalAiToken(user, 'claude') || CLAUDE_API_KEY || '').trim();
    if (!keyToUse) {
      return res.status(400).json({ error: 'Bitte gib zuerst einen Anthropic Claude API-Schlüssel ein, um die verfügbaren Modelle abzufragen.' });
    }
    try {
      const models = await fetchClaudeModels(keyToUse);
      res.json({ ok: true, provider: 'claude', models });
    } catch (caught: unknown) {
      const err = asError(caught);
      res.status(400).json({ error: err.message });
    }
  })
);

router.post(
  '/me/ai/test',
  auth,
  wrap(async (req: Request, res: Response) => {
    const user = await db.users.findById(req.user.id);
    const provider = (req.body?.provider || user?.ai_provider || 'openai').toLowerCase().trim();
    let apiKey = (req.body?.apiKey || '').trim();
    const model = (req.body?.model || '').trim();

    if (!apiKey) {
      if (provider === 'gemini') apiKey = (personalAiToken(user, 'gemini') || GEMINI_API_KEY || '').trim();
      else if (provider === 'claude') apiKey = (personalAiToken(user, 'claude') || CLAUDE_API_KEY || '').trim();
      else apiKey = (personalAiToken(user, 'openai') || OPENAI_API_KEY || '').trim();
    }

    if (!apiKey) {
      return res.status(400).json({ error: `Kein API-Schlüssel für ${provider} zum Testen übergeben oder hinterlegt.` });
    }

    try {
      const result = await testAiConnection({ provider, apiKey, model });
      res.json(result);
    } catch (caught: unknown) {
      const err = asError(caught);
      res.status(400).json({ error: err.message });
    }
  })
);

router.post(
  '/me/ai/models',
  auth,
  wrap(async (req: Request, res: Response) => {
    const user = await db.users.findById(req.user.id);
    const provider = (req.body?.provider || user?.ai_provider || DEFAULT_AI_PROVIDER || 'openai').toLowerCase().trim();
    let apiKey = (req.body?.apiKey || '').trim();

    if (!apiKey) {
      if (provider === 'gemini') apiKey = (personalAiToken(user, 'gemini') || GEMINI_API_KEY || '').trim();
      else if (provider === 'claude') apiKey = (personalAiToken(user, 'claude') || CLAUDE_API_KEY || '').trim();
      else apiKey = (personalAiToken(user, 'openai') || OPENAI_API_KEY || '').trim();
    }

    if (!apiKey) {
      return res.status(400).json({ error: `Bitte gib zuerst einen ${provider} API-Schlüssel ein, um die verfügbaren Modelle abzufragen.` });
    }

    try {
      const models = await fetchProviderModels({ provider, apiKey });
      res.json({ ok: true, provider, models });
    } catch (caught: unknown) {
      const err = asError(caught);
      res.status(400).json({ error: err.message });
    }
  })
);

router.post('/oidc/login', async (req: Request, res: Response, next) => {
  if (!oidc) return res.status(404).end();
  if (req.body.acceptTerms !== undefined && req.body.acceptTerms !== false && !acceptsCurrentTerms(req.body))
    return res.status(400).json({ error: 'Bitte die aktuellen AGB ausdrücklich akzeptieren.' });
  try {
    const terms = acceptsCurrentTerms(req.body) ? { version: TERMS_VERSION, acceptedAt: new Date().toISOString() } : null;
    const { url, state } = await oidc.startLogin(terms);
    setCookie(res, 'oidc_state', state, 600);
    res.json({ url });
  } catch (error) { next(error); }
});

router.get('/terms', (req: Request, res: Response) => res.setHeader('Cache-Control', 'no-store').json(currentTerms(req.query.language === 'en' ? 'en' : 'de')));

router.get('/registration', (req: Request, res: Response) => {
  const regConfig = registrationService.getConfig();
  res.json({
    registration: LOCAL_LOGIN && ALLOW_REGISTRATION && !regConfig.isClosed,
    termsVersion: TERMS_VERSION,
    mode: regConfig.mode,
    isOpen: regConfig.isOpen,
    isInviteAdmin: regConfig.isInviteAdmin,
    isInviteOpen: regConfig.isInviteOpen,
    isInviteOnly: regConfig.isInviteOnly,
    isClosed: regConfig.isClosed,
    userCodeMaxDays: regConfig.userCodeMaxDays,
    mailInviteMaxDays: regConfig.mailInviteMaxDays,
    localLogin: LOCAL_LOGIN,
    oidc: OIDC_ENABLED,
    oidcName: OIDC_PROVIDER_NAME,
  });
});

router.get(
  '/invitations/validate',
  wrap(async (req: Request, res: Response) => {
    const rawCode = req.query.code || req.query.invite || req.query.token || '';
    const code = str(rawCode, 128).trim();
    if (!code) {
      return res.status(400).json({ error: 'Kein Einladungscode übergeben.' });
    }
    const inv = await db.invitations.findByCode(code);
    if (!inv) {
      return res.status(404).json({ error: 'Ungültiger Einladungscode.' });
    }
    if (inv.expires_at < Date.now()) {
      return res.status(400).json({ error: 'Dieser Einladungscode ist bereits abgelaufen.' });
    }
    if (inv.max_uses != null && inv.max_uses > 0 && inv.used_count >= inv.max_uses) {
      return res.status(400).json({ error: 'Dieser Einladungscode wurde bereits vollständig eingelöst.' });
    }
    res.json({
      valid: true,
      code: inv.code,
      type: inv.type,
      email: inv.email || null,
      expiresAt: inv.expires_at,
      inviter: inv.created_by_username || null,
    });
  })
);

/* ---------- Benutzer-Einladungen (Profilbereich) ---------- */

router.get(
  '/me/invitations',
  auth,
  wrap(async (req: Request, res: Response) => {
    const isAdmin = req.user.isAdmin;
    if (!registrationService.canUserInvite(req.user, isAdmin)) {
      return res.json({ invitations: [], canInvite: false });
    }
    const rows = await db.invitations.listForUser(req.user.id);
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
        maxUses: inv.max_uses,
        usedCount: inv.used_count,
        expiresAt: inv.expires_at,
        note: inv.note || null,
        createdAt: inv.created_at,
        status,
      };
    });
    res.json({ invitations, canInvite: true });
  })
);

router.post(
  '/me/invitations',
  auth,
  wrap(async (req: Request, res: Response) => {
    const isAdmin = req.user.isAdmin;
    if (!registrationService.canUserInvite(req.user, isAdmin)) {
      return res.status(403).json({ error: 'Einladungen sind derzeit für reguläre Benutzer nicht gestattet.' });
    }
    const regConfig = registrationService.getConfig();
    const type = req.body.type === 'mail' ? 'mail' : 'code';
    const email = req.body.email ? str(req.body.email, 120).trim().toLowerCase() : null;
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
      const days = Math.max(1, Math.min(14, Number(req.body.days) || 14));
      const expiresAt = Date.now() + days * 24 * 3600 * 1000;
      const code = registrationService.generateInviteToken();

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

      const expiresDateStr = new Date(expiresAt).toLocaleDateString(req.user.language === 'en' ? 'en-US' : 'de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
      const inviteLang = req.body.language || req.user.language || 'de';
      mailService.sendInvitationEmail({
        to: email,
        inviterName: [req.user.first_name, req.user.last_name].filter(Boolean).join(' ') || req.user.username,
        inviteCode: code,
        expiresDays: days,
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
    // Usercodes sollen maximal 7 Tage gültig sein (vom Admin im Admin-Menü umstellbar)
    const maxDays = regConfig.userCodeMaxDays;
    const days = Math.max(1, Math.min(maxDays, Number(req.body.days) || maxDays));
    const expiresAt = Date.now() + days * 24 * 3600 * 1000;
    const code = registrationService.generateInviteCode();

    const inv = await db.invitations.create({
      code,
      type: 'code',
      email: null,
      created_by: req.user.id,
      max_uses: 1,
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
  '/me/invitations/:id',
  auth,
  wrap(async (req: Request, res: Response) => {
    const id = Number(req.params.id);
    const deleted = await db.invitations.delete(id, req.user.id);
    if (!deleted) {
      return res.status(404).json({ error: 'Einladung nicht gefunden oder keine Berechtigung.' });
    }
    res.json({ ok: true });
  })
);

router.post(
  '/password',
  auth,
  wrap(async (req: Request, res: Response) => {
    if (!LOCAL_LOGIN) {
      return res.status(403).json({ error: 'Passwörter werden über den Anmeldedienst verwaltet.' });
    }
    const { current, next } = req.body;
    if (typeof current !== 'string' || current.length > 200 || typeof next !== 'string' || next.length < 8 || next.length > 200)
      return res.status(400).json({ error: 'Das aktuelle Passwort darf höchstens 200 Zeichen enthalten; das neue braucht 8 bis 200 Zeichen.' });
    const key = `change-password|${req.user.id}`;
    if (await checkAndNoteAttempt(key)) return res.status(429).json({ error: 'Zu viele Versuche. Bitte später erneut versuchen.' });
    const user = await db.users.findById(req.user.id);
    if (!user) return res.status(401).json({ error: 'Benutzer nicht gefunden.' });
    if (!String(user.password_hash).includes(':')) return res.status(400).json({ error: 'Dieses Konto hat kein lokales Passwort.' });
    if (!(await verifyPassword(current, user.password_hash))) return res.status(400).json({ error: 'Das aktuelle Passwort stimmt nicht.' });
    const changed = await db.users.update(req.user.id, { password_hash: await hashPassword(next) }, { password_hash: user.password_hash });
    if (!changed) return res.status(409).json({ error: 'Das Passwort wurde inzwischen geändert. Bitte erneut anmelden.' });
    const token = parseCookies(req).session;
    const previous = token ? await db.sessions.find(sha(token)) : null;
    await db.sessions.deleteForUser(req.user.id);
    await startSession(res, db, req.user.id, previous?.id_token || null);
    await clearAttempts(key);
    res.json({ ok: true });
  })
);

/* ---------- E-Mail-Verifizierung & Passwort-Reset Endpunkte ---------- */

router.all(
  '/verify-email',
  wrap(async (req: Request, res: Response) => {
    const token = str(req.body?.token || req.query?.token, 128);
    if (!token) {
      return res.status(400).json({ error: 'Kein Bestätigungstoken angegeben.' });
    }
    const user = await db.users.findByEmailVerifyToken(token);
    if (!user) {
      return res.status(400).json({ error: 'Ungültiger oder bereits verwendeter Bestätigungslink.' });
    }
    if (user.email_verify_expires && user.email_verify_expires < Date.now()) {
      return res.status(400).json({ error: 'Dieser Bestätigungslink ist abgelaufen. Bitte fordere einen neuen an.' });
    }
    const verified = await db.users.update(user.id, {
      email_verified: 1,
      email_verify_token: null,
      email_verify_expires: null,
    }, { email_verify_token: token, email: user.email });
    if (!verified) return res.status(400).json({ error: 'Bestätigungslink bereits verwendet oder ersetzt.' });
    res.json({
      ok: true,
      message: 'Deine E-Mail-Adresse wurde erfolgreich bestätigt! Du kannst dich jetzt anmelden.',
      user: { id: user.id, username: user.username, email: user.email },
    });
  })
);

router.post(
  '/resend-verification',
  wrap(async (req: Request, res: Response) => {
    const identifier = str(req.body?.identifier || req.body?.email || req.body?.username, 120);
    const key = `resend-verify|${req.ip}|${identifier.toLowerCase()}`;
    if (await checkAndNoteAttempt(key)) {
      return res.status(429).json({ error: 'Zu viele Anfragen. Bitte warte einige Minuten.' });
    }

    if (identifier) {
      const user = (await db.users.findByEmail(identifier)) || (await db.users.findByUsername(identifier));
      if (user && !user.email_verified && user.email) {
        const token = crypto.randomBytes(32).toString('hex');
        const expires = Date.now() + 24 * 3600 * 1000;
        await db.users.update(user.id, {
          email_verify_token: token,
          email_verify_expires: expires,
        });
        const lang = req.body?.language || req.headers['x-language'] || user.language || 'de';
        mailService.sendVerificationEmail(user, token, lang);
      }
    }
    res.json({
      ok: true,
      message: 'Falls ein unbestätigtes Konto existiert, wurde eine neue Bestätigungs-E-Mail versendet.',
    });
  })
);

router.post(
  '/forgot-password',
  wrap(async (req: Request, res: Response) => {
    if (!LOCAL_LOGIN) {
      return res.status(403).json({ error: 'Passwörter werden über den Anmeldedienst verwaltet.' });
    }
    const identifier = str(req.body?.identifier || req.body?.email || req.body?.username, 120);
    const key = `forgot-pw|${req.ip}`;
    if (await checkAndNoteAttempt(key)) {
      return res.status(429).json({ error: 'Zu viele Anfragen. Bitte in ein paar Minuten erneut probieren.' });
    }

    if (identifier) {
      const user = (await db.users.findByEmail(identifier)) || (await db.users.findByUsername(identifier));
      if (user && user.email && hasLocalPassword(user)) {
        const token = crypto.randomBytes(32).toString('hex');
        const expires = Date.now() + 3600 * 1000; // 1 Stunde
        await db.users.update(user.id, {
          password_reset_token: token,
          password_reset_expires: expires,
        });
        const lang = req.body?.language || req.headers['x-language'] || user.language || 'de';
        mailService.sendPasswordResetEmail(user, token, lang);
      }
    }

    res.json({
      ok: true,
      message: 'Falls ein passendes Konto mit lokaler Anmeldung existiert, wurde ein Link zum Zurücksetzen des Passworts versendet.',
    });
  })
);

router.post(
  '/reset-password',
  wrap(async (req: Request, res: Response) => {
    if (!LOCAL_LOGIN) {
      return res.status(403).json({ error: 'Passwörter werden über den Anmeldedienst verwaltet.' });
    }
    const token = str(req.body?.token, 128);
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    const key = `reset-pw|${req.ip}`;
    if (await checkAndNoteAttempt(key)) {
      return res.status(429).json({ error: 'Zu viele Versuche. Bitte in ein paar Minuten erneut probieren.' });
    }

    if (!token) {
      return res.status(400).json({ error: 'Kein Token zum Zurücksetzen angegeben.' });
    }
    if (password.length < 8 || password.length > 200) {
      return res.status(400).json({ error: 'Das Passwort braucht mindestens 8 Zeichen.' });
    }

    const user = await db.users.findByPasswordResetToken(token);
    if (!user) {
      return res.status(400).json({ error: 'Dieser Link zum Zurücksetzen ist ungültig oder wurde bereits verwendet.' });
    }
    if (user.password_reset_expires && user.password_reset_expires < Date.now()) {
      return res.status(400).json({ error: 'Dieser Link zum Zurücksetzen ist abgelaufen. Bitte fordere einen neuen an.' });
    }

    const passwordHash = await hashPassword(password);
    if (user.password_reset_expires && user.password_reset_expires < Date.now()) return res.status(400).json({ error: 'Dieser Link ist abgelaufen.' });
    const changed = await db.users.update(user.id, {
      password_hash: passwordHash,
      password_reset_token: null,
      password_reset_expires: null,
    }, { password_reset_token: token, password_reset_expires: user.password_reset_expires });
    if (!changed) return res.status(400).json({ error: 'Dieser Link wurde bereits verwendet oder ersetzt.' });

    // Alle bestehenden Sitzungen des Benutzers beenden
    await db.sessions.deleteForUser(user.id);
    await clearAttempts(key);

    res.json({ ok: true, message: 'Dein Passwort wurde erfolgreich geändert. Du kannst dich jetzt damit anmelden.' });
  })
);

/* ---------- Konto-Löschung (Zweistufig: App-Bestätigung + E-Mail-Bestätigung) ---------- */

router.post(
  '/me/delete-request',
  auth,
  wrap(async (req: Request, res: Response) => {
    const user = await db.users.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ error: 'Benutzer nicht gefunden.' });
    }

    if (isEmailAdmin(user.email)) {
      return res.status(400).json({ error: 'Der Administrator-Account kann nicht über die Profil-Löschung entfernt werden.' });
    }

    if (!user.email) {
      return res.status(400).json({
        error: 'Für die Kontolöschung ist eine hinterlegte E-Mail-Adresse erforderlich. Bitte trage zuerst eine E-Mail-Adresse in deinem Profil ein.',
      });
    }

    const key = `delete-account-req|${req.user.id}`;
    if (await checkAndNoteAttempt(key)) {
      return res.status(429).json({ error: 'Zu viele Löschanfragen. Bitte in ein paar Minuten erneut probieren.' });
    }

    // Wenn lokales Passwort vorhanden ist, Passwort-Bestätigung verlangen
    if (hasLocalPassword(user)) {
      const password = typeof req.body?.password === 'string' ? req.body.password : '';
      if (!password || password.length > 200) {
        return res.status(400).json({ error: 'Bitte gib zur Bestätigung dein aktuelles Passwort mit höchstens 200 Zeichen ein.' });
      }
      const ok = await verifyPassword(password, user.password_hash);
      if (!ok) {
        return res.status(400).json({ error: 'Das eingegebene Passwort ist nicht korrekt.' });
      }
    }

    const token = crypto.randomBytes(32).toString('hex');
    const expires = Date.now() + 3600 * 1000; // 1 Stunde

    await db.users.update(user.id, {
      account_delete_token: token,
      account_delete_expires: expires,
    });

    mailService.sendAccountDeletionEmail(user, token);

    res.json({
      ok: true,
      message: `Eine Bestätigungs-E-Mail wurde an ${user.email} versendet. Bitte öffne den Link in der E-Mail, um die Löschung endgültig zu bestätigen.`,
    });
  })
);

router.all(
  ['/confirm-delete-account', '/delete-account'],
  wrap(async (req: Request, res: Response) => {
    const token = str(req.body?.token || req.query?.token, 128);
    const key = `delete-account-confirm|${req.ip}`;
    if (await checkAndNoteAttempt(key)) {
      return res.status(429).json({ error: 'Zu viele Versuche. Bitte in ein paar Minuten erneut probieren.' });
    }

    if (!token) {
      return res.status(400).json({ error: 'Kein Bestätigungstoken angegeben.' });
    }

    const user = await db.users.findByDeleteToken(token);
    if (!user) {
      return res.status(400).json({ error: 'Dieser Bestätigungslink ist ungültig oder wurde bereits verwendet.' });
    }

    if (user.account_delete_expires && user.account_delete_expires < Date.now()) {
      return res.status(400).json({ error: 'Dieser Bestätigungslink ist abgelaufen. Bitte fordere einen neuen an.' });
    }

    if (isEmailAdmin(user.email)) {
      return res.status(400).json({ error: 'Der Administrator-Account kann nicht gelöscht werden.' });
    }

    const { backupService } = require('../services/backup-service');
    if (backupService.isBackingUp || backupService.isRestoring) return res.status(409).json({ error: 'Eine Sicherung oder Wiederherstellung läuft. Bitte die Kontolöschung danach erneut bestätigen.' });

    // Benutzer und alle zugehörigen Daten (Aquarien, Fotos, Messwerte, Alarme, Pflegen, Freigaben, Sessions) löschen
    await db.users.delete(user.id);
    clearSessionCookie(res);
    await clearAttempts(key);

    res.json({
      ok: true,
      message: 'Dein Benutzerkonto sowie alle deine Aquarien, Fotos, Messwerte und Daten wurden endgültig und unwiderruflich gelöscht.',
    });
  })
);

export = router;

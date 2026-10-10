'use strict';
const express = require('express');
const crypto = require('crypto');
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
const { parseCookies, setSessionCookie, clearSessionCookie, startSession } = require('../utils/cookies');
const { wrap, str } = require('../utils/helpers');
const { auth } = require('../middleware/auth');
const { saveAvatar, deleteImage, getImagePath, getMimeType } = require('../services/image-service');
const { mailService } = require('../services/mail-service');

const router = express.Router();

function serializeMe(u) {
  let selectedTests = null;
  if (u.selected_tests) {
    try {
      selectedTests = typeof u.selected_tests === 'string' ? JSON.parse(u.selected_tests) : u.selected_tests;
    } catch (e) {
      selectedTests = null;
    }
  }
  return {
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
    email: u.email || null,
    emailVerified: Boolean(u.email_verified),
    registration: ALLOW_REGISTRATION,
    hasPassword: LOCAL_LOGIN && hasLocalPassword(u),
    hasOidc: !!u.oidc_sub,
    oidcSub: u.oidc_sub || null,
    oidcEnabled: OIDC_ENABLED,
    oidcProviderName: OIDC_PROVIDER_NAME,
    isAdmin: isEmailAdmin(u.email),
  };
}

router.post(
  '/register',
  wrap(async (req, res) => {
    if (!LOCAL_LOGIN || !ALLOW_REGISTRATION) {
      return res.status(403).json({ error: 'Registrierung ist deaktiviert.' });
    }
    const username = str(req.body.username, 40);
    const email = req.body.email ? str(req.body.email, 120).toLowerCase() : null;
    const password = typeof req.body.password === 'string' ? req.body.password : '';
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

    const isAdmin = isEmailAdmin(email);
    let emailVerified = isAdmin ? 1 : 0;
    let verifyToken = null;
    let verifyExpires = null;

    if (!isAdmin) {
      verifyToken = crypto.randomBytes(32).toString('hex');
      verifyExpires = Date.now() + 24 * 3600 * 1000; // 24 Stunden
    }

    const user = await db.users.create({
      username,
      password_hash: await hashPassword(password),
      email,
      email_verified: emailVerified,
      email_verify_token: verifyToken,
      email_verify_expires: verifyExpires,
    });

    if (isAdmin) {
      await startSession(res, db, user.id);
      return res.json({ id: user.id, username, email, needsVerification: false });
    }

    // Bestätigungs-E-Mail versenden
    mailService.sendVerificationEmail(user, verifyToken);

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
  wrap(async (req, res) => {
    if (!LOCAL_LOGIN) {
      return res.status(403).json({ error: `Bitte über ${OIDC_PROVIDER_NAME} anmelden.` });
    }
    const username = str(req.body.username, 40);
    const password = typeof req.body.password === 'string' ? req.body.password : '';
    const key = `${req.ip}|${username.toLowerCase()}`;
    if (tooManyAttempts(key)) {
      return res.status(429).json({ error: 'Zu viele Versuche. Bitte in ein paar Minuten erneut probieren.' });
    }
    const user = (await db.users.findByUsername(username)) || (await db.users.findByEmail(username));
    const ok = (await verifyPassword(password, user ? user.password_hash : DUMMY_HASH)) && !!user;
    if (!ok) {
      noteAttempt(key);
      return res.status(401).json({ error: 'Benutzername oder Passwort stimmt nicht.' });
    }

    // E-Mail-Verifizierung prüfen (außer für Admins)
    const isAdmin = isEmailAdmin(user.email);
    if (!user.email_verified && !isAdmin) {
      noteAttempt(key);
      return res.status(403).json({
        error: 'Bitte bestätige zuerst deine E-Mail-Adresse über den Link in deiner E-Mail.',
        unverified: true,
        email: user.email,
      });
    }

    clearAttempts(key);
    await startSession(res, db, user.id);
    res.json({ id: user.id, username: user.username });
  })
);

router.post(
  '/logout',
  wrap(async (req, res) => {
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
  wrap(async (req, res) => {
    const u = await db.users.findById(req.user.id);
    if (!u) return res.status(404).json({ error: 'Benutzer nicht gefunden.' });
    res.json(serializeMe(u));
  })
);

router.put(
  ['/me', '/me/profile'],
  auth,
  wrap(async (req, res) => {
    const user = await db.users.findById(req.user.id);
    if (!user) return res.status(404).json({ error: 'Benutzer nicht gefunden.' });

    const username = req.body.username !== undefined ? str(req.body.username, 40) : user.username;
    const firstName = req.body.firstName !== undefined ? (req.body.firstName ? str(req.body.firstName, 100) : null) : user.first_name;
    const lastName = req.body.lastName !== undefined ? (req.body.lastName ? str(req.body.lastName, 100) : null) : user.last_name;
    const bio = req.body.bio !== undefined ? (req.body.bio ? str(req.body.bio, 1000) : null) : user.bio;
    const email = req.body.email !== undefined ? (req.body.email ? str(req.body.email, 120).toLowerCase() : null) : user.email;
    const defaultGraphRange = req.body.defaultGraphRange !== undefined ? (req.body.defaultGraphRange ? str(req.body.defaultGraphRange, 10) : '90') : user.default_graph_range;

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

    await db.users.update(req.user.id, {
      username,
      first_name: firstName,
      last_name: lastName,
      bio,
      email,
      default_graph_range: defaultGraphRange,
    });

    const updated = await db.users.findById(req.user.id);
    res.json({ ok: true, user: serializeMe(updated) });
  })
);

router.get(
  '/me/avatar',
  auth,
  wrap(async (req, res) => {
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
  wrap(async (req, res) => {
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
  wrap(async (req, res) => {
    const user = await db.users.findById(req.user.id);
    const { error, value } = saveAvatar(req.user.id, req.body.image, user ? user.avatar_file : null);
    if (error) return res.status(400).json({ error });
    await db.users.update(req.user.id, { avatar_file: value.filename });
    res.json({ ok: true, avatarUrl: `api/me/avatar?t=${Date.now()}` });
  })
);

router.delete(
  '/me/avatar',
  auth,
  wrap(async (req, res) => {
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
  wrap(async (req, res) => {
    const user = await db.users.findById(req.user.id);
    const hasPw = hasLocalPassword(user);
    if (!hasPw) {
      return res.status(400).json({ error: 'Ohne lokales Passwort kann die OIDC-Verknüpfung nicht getrennt werden.' });
    }
    await db.users.update(req.user.id, { oidc_sub: null });
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
  wrap(async (req, res) => {
    if (!LOCAL_LOGIN) {
      return res.status(403).json({ error: 'Passwörter werden über den Anmeldedienst verwaltet.' });
    }
    const { current, next } = req.body;
    const user = await db.users.findById(req.user.id);
    if (!String(user.password_hash).includes(':')) {
      return res.status(400).json({ error: 'Dieses Konto hat kein lokales Passwort.' });
    }
    if (typeof current !== 'string' || !(await verifyPassword(current, user.password_hash))) {
      return res.status(400).json({ error: 'Das aktuelle Passwort stimmt nicht.' });
    }
    if (typeof next !== 'string' || next.length < 8) {
      return res.status(400).json({ error: 'Das neue Passwort braucht mindestens 8 Zeichen.' });
    }
    await db.users.update(req.user.id, { password_hash: await hashPassword(next) });
    res.json({ ok: true });
  })
);

/* ---------- E-Mail-Verifizierung & Passwort-Reset Endpunkte ---------- */

router.all(
  '/verify-email',
  wrap(async (req, res) => {
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
    await db.users.update(user.id, {
      email_verified: 1,
      email_verify_token: null,
      email_verify_expires: null,
    });
    res.json({
      ok: true,
      message: 'Deine E-Mail-Adresse wurde erfolgreich bestätigt! Du kannst dich jetzt anmelden.',
      user: { id: user.id, username: user.username, email: user.email },
    });
  })
);

router.post(
  '/resend-verification',
  wrap(async (req, res) => {
    const identifier = str(req.body?.identifier || req.body?.email || req.body?.username, 120);
    const key = `resend-verify|${req.ip}|${identifier.toLowerCase()}`;
    if (tooManyAttempts(key)) {
      return res.status(429).json({ error: 'Zu viele Anfragen. Bitte warte einige Minuten.' });
    }
    noteAttempt(key);

    if (identifier) {
      const user = (await db.users.findByEmail(identifier)) || (await db.users.findByUsername(identifier));
      if (user && !user.email_verified && !isEmailAdmin(user.email) && user.email) {
        const token = crypto.randomBytes(32).toString('hex');
        const expires = Date.now() + 24 * 3600 * 1000;
        await db.users.update(user.id, {
          email_verify_token: token,
          email_verify_expires: expires,
        });
        mailService.sendVerificationEmail(user, token);
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
  wrap(async (req, res) => {
    if (!LOCAL_LOGIN) {
      return res.status(403).json({ error: 'Passwörter werden über den Anmeldedienst verwaltet.' });
    }
    const identifier = str(req.body?.identifier || req.body?.email || req.body?.username, 120);
    const key = `forgot-pw|${req.ip}`;
    if (tooManyAttempts(key)) {
      return res.status(429).json({ error: 'Zu viele Anfragen. Bitte in ein paar Minuten erneut probieren.' });
    }
    noteAttempt(key);

    if (identifier) {
      const user = (await db.users.findByEmail(identifier)) || (await db.users.findByUsername(identifier));
      if (user && user.email && hasLocalPassword(user)) {
        const token = crypto.randomBytes(32).toString('hex');
        const expires = Date.now() + 3600 * 1000; // 1 Stunde
        await db.users.update(user.id, {
          password_reset_token: token,
          password_reset_expires: expires,
        });
        mailService.sendPasswordResetEmail(user, token);
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
  wrap(async (req, res) => {
    if (!LOCAL_LOGIN) {
      return res.status(403).json({ error: 'Passwörter werden über den Anmeldedienst verwaltet.' });
    }
    const token = str(req.body?.token, 128);
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    const key = `reset-pw|${req.ip}`;
    if (tooManyAttempts(key)) {
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
      noteAttempt(key);
      return res.status(400).json({ error: 'Dieser Link zum Zurücksetzen ist ungültig oder wurde bereits verwendet.' });
    }
    if (user.password_reset_expires && user.password_reset_expires < Date.now()) {
      noteAttempt(key);
      return res.status(400).json({ error: 'Dieser Link zum Zurücksetzen ist abgelaufen. Bitte fordere einen neuen an.' });
    }

    const passwordHash = await hashPassword(password);
    await db.users.update(user.id, {
      password_hash: passwordHash,
      password_reset_token: null,
      password_reset_expires: null,
    });

    // Alle bestehenden Sitzungen des Benutzers beenden
    await db.sessions.deleteForUser(user.id);
    clearAttempts(key);

    res.json({ ok: true, message: 'Dein Passwort wurde erfolgreich geändert. Du kannst dich jetzt damit anmelden.' });
  })
);

/* ---------- Konto-Löschung (Zweistufig: App-Bestätigung + E-Mail-Bestätigung) ---------- */

router.post(
  '/me/delete-request',
  auth,
  wrap(async (req, res) => {
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

    // Wenn lokales Passwort vorhanden ist, Passwort-Bestätigung verlangen
    if (hasLocalPassword(user)) {
      const password = typeof req.body?.password === 'string' ? req.body.password : '';
      if (!password) {
        return res.status(400).json({ error: 'Bitte gib zur Bestätigung dein aktuelles Passwort ein.' });
      }
      const ok = await verifyPassword(password, user.password_hash);
      if (!ok) {
        return res.status(400).json({ error: 'Das eingegebene Passwort ist nicht korrekt.' });
      }
    }

    const key = `delete-account-req|${req.user.id}|${req.ip}`;
    if (tooManyAttempts(key)) {
      return res.status(429).json({ error: 'Zu viele Löschanfragen. Bitte in ein paar Minuten erneut probieren.' });
    }
    noteAttempt(key);

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
  wrap(async (req, res) => {
    const token = str(req.body?.token || req.query?.token, 128);
    const key = `delete-account-confirm|${req.ip}`;
    if (tooManyAttempts(key)) {
      return res.status(429).json({ error: 'Zu viele Versuche. Bitte in ein paar Minuten erneut probieren.' });
    }

    if (!token) {
      return res.status(400).json({ error: 'Kein Bestätigungstoken angegeben.' });
    }

    const user = await db.users.findByDeleteToken(token);
    if (!user) {
      noteAttempt(key);
      return res.status(400).json({ error: 'Dieser Bestätigungslink ist ungültig oder wurde bereits verwendet.' });
    }

    if (user.account_delete_expires && user.account_delete_expires < Date.now()) {
      noteAttempt(key);
      return res.status(400).json({ error: 'Dieser Bestätigungslink ist abgelaufen. Bitte fordere einen neuen an.' });
    }

    if (isEmailAdmin(user.email)) {
      return res.status(400).json({ error: 'Der Administrator-Account kann nicht gelöscht werden.' });
    }

    // Benutzer und alle zugehörigen Daten (Aquarien, Fotos, Messwerte, Alarme, Pflegen, Freigaben, Sessions) löschen
    await db.users.delete(user.id);
    clearSessionCookie(res);
    clearAttempts(key);

    res.json({
      ok: true,
      message: 'Dein Benutzerkonto sowie alle deine Aquarien, Fotos, Messwerte und Daten wurden endgültig und unwiderruflich gelöscht.',
    });
  })
);

module.exports = router;

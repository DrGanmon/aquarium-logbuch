import cryptoModule = require('../utils/crypto');
const { sha } = cryptoModule;
import { asError } from '../utils/app-error';
import type { Request, Response } from 'express';
import express = require('express');
import db = require('../db');
import envModule = require('../config/env');
const { OIDC_PROVIDER_NAME, APP_URL } = envModule;
import oidc_serviceModule = require('../services/oidc-service');
const { oidc, appRedirect, userForClaims } = oidc_serviceModule;
import cookiesModule = require('../utils/cookies');
const { parseCookies, setCookie, startSession } = cookiesModule;
import authModule = require('../middleware/auth');
const { auth } = authModule;

const router = express.Router();

router.get('/login', async (req: Request, res: Response) => {
  if (!oidc) return res.status(404).end();
  try {
    const { url, state } = await oidc.startLogin();
    setCookie(res, 'oidc_state', state, 600);
    res.redirect(302, url);
  } catch (caught: unknown) {
    const e = asError(caught);
    console.error('OIDC-Login fehlgeschlagen:', e.message);
    appRedirect(res, `${OIDC_PROVIDER_NAME} ist nicht erreichbar.`);
  }
});

router.get('/link', auth, async (req: Request, res: Response) => {
  if (!oidc) return res.status(404).end();
  try {
    const { url, state } = await oidc.startLogin();
    setCookie(res, 'oidc_state', state, 600);
    setCookie(res, 'oidc_link_user', String(req.user.id), 600);
    res.redirect(302, url);
  } catch (caught: unknown) {
    const e = asError(caught);
    console.error('OIDC-Link fehlgeschlagen:', e.message);
    appRedirect(res, `${OIDC_PROVIDER_NAME} ist nicht erreichbar.`);
  }
});

router.get('/callback', async (req: Request, res: Response) => {
  if (!oidc) return res.status(404).end();
  const cookies = parseCookies(req);
  const cookieState = cookies.oidc_state;
  const linkUserId = cookies.oidc_link_user ? Number(cookies.oidc_link_user) : null;
  setCookie(res, 'oidc_state', '', 0);
  setCookie(res, 'oidc_link_user', '', 0);
  try {
    const { claims, idToken, terms } = await oidc.finishLogin(req.query, cookieState);
    const sub = String(claims.sub);
    const email = claims.email ? String(claims.email).trim().toLowerCase() : null;

    if (linkUserId) {
      const session = cookies.session ? await db.sessions.find(sha(cookies.session)) : null;
      if (!session || session.expires_at < Date.now() || session.user_id !== linkUserId) {
        return appRedirect(res, 'Für die Kontoverknüpfung ist eine gültige Sitzung des betreffenden Kontos erforderlich.');
      }
      const targetUser = await db.users.findById(linkUserId);
      if (!targetUser) return appRedirect(res, 'Benutzerkonto nicht gefunden.');
      const conflict = await db.users.findByOidcSub(sub, linkUserId);
      if (conflict) {
        return appRedirect(res, `Diese ${OIDC_PROVIDER_NAME}-Kennung ist bereits mit dem Konto „${conflict.username}“ verknüpft.`);
      }
      const verifiedEmail = email && claims.email_verified === true;
      await db.users.update(linkUserId, { oidc_sub: sub, ...(verifiedEmail ? { email, email_verified: 1 } : {}) });
      await startSession(res, db, linkUserId, idToken);
      return res.redirect(302, `${APP_URL}/?oidc_linked=1`);
    }

    const user = await userForClaims(claims, db, terms);
    if (!user) {
      return appRedirect(res, 'Für dieses Konto ist kein Zugang eingerichtet (Registrierung ist deaktiviert).');
    }
    await startSession(res, db, user.id, idToken);
    appRedirect(res);
  } catch (caught: unknown) {
    const e = asError(caught);
    console.error('OIDC-Callback fehlgeschlagen:', e.message);
    appRedirect(res, (e.message.startsWith('Anmeldung abgebrochen') || e.message.startsWith('Bitte vor der ersten Anmeldung')) ? e.message : 'Die Anmeldung ist fehlgeschlagen. Bitte erneut versuchen.');
  }
});

export = router;

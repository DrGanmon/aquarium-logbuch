'use strict';
const express = require('express');
const db = require('../db');
const { OIDC_PROVIDER_NAME, APP_URL } = require('../config/env');
const { oidc, appRedirect, userForClaims } = require('../services/oidc-service');
const { parseCookies, setCookie, startSession } = require('../utils/cookies');
const { auth } = require('../middleware/auth');

const router = express.Router();

router.get('/login', async (req, res) => {
  if (!oidc) return res.status(404).end();
  try {
    const { url, state } = await oidc.startLogin();
    setCookie(res, 'oidc_state', state, 600);
    res.redirect(302, url);
  } catch (e) {
    console.error('OIDC-Login fehlgeschlagen:', e.message);
    appRedirect(res, `${OIDC_PROVIDER_NAME} ist nicht erreichbar.`);
  }
});

router.get('/link', auth, async (req, res) => {
  if (!oidc) return res.status(404).end();
  try {
    const { url, state } = await oidc.startLogin();
    setCookie(res, 'oidc_state', state, 600);
    setCookie(res, 'oidc_link_user', String(req.user.id), 600);
    res.redirect(302, url);
  } catch (e) {
    console.error('OIDC-Link fehlgeschlagen:', e.message);
    appRedirect(res, `${OIDC_PROVIDER_NAME} ist nicht erreichbar.`);
  }
});

router.get('/callback', async (req, res) => {
  if (!oidc) return res.status(404).end();
  const cookies = parseCookies(req);
  const cookieState = cookies.oidc_state;
  const linkUserId = cookies.oidc_link_user ? Number(cookies.oidc_link_user) : null;
  setCookie(res, 'oidc_state', '', 0);
  setCookie(res, 'oidc_link_user', '', 0);
  try {
    const { claims, idToken } = await oidc.finishLogin(req.query, cookieState);
    const sub = String(claims.sub);
    const email = claims.email ? String(claims.email).trim().toLowerCase() : null;

    if (linkUserId) {
      const targetUser = await db.users.findById(linkUserId);
      if (!targetUser) return appRedirect(res, 'Benutzerkonto nicht gefunden.');
      const conflict = await db.users.findByOidcSub(sub, linkUserId);
      if (conflict) {
        return appRedirect(res, `Diese ${OIDC_PROVIDER_NAME}-Kennung ist bereits mit dem Konto „${conflict.username}“ verknüpft.`);
      }
      await db.users.update(linkUserId, { oidc_sub: sub, email: email || targetUser.email });
      await startSession(res, db, linkUserId, idToken);
      return res.redirect(302, `${APP_URL}/?oidc_linked=1`);
    }

    const user = await userForClaims(claims, db);
    if (!user) {
      return appRedirect(res, 'Für dieses Konto ist kein Zugang eingerichtet (Registrierung ist deaktiviert).');
    }
    await startSession(res, db, user.id, idToken);
    appRedirect(res);
  } catch (e) {
    console.error('OIDC-Callback fehlgeschlagen:', e.message);
    appRedirect(res, e.message.startsWith('Anmeldung abgebrochen') ? e.message : 'Die Anmeldung ist fehlgeschlagen. Bitte erneut versuchen.');
  }
});

module.exports = router;

'use strict';
const { createOidc } = require('../../oidc');
const {
  OIDC_ENABLED,
  OIDC_ISSUER,
  OIDC_CLIENT_ID,
  OIDC_CLIENT_SECRET,
  OIDC_SCOPES,
  OIDC_LINK_BY_USERNAME,
  ALLOW_REGISTRATION,
  APP_URL,
} = require('../config/env');
const { registrationService } = require('./registration-service');

const oidc = OIDC_ENABLED
  ? createOidc({
      issuer: OIDC_ISSUER,
      clientId: OIDC_CLIENT_ID,
      clientSecret: OIDC_CLIENT_SECRET,
      redirectUri: `${APP_URL}/auth/callback`,
      scopes: OIDC_SCOPES,
    })
  : null;

function appRedirect(res, error) {
  res.redirect(302, `${APP_URL}/${error ? '?auth_error=' + encodeURIComponent(error) : ''}`);
}

// Freien, gültigen Benutzernamen aus den OIDC-Claims ableiten
async function usernameFromClaims(claims, db) {
  const raw = claims.preferred_username || (claims.email ? String(claims.email).split('@')[0] : '') || claims.name || 'benutzer';
  let base = String(raw).normalize('NFC').replace(/[^\p{L}\p{N}_.-]+/gu, '_').slice(0, 36);
  if (base.length < 3) base = (base + '_user').slice(0, 36);
  let name = base;
  for (let i = 2; await db.users.findByUsername(name); i++) {
    name = `${base}-${i}`;
  }
  return name;
}

async function userForClaims(claims, db) {
  const sub = String(claims.sub);
  const email = claims.email ? String(claims.email).trim().toLowerCase() : null;
  const existing = await db.users.findByOidcSub(sub);
  if (existing) {
    if (email && existing.email !== email) {
      await db.users.update(existing.id, { email });
      existing.email = email;
    }
    return existing;
  }
  // Lokales Konto mit gleicher E-Mail-Adresse automatisch zuordnen
  if (email) {
    const localByEmail = await db.users.findByEmail(email);
    if (localByEmail && !localByEmail.oidc_sub) {
      await db.users.update(localByEmail.id, { oidc_sub: sub, email_verified: 1 });
      return { ...localByEmail, oidc_sub: sub, email_verified: 1 };
    }
  }
  // Optional: vorhandenes lokales Konto mit gleichem Benutzernamen übernehmen (Migration)
  if (OIDC_LINK_BY_USERNAME && claims.preferred_username) {
    const local = await db.users.findByUsername(String(claims.preferred_username));
    if (local && !local.oidc_sub) {
      await db.users.update(local.id, { oidc_sub: sub, email: email || local.email, email_verified: 1 });
      return { ...local, oidc_sub: sub, email: email || local.email, email_verified: 1 };
    }
  }
  if (!ALLOW_REGISTRATION || registrationService.getConfig().isClosed) return null;
  const username = await usernameFromClaims(claims, db);
  const user = await db.users.create({
    username,
    password_hash: '',
    oidc_sub: sub,
    email,
    email_verified: 1,
  });
  return { id: user.id, username, email };
}

module.exports = {
  oidc,
  appRedirect,
  usernameFromClaims,
  userForClaims,
};

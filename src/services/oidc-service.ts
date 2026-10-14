import { TERMS_VERSION } from './terms-service';
import type { Response } from 'express';
'use strict';
import oidcModule = require('./oidc-client');
const { createOidc } = oidcModule;
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
import registration_serviceModule = require('./registration-service');
const { registrationService } = registration_serviceModule;

const oidc = OIDC_ENABLED
  ? createOidc({
      issuer: OIDC_ISSUER,
      clientId: OIDC_CLIENT_ID,
      clientSecret: OIDC_CLIENT_SECRET,
      redirectUri: `${APP_URL}/auth/callback`,
      scopes: OIDC_SCOPES,
    })
  : null;

function appRedirect(res: Response, error?: any) {
  res.redirect(302, `${APP_URL}/${error ? '?auth_error=' + encodeURIComponent(error) : ''}`);
}

// Freien, gültigen Benutzernamen aus den OIDC-Claims ableiten
async function usernameFromClaims(claims?: any, db?: any) {
  const raw = claims.preferred_username || (claims.email ? String(claims.email).split('@')[0] : '') || claims.name || 'benutzer';
  let base = String(raw).normalize('NFC').replace(/[^\p{L}\p{N}_.-]+/gu, '_').slice(0, 36);
  if (base.length < 3) base = (base + '_user').slice(0, 36);
  let name = base;
  for (let i = 2; await db.users.findByUsername(name); i++) {
    name = `${base}-${i}`;
  }
  return name;
}

async function userForClaims(claims?: any, db?: any, terms: { version: string; acceptedAt: string } | null = null) {
  if (typeof claims?.sub !== 'string' || !claims.sub.trim()) throw new Error('OIDC subject fehlt.');
  const sub = claims.sub;
  const verifiedEmail = claims.email_verified === true;
  const email = claims.email ? String(claims.email).trim().toLowerCase() : null;
  const existing = await db.users.findByOidcSub(sub);
  if (existing) {
    if (verifiedEmail && email && (existing.email !== email || !existing.email_verified)) {
      await db.users.update(existing.id, { email, email_verified: 1 });
      existing.email_verified = 1;
      existing.email = email;
    }
    return existing;
  }
  // Lokales Konto mit gleicher E-Mail-Adresse automatisch zuordnen
  if (verifiedEmail && email) {
    const localByEmail = await db.users.findByEmail(email);
    if (localByEmail && !localByEmail.oidc_sub) {
      const linked = await db.users.update(localByEmail.id, { oidc_sub: sub, email_verified: 1 }, { oidc_sub: null, email: localByEmail.email });
      if (!linked) return null;
      return { ...localByEmail, oidc_sub: sub, email_verified: 1 };
    }
  }
  // Optional: vorhandenes lokales Konto mit gleichem Benutzernamen übernehmen (Migration)
  if (OIDC_LINK_BY_USERNAME && verifiedEmail && email && claims.preferred_username) {
    const local = await db.users.findByUsername(String(claims.preferred_username));
    if (local && !local.oidc_sub && local.email?.toLowerCase() === email) {
      const linked = await db.users.update(local.id, { oidc_sub: sub, email, email_verified: 1 }, { oidc_sub: null, email: local.email });
      if (!linked) return null;
      return { ...local, oidc_sub: sub, email: email || local.email, email_verified: 1 };
    }
  }
  if (!ALLOW_REGISTRATION || (registrationService.getConfig().isClosed || registrationService.getConfig().isInviteOnly)) return null;
  if (terms?.version !== TERMS_VERSION || !terms.acceptedAt) throw new Error('Bitte vor der ersten Anmeldung die aktuellen AGB akzeptieren.');
  const username = await usernameFromClaims(claims, db);
  const user = await db.users.create({
    username,
    password_hash: '', terms_version: terms.version, terms_accepted_at: terms.acceptedAt,
    oidc_sub: sub,
    email,
    email_verified: verifiedEmail ? 1 : 0,
  });
  return { ...user, email_verified: verifiedEmail ? 1 : 0 };
}

export = {
  oidc,
  appRedirect,
  usernameFromClaims,
  userForClaims,
};

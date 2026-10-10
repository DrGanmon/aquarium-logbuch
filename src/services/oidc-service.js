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
function usernameFromClaims(claims, db) {
  const raw = claims.preferred_username || (claims.email ? String(claims.email).split('@')[0] : '') || claims.name || 'benutzer';
  let base = String(raw).normalize('NFC').replace(/[^\p{L}\p{N}_.-]+/gu, '_').slice(0, 36);
  if (base.length < 3) base = (base + '_user').slice(0, 36);
  let name = base;
  for (let i = 2; db.prepare('SELECT 1 FROM users WHERE username = ?').get(name); i++) {
    name = `${base}-${i}`;
  }
  return name;
}

function userForClaims(claims, db) {
  const sub = String(claims.sub);
  const email = claims.email ? String(claims.email).trim().toLowerCase() : null;
  const existing = db.prepare('SELECT id, username, email FROM users WHERE oidc_sub = ?').get(sub);
  if (existing) {
    if (email && existing.email !== email) {
      db.prepare('UPDATE users SET email = ? WHERE id = ?').run(email, existing.id);
      existing.email = email;
    }
    return existing;
  }
  // Lokales Konto mit gleicher E-Mail-Adresse automatisch zuordnen
  if (email) {
    const localByEmail = db.prepare('SELECT id, username, email FROM users WHERE email = ? AND oidc_sub IS NULL').get(email);
    if (localByEmail) {
      db.prepare('UPDATE users SET oidc_sub = ? WHERE id = ?').run(sub, localByEmail.id);
      return localByEmail;
    }
  }
  // Optional: vorhandenes lokales Konto mit gleichem Benutzernamen übernehmen (Migration)
  if (OIDC_LINK_BY_USERNAME && claims.preferred_username) {
    const local = db.prepare('SELECT id, username, email FROM users WHERE username = ? AND oidc_sub IS NULL').get(String(claims.preferred_username));
    if (local) {
      db.prepare('UPDATE users SET oidc_sub = ?, email = COALESCE(?, email) WHERE id = ?').run(sub, email, local.id);
      return { ...local, email: email || local.email };
    }
  }
  if (!ALLOW_REGISTRATION) return null;
  const username = usernameFromClaims(claims, db);
  const info = db.prepare('INSERT INTO users (username, password_hash, oidc_sub, email) VALUES (?, ?, ?, ?)').run(username, '', sub, email);
  return { id: info.lastInsertRowid, username, email };
}

module.exports = {
  oidc,
  appRedirect,
  usernameFromClaims,
  userForClaims,
};

'use strict';
const crypto = require('crypto');
const { COOKIE_PATH, COOKIE_SECURE, SESSION_DAYS } = require('../config/env');
const { sha } = require('./crypto');

function parseCookies(req) {
  const out = {};
  (req.headers.cookie || '').split(';').forEach((p) => {
    const i = p.indexOf('=');
    if (i > 0) out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim());
  });
  return out;
}

function setCookie(res, name, value, maxAgeSec) {
  const parts = [`${name}=${encodeURIComponent(value)}`, `Path=${COOKIE_PATH}`, 'HttpOnly', 'SameSite=Lax', `Max-Age=${maxAgeSec}`];
  if (COOKIE_SECURE) parts.push('Secure');
  const prev = res.getHeader('Set-Cookie');
  res.setHeader('Set-Cookie', [...(prev ? [].concat(prev) : []), parts.join('; ')]);
}

const setSessionCookie = (res, token, maxAgeSec) => setCookie(res, 'session', token, maxAgeSec);

function startSession(res, db, userId, idToken = null) {
  const token = crypto.randomBytes(32).toString('hex');
  const maxAge = SESSION_DAYS * 86400;
  db.prepare('INSERT INTO sessions (token_hash, user_id, expires_at, id_token) VALUES (?, ?, ?, ?)').run(
    sha(token),
    userId,
    Date.now() + maxAge * 1000,
    idToken
  );
  db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(Date.now());
  setSessionCookie(res, token, maxAge);
}

module.exports = {
  parseCookies,
  setCookie,
  setSessionCookie,
  startSession,
};

import type { Request, Response } from 'express';
'use strict';
import crypto = require('crypto');
import envModule = require('../config/env');
const { COOKIE_PATH, COOKIE_SECURE, SESSION_DAYS } = envModule;
import cryptoModule = require('./crypto');
const { sha } = cryptoModule;

function parseCookies(req: Request) {
  const out: Record<string, string> = {};
  (req.headers.cookie || '').split(';').forEach((p: any) => {
    const i = p.indexOf('=');
    if (i > 0) out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim());
  });
  return out;
}

function setCookie(res: Response, name?: any, value?: any, maxAgeSec?: any) {
  const parts = [`${name}=${encodeURIComponent(value)}`, `Path=${COOKIE_PATH}`, 'HttpOnly', 'SameSite=Lax', `Max-Age=${maxAgeSec}`];
  if (COOKIE_SECURE) parts.push('Secure');
  const prev = res.getHeader('Set-Cookie');
  res.setHeader('Set-Cookie', [...(prev ? Array.isArray(prev) ? prev : [String(prev)] : []), parts.join('; ')]);
}

const setSessionCookie = (res: Response, token?: any, maxAgeSec?: any) => setCookie(res, 'session', token, maxAgeSec);
const clearSessionCookie = (res: Response) => setCookie(res, 'session', '', 0);

async function startSession(res: Response, db?: any, userId?: any, idToken: any = null) {
  const token = crypto.randomBytes(32).toString('hex');
  const maxAge = SESSION_DAYS * 86400;
  await db.sessions.create(sha(token), userId, Date.now() + maxAge * 1000, idToken);
  try {
    db.sessions.cleanExpired().catch(() => {});
  } catch (e) {
    // Ignore async cleanup error
  }
  setSessionCookie(res, token, maxAge);
  return token;
}

export = {
  parseCookies,
  setCookie,
  setSessionCookie,
  clearSessionCookie,
  startSession,
};

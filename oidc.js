'use strict';
// OpenID Connect (Authorization Code Flow mit PKCE), z. B. gegen Pocket ID. Ohne externe Pakete.
const crypto = require('crypto');

const b64url = (buf) => Buffer.from(buf).toString('base64url');
const fromB64url = (s) => Buffer.from(s, 'base64url');

const ALGS = {
  RS256: { hash: 'sha256' }, RS384: { hash: 'sha384' }, RS512: { hash: 'sha512' },
  PS256: { hash: 'sha256', pss: true }, PS384: { hash: 'sha384', pss: true }, PS512: { hash: 'sha512', pss: true },
  ES256: { hash: 'sha256', ec: true }, ES384: { hash: 'sha384', ec: true }, ES512: { hash: 'sha512', ec: true },
  EdDSA: { hash: null },
};
const CLOCK_SKEW = 120; // Sekunden
const PENDING_TTL = 10 * 60 * 1000;

function createOidc({ issuer, clientId, clientSecret, redirectUri, scopes = 'openid profile email' }) {
  const base = issuer.replace(/\/+$/, '');
  let discovery = null;
  let discoveryAt = 0;
  let jwks = null;
  const pending = new Map(); // state -> { verifier, nonce, created }

  async function getJson(url, opts = {}) {
    const res = await fetch(url, { ...opts, headers: { Accept: 'application/json', ...(opts.headers || {}) }, signal: AbortSignal.timeout(10000) });
    const text = await res.text();
    let data;
    try { data = JSON.parse(text); } catch (e) { throw new Error(`Ungültige Antwort von ${url} (HTTP ${res.status})`); }
    if (!res.ok) throw new Error(`${url}: HTTP ${res.status} ${data.error_description || data.error || ''}`.trim());
    return data;
  }

  async function config() {
    if (!discovery || Date.now() - discoveryAt > 3600 * 1000) {
      const d = await getJson(`${base}/.well-known/openid-configuration`);
      if (!d.authorization_endpoint || !d.token_endpoint || !d.jwks_uri || !d.issuer) throw new Error('OIDC-Discovery unvollständig.');
      discovery = d;
      discoveryAt = Date.now();
      jwks = null;
    }
    return discovery;
  }

  async function findKey(header) {
    for (let attempt = 0; attempt < 2; attempt++) {
      if (!jwks || attempt === 1) jwks = (await getJson((await config()).jwks_uri)).keys || [];
      const candidates = jwks.filter((k) => (!k.use || k.use === 'sig') && (!header.kid || k.kid === header.kid) && (!k.alg || k.alg === header.alg));
      if (candidates.length) return crypto.createPublicKey({ key: candidates[0], format: 'jwk' });
    }
    throw new Error('Kein passender Schlüssel für das ID-Token gefunden.');
  }

  async function verifyIdToken(token, nonce) {
    const parts = String(token || '').split('.');
    if (parts.length !== 3) throw new Error('ID-Token fehlt oder ist ungültig.');
    const header = JSON.parse(fromB64url(parts[0]).toString('utf8'));
    const alg = ALGS[header.alg];
    if (!alg) throw new Error(`Nicht unterstützter Signatur-Algorithmus: ${header.alg}`);
    const key = await findKey(header);
    const verifyKey = { key };
    if (alg.pss) Object.assign(verifyKey, { padding: crypto.constants.RSA_PKCS1_PSS_PADDING, saltLength: crypto.constants.RSA_PSS_SALTLEN_DIGEST });
    if (alg.ec) verifyKey.dsaEncoding = 'ieee-p1363';
    const ok = crypto.verify(alg.hash, Buffer.from(`${parts[0]}.${parts[1]}`), verifyKey, fromB64url(parts[2]));
    if (!ok) throw new Error('Signatur des ID-Tokens ist ungültig.');

    const claims = JSON.parse(fromB64url(parts[1]).toString('utf8'));
    const now = Math.floor(Date.now() / 1000);
    const aud = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
    if (claims.iss !== (await config()).issuer) throw new Error('ID-Token: falscher Aussteller (iss).');
    if (!aud.includes(clientId)) throw new Error('ID-Token: falsche Zielgruppe (aud).');
    if (aud.length > 1 && claims.azp && claims.azp !== clientId) throw new Error('ID-Token: falscher azp.');
    if (typeof claims.exp !== 'number' || claims.exp + CLOCK_SKEW < now) throw new Error('ID-Token ist abgelaufen.');
    if (typeof claims.iat === 'number' && claims.iat - CLOCK_SKEW > now) throw new Error('ID-Token liegt in der Zukunft.');
    if (claims.nonce !== nonce) throw new Error('ID-Token: nonce stimmt nicht.');
    if (!claims.sub) throw new Error('ID-Token ohne sub.');
    return claims;
  }

  function cleanup() {
    const now = Date.now();
    for (const [k, v] of pending) if (now - v.created > PENDING_TTL) pending.delete(k);
  }

  // Liefert die URL, zu der der Browser umgeleitet wird, und den state für das Cookie
  async function startLogin() {
    const d = await config();
    cleanup();
    const state = b64url(crypto.randomBytes(24));
    const nonce = b64url(crypto.randomBytes(24));
    const verifier = b64url(crypto.randomBytes(48));
    pending.set(state, { verifier, nonce, created: Date.now() });
    const url = new URL(d.authorization_endpoint);
    url.search = new URLSearchParams({
      response_type: 'code',
      client_id: clientId,
      redirect_uri: redirectUri,
      scope: scopes,
      state,
      nonce,
      code_challenge: b64url(crypto.createHash('sha256').update(verifier).digest()),
      code_challenge_method: 'S256',
    }).toString();
    return { url: url.toString(), state };
  }

  // Prüft den Rücksprung vom Anbieter und gibt die Claims des Benutzers zurück
  async function finishLogin(query, cookieState) {
    if (query.error) throw new Error(`Anmeldung abgebrochen: ${query.error_description || query.error}`);
    const state = typeof query.state === 'string' ? query.state : '';
    const code = typeof query.code === 'string' ? query.code : '';
    if (!state || !cookieState || state.length !== cookieState.length || !crypto.timingSafeEqual(Buffer.from(state), Buffer.from(cookieState))) {
      throw new Error('Ungültiger Anmeldestatus. Bitte erneut anmelden.');
    }
    const p = pending.get(state);
    pending.delete(state);
    if (!p || Date.now() - p.created > PENDING_TTL) throw new Error('Die Anmeldung hat zu lange gedauert. Bitte erneut anmelden.');
    if (!code) throw new Error('Kein Autorisierungscode erhalten.');

    const d = await config();
    const body = new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: redirectUri, code_verifier: p.verifier });
    const headers = { 'Content-Type': 'application/x-www-form-urlencoded' };
    if (clientSecret) headers.Authorization = 'Basic ' + Buffer.from(`${encodeURIComponent(clientId)}:${encodeURIComponent(clientSecret)}`).toString('base64');
    else body.set('client_id', clientId);
    const tokens = await getJson(d.token_endpoint, { method: 'POST', headers, body: body.toString() });

    let claims = await verifyIdToken(tokens.id_token, p.nonce);
    if (!claims.preferred_username && !claims.email && d.userinfo_endpoint && tokens.access_token) {
      try {
        const info = await getJson(d.userinfo_endpoint, { headers: { Authorization: `Bearer ${tokens.access_token}` } });
        if (info.sub === claims.sub) claims = { ...info, ...claims };
      } catch (e) { /* Userinfo ist optional */ }
    }
    return { claims, idToken: tokens.id_token };
  }

  async function logoutUrl(idToken, postLogoutRedirectUri) {
    try {
      const d = await config();
      if (!d.end_session_endpoint) return null;
      const url = new URL(d.end_session_endpoint);
      const params = { client_id: clientId, post_logout_redirect_uri: postLogoutRedirectUri };
      if (idToken) params.id_token_hint = idToken;
      url.search = new URLSearchParams(params).toString();
      return url.toString();
    } catch (e) {
      return null;
    }
  }

  return { startLogin, finishLogin, logoutUrl, config };
}

module.exports = { createOidc };

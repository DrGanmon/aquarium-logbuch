// OpenID Connect (Authorization Code Flow mit PKCE), z. B. gegen Pocket ID. Ohne externe Pakete.
import crypto = require('crypto');

const b64url = (buf: any) => Buffer.from(buf).toString('base64url');
const fromB64url = (s: any) => Buffer.from(s, 'base64url');

const ALGS: Record<string, any> = {
  RS256: { hash: 'sha256' }, RS384: { hash: 'sha384' }, RS512: { hash: 'sha512' },
  PS256: { hash: 'sha256', pss: true }, PS384: { hash: 'sha384', pss: true }, PS512: { hash: 'sha512', pss: true },
  ES256: { hash: 'sha256', ec: true }, ES384: { hash: 'sha384', ec: true }, ES512: { hash: 'sha512', ec: true },
  EdDSA: { hash: null },
};
const CLOCK_SKEW = 120; // Sekunden
const PENDING_TTL = 10 * 60 * 1000;

function createOidc({ issuer, clientId, clientSecret, redirectUri, scopes = 'openid profile email', stateSecret = clientSecret || crypto.randomBytes(32).toString('hex') }: any) {
  const base = issuer.replace(/\/+$/, '');
  const internalSecret = crypto.createHash('sha256').update(stateSecret).update('\0').update(base).update('\0').update(clientId).update('\0').update(redirectUri).digest();
  let discovery: Record<string, any> | null = null;
  let discoveryAt = 0;
  let jwks: (crypto.JsonWebKey & { use?: string; kid?: string; alg?: string })[] | null = null;
  const pending = new Map(); // state -> { verifier, nonce, created }

  // Authenticate and encrypt the PKCE verifier; a signed plaintext state would expose it in URLs.
  function signState(data: unknown) {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', internalSecret, iv);
    const encrypted = Buffer.concat([cipher.update(JSON.stringify(data), 'utf8'), cipher.final()]);
    return `v2.${b64url(iv)}.${b64url(encrypted)}.${b64url(cipher.getAuthTag())}`;
  }

  function verifyStateToken(stateStr: unknown) {
    if (typeof stateStr !== 'string' || stateStr.length > 4096) return null;
    const parts = stateStr.split('.');
    if (parts.length !== 4 || parts[0] !== 'v2') return null;
    try {
      const iv = fromB64url(parts[1]), tag = fromB64url(parts[3]);
      if (iv.length !== 12 || tag.length !== 16) return null;
      const decipher = crypto.createDecipheriv('aes-256-gcm', internalSecret, iv);
      decipher.setAuthTag(tag);
      const plaintext = Buffer.concat([decipher.update(fromB64url(parts[2])), decipher.final()]);
      const data = JSON.parse(plaintext.toString('utf8'));
      if (!data || typeof data !== 'object' || !Number.isSafeInteger(data.t)
        || Date.now() - data.t > PENDING_TTL || data.t > Date.now() + CLOCK_SKEW * 1000
        || typeof data.v !== 'string' || typeof data.n !== 'string') return null;
      return data;
    } catch { return null; }
  }

  async function getJson(url?: any, opts: any = {}) {
    const res = await fetch(url, { ...opts, headers: { Accept: 'application/json', ...(opts.headers || {}) }, signal: AbortSignal.timeout(10000) });
    const text = await res.text();
    let data;
    try { data = JSON.parse(text); } catch (cause) { throw new Error(`Ungültige Antwort von ${url} (HTTP ${res.status})`, { cause }); }
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
    if (!discovery) throw new Error('OIDC-Discovery fehlt.');
    return discovery;
  }

  async function findKey(header?: any) {
    for (let attempt = 0; attempt < 2; attempt++) {
      if (!jwks || attempt === 1) {
        const keys = (await getJson((await config()).jwks_uri)).keys;
        jwks = Array.isArray(keys) ? keys : [];
      }
      const candidates = jwks.filter((k: any) => (!k.use || k.use === 'sig') && (!header.kid || k.kid === header.kid) && (!k.alg || k.alg === header.alg));
      if (candidates.length) return crypto.createPublicKey({ key: candidates[0], format: 'jwk' });
    }
    throw new Error('Kein passender Schlüssel für das ID-Token gefunden.');
  }

  async function verifyIdToken(token?: any, nonce?: any) {
    const parts = String(token || '').split('.');
    if (parts.length !== 3) throw new Error('ID-Token fehlt oder ist ungültig.');
    const header = JSON.parse(fromB64url(parts[0]).toString('utf8'));
    const alg = Object.hasOwn(ALGS, header.alg) ? ALGS[header.alg] : undefined;
    if (!alg) throw new Error(`Nicht unterstützter Signatur-Algorithmus: ${header.alg}`);
    const key = await findKey(header);
    const verifyKey: crypto.VerifyKeyObjectInput = { key };
    if (alg.pss) Object.assign(verifyKey, { padding: crypto.constants.RSA_PKCS1_PSS_PADDING, saltLength: crypto.constants.RSA_PSS_SALTLEN_DIGEST });
    if (alg.ec) verifyKey.dsaEncoding = 'ieee-p1363';
    const ok = crypto.verify(alg.hash, Buffer.from(`${parts[0]}.${parts[1]}`), verifyKey, fromB64url(parts[2]));
    if (!ok) throw new Error('Signatur des ID-Tokens ist ungültig.');

    const claims = JSON.parse(fromB64url(parts[1]).toString('utf8'));
    const now = Math.floor(Date.now() / 1000);
    const aud = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
    if (claims.iss !== (await config()).issuer) throw new Error('ID-Token: falscher Aussteller (iss).');
    if (!aud.includes(clientId)) throw new Error('ID-Token: falsche Zielgruppe (aud).');
    if (aud.length > 1 && claims.azp !== clientId) throw new Error('ID-Token: falscher azp.');
    if (typeof claims.exp !== 'number' || claims.exp + CLOCK_SKEW < now) throw new Error('ID-Token ist abgelaufen.');
    if (typeof claims.iat === 'number' && claims.iat - CLOCK_SKEW > now) throw new Error('ID-Token liegt in der Zukunft.');
    if (claims.nonce !== nonce) throw new Error('ID-Token: nonce stimmt nicht.');
    if (typeof claims.sub !== 'string' || !claims.sub.trim()) throw new Error('ID-Token ohne gültigen sub.');
    return claims;
  }

  function cleanup() {
    const now = Date.now();
    for (const [k, v] of pending) if (now - v.created > PENDING_TTL) pending.delete(k);
  }

  // Liefert die URL, zu der der Browser umgeleitet wird, und den state für das Cookie
  async function startLogin(terms: { version: string; acceptedAt: string } | null = null) {
    const d = await config();
    cleanup();
    const nonce = b64url(crypto.randomBytes(24));
    const verifier = b64url(crypto.randomBytes(48));
    const random = b64url(crypto.randomBytes(16));
    const state = signState({ s: random, n: nonce, v: verifier, t: Date.now(), terms });
    if (pending.size >= 1000) pending.delete(pending.keys().next().value);
    pending.set(state, { verifier, nonce, created: Date.now(), terms });
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
  async function finishLogin(query?: any, cookieState?: any) {
    if (query.error) throw new Error(`Anmeldung abgebrochen: ${query.error_description || query.error}`);
    const state = typeof query.state === 'string' ? query.state : '';
    const code = typeof query.code === 'string' ? query.code : '';
    if (!state || !cookieState || state.length !== cookieState.length || !crypto.timingSafeEqual(Buffer.from(state), Buffer.from(cookieState))) {
      throw new Error('Ungültiger Anmeldestatus. Bitte erneut anmelden.');
    }
    let p = pending.get(state);
    if (p) {
      pending.delete(state);
    } else {
      const verified = verifyStateToken(state);
      if (verified) {
        p = { verifier: verified.v, nonce: verified.n, created: verified.t, terms: verified.terms || null };
      }
    }
    if (!p || Date.now() - p.created > PENDING_TTL) throw new Error('Die Anmeldung hat zu lange gedauert. Bitte erneut anmelden.');
    if (!code) throw new Error('Kein Autorisierungscode erhalten.');

    const d = await config();
    const body = new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: redirectUri, code_verifier: p.verifier });
    const headers: Record<string, any> = { 'Content-Type': 'application/x-www-form-urlencoded' };
    if (clientSecret) headers.Authorization = 'Basic ' + Buffer.from(`${encodeURIComponent(clientId)}:${encodeURIComponent(clientSecret)}`).toString('base64');
    else body.set('client_id', clientId);
    const tokens = await getJson(d.token_endpoint, { method: 'POST', headers, body: body.toString() });

    let claims = await verifyIdToken(tokens.id_token, p.nonce);
    if (!claims.preferred_username && !claims.email && d.userinfo_endpoint && tokens.access_token) {
      try {
        const info = await getJson(d.userinfo_endpoint, { headers: { Authorization: `Bearer ${tokens.access_token}` } });
        if (info.sub === claims.sub) claims = { ...info, ...claims };
      } catch { /* Userinfo ist optional */ }
    }
    return { claims, idToken: tokens.id_token, terms: p.terms || null };
  }

  async function logoutUrl(idToken?: any, postLogoutRedirectUri?: any) {
    try {
      const d = await config();
      if (!d.end_session_endpoint) return null;
      const url = new URL(d.end_session_endpoint);
      const params: Record<string, any> = { client_id: clientId, post_logout_redirect_uri: postLogoutRedirectUri };
      if (idToken) params.id_token_hint = idToken;
      url.search = new URLSearchParams(params).toString();
      return url.toString();
    } catch {
      return null;
    }
  }

  return { startLogin, finishLogin, logoutUrl, config };
}

export = { createOidc };

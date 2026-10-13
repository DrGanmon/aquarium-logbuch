'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const crypto = require('crypto');
const { createTestEnvironment } = require('./helpers/env');

// Mock OIDC Server Setup
function createMockOidcServer(alg = 'RS256') {
  let keyPair;
  let jwk;

  if (alg === 'ES256') {
    keyPair = crypto.generateKeyPairSync('ec', {
      namedCurve: 'P-256',
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });
    jwk = crypto.createPublicKey(keyPair.publicKey).export({ format: 'jwk' });
    jwk.kid = 'test-ec-key';
    jwk.alg = 'ES256';
  } else {
    keyPair = crypto.generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });
    jwk = crypto.createPublicKey(keyPair.publicKey).export({ format: 'jwk' });
    jwk.kid = 'test-rsa-key';
    jwk.alg = 'RS256';
  }
  jwk.use = 'sig';

  const authCodes = new Map();
  let server;
  let issuerUrl = '';

  const start = () => new Promise((resolve, reject) => {
    server = http.createServer((req, res) => {
      const url = new URL(req.url, issuerUrl);
      if (url.pathname === '/.well-known/openid-configuration') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({
          issuer: issuerUrl,
          authorization_endpoint: `${issuerUrl}/auth`,
          token_endpoint: `${issuerUrl}/token`,
          jwks_uri: `${issuerUrl}/jwks`,
          end_session_endpoint: `${issuerUrl}/logout`,
        }));
      }
      if (url.pathname === '/jwks') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ keys: [jwk] }));
      }
      if (url.pathname === '/token' && req.method === 'POST') {
        let body = '';
        req.on('data', (c) => (body += c));
        req.on('end', () => {
          const params = new URLSearchParams(body);
          const code = params.get('code');
          const entry = authCodes.get(code);
          if (!entry) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ error: 'invalid_grant' }));
          }
          authCodes.delete(code);

          if (entry.tokenResponseOverride) {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify(entry.tokenResponseOverride));
          }

          const header = Buffer.from(JSON.stringify({ alg, typ: 'JWT', kid: jwk.kid })).toString('base64url');
          const payloadObj = {
            iss: entry.overrideIssuer || issuerUrl,
            aud: entry.overrideAudience || 'test-client-id',
            sub: entry.sub,
            email: entry.email,
            email_verified: entry.email_verified !== false,
            preferred_username: entry.username,
            nonce: entry.nonce,
            exp: entry.overrideExp || (Math.floor(Date.now() / 1000) + 3600),
            iat: Math.floor(Date.now() / 1000),
          };
          const payload = Buffer.from(JSON.stringify(payloadObj)).toString('base64url');

          let sig;
          if (alg === 'ES256') {
            const signer = crypto.createSign('SHA256');
            signer.update(`${header}.${payload}`);
            sig = signer.sign({ key: keyPair.privateKey, dsaEncoding: 'ieee-p1363' }).toString('base64url');
          } else {
            const signer = crypto.createSign('RSA-SHA256');
            signer.update(`${header}.${payload}`);
            sig = signer.sign(keyPair.privateKey).toString('base64url');
          }

          if (entry.corruptSignature) {
            sig = 'corrupted_signature_value';
          }

          const idToken = `${header}.${payload}.${sig}`;
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            access_token: 'mock-access-token',
            id_token: idToken,
            token_type: 'Bearer',
            expires_in: 3600,
          }));
        });
        return;
      }
      res.writeHead(404).end();
    });

    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      issuerUrl = `http://127.0.0.1:${port}`;
      resolve(issuerUrl);
    });
    server.on('error', reject);
  });

  const stop = () => new Promise((resolve) => {
    if (server) server.close(resolve);
    else resolve();
  });

  return {
    start,
    stop,
    getIssuerUrl: () => issuerUrl,
    setAuthCode: (code, data) => authCodes.set(code, data),
  };
}

test('OIDC: Login-Flow, Signaturen, Validierung, Verknüpfung und Unlink', async (t) => {
  const oidcMock = createMockOidcServer('RS256');
  const issuerUrl = await oidcMock.start();

  const env = createTestEnvironment({
    OIDC_ISSUER: issuerUrl,
    OIDC_CLIENT_ID: 'test-client-id',
    OIDC_CLIENT_SECRET: 'test-secret',
    APP_URL: 'http://127.0.0.1:4000',
    LOCAL_LOGIN: 'true',
    ADMIN_EMAIL: 'admin@example.com',
  });

  t.after(async () => {
    await env.cleanup();
    await oidcMock.stop();
  });

  // 1. Initialer Login-Redirect (/auth/login)
  const loginInit = await env.request('/auth/login');
  assert.strictEqual(loginInit.status, 302);
  const redirectTarget = new URL(loginInit.headers.get('location'));
  assert.strictEqual(redirectTarget.pathname, '/auth');
  const loginState = redirectTarget.searchParams.get('state');
  const loginNonce = redirectTarget.searchParams.get('nonce');
  const oidcStateCookie = loginInit.cookies.oidc_state;
  assert.ok(oidcStateCookie);

  // 2. Fehlerfall: Ungültiger State beim Callback
  const badStateRes = await env.request(`/auth/callback?code=some-code&state=wrong-state`, {
    headers: { Cookie: `oidc_state=${oidcStateCookie}` },
  });
  assert.strictEqual(badStateRes.status, 302);
  assert.ok(badStateRes.headers.get('location').includes('auth_error'));

  // 3. Fehlerfall: Manipulierte Signatur
  oidcMock.setAuthCode('code-tampered-sig', {
    sub: 'sub-tampered',
    username: 'tampered',
    nonce: loginNonce,
    corruptSignature: true,
  });
  const tamperedRes = await env.request(`/auth/callback?code=code-tampered-sig&state=${loginState}`, {
    headers: { Cookie: `oidc_state=${oidcStateCookie}` },
  });
  assert.strictEqual(tamperedRes.status, 302);
  assert.ok(tamperedRes.headers.get('location').includes('auth_error'));

  // A plain login may sign in existing accounts, but must never create a new account without acceptance.
  const noConsentInit = await env.request('/auth/login');
  const noConsentUrl = new URL(noConsentInit.headers.get('location'));
  oidcMock.setAuthCode('code-no-consent', { sub: 'no-consent-sub', email: 'no-consent@pocketid.test', username: 'no_consent', nonce: noConsentUrl.searchParams.get('nonce') });
  const noConsentResult = await env.request(`/auth/callback?code=code-no-consent&state=${noConsentUrl.searchParams.get('state')}`, { headers: { Cookie: `oidc_state=${noConsentInit.cookies.oidc_state}` } });
  assert.equal(noConsentResult.status, 302);
  assert.equal(noConsentResult.cookies.session, undefined);
  assert.match(decodeURIComponent(noConsentResult.headers.get('location')), /AGB akzeptieren/);
  assert.equal(await require('../dist/backend/src/db').users.findByOidcSub('no-consent-sub'), null);
  assert.equal((await env.request('/api/oidc/login', { method: 'POST', body: { acceptTerms: true, termsVersion: 'old' } })).status, 400);

  // 4. Erfolgreicher OIDC-Login (Neuer Benutzer)
  const loginInit2 = await env.request('/api/oidc/login', { method: 'POST', body: { acceptTerms: true, termsVersion: require('../dist/backend/src/services/terms-service').TERMS_VERSION } });
  assert.equal(loginInit2.status, 200);
  const url2 = new URL(loginInit2.data.url);
  const state2 = url2.searchParams.get('state');
  const nonce2 = url2.searchParams.get('nonce');
  const stateCookie2 = loginInit2.cookies.oidc_state;

  oidcMock.setAuthCode('code-success-1', {
    sub: 'pocket-sub-alice-001',
    email: 'alice@pocketid.test',
    username: 'alice_pocket',
    nonce: nonce2,
  });

  const callbackRes = await env.request(`/auth/callback?code=code-success-1&state=${state2}`, {
    headers: { Cookie: `oidc_state=${stateCookie2}` },
  });
  assert.strictEqual(callbackRes.status, 302);
  const sessionAlice = callbackRes.cookies.session;
  assert.ok(sessionAlice, 'Session-Cookie muss gesetzt werden');
  const dbForTerms = require('../dist/backend/src/db');
  const acceptedUser = await dbForTerms.users.findByOidcSub('pocket-sub-alice-001');
  assert.equal(acceptedUser.terms_version, require('../dist/backend/src/services/terms-service').TERMS_VERSION);
  assert.ok(acceptedUser.terms_accepted_at);

  // Prüfen von /api/me für Alice
  const meAlice = await env.request('/api/me', {
    headers: { Cookie: `session=${sessionAlice}` },
  });
  assert.strictEqual(meAlice.status, 200);
  assert.strictEqual(meAlice.data.hasOidc, true);
  assert.strictEqual(meAlice.data.hasPassword, false);
  assert.strictEqual(meAlice.data.email, 'alice@pocketid.test');

  // Versuch von Unlink ohne Passwort -> 400
  const unlinkNoPw = await env.request('/api/me/unlink-oidc', {
    method: 'POST',
    headers: { Cookie: `session=${sessionAlice}` },
  });
  assert.strictEqual(unlinkNoPw.status, 400);

  // 5. Automatische Zuordnung anhand gleicher E-Mail bei existierendem lokalem Benutzer
  const localBob = await env.createUserAndLogin('bob_local', 'passwordBob123', 'bob@matching-email.test');
  assert.strictEqual(localBob.cookies.session ? true : false, true);

  const loginInit3 = await env.request('/auth/login');
  const url3 = new URL(loginInit3.headers.get('location'));
  const state3 = url3.searchParams.get('state');
  const nonce3 = url3.searchParams.get('nonce');
  const stateCookie3 = loginInit3.cookies.oidc_state;

  oidcMock.setAuthCode('code-bob-email-match', {
    sub: 'pocket-sub-bob-002',
    email: 'bob@matching-email.test',
    username: 'bob_on_pocketid',
    nonce: nonce3,
  });

  const callbackBob = await env.request(`/auth/callback?code=code-bob-email-match&state=${state3}`, {
    headers: { Cookie: `oidc_state=${stateCookie3}` },
  });
  assert.strictEqual(callbackBob.status, 302);

  const meBob = await env.request('/api/me', {
    headers: { Cookie: `session=${callbackBob.cookies.session}` },
  });
  assert.strictEqual(meBob.data.id, localBob.id);
  assert.strictEqual(meBob.data.username, 'bob_local');
  assert.strictEqual(meBob.data.hasOidc, true);
  assert.strictEqual(meBob.data.hasPassword, true);

  // Bob hat Passwort, kann OIDC entkoppeln (Unlink)
  const unlinkBob = await env.request('/api/me/unlink-oidc', {
    method: 'POST',
    headers: { Cookie: `session=${callbackBob.cookies.session}` },
  });
  assert.strictEqual(unlinkBob.status, 200);

  const meBobAfterUnlink = await env.request('/api/me', {
    headers: { Cookie: `session=${callbackBob.cookies.session}` },
  });
  assert.strictEqual(meBobAfterUnlink.data.hasOidc, false);

  // Gefälschter Link-Cookie darf ohne Bobs Session kein bestehendes Konto übernehmen.
  const forgedInit = await env.request('/auth/login');
  const forgedUrl = new URL(forgedInit.headers.get('location'));
  oidcMock.setAuthCode('code-forged-link', {
    sub: 'attacker-sub', email: 'attacker@example.com', username: 'attacker',
    nonce: forgedUrl.searchParams.get('nonce'),
  });
  const forged = await env.request(`/auth/callback?code=code-forged-link&state=${forgedUrl.searchParams.get('state')}`, {
    headers: { Cookie: `oidc_state=${forgedInit.cookies.oidc_state}; oidc_link_user=${localBob.id}` },
  });
  assert.ok(forged.headers.get('location').includes('auth_error'));
  assert.equal(forged.cookies.session, undefined);
  const meAfterAttack = await env.request('/api/me', { headers: { Cookie: `session=${callbackBob.cookies.session}` } });
  assert.equal(meAfterAttack.data.hasOidc, false);

  // 6. Selbstverknüpfung via /auth/link
  const linkInit = await env.request('/auth/link', {
    headers: { Cookie: `session=${callbackBob.cookies.session}` },
  });
  assert.strictEqual(linkInit.status, 302);
  const linkUrl = new URL(linkInit.headers.get('location'));
  const linkState = linkUrl.searchParams.get('state');
  const linkNonce = linkUrl.searchParams.get('nonce');
  const linkOidcState = linkInit.cookies.oidc_state;
  const linkOidcUser = linkInit.cookies.oidc_link_user;

  oidcMock.setAuthCode('code-link-bob', {
    sub: 'pocket-sub-bob-relinked',
    email: 'bob@matching-email.test',
    username: 'bob',
    nonce: linkNonce,
  });

  const linkCallback = await env.request(`/auth/callback?code=code-link-bob&state=${linkState}`, {
    headers: {
      Cookie: `session=${callbackBob.cookies.session}; oidc_state=${linkOidcState}; oidc_link_user=${linkOidcUser}`,
    },
  });
  assert.strictEqual(linkCallback.status, 302);
  assert.ok(linkCallback.headers.get('location').includes('oidc_linked=1'));

  const meBobRelinked = await env.request('/api/me', {
    headers: { Cookie: `session=${linkCallback.cookies.session}` },
  });
  assert.strictEqual(meBobRelinked.data.hasOidc, true);

  // 7. OIDC Logout Test
  const logoutRes = await env.request('/api/logout', {
    method: 'POST',
    headers: { Cookie: `session=${linkCallback.cookies.session}` },
  });
  assert.strictEqual(logoutRes.status, 200);
  assert.ok(logoutRes.data.redirect, 'Logout-URL zum OIDC End-Session Endpunkt muss vorhanden sein');
  assert.ok(logoutRes.data.redirect.includes('/logout'));
});

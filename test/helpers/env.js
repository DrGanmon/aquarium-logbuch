'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

/**
 * Erstellt eine isolierte Testumgebung für einen Testlauf.
 */
function createTestEnvironment(customEnv = {}) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aquarium-test-'));

  const envBackup = { ...process.env };
  const envVars = {
    DATA_DIR: dataDir,
    PORT: '0',
    ALLOW_REGISTRATION: 'true',
    LOCAL_LOGIN: 'true',
    NODE_ENV: 'test',
    ADMIN_EMAIL: 'admin@example.com',
    ...customEnv,
  };

  for (const [k, v] of Object.entries(envVars)) {
    if (v === null || v === undefined) {
      delete process.env[k];
    } else {
      process.env[k] = String(v);
    }
  }

  // Clear module cache to ensure fresh server instance with updated env
  for (const modPath of Object.keys(require.cache)) {
    if (!modPath.includes('node_modules')) {
      delete require.cache[modPath];
    }
  }

  const serverPath = path.resolve(__dirname, '../../server.js');
  const app = require(serverPath);
  const db = require('../../dist/backend/src/db');
  let server = null;
  let baseUrl = '';
  let startPromise = null;

  const start = async () => {
    if (baseUrl) return baseUrl;
    if (startPromise) return startPromise;
    startPromise = (async () => {
      await db.init();
      return new Promise((resolve, reject) => {
        server = http.createServer(app);
        server.listen(0, '127.0.0.1', () => {
          const port = server.address().port;
          baseUrl = `http://127.0.0.1:${port}`;
          resolve(baseUrl);
        });
        server.on('error', reject);
      });
    })();
    return startPromise;
  };

  const cleanup = async () => {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
    // Importing the SQLite adapter starts migrations, even without start().
    // Finish their backup writes before removing the data directory or changing env.
    if (db.type === 'sqlite') await db.init();
    await db.close();
    // Restore env
    for (const k of Object.keys(process.env)) {
      if (!(k in envBackup)) delete process.env[k];
    }
    Object.assign(process.env, envBackup);

    // Delete temp dir
    try {
      fs.rmSync(dataDir, { recursive: true, force: true });
    } catch (e) {
      // Ignore cleanup error
    }
  };

  /**
   * Führt einen HTTP-Request gegen den Test-Server aus.
   */
  async function request(pathStr, options = {}) {
    if (!baseUrl) await start();
    const url = `${baseUrl}${pathStr.startsWith('/') ? pathStr : '/' + pathStr}`;
    const headers = {
      'X-Requested-With': 'fetch',
      ...(options.headers || {}),
    };

    let body = options.body;
    // Existing account fixtures explicitly accept the current terms by default.
    // Pass termsConsent: false to exercise a request without that fixture default.
    if (pathStr === '/api/register' && body && options.termsConsent !== false) {
      const { TERMS_VERSION } = require('../../dist/backend/src/services/terms-service');
      body = { acceptTerms: true, termsVersion: TERMS_VERSION, ...body };
    }
    if (body && typeof body === 'object' && !(body instanceof Buffer) && !(body instanceof Uint8Array)) {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(body);
    }

    const res = await fetch(url, {
      method: options.method || 'GET',
      headers,
      body,
      redirect: options.redirect || 'manual',
    });

    let data;
    const text = await res.text();
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }

    const rawCookies = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
    const cookies = {};
    for (const c of rawCookies) {
      const part = c.split(';')[0];
      const idx = part.indexOf('=');
      if (idx > 0) {
        cookies[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim());
      }
    }

    return {
      status: res.status,
      headers: res.headers,
      data,
      text,
      cookies,
      cookieHeader: Object.entries(cookies).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('; '),
    };
  }

  /**
   * Hilfsfunktion zum Erstellen und Einloggen eines Benutzers.
   */
  async function createUserAndLogin(username, password = 'password123', email = null) {
    const userEmail = email || `${username}@example.com`;
    const regRes = await request('/api/register', {
      method: 'POST',
      body: { username, password, email: userEmail },
    });

    let cookie = regRes.cookieHeader;
    let cookies = regRes.cookies;
    let sessionToken = regRes.cookies?.session;

    if (regRes.data?.needsVerification) {
      const db = require('../../dist/backend/src/db');
      const u = await db.users.findByUsername(username);
      if (u && u.email_verify_token) {
        await request('/api/verify-email', {
          method: 'POST',
          body: { token: u.email_verify_token },
        });
      }
      const loginRes = await request('/api/login', {
        method: 'POST',
        body: { username, password },
      });
      cookie = loginRes.cookieHeader;
      cookies = loginRes.cookies;
      sessionToken = loginRes.cookies?.session;
    }

    return {
      id: regRes.data?.id,
      username,
      email: userEmail,
      cookie,
      cookies,
      sessionToken,
    };
  }

  return {
    app,
    start,
    cleanup,
    request,
    createUserAndLogin,
    getBaseUrl: () => baseUrl,
    getDataDir: () => dataDir,
  };
}

/**
 * Erstellt eine isolierte MongoDB-Testumgebung mit In-Memory-Server.
 */
async function createMongoTestEnvironment(customEnv = {}) {
  const { MongoMemoryReplSet } = require('mongodb-memory-server');
  const mongod = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  const uri = mongod.getUri();

  const env = createTestEnvironment({
    DB_TYPE: 'mongodb',
    MONGODB_URI: uri,
    ...customEnv,
  });

  const originalCleanup = env.cleanup;
  env.cleanup = async () => {
    await originalCleanup();
    try {
      await mongod.stop();
    } catch { /* Temporary resources may already have been removed. */ }
  };

  env.getMongoUri = () => uri;
  return env;
}

module.exports = {
  createTestEnvironment,
  createMongoTestEnvironment,
};

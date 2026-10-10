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
  let server = null;
  let baseUrl = '';

  const start = async () => {
    return new Promise((resolve, reject) => {
      server = http.createServer(app);
      server.listen(0, '127.0.0.1', () => {
        const port = server.address().port;
        baseUrl = `http://127.0.0.1:${port}`;
        resolve(baseUrl);
      });
      server.on('error', reject);
    });
  };

  const cleanup = async () => {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
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
    if (!server) await start();
    const url = `${baseUrl}${pathStr.startsWith('/') ? pathStr : '/' + pathStr}`;
    const headers = {
      'X-Requested-With': 'fetch',
      ...(options.headers || {}),
    };

    let body = options.body;
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

    let data = null;
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
    const regRes = await request('/api/register', {
      method: 'POST',
      body: { username, password, email },
    });
    return {
      id: regRes.data?.id,
      username,
      email,
      cookie: regRes.cookieHeader,
      cookies: regRes.cookies,
      sessionToken: regRes.cookies.session,
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

module.exports = {
  createTestEnvironment,
};

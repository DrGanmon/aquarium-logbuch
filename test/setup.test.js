'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createTestEnvironment } = require('./helpers/env');

test('Ersteinrichtung: erster Admin, SMTP und Backups werden einmalig eingerichtet', async (t) => {
  const env = createTestEnvironment({ ADMIN_EMAIL: '', LOCAL_LOGIN: 'true' });
  t.after(async () => await env.cleanup());
  const status = await env.request('/api/setup/status');
  assert.equal(status.status, 200);assert.equal(status.data.required, true);

  const incomplete = await env.request('/api/setup/complete', { method: 'POST', body: {
    username: 'first_admin', email: 'admin@setup.test', password: 'password123', acceptTerms: true,
    termsVersion: status.data.termsVersion, smtp: { enabled: false }, backup: { enabled: true, password: 'short' },
  } });
  assert.equal(incomplete.status, 400);

  const complete = await env.request('/api/setup/complete', { method: 'POST', body: {
    username: 'first_admin', email: 'admin@setup.test', password: 'password123', language: 'de',
    acceptTerms: true, termsVersion: status.data.termsVersion,
    smtp: { enabled: true, host: 'smtp.setup.test', port: 465, secure: true, user: 'mailer', pass: 'smtp-secret', from: 'Aquarium <mail@setup.test>' },
    backup: { enabled: true, password: 'backup-secret-123', intervalHours: 12, retentionCount: 7, includeFiles: true },
  } });
  assert.equal(complete.status, 201, complete.text);assert.ok(complete.cookies.session);
  assert.equal((await env.request('/api/setup/status')).data.required, false);
  const me = await env.request('/api/me', { headers: { Cookie: complete.cookieHeader } });
  assert.equal(me.status, 200);assert.equal(me.data.isAdmin, true);
  assert.equal((await env.request('/api/admin/users', { headers: { Cookie: complete.cookieHeader } })).status, 200);

  const mail = JSON.parse(fs.readFileSync(path.join(env.getDataDir(), 'mail-config.json'), 'utf8'));
  const backup = JSON.parse(fs.readFileSync(path.join(env.getDataDir(), 'backup-config.json'), 'utf8'));
  assert.equal(mail.host, 'smtp.setup.test');assert.equal(mail.enabled, true);
  assert.equal(backup.enabled, true);assert.equal(backup.intervalHours, 12);assert.equal(backup.retentionCount, 7);
  assert.equal((await env.request('/api/setup/complete', { method: 'POST', body: {
    username: 'attacker', email: 'attacker@example.com', password: 'password123', acceptTerms: true,
    termsVersion: status.data.termsVersion, smtp: { enabled: false }, backup: { enabled: false },
  } })).status, 409);
});

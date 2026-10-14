'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const { createTestEnvironment, createMongoTestEnvironment } = require('./helpers/env');
for (const backend of ['sqlite', 'mongodb']) test(`Bestehende Nutzer: versionierte AGB-Zustimmung und Upload (${backend})`, { timeout: 60000 }, async t => {
  const env = backend === 'sqlite' ? createTestEnvironment({ DB_TYPE: 'sqlite' }) : await createMongoTestEnvironment();
  t.after(() => env.cleanup());
  const account = await env.createUserAndLogin('legacy_terms');
  const db = require('../dist/backend/src/db');
  const { TERMS_VERSION } = require('../dist/backend/src/services/terms-service');
  const headers = { Cookie: account.cookie };
  await db.users.update(account.id, { terms_version: null, terms_accepted_at: null });
  assert.equal((await env.request('/api/me', { headers })).data.termsRequired, true);
  assert.equal((await env.request('/api/social/posts', { method: 'POST', headers, body: {} })).status, 428);
  assert.equal((await env.request('/api/me/terms', { method: 'POST', body: { acceptTerms: true, termsVersion: TERMS_VERSION } })).status, 401);
  for (const body of [{}, { acceptTerms: false, termsVersion: TERMS_VERSION }, { acceptTerms: true, termsVersion: 'old' }, { acceptTerms: 'true', termsVersion: TERMS_VERSION }])
    assert.equal((await env.request('/api/me/terms', { method: 'POST', headers, body })).status, 400);
  const result = await env.request('/api/me/terms', { method: 'POST', headers, body: { acceptTerms: true, termsVersion: TERMS_VERSION } });
  assert.equal(result.status, 200);assert.equal(result.data.user.termsRequired, false);
  const user = await db.users.findById(account.id);
  assert.equal(user.terms_version, TERMS_VERSION);assert.ok(Number.isFinite(Date.parse(user.terms_accepted_at)));
  await env.request('/api/me/terms', { method: 'POST', headers, body: { acceptTerms: true, termsVersion: TERMS_VERSION } });
  assert.equal((await db.users.findById(account.id)).terms_accepted_at, user.terms_accepted_at);
  const bytes = await require('sharp')({ create: { width: 100, height: 100, channels: 3, background: '#123456' } }).png().toBuffer();
  assert.equal((await env.request('/api/social/posts', { method: 'POST', headers, body: { image: `data:image/png;base64,${bytes.toString('base64')}` } })).status, 201);
  await db.users.update(account.id, { terms_version: 'old' });
  assert.equal((await env.request('/api/me', { headers })).data.termsRequired, true);
});

for (const type of ['image/png', 'image/jpeg', 'image/webp', 'image/gif']) test(`Social-Bild ${type}: Komprimierung ohne Worker unter Proxy-Limit`, async () => {
  const code = ts.transpileModule(fs.readFileSync('public/frontend/composables/media.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const exports = {}, sizes = [900000, 750000, 600000], dimensions = [];let revoked = false;
  const canvas = { getContext: () => ({ fillRect() {}, drawImage() {} }), toBlob(callback, mime, quality) { dimensions.push([canvas.width, canvas.height]);assert.equal(mime, 'image/jpeg');assert.ok(quality >= 0.6);callback({ size: sizes.shift(), type: mime }); } };
  class Image { naturalWidth = 4000;naturalHeight = 3000;async decode() {} }
  class FileReader { readAsDataURL(blob) { this.result = 'data:image/jpeg;base64,' + 'a'.repeat(Math.ceil(blob.size / 3) * 4);this.onload(); } }
  new Function('require', 'exports', 'document', 'Image', 'URL', 'FileReader', code)(() => ({}), exports, { createElement: () => canvas }, Image, { createObjectURL: () => 'blob:test', revokeObjectURL: () => { revoked = true; } }, FileReader);
  const image = await exports.readSocialImage({ type, size: 10 * 1024 * 1024 });
  assert.ok(JSON.stringify({ image, text: '🐠'.repeat(1100), isPublic: true }).length < 1024 * 1024);
  assert.deepEqual(dimensions[0], [1600, 1200]);assert.ok(dimensions[2][0] < dimensions[0][0]);assert.equal(revoked, true);
  await assert.rejects(exports.readSocialImage({ type, size: 10 * 1024 * 1024 + 1 }));
});

test('AGB-Modal: ausdrückliche Zustimmung, Fehler und erfolgreiche Freigabe', async () => {
  const vue = require('vue');
  const source = fs.readFileSync('public/frontend/components/TermsConsent.vue', 'utf8');
  const script = source.match(/<script setup lang="ts">([\s\S]*?)<\/script>/)[1];
  const code = ts.transpileModule(script + '\nexport { accepted, version, error, busy, confirm, loadTerms };', { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const session = { user: { id: 1, termsRequired: true } }, calls = [];let fail = true;
  const exports = {};
  new Function('require', 'exports', code)(name => {
    if (name === 'vue') return { ...vue, watch() {}, onBeforeUnmount() {} };
    if (name === '../state') return { session, language: vue.ref('de'), errorMessage: error => error.message };
    if (name === '../api') return { api: async (path, options) => {
      calls.push([path, options]);
      if (path.startsWith('/terms')) return { version: 'current', terms: { title: 'AGB' } };
      if (fail) throw new Error('offline');
      return { user: { id: 1, termsRequired: false } };
    } };
    return {};
  }, exports);
  await exports.loadTerms();await exports.confirm();assert.equal(calls.length, 1);
  exports.accepted.value = true;await exports.confirm();
  assert.equal(exports.error.value, 'offline');assert.equal(exports.busy.value, false);assert.equal(session.user.termsRequired, true);
  fail = false;await exports.confirm();assert.equal(session.user.termsRequired, false);
  assert.deepEqual(calls.at(-1)[1].body, { acceptTerms: true, termsVersion: 'current' });
  assert.match(source, /persistent wide/);
});

test('Social-API: gültiges Bild mit genau 10 MB akzeptieren, darüber ablehnen', async t => {
  const env = createTestEnvironment({ DB_TYPE: 'sqlite' });t.after(() => env.cleanup());
  const account = await env.createUserAndLogin('social_size_limit');
  const png = await require('sharp')({ create: { width: 32, height: 32, channels: 3, background: '#123456' } }).png().toBuffer();
  // PNG permits a decoder to ignore trailing bytes; padding exercises the actual input size.
  const bytes = Buffer.concat([png, Buffer.alloc(10 * 1024 * 1024 - png.length)]);
  const post = image => env.request('/api/social/posts', { method: 'POST', headers: { Cookie: account.cookie }, body: { image } });
  const accepted = await post(`data:image/png;base64,${bytes.toString('base64')}`);
  assert.equal(accepted.status, 201, accepted.text);
  const rejected = await post(`data:image/png;base64,${Buffer.concat([bytes, Buffer.alloc(1)]).toString('base64')}`);
  assert.equal(rejected.status, 400);
});

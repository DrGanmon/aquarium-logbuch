'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const vue = require('vue');
class ApiError extends Error { constructor(message, status, code) { super(message);this.status = status;this.code = code; } }
function social(request) {
  const source = fs.readFileSync('public/frontend/views/SocialView.vue', 'utf8');
  const script = source.match(/<script setup lang="ts">([\s\S]*?)<\/script>/)[1];
  const code = ts.transpileModule(script + '\nexport { load, membersOnly, error, posts };', { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const session = vue.reactive({ user: null });
  const route = vue.ref({ path: '/social/1' });
  const exports = {};
  new Function('require', 'exports', code)(name => {
    if (name === 'vue') return { ...vue, watch() {}, onBeforeUnmount() {} };
    if (name === '../api') return { api: request, ApiError };
    if (name === '../state') return { session, language: vue.ref('de'), errorMessage: error => error.message };
    if (name === '../router') return { route };
    return {};
  }, exports);
  return { ...exports, session, route, source };
}
test('Interner Teilen-Link: Mitgliederhinweis, anschließend Beitrag nach Anmeldung', async () => {
  const app = social(async () => {
    if (!app.session.user) throw new ApiError('members', 403, 'MEMBERS_ONLY');
    return { post: { id: 1, text: 'Internal' } };
  });
  await app.load();assert.equal(app.membersOnly.value, true);assert.equal(app.error.value, '');assert.deepEqual(app.posts.value, []);
  assert.match(app.source, /href="#\/login"/);assert.match(app.source, /href="#\/register"/);
  assert.match(app.source, /!posts.length && !error && !membersOnly/);
  app.session.user = { id: 1 };await app.load();assert.equal(app.membersOnly.value, false);assert.equal(app.posts.value[0].id, 1);
});
test('Fehlender Beitrag und Netzwerkfehler werden nicht als Mitgliederhinweis dargestellt', async () => {
  for (const error of [new ApiError('missing', 404), new Error('offline')]) {
    const app = social(async () => { throw error; });await app.load();
    assert.equal(app.membersOnly.value, false);assert.equal(app.error.value, error.message);
  }
});
test('Veraltete Antworten ersetzen keine neue Social-Seite', async () => {
  let reject, count = 0;
  const app = social(async () => ++count === 1 ? new Promise((_resolve, fail) => { reject = fail; }) : { posts: [{ id: 2 }], next: null });
  const first = app.load();app.route.value.path = '/social';await app.load();reject(new ApiError('members', 403, 'MEMBERS_ONLY'));await first;
  assert.equal(app.membersOnly.value, false);assert.equal(app.error.value, '');assert.equal(app.posts.value[0].id, 2);
});

test('API-Client: Mitgliederfehler enthält Status und Code ohne Abmeldung', async () => {
  const code = ts.transpileModule(fs.readFileSync('public/frontend/api.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports = {}, session = { user: { id: 1 } };
  new Function('require', 'exports', 'fetch', code)(name => name === './offline-store' ? { offlineState: {}, activeOwner: async () => 1 } : name === './offline-workspace' ? { readWorkspace: async () => undefined } : name.endsWith('offline-catalog-query') ? { CatalogLookupError: class extends Error {} } : name === './offline-catalogs' ? { readOfflineCatalog: async () => undefined } : ({ session, language: vue.ref('de'), t: value => value }), exports,
    async () => new Response(JSON.stringify({ error: 'members only', code: 'MEMBERS_ONLY' }), { status: 403 }));
  await assert.rejects(exports.api('/social/posts/1'), error => error instanceof exports.ApiError && error.status === 403 && error.code === 'MEMBERS_ONLY');
  assert.equal(session.user.id, 1);
});

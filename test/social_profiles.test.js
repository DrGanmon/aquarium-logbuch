'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const sharp = require('sharp');
const { createTestEnvironment, createMongoTestEnvironment } = require('./helpers/env');

for (const backend of ['sqlite', 'mongodb']) test(`Social-Profil: öffentlich, Beiträge je nach Sichtbarkeit (${backend})`, { timeout: 120000 }, async t => {
  const env = backend === 'mongodb' ? await createMongoTestEnvironment() : createTestEnvironment();
  t.after(() => env.cleanup());
  const owner = await env.createUserAndLogin('profil_owner', 'password123', 'admin@example.com');
  const member = await env.createUserAndLogin('profil_member', 'password123', 'member@example.com');
  const headers = { Cookie: owner.cookie }, memberHeaders = { Cookie: member.cookie };
  const bytes = await sharp({ create: { width: 64, height: 48, channels: 3, background: '#2a9d8f' } }).png().toBuffer();
  const image = `data:image/png;base64,${bytes.toString('base64')}`;
  assert.equal((await env.request('/api/me/avatar', { method: 'POST', headers, body: { image } })).status, 200);
  const post = async (isPublic, text) => (await env.request('/api/social/posts', { method: 'POST', headers, body: { image, text, isPublic } })).data.post;
  const publicPost = await post(true, 'Öffentlich');
  const internalPost = await post(false, 'Intern');
  const profile = (cookieHeaders) => env.request('/api/social/profiles/profil_owner', { headers: cookieHeaders });

  // Standardmäßig deaktiviert: keine Profilseite, kein Profil-Link; der Besitzer sieht eine Vorschau.
  assert.equal((await profile({})).status, 404);
  assert.equal((await profile(memberHeaders)).status, 404);
  assert.equal((await env.request('/api/social/profiles/unbekannt_xyz')).status, 404, 'Unbekannte und deaktivierte Profile sind nicht unterscheidbar');
  const preview = await profile(headers);
  assert.equal(preview.status, 200);
  assert.equal(preview.data.profile.enabled, false);
  assert.equal(preview.data.profile.isOwner, true);
  assert.equal((await env.request('/api/social/posts', { headers: memberHeaders })).data.posts[0].author.profileUrl, null);
  assert.deepEqual((await env.request('/api/social/profile', { headers })).data, { enabled: false, username: 'profil_owner', profileUrl: '#/social/u/profil_owner' });

  // Aktivieren: nur angemeldet, mit gültigem Wert.
  assert.equal((await env.request('/api/social/profile', { method: 'PUT', body: { enabled: true } })).status, 401);
  assert.equal((await env.request('/api/social/profile', { method: 'PUT', headers, body: { enabled: 'ja' } })).status, 400);
  const enabled = await env.request('/api/social/profile', { method: 'PUT', headers, body: { enabled: true } });
  assert.equal(enabled.status, 200, enabled.text);
  assert.equal(enabled.data.enabled, true);

  // Gast: öffentliches Profil, aber nur öffentliche Beiträge.
  const guestView = await profile({});
  assert.equal(guestView.status, 200);
  assert.equal(guestView.data.profile.username, 'profil_owner');
  assert.equal(guestView.data.profile.isOwner, false);
  assert.equal(guestView.data.profile.postCount, 1);
  assert.deepEqual(guestView.data.posts.map(entry => entry.id), [publicPost.id], 'Gäste sehen nur öffentliche Beiträge');
  assert.ok(guestView.data.profile.avatarUrl);
  assert.equal((await env.request('/' + guestView.data.profile.avatarUrl)).status, 200, 'Profilbild ist mit dem Profil öffentlich');
  assert.equal((await env.request('/api/social/posts')).data.posts[0].author.profileUrl, '#/social/u/profil_owner', 'Benutzername führt im öffentlichen Feed zum Profil');

  // Mitglied: öffentliche und interne Beiträge.
  const memberView = await profile(memberHeaders);
  assert.equal(memberView.data.profile.postCount, 2);
  assert.deepEqual(memberView.data.posts.map(entry => entry.id), [internalPost.id, publicPost.id]);
  assert.equal(memberView.data.posts.find(entry => entry.id === internalPost.id).is_public, false);
  const comment = await env.request(`/api/social/posts/${publicPost.id}/comments`, { method: 'POST', headers, body: { text: 'Danke!' } });
  assert.equal(comment.data.comment.author.profileUrl, '#/social/u/profil_owner', 'Auch Kommentar-Autoren sind verlinkt');
  assert.equal((await env.request(`/api/social/profiles/profil_owner?before=${internalPost.id}`, { headers: memberHeaders })).data.posts.length, 1, 'Seitenweises Nachladen');

  // Sicherung und Wiederherstellung erhalten die Einstellung.
  assert.equal((await env.request('/api/admin/backups/config', { method: 'PUT', headers, body: { password: 'backup-test-password' } })).status, 200);
  const backup = await env.request('/api/admin/backups/create', { method: 'POST', headers });
  assert.equal((await env.request('/api/social/profile', { method: 'PUT', headers, body: { enabled: false } })).status, 200);
  assert.equal((await profile({})).status, 404, 'Deaktivieren entfernt die Profilseite sofort');
  assert.equal((await env.request(`/api/admin/backups/${encodeURIComponent(backup.data.filename)}/restore`, { method: 'POST', headers })).status, 200);
  assert.equal((await profile({})).status, 200, 'Aktiviertes Profil bleibt nach einer Wiederherstellung erhalten');

  // Kontolöschung entfernt das Profil.
  const memberProfile = await env.request('/api/social/profile', { method: 'PUT', headers: memberHeaders, body: { enabled: true } });
  assert.equal(memberProfile.status, 200);
  const db = require('../dist/backend/src/db');
  const memberId = (await env.request('/api/me', { headers: memberHeaders })).data.id;
  assert.ok(await db.social.profile(memberId));
  await db.social.deleteUser(memberId);
  assert.equal(await db.social.profile(memberId), null);
});

test('Social-Profil: Oberfläche, Routing und Texte', () => {
  const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
  assert.match(read('public/frontend/App.vue'), /SocialProfileView v-else-if="route\.path\.startsWith\('\/social\/u\/'\)"/);
  assert.match(read('public/frontend/views/ProfileView.vue'), /SocialProfileSettings = lazyComponent/);
  const card = read('public/frontend/components/SocialPostCard.vue');
  assert.equal((card.match(/author\.profileUrl/g) || []).length >= 3, true, 'Benutzernamen in Kopf, Bildtext und Kommentaren sind verlinkt');
  const view = read('public/frontend/views/SocialProfileView.vue');
  assert.match(view, /social-profile-grid/);
  assert.match(view, /encodeURIComponent\(username\.value\)/);
  const de = JSON.parse(read('public/locales/features.de.json')), en = JSON.parse(read('public/locales/features.en.json'));
  assert.deepEqual(Object.keys(en.socialProfile).sort(), Object.keys(de.socialProfile).sort());
  assert.match(JSON.parse(read('public/locales/de.json')).social.privacyText, /Social-Profil ist freiwillig/);
});

'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const sharp = require('sharp');
const { createTestEnvironment, createMongoTestEnvironment } = require('./helpers/env');

for (const backend of ['sqlite', 'mongodb']) {
  test(`Social: Sichtbarkeit, AGB und vollständige Bildlöschung (${backend})`, { timeout: 60000 }, async t => {
    const env = backend === 'mongodb' ? await createMongoTestEnvironment() : createTestEnvironment({ DB_TYPE: 'sqlite' });
    t.after(() => env.cleanup());
    await env.start();
    const db = require('../dist/backend/src/db');
    const { backupService } = require('../dist/backend/src/services/backup-service');
    const { TERMS_VERSION } = require('../dist/backend/src/services/terms-service');
    const imageService = require('../dist/backend/src/services/image-service');
    const germanTerms = await env.request('/api/terms');
    assert.equal(germanTerms.data.version, TERMS_VERSION);
    assert.match(germanTerms.data.terms.licenseText, /nicht ausschließliches/);
    assert.equal(germanTerms.headers.get('cache-control'), 'no-store');
    assert.match((await env.request('/api/terms?language=en')).data.terms.licenseText, /non-exclusive/);
    assert.equal((await env.request('/api/registration')).data.termsVersion, TERMS_VERSION);
    const registration = { username: 'consent_owner', email: 'consent_owner@example.com', password: 'password123' };
    for (const extra of [{}, { acceptTerms: false, termsVersion: TERMS_VERSION }, { acceptTerms: 'true', termsVersion: TERMS_VERSION }, { acceptTerms: true, termsVersion: 'old' }, { acceptTerms: true }]) {
      const response = await env.request('/api/register', { method: 'POST', termsConsent: false, body: { ...registration, ...extra } });
      assert.equal(response.status, 400, response.text);
      assert.equal(await db.users.findByUsername(registration.username), null);
    }
    const owner = await env.createUserAndLogin('consent_owner');
    const friend = await env.createUserAndLogin('consent_friend');
    const headers = { Cookie: owner.cookie }, friendHeaders = { Cookie: friend.cookie };
    const storedUser = await db.users.findById(owner.id);
    assert.equal(storedUser.terms_version, TERMS_VERSION);
    assert.ok(Number.isFinite(Date.parse(storedUser.terms_accepted_at)));
    const image = `data:image/png;base64,${(await sharp({ create: { width: 32, height: 24, channels: 3, background: '#558877' } }).png().toBuffer()).toString('base64')}`;
    await env.request('/api/me/avatar', { method: 'POST', headers, body: { image } });
    await env.request('/api/me/avatar', { method: 'POST', headers: friendHeaders, body: { image } });
    const internal = await env.request('/api/social/posts', { method: 'POST', headers, body: { image, text: 'Serverintern' } });
    assert.equal((await db.users.findById(owner.id)).terms_accepted_at, storedUser.terms_accepted_at);
    assert.equal(internal.status, 201, internal.text);assert.equal(internal.data.post.is_public, false);
    const internalUrl = `/api/social/posts/${internal.data.post.id}`;
    assert.equal((await env.request('/api/social/posts')).data.posts.length, 0);
    assert.equal((await env.request('/api/social/posts', { headers: friendHeaders })).data.posts.length, 1);
    const comment = await env.request(`${internalUrl}/comments`, { method: 'POST', headers: friendHeaders, body: { text: 'Nur für den Server' } });
    assert.equal(comment.status, 201);
    for (const suffix of ['', '/image', '/comments']) {
      assert.equal((await env.request(internalUrl + suffix)).status, 404);
      const visible = await env.request(internalUrl + suffix, { headers: friendHeaders });
      assert.equal(visible.status, 200);assert.equal(visible.headers.get('cache-control'), 'no-store');
    }
    for (const user of [owner, friend]) {
      assert.equal((await env.request(`/api/social/authors/${user.id}/avatar`)).status, 404);
      assert.equal((await env.request(`/api/social/authors/${user.id}/avatar`, { headers: friendHeaders })).status, 200);
    }
    assert.equal((await env.request('/api/social/posts', { method: 'POST', headers, body: { image, isPublic: 'false' } })).status, 400);
    const publicPost = await env.request('/api/social/posts', { method: 'POST', headers, body: { image, text: 'Öffentlich', isPublic: true } });
    assert.equal(publicPost.status, 201);assert.equal(publicPost.data.post.is_public, true);
    assert.deepEqual((await env.request('/api/social/posts')).data.posts.map(p => p.id), [publicPost.data.post.id]);
    assert.equal((await env.request(`/api/social/posts/${publicPost.data.post.id}/image`)).status, 200);
    assert.equal((await env.request(`/api/social/authors/${owner.id}/avatar`)).status, 200);
    assert.equal((await env.request(`/api/social/authors/${friend.id}/avatar`)).status, 404, 'Kommentar zu internem Beitrag darf Profilbild nicht öffentlich machen');
    await env.request(`${internalUrl}/like`, { method: 'PUT', headers: friendHeaders, body: { liked: true } });
    // Legacy accounts may upload without accepting terms again; do not invent consent.
    await db.users.update(friend.id, { terms_version: null, terms_accepted_at: null });
    const friendPost = await env.request('/api/social/posts', { method: 'POST', headers: friendHeaders, body: { image, isPublic: true } });
    assert.equal(friendPost.status, 201, friendPost.text);
    assert.equal((await db.users.findById(friend.id)).terms_version, null);
    assert.equal((await db.users.findById(friend.id)).terms_accepted_at, null);
    await env.request(`/api/social/posts/${friendPost.data.post.id}/comments`, { method: 'POST', headers, body: { text: 'Wird mit meinem Konto gelöscht' } });
    await env.request(`/api/social/posts/${friendPost.data.post.id}/like`, { method: 'PUT', headers, body: { liked: true } });
    const aq = await db.aquariums.create({ user_id: owner.id, name: 'Bildlöschung' });
    // Separate files cover legacy aquarium photos, gallery photos and stock photos.
    const additionalFiles = ['privacy-cover.webp', 'privacy-gallery.webp', 'privacy-stock.webp'];
    for (const filename of additionalFiles) fs.writeFileSync(path.join(imageService.UPLOADS_DIR, filename), Buffer.from(image.split(',')[1], 'base64'));
    await db.aquariumImages.create({ aquarium_id: aq.id, filename: additionalFiles[1] });
    await db.aquariums.updateImage(aq.id, additionalFiles[0]);
    await db.stock.create({ aquarium_id: aq.id, species: 'test', image_file: additionalFiles[2] });
    const backup = await backupService.generateBackupData({ includeFiles: true });
    assert.equal(backup.version, 4);
    assert.equal(backup.data.users.find(u => u.id === owner.id).terms_version, TERMS_VERSION);
    const internalRecord = backup.data.social_posts.find(p => p.id === internal.data.post.id);
    assert.equal(Boolean(internalRecord.is_public), false);
    const restored = backupService.migrateBackupData(backup);
    assert.equal(restored.data.social_posts.find(p => p.id === internal.data.post.id).is_public, false);
    const legacy = structuredClone(backup);delete legacy.data.social_posts[0].is_public;
    assert.equal(backupService.migrateBackupData(legacy).data.social_posts[0].is_public, true);
    await backupService.restoreBackup(backup);
    assert.equal((await db.users.findById(owner.id)).terms_version, TERMS_VERSION);
    assert.equal((await env.request(internalUrl)).status, 404);
    const archived = await backupService.createBackup({ includeFiles: true, customFilename: 'privacy-account.json.gz' });
    const imageFiles = [...additionalFiles, ...backup.data.social_posts.filter(p => p.user_id === owner.id).map(p => p.filename), backup.data.users.find(u => u.id === owner.id).avatar_file];
    assert.ok(imageFiles.every(filename => imageService.getImagePath(filename)));
    const requestDeletion = await env.request('/api/me/delete-request', { method: 'POST', headers, body: { password: 'password123' } });
    assert.equal(requestDeletion.status, 200, requestDeletion.text);
    const token = (await db.users.findById(owner.id)).account_delete_token;
    const confirm = () => env.request('/api/confirm-delete-account', { method: 'POST', body: { token } });
    backupService.isBackingUp = true;
    try { assert.equal((await confirm()).status, 409);assert.ok(await db.users.findById(owner.id)); }
    finally { backupService.isBackingUp = false; }
    // A disk error must not report successful deletion or make it impossible to retry.
    const targetPath = imageService.getImagePath(internalRecord.filename), unlink = fs.unlinkSync;
    fs.unlinkSync = function(filename) { if (filename === targetPath) { const e = new Error('simulated image permission failure');e.code = 'EACCES';throw e; }return unlink.apply(this, arguments); };
    try { assert.equal((await confirm()).status, 500);assert.ok(await db.users.findById(owner.id));assert.ok(imageService.getImagePath(internalRecord.filename)); }
    finally { fs.unlinkSync = unlink; }
    // A photo upload already in flight must not recreate a deleted account's post.
    const socialImageService = require('../dist/backend/src/services/social-image-service');
    const saveImage = socialImageService.saveSocialImage;
    let releaseUpload, markReady, pendingFilename;
    const blocked = new Promise(resolve => { releaseUpload = resolve; });
    const ready = new Promise(resolve => { markReady = resolve; });
    socialImageService.saveSocialImage = async input => { const saved = await saveImage(input);pendingFilename = saved.filename;markReady();await blocked;return saved; };
    const pendingUpload = env.request('/api/social/posts', { method: 'POST', headers, body: { image } });
    let deleted;
    try { await ready;deleted = await confirm(); }
    finally { releaseUpload();socialImageService.saveSocialImage = saveImage; }
    assert.equal(deleted.status, 200, deleted.text);
    assert.equal((await pendingUpload).status, 401);
    assert.equal(imageService.getImagePath(pendingFilename), null);
    assert.equal(await db.users.findById(owner.id), null);
    for (const filename of imageFiles) assert.equal(imageService.getImagePath(filename), null, `Bild wurde nicht gelöscht: ${filename}`);
    assert.equal(await db.social.post(internal.data.post.id), null);
    assert.equal((await env.request(`/api/social/authors/${owner.id}/avatar`)).status, 404);
    assert.equal((await env.request('/api/me', { headers })).status, 401);
    const friendRemaining = await env.request(`/api/social/posts/${friendPost.data.post.id}`);
    assert.equal(friendRemaining.status, 200);assert.equal(friendRemaining.data.post.likeCount, 0);assert.equal(friendRemaining.data.post.commentCount, 0);
    const cleanArchive = JSON.parse(zlib.gunzipSync(fs.readFileSync(archived.fullPath)).toString());
    assert.ok(imageFiles.every(filename => !Object.hasOwn(cleanArchive.files, filename)));
    assert.equal(cleanArchive.data.users.find(u => u.id === owner.id).avatar_file, null);
    assert.equal(cleanArchive.data.social_posts.filter(p => p.user_id === owner.id).length, 0);
    assert.ok(cleanArchive.files[backup.data.social_posts.find(p => p.user_id === friend.id).filename], 'Bilder anderer Nutzer bleiben erhalten');
  });
}

test('Migration v4 bleibt wiederholbar, erhält öffentliche Altbeiträge und erfindet keine Zustimmung', async t => {
  const Database = require('better-sqlite3'), db = new Database(':memory:');t.after(() => db.close());
  db.exec("CREATE TABLE users(id INTEGER PRIMARY KEY, username TEXT); INSERT INTO users VALUES(1,'existing')");
  await require('../dist/backend/src/db/migrations/003_social').up(db);
  db.prepare('INSERT INTO social_posts(user_id,filename,width,height,text,created_at) VALUES(?,?,?,?,?,?)').run(1, 'old.webp', 10, 10, '', new Date().toISOString());
  const migration = require('../dist/backend/src/db/migrations/004_social_privacy_terms');
  await migration.up(db);await migration.up(db);
  assert.equal(db.prepare('SELECT is_public FROM social_posts').get().is_public, 1);
  assert.equal(db.prepare('SELECT terms_version FROM users').get().terms_version, null);
  assert.equal(db.prepare('SELECT terms_accepted_at FROM users').get().terms_accepted_at, null);
});

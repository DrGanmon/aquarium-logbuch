'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createTestEnvironment, createMongoTestEnvironment } = require('./helpers/env');

for (const backend of ['sqlite', 'mongodb']) test(`Backup-Worker: Schnappschuss ohne Wartungssperre, App bleibt erreichbar (${backend})`, { timeout: 120000 }, async t => {
  const env = backend === 'mongodb' ? await createMongoTestEnvironment() : createTestEnvironment();
  t.after(() => env.cleanup());
  const admin = await env.createUserAndLogin('worker_admin', 'password123', 'admin@example.com');
  const headers = { Cookie: admin.cookie };
  const created = await env.request('/api/aquariums', { method: 'POST', headers, body: { name: 'Schnappschuss', volume_l: 90 } });
  assert.equal((await env.request('/api/admin/backups/config', { method: 'PUT', headers, body: { password: 'backup-test-password' } })).status, 200);
  const { backupService } = require('../dist/backend/src/services/backup-service');
  const maintenance = require('../dist/backend/src/services/maintenance-coordinator');

  // Eine lange laufende Anfrage hielt früher jedes Backup auf; jetzt wartet das Backup nicht auf sie.
  const longRequest = await maintenance.acquireRequestLease();
  let backupFile = '';
  try {
    const started = Date.now();
    const pending = backupService.createBackup({ includeFiles: true });
    const during = await env.request('/api/aquariums', { headers });
    assert.equal(during.status, 200, 'Während des Backups bleibt die App erreichbar');
    const backup = await pending;
    assert.ok(Date.now() - started < 60000, 'Backup wartet nicht auf laufende Anfragen');
    assert.equal(backupService.lastBackupMode, 'worker');
    assert.ok(backup.size > 0);
    assert.ok(Buffer.isBuffer(backup.gzippedBuffer));
    const stored = fs.readFileSync(path.join(backupService.backupsDir, backup.filename));
    assert.deepEqual(stored, backup.gzippedBuffer, 'Worker liefert genau das gespeicherte Archiv zurück');
    assert.equal(fs.statSync(path.join(backupService.backupsDir, backup.filename)).mode & 0o777, 0o600);
    assert.ok(!fs.readdirSync(backupService.backupsDir).some(name => name.endsWith('.partial')));
    backupFile = backup.filename;
  } finally { await longRequest?.release(); }

  // Download über die Admin-Oberfläche nutzt denselben Worker.
  const download = await env.request('/api/admin/backups/create?download=1', { method: 'POST', headers, body: { includeFiles: false } });
  assert.equal(download.status, 200);
  assert.match(download.headers.get('content-disposition'), /attachment; filename="aquarium-manual-backup-.*\.json\.gz\.enc"/);

  // Das Archiv lässt sich wie bisher wiederherstellen (die Wiederherstellung selbst wartet weiterhin auf offene Anfragen).
  assert.equal((await env.request(`/api/aquariums/${created.data.id}`, { method: 'DELETE', headers })).status, 200);
  const restored = await env.request(`/api/admin/backups/${encodeURIComponent(backupFile)}/restore`, { method: 'POST', headers });
  assert.equal(restored.status, 200, restored.text);
  assert.equal((await env.request('/api/aquariums', { headers })).data[0].name, 'Schnappschuss');
});

test('Backup-Worker: Fehler, Absturz und Zeitüberschreitung werden protokolliert und sofort freigegeben', { timeout: 60000 }, async t => {
  const env = createTestEnvironment();
  t.after(() => env.cleanup());
  const admin = await env.createUserAndLogin('worker_failure', 'password123', 'admin@example.com');
  assert.equal((await env.request('/api/admin/backups/config', { method: 'PUT', headers: { Cookie: admin.cookie }, body: { password: 'backup-test-password' } })).status, 200);
  const { backupService } = require('../dist/backend/src/services/backup-service');
  const original = { path: backupService.workerPath, timeout: backupService.workerTimeoutMs };
  t.after(() => { backupService.workerPath = original.path;backupService.workerTimeoutMs = original.timeout; });
  const script = (name, source) => { const file = path.join(env.getDataDir(), name);fs.writeFileSync(file, source);return file; };
  const before = fs.readdirSync(backupService.backupsDir).filter(name => name.endsWith('.enc')).length;
  const logFile = () => { try { return fs.readFileSync(path.join(env.getDataDir(), 'aquarium.log'), 'utf8'); } catch { return ''; } };

  backupService.workerPath = script('fails.js', "require('node:worker_threads').parentPort.postMessage({ ok: false, error: 'Testfehler im Worker' });");
  await assert.rejects(backupService.createBackup({ includeFiles: false }), /Testfehler im Worker/);
  assert.equal(backupService.isBackingUp, false);

  backupService.workerPath = script('crashes.js', 'process.exit(3);');
  await assert.rejects(backupService.createBackup({ includeFiles: false }), /unerwartet beendet \(Code 3\)/);

  backupService.workerPath = script('throws.js', "throw new Error('Absturz beim Laden');");
  await assert.rejects(backupService.createBackup({ includeFiles: false }), /Backup-Worker abgestürzt: Absturz beim Laden/);

  // Ein hängender Worker wird nach dem Zeitlimit beendet; angefangene Archive werden entfernt.
  backupService.workerTimeoutMs = 300;
  backupService.workerPath = script('hangs.js', `const { workerData } = require('node:worker_threads');
require('node:fs').writeFileSync(workerData.fullPath + '.42.abcd.partial', 'halb');
setInterval(() => {}, 1000);`);
  const started = Date.now();
  await assert.rejects(backupService.createBackup({ includeFiles: false }), /Zeitlimit .* überschritten und wurde beendet/);
  assert.ok(Date.now() - started < 10000);
  assert.equal(backupService.isBackingUp, false, 'Ein hängender Worker blockiert keine weiteren Backups');
  assert.ok(!fs.readdirSync(backupService.backupsDir).some(name => name.endsWith('.partial')), 'Teilarchive werden entfernt');
  assert.equal(fs.readdirSync(backupService.backupsDir).filter(name => name.endsWith('.enc')).length, before, 'Kein unvollständiges Archiv in der Liste');
  assert.match(logFile(), /Backup-Worker fehlgeschlagen nach \d+ s: Backup-Worker hat das Zeitlimit/);

  // Danach funktioniert der echte Worker wieder.
  backupService.workerPath = original.path;backupService.workerTimeoutMs = original.timeout;
  const backup = await backupService.createBackup({ includeFiles: false });
  assert.ok(backup.size > 0);
});

test('Backup-Schnappschuss: eigene schreibgeschützte SQLite-Verbindung', async t => {
  const env = createTestEnvironment();
  t.after(() => env.cleanup());
  await env.start();
  const SqliteAdapter = require('../dist/backend/src/db/sqlite-adapter');
  const reader = SqliteAdapter.openSnapshotReader({ dbPath: path.join(env.getDataDir(), 'aquarium.db') });
  try {
    assert.equal(reader.getRawDb().readonly, true);
    const data = await reader.exportAllData();
    assert.ok(Array.isArray(data.users));
  } finally { await reader.close(); }
});

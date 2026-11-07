'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { createTestEnvironment } = require('./helpers/env');

function fakeExchange(path = '/api/aquariums') {
  const socket = { destroyed: false };
  const req = { method: 'GET', url: path, originalUrl: path, socket };
  const res = new EventEmitter();
  Object.assign(res, { headersSent: false, destroyed: false, writableFinished: false, statusCode: 200,
    status(code) { this.statusCode = code;return this; }, json() { this.headersSent = true;return this; } });
  return { req, res, socket };
}
const settle = () => new Promise(resolve => setTimeout(resolve, 20));

test('Wartung: abgebrochene oder beendete Anfragen hinterlassen keine Sperre für Backups', async t => {
  const env = createTestEnvironment();
  t.after(() => env.cleanup());
  await env.start();
  const maintenance = require('../dist/backend/src/services/maintenance-coordinator');
  const gate = maintenance.requestLeaseGate();
  const before = await maintenance.activeRequestLeases();

  // Normaler Ablauf: Sperre während der Anfrage, Freigabe nach dem Ende.
  const normal = fakeExchange();
  let nextCalls = 0;
  await gate(normal.req, normal.res, () => { nextCalls++; });
  assert.equal(nextCalls, 1);
  assert.equal(await maintenance.activeRequestLeases(), before + 1);
  normal.res.writableFinished = true;normal.res.emit('finish');normal.res.emit('close');
  await settle();
  assert.equal(await maintenance.activeRequestLeases(), before);

  // Client bricht ab, während die Sperre noch angefordert wird: kein endlos erneuertes Lease.
  const aborted = fakeExchange();
  const pending = gate(aborted.req, aborted.res, () => { nextCalls++; });
  aborted.socket.destroyed = true;aborted.res.destroyed = true;aborted.res.emit('close');
  await pending;await settle();
  assert.equal(nextCalls, 1, 'Für verlassene Anfragen startet kein Handler');
  assert.equal(await maintenance.activeRequestLeases(), before, 'Die Sperre wird sofort freigegeben');

  // Bereits geschlossene Verbindung (Ereignis vor dem Gate) wird ebenfalls erkannt.
  const closed = fakeExchange();
  closed.socket.destroyed = true;
  await gate(closed.req, closed.res, () => { nextCalls++; });
  await settle();
  assert.equal(nextCalls, 1);
  assert.equal(await maintenance.activeRequestLeases(), before);

  // Backup-Endpunkte selbst halten keine Sperre.
  const backup = fakeExchange('/api/admin/backups/create');
  backup.req.method = 'POST';
  await gate(backup.req, backup.res, () => { nextCalls++; });
  assert.equal(nextCalls, 2);
  assert.equal(await maintenance.activeRequestLeases(), before);

  // Wartung aktiv: neue Anfragen werden abgewiesen, ohne eine Sperre anzulegen.
  const lease = await maintenance.acquireMaintenanceLease('backup');
  try {
    const blocked = fakeExchange();
    await gate(blocked.req, blocked.res, () => { nextCalls++; });
    assert.equal(blocked.res.statusCode, 503);
    assert.equal(nextCalls, 2);
  } finally { await lease.release(); }
});

test('Wartung: Request-Sperren werden höchstens 15 Minuten erneuert', () => {
  const { shouldRenewRequestLease, MAX_REQUEST_LEASE_MS } = require('../dist/backend/src/services/maintenance-coordinator');
  assert.equal(MAX_REQUEST_LEASE_MS, 15 * 60 * 1000);
  assert.equal(shouldRenewRequestLease(0, 60 * 1000), true);
  assert.equal(shouldRenewRequestLease(0, MAX_REQUEST_LEASE_MS - 1), true);
  assert.equal(shouldRenewRequestLease(0, MAX_REQUEST_LEASE_MS), false, 'Hängende Anfragen blockieren Backups nicht dauerhaft');
});

test('Automatisches Backup: Fehlversuche mit wachsendem Abstand statt minütlicher Wartungssperre', async t => {
  const env = createTestEnvironment();
  t.after(() => env.cleanup());
  await env.start();
  const { backupService } = require('../dist/backend/src/services/backup-service');
  const originalConfig = backupService.getConfig, originalCreate = backupService.createBackup;
  t.after(() => { backupService.getConfig = originalConfig;backupService.createBackup = originalCreate;backupService.autoFailures = 0;backupService.nextAutoAttemptAt = 0; });
  backupService.getConfig = () => ({ enabled: true, intervalHours: 24, lastBackupAt: null, includeFiles: false });
  let attempts = 0, fail = true;
  backupService.createBackup = async () => { attempts++;if (fail) throw new Error('Laufende Anfragen konnten vor der Wartung nicht beendet werden (1 aktiv).'); };

  let now = Date.UTC(2026, 10, 7, 12);
  const minutes = value => value * 60 * 1000;
  const delays = [];
  for (let step = 0; step < 6; step++) {
    assert.equal(await backupService.runScheduledBackup(now), false);
    delays.push((backupService.nextAutoAttemptAt - now) / minutes(1));
    assert.equal(await backupService.runScheduledBackup(now + minutes(1)), false, 'Kein erneuter Versuch vor Ablauf der Pause');
    now = backupService.nextAutoAttemptAt;
  }
  assert.deepEqual(delays, [5, 10, 20, 40, 60, 60]);
  assert.equal(attempts, 6, 'Zwischen den Pausen wird keine Wartung gestartet');

  fail = false;
  assert.equal(await backupService.runScheduledBackup(now), true);
  assert.equal(backupService.autoFailures, 0);
  assert.equal(backupService.nextAutoAttemptAt, 0, 'Ein erfolgreiches Backup setzt die Pause zurück');
});

'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createTestEnvironment, createMongoTestEnvironment } = require('./helpers/env');

for (const type of ['sqlite', 'mongodb']) test(`Dünger: manuelle Erinnerungen, automatische Logs und Berechtigungen (${type})`, async t => {
  const env = type === 'mongodb' ? await createMongoTestEnvironment() : createTestEnvironment();
  t.after(() => env.cleanup());
  const owner = await env.createUserAndLogin('fertilizer_owner', 'password123', 'fertilizer@test.local');
  const viewer = await env.createUserAndLogin('fertilizer_viewer');
  const stranger = await env.createUserAndLogin('fertilizer_stranger');
  const db = require('../dist/backend/src/db');
  const { processDosingPlans, nextAutomaticDosingAt } = require('../dist/backend/src/services/dosing-service');
  const { mailService } = require('../dist/backend/src/services/mail-service');
  const original = mailService.sendFertilizeReminderEmail;
  const mails = [];let mailFailure = false;
  mailService.sendFertilizeReminderEmail = params => { if (mailFailure) return { ok: false, error: 'queue failure' };mails.push(params);return { ok: true }; };
  t.after(() => { mailService.sendFertilizeReminderEmail = original; });
  const created = await env.request('/api/aquariums', { method: 'POST', headers: { Cookie: owner.cookie }, body: { name: 'Düngerbecken', fertilize_cycle_interval: 1, fertilize_reminder_mail: 1 } });
  assert.equal(created.status, 200);const aqId = created.data.id;
  const aquarium = await db.aquariums.findById(aqId);
  assert.equal(aquarium.fertilize_reminder_mail, 0);assert.equal(aquarium.fertilize_cycle_interval, null);
  const request = (suffix = '', options = {}) => env.request(`/api/aquariums/${aqId}/fertilizers${suffix}`, { ...options, headers: { Cookie: owner.cookie, ...options.headers } });
  const input = { name: 'Eisen', fertilizer_name: 'Eisen-Volldünger', amount_ml: 2.5, interval_days: 2, time_of_day: '08:00', is_active: true };
  const auto = await request('', { method: 'POST', body: { ...input, mode: 'automatic' } });
  const manual = await request('', { method: 'POST', body: { ...input, mode: 'manual', reminder_mail: true, interval_days: 1 } });
  const manual2 = await request('', { method: 'POST', body: { ...input, name: 'NPK', mode: 'manual', reminder_mail: true, interval_days: 1 } });
  const paused = await request('', { method: 'POST', body: { ...input, name: 'Pause', mode: 'automatic', is_active: false } });
  for (const response of [auto, manual, manual2, paused]) assert.equal(response.status, 200);
  assert.equal((await request()).data.length, 4);
  assert.equal((await request('', { method: 'POST', body: { ...input, mode: 'automatic', reminder_mail: true } })).status, 400);
  assert.equal((await request('', { method: 'POST', body: { ...input, mode: 'unknown' } })).status, 400);
  assert.equal((await request(`/${auto.data.id}/dose`, { method: 'POST', body: {} })).status, 400);
  const maintenancePath = `/api/aquariums/${aqId}/maintenance`;
  assert.equal((await env.request(maintenancePath, { method: 'POST', headers: { Cookie: owner.cookie }, body: { type: 'dosing_pump' } })).status, 400);

  await env.request(`/api/aquariums/${aqId}/shares`, { method: 'POST', headers: { Cookie: owner.cookie }, body: { username: 'fertilizer_viewer', role: 'view' } });
  await env.request('/api/shares/accept', { method: 'POST', headers: { Cookie: viewer.cookie }, body: { aquarium_id: aqId } });
  assert.equal((await request('', { headers: { Cookie: viewer.cookie } })).status, 200);
  assert.equal((await request(`/${manual.data.id}/dose`, { method: 'POST', headers: { Cookie: viewer.cookie }, body: {} })).status, 403);
  assert.equal((await request(`/${manual.data.id}`, { method: 'DELETE', headers: { Cookie: stranger.cookie } })).status, 404);
  const otherAq = await env.request('/api/aquariums', { method: 'POST', headers: { Cookie: owner.cookie }, body: { name: 'Anderes Becken' } });
  assert.equal((await env.request(`/api/aquariums/${otherAq.data.id}/fertilizers/${manual.data.id}/dose`, { method: 'POST', headers: { Cookie: owner.cookie }, body: {} })).status, 404);

  const now = new Date();now.setDate(now.getDate() - 1);now.setHours(12, 0, 0, 0);
  const start = new Date(now);start.setDate(start.getDate() - 2);start.setHours(8, 0, 0, 0);
  for (const plan of [auto, manual, manual2, paused]) await db.dosingPumps.update(plan.data.id, aqId, { schedule_started_at: start.toISOString() });
  const runs = await Promise.all([processDosingPlans(db, [aquarium], now), processDosingPlans(db, [aquarium], now)]);
  assert.equal(runs.reduce((sum, run) => sum + run.logged, 0), 2, 'Jede fällige Pumpendosierung genau einmal');
  assert.equal(mails.length, 2, 'Jeder manuelle Dünger erhält seine eigene Erinnerung');
  assert.equal(new Set(mails.map(mail => mail.fertilizer.id)).size, 2);
  assert.ok(mails.every(mail => mail.user.email === 'fertilizer@test.local'));
  const logs = await db.maintenance.listForAquarium(aqId);
  assert.equal(logs.length, 2);assert.ok(logs.every(log => log.type === 'dosing_pump' && log.created_by === null));
  const detail = await env.request(`/api/aquariums/${aqId}`, { headers: { Cookie: owner.cookie } });
  assert.equal(detail.data.aquarium.last_fertilized_at, logs[0].logged_at);
  assert.equal((await db.dosingPumps.findById(paused.data.id)).last_dosed_at, null);
  const repeated = await processDosingPlans(db, [aquarium], now);
  assert.deepEqual(repeated, { sent: 0, logged: 0 });
  assert.equal((await env.request(`${maintenancePath}/${logs[0].id}`, { method: 'PUT', headers: { Cookie: owner.cookie }, body: { type: 'fertilize' } })).status, 400);

  const badDate = await request(`/${manual.data.id}/dose`, { method: 'POST', body: { logged_at: 'invalid' } });
  assert.equal(badDate.status, 400);
  const dose = await request(`/${manual.data.id}/dose`, { method: 'POST', body: {} });
  assert.equal(dose.status, 200);
  const updatedManual = await db.dosingPumps.findById(manual.data.id);
  assert.ok(updatedManual.last_dosed_at);assert.equal(updatedManual.last_reminder_sent_at, null);
  assert.equal((await db.maintenance.findById(dose.data.log_id)).type, 'fertilize');

  // Failed queue claims must be retryable, independently for each fertilizer.
  const retryPlan = await request('', { method: 'POST', body: { ...input, mode: 'manual', reminder_mail: true } });
  await db.dosingPumps.update(retryPlan.data.id, aqId, { schedule_started_at: start.toISOString() });
  mailFailure = true;await processDosingPlans(db, [aquarium], now);
  assert.equal((await db.dosingPumps.findById(retryPlan.data.id)).last_reminder_sent_at, null);
  mailFailure = false;const retry = await processDosingPlans(db, [aquarium], now);assert.equal(retry.sent, 1);

  // Changing or resuming a pump starts a new schedule rather than logging its pause.
  const resumed = await request(`/${paused.data.id}`, { method: 'PUT', body: { ...input, mode: 'automatic', is_active: true } });
  assert.equal(resumed.status, 200);assert.ok(new Date(resumed.data.schedule_started_at) > now);
  assert.ok(nextAutomaticDosingAt(resumed.data) > now);

  const snapshot = await db.exportAllData();
  await db.importAllData(snapshot);
  assert.equal((await db.dosingPumps.findById(manual.data.id)).mode, 'manual');
  assert.equal((await db.dosingPumps.findById(manual2.data.id)).reminder_mail, 1);
  assert.equal((await db.maintenance.listForAquarium(aqId)).length, 3);
  const sameSlot = await db.dosingPumps.logDosing(auto.data.id, aqId, null, logs[0].logged_at, true);
  assert.equal(sameSlot.created, false, 'Backup behält Eindeutigkeit der Pumpenprotokolle');
});

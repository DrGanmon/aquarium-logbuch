'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createTestEnvironment } = require('./helpers/env');
const { calculateCycleStatus, reminderService } = require('../src/services/reminder-service');
const { loadTemplate, createMeasureReminderMail, createFertilizeReminderMail } = require('../src/services/mail-template');
const { mailService } = require('../src/services/mail-service');

test('Zyklus-Berechnung: calculateCycleStatus Logik für Tage, Wochen und Wochentage', () => {
  // 1. Nicht konfigurierter Zyklus
  const unconfigured = calculateCycleStatus({ interval: null });
  assert.strictEqual(unconfigured.configured, false);
  assert.strictEqual(unconfigured.is_due, false);
  assert.strictEqual(unconfigured.next_due_at, null);

  // 2. Tägliches Intervall (Tage, ohne Wochentag)
  // Letzte Aktion: 2026-10-10, Jetzt: 2026-10-11, Intervall: 3 Tage
  const baseDate = '2026-10-10T12:00:00.000Z';
  const nowDay1 = new Date('2026-10-11T12:00:00.000Z');
  const res3Days = calculateCycleStatus({ interval: 3, unit: 'days' }, baseDate, null, nowDay1);
  assert.strictEqual(res3Days.configured, true);
  assert.strictEqual(res3Days.is_due, false);
  assert.strictEqual(res3Days.days_remaining, 2); // 13. Okt fällig -> 2 Tage verbleibend
  assert.strictEqual(res3Days.status_label, 'Fällig in 2 Tagen');

  // Jetzt ist der 13. Okt (Fälligkeitstag)
  const nowDay3 = new Date('2026-10-13T12:00:00.000Z');
  const res3DaysDue = calculateCycleStatus({ interval: 3, unit: 'days' }, baseDate, null, nowDay3);
  assert.strictEqual(res3DaysDue.is_due, true);
  assert.strictEqual(res3DaysDue.is_overdue, false);
  assert.strictEqual(res3DaysDue.status_label, 'Fällig heute');

  // Jetzt ist der 15. Okt (2 Tage überfällig)
  const nowDay5 = new Date('2026-10-15T12:00:00.000Z');
  const res3DaysOverdue = calculateCycleStatus({ interval: 3, unit: 'days' }, baseDate, null, nowDay5);
  assert.strictEqual(res3DaysOverdue.is_due, true);
  assert.strictEqual(res3DaysOverdue.is_overdue, true);
  assert.strictEqual(res3DaysOverdue.days_overdue, 2);
  assert.strictEqual(res3DaysOverdue.status_label, 'Überfällig seit 2 Tagen');

  // 3. Wochen-Intervall mit festgelegtem Wochentag (z. B. Alle 2 Wochen samstags [6 = Samstag])
  // Samstag 2026-10-10 (Sa) -> +2 Wochen = Samstag 2026-10-24 (Sa)
  const res2WeeksSat = calculateCycleStatus(
    { interval: 2, unit: 'weeks', day_of_week: 6 },
    '2026-10-10T10:00:00.000Z',
    null,
    new Date('2026-10-11T10:00:00.000Z')
  );
  assert.strictEqual(res2WeeksSat.configured, true);
  assert.strictEqual(res2WeeksSat.day_of_week, 6);
  assert.strictEqual(res2WeeksSat.day_of_week_label, 'Samstag');
  assert.strictEqual(res2WeeksSat.cycle_label, 'Alle 2 Wochen (Samstag)');
  const nextDueDate = new Date(res2WeeksSat.next_due_at);
  assert.strictEqual(nextDueDate.getDay(), 6); // Samstag
  assert.strictEqual(nextDueDate.getDate(), 24); // 24. Oktober
});

test('E-Mail-Templates: measure-reminder.tpl & fertilize-reminder.tpl Vorlagen und Tokens', () => {
  const tplMeasure = loadTemplate('measure-reminder');
  assert.ok(tplMeasure, 'measure-reminder.tpl sollte vorhanden sein');
  assert.ok(tplMeasure.includes('{{measureUrl}}'));
  assert.ok(tplMeasure.includes('{{cycleLabel}}'));
  assert.ok(tplMeasure.includes('{{statusLabel}}'));

  const tplFertilize = loadTemplate('fertilize-reminder');
  assert.ok(tplFertilize, 'fertilize-reminder.tpl sollte vorhanden sein');
  assert.ok(tplFertilize.includes('{{fertilizeUrl}}'));
  assert.ok(tplFertilize.includes('{{cycleLabel}}'));

  const mMail = createMeasureReminderMail({
    username: 'Aquafreund',
    aquariumName: 'Naturaquarium 200L',
    cycleLabel: 'Wöchentlich (Samstag)',
    lastDateStr: '10.10.2026',
    statusLabel: 'Fällig heute',
    measureUrl: 'http://localhost:3000/#/a/1/messen',
  });
  assert.ok(mMail.subject.includes('Naturaquarium 200L'));
  assert.ok(mMail.html.includes('Aquafreund'));
  assert.ok(mMail.html.includes('Wöchentlich (Samstag)'));
  assert.ok(mMail.html.includes('http://localhost:3000/#/a/1/messen'));

  const fMail = createFertilizeReminderMail({
    username: 'Aquafreund',
    aquariumName: 'Naturaquarium 200L',
    cycleLabel: 'Alle 3 Tage',
    lastDateStr: '08.10.2026',
    statusLabel: 'Überfällig seit 1 Tag',
    fertilizeUrl: 'http://localhost:3000/#/a/1',
  });
  assert.ok(fMail.subject.includes('Düngung fällig'));
  assert.ok(fMail.html.includes('Alle 3 Tage'));
  assert.ok(fMail.html.includes('http://localhost:3000/#/a/1'));
});

test('Aquarium-Zyklen API: Anlegen, Bearbeiten, Statusabfrage und Rückstellung durch Messung / Düngung', async (t) => {
  const env = createTestEnvironment();
  t.after(async () => await env.cleanup());

  const user = await env.createUserAndLogin('cycle_user', 'passCycle123', 'cycle@test.local');

  // 1. Aquarium mit Mess- und Düngzyklus anlegen
  const createRes = await env.request('/api/aquariums', {
    method: 'POST',
    headers: { Cookie: user.cookie },
    body: {
      name: 'High-Tech Aquascape',
      water_type: 'fresh',
      volume_l: 120,
      measure_cycle_interval: 1,
      measure_cycle_unit: 'weeks',
      measure_cycle_day_of_week: 6, // Samstag
      measure_reminder_mail: 1,
      fertilize_cycle_interval: 3,
      fertilize_cycle_unit: 'days',
      fertilize_cycle_day_of_week: null,
      fertilize_reminder_mail: 1,
    },
  });
  assert.strictEqual(createRes.status, 200);
  const aqId = createRes.data.id;

  // 2. Aquarium Details abrufen & Cycle Status prüfen
  const getRes = await env.request(`/api/aquariums/${aqId}`, { headers: { Cookie: user.cookie } });
  assert.strictEqual(getRes.status, 200);
  const aq = getRes.data.aquarium;

  assert.strictEqual(aq.measure_cycle_interval, 1);
  assert.strictEqual(aq.measure_cycle_unit, 'weeks');
  assert.strictEqual(aq.measure_cycle_day_of_week, 6);
  assert.strictEqual(aq.measure_reminder_mail, 1);
  assert.ok(aq.measure_cycle_status);
  assert.strictEqual(aq.measure_cycle_status.configured, true);
  assert.strictEqual(aq.measure_cycle_status.day_of_week_label, 'Samstag');

  assert.strictEqual(aq.fertilize_cycle_interval, 3);
  assert.strictEqual(aq.fertilize_cycle_unit, 'days');
  assert.strictEqual(aq.fertilize_reminder_mail, 1);
  assert.ok(aq.fertilize_cycle_status);
  assert.strictEqual(aq.fertilize_cycle_status.configured, true);

  // 3. Messung durchführen
  const addMeas = await env.request(`/api/aquariums/${aqId}/measurements`, {
    method: 'POST',
    headers: { Cookie: user.cookie },
    body: { values: { no3: 15, po4: 0.8, fe: 0.1 } },
  });
  assert.strictEqual(addMeas.status, 200);

  // 4. Düngung im Logbuch erfassen
  const addFertilize = await env.request(`/api/aquariums/${aqId}/maintenance`, {
    method: 'POST',
    headers: { Cookie: user.cookie },
    body: {
      type: 'fertilize',
      details: '5 ml Aqua Rebell Eisen, 3 ml NPK',
      note: 'Morgendliche Düngung nach Beleuchtungsstart',
    },
  });
  assert.strictEqual(addFertilize.status, 200);

  // 5. Erneute Abfrage: last_measured_at und last_fertilized_at müssen aktualisiert sein
  const updatedGet = await env.request(`/api/aquariums/${aqId}`, { headers: { Cookie: user.cookie } });
  assert.strictEqual(updatedGet.status, 200);
  const updatedAq = updatedGet.data.aquarium;

  assert.ok(updatedAq.last_measured_at);
  assert.ok(updatedAq.last_fertilized_at);
  assert.strictEqual(updatedAq.measure_cycle_status.last_action_at, updatedAq.last_measured_at);
  assert.strictEqual(updatedAq.fertilize_cycle_status.last_action_at, updatedAq.last_fertilized_at);

  // 6. Zyklus per PUT aktualisieren (z. B. auf tägliche Düngung)
  const putRes = await env.request(`/api/aquariums/${aqId}`, {
    method: 'PUT',
    headers: { Cookie: user.cookie },
    body: {
      name: 'High-Tech Aquascape (Täglich)',
      water_type: 'fresh',
      volume_l: 120,
      measure_cycle_interval: 2,
      measure_cycle_unit: 'weeks',
      measure_cycle_day_of_week: 7, // Sonntag
      measure_reminder_mail: 0,
      fertilize_cycle_interval: 1,
      fertilize_cycle_unit: 'days',
      fertilize_reminder_mail: 1,
    },
  });
  assert.strictEqual(putRes.status, 200);

  const getAfterPut = await env.request(`/api/aquariums/${aqId}`, { headers: { Cookie: user.cookie } });
  assert.strictEqual(getAfterPut.status, 200);
  const putAq = getAfterPut.data.aquarium;

  assert.strictEqual(putAq.measure_cycle_interval, 2);
  assert.strictEqual(putAq.measure_cycle_unit, 'weeks');
  assert.strictEqual(putAq.measure_cycle_day_of_week, 7);
  assert.strictEqual(putAq.measure_reminder_mail, 0);
  assert.strictEqual(putAq.fertilize_cycle_interval, 1);
  assert.strictEqual(putAq.fertilize_cycle_unit, 'days');
});

test('Reminder-Service: checkAndSendReminders generiert Erinnerungs-E-Mails bei fälligen Zyklen', async (t) => {
  const env = createTestEnvironment();
  t.after(async () => await env.cleanup());

  const user = await env.createUserAndLogin('mail_cycle_user', 'pass123456', 'reminder_owner@test.local');

  // Aquarium mit sofort fälligem Zyklus anlegen (Erstellung vor 20 Tagen, Intervall 7 Tage)
  const createAq = await env.request('/api/aquariums', {
    method: 'POST',
    headers: { Cookie: user.cookie },
    body: {
      name: 'Pflanzenbecken Rio',
      water_type: 'fresh',
      volume_l: 80,
      measure_cycle_interval: 7,
      measure_cycle_unit: 'days',
      measure_reminder_mail: 1,
      fertilize_cycle_interval: 2,
      fertilize_cycle_unit: 'days',
      fertilize_reminder_mail: 1,
    },
  });
  assert.strictEqual(createAq.status, 200);
  const aqId = createAq.data.id;

  // Rückdatiere das Aquarium in der DB, sodass Zyklen sofort fällig sind
  const db = require('../src/db');
  const rawDb = db.getRawDb();
  rawDb.prepare("UPDATE aquariums SET created_at = datetime('now', '-20 days') WHERE id = ?").run(aqId);

  const sentEmails = [];
  const origSendMeasure = mailService.sendMeasureReminderEmail.bind(mailService);
  const origSendFertilize = mailService.sendFertilizeReminderEmail.bind(mailService);

  mailService.sendMeasureReminderEmail = (params) => {
    sentEmails.push({ type: 'measure', ...params });
    return origSendMeasure(params);
  };
  mailService.sendFertilizeReminderEmail = (params) => {
    sentEmails.push({ type: 'fertilize', ...params });
    return origSendFertilize(params);
  };

  // Führe Erinnerungsdurchlauf aus
  const result = await reminderService.checkAndSendReminders(db);
  assert.ok(result.checked >= 1);
  assert.strictEqual(result.sent, 2, '2 Erinnerungs-Mails (Messung + Düngung) sollten erfasst und gesendet werden');

  assert.strictEqual(sentEmails.length, 2);
  const measureEntry = sentEmails.find((m) => m.type === 'measure');
  const fertilizeEntry = sentEmails.find((m) => m.type === 'fertilize');

  assert.ok(measureEntry, 'Messzyklus-Mail sollte erfasst worden sein');
  assert.strictEqual(measureEntry.user.email, 'reminder_owner@test.local');
  assert.ok(fertilizeEntry, 'Düngzyklus-Mail sollte erfasst worden sein');
  assert.strictEqual(fertilizeEntry.user.email, 'reminder_owner@test.local');

  // Zweiter Durchlauf unmittelbar danach: Keine erneuten doppelten E-Mails
  const secondRun = await reminderService.checkAndSendReminders(db);
  assert.strictEqual(secondRun.sent, 0, 'Sollte keine doppelten E-Mails am selben Tag senden');

  // Restore spies
  mailService.sendMeasureReminderEmail = origSendMeasure;
  mailService.sendFertilizeReminderEmail = origSendFertilize;
});

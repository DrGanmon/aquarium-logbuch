'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createTestEnvironment, createMongoTestEnvironment } = require('./helpers/env');

for (const backend of ['sqlite', 'mongodb']) {
  test(`Wassertest-Verbrauch & Nachkauferinnerung (${backend})`, async (t) => {
    const env = backend === 'mongodb' ? await createMongoTestEnvironment() : createTestEnvironment({ DB_TYPE: 'sqlite' });
    t.after(() => env.cleanup());
    await env.start();
    const db = require('../dist/backend/src/db');
    const inventory = require('../dist/backend/src/services/test-inventory-service');
    const { mailService } = require('../dist/backend/src/services/mail-service');
    const sent = [];
    let smtpEnabled = true;
    t.mock.method(mailService, 'getConfig', () => ({ enabled: smtpEnabled, host: smtpEnabled ? 'mock.local' : '' }));
    t.mock.method(mailService, 'sendTestRefillReminderEmail', (mail) => { sent.push(mail); return { ok: true }; });
    const user = await env.createUserAndLogin('inventory_user', 'password123', 'inventory@example.com');
    const other = await env.createUserAndLogin('inventory_other', 'password123', 'other@example.com');
    const headers = { Cookie: user.cookie };
    const otherHeaders = { Cookie: other.cookie };
    const aquarium = await env.request('/api/aquariums', { method: 'POST', headers, body: { name: 'Inventory tank', water_type: 'fresh', volume_l: 100 } });
    assert.equal(aquarium.status, 200);
    const aqId = aquarium.data.id;
    const read = async (h = headers, suiteId = 'jbl-pro') => (await env.request(`/api/me/test-inventory?suiteId=${suiteId}`, { headers: h })).data.items;
    const item = async (key, h = headers) => (await read(h)).find(entry => entry.key === key);
    const update = (key, body) => env.request(`/api/me/test-inventory/${key}`, { method: 'PUT', headers, body: { suiteId: 'jbl-pro', ...body } });
    const measure = (values, h = headers, suiteId = 'jbl-pro') => env.request(`/api/aquariums/${aqId}/measurements`, { method: 'POST', headers: h, body: { values, suiteId } });

    await t.test('JBL-Reichweiten, Varianten und eigene Schätzung', async () => {
      const items = await read();
      assert.equal(items.length, 15);
      assert.ok(!items.some(entry => entry.key === 'temp'));
      for (const [key, capacity] of Object.entries({ ph: 80, nh4: 50, no2: 50, no3: 40, po4: 50, fe: 50, k: 25, mg: 60, cu: 50, sio2: 50, o2: 40 })) {
        assert.equal(items.find(entry => entry.key === key).capacity, capacity, key);
      }
      for (const key of ['kh', 'gh', 'ca', 'co2']) assert.equal((await item(key)).capacity, null);
      assert.equal((await update('kh', { capacity: 45, used: 5 })).status, 200);
      assert.equal((await item('kh')).capacity, 45);
      assert.equal((await update('ph', { variant: '3-10', used: 0 })).status, 200);
      assert.equal((await item('ph')).capacity, 50);
    });

    await t.test('Jeder gültige Messwert zählt, inklusive 0; Fehler und fehlende Werte zählen nicht', async () => {
      assert.equal((await measure({ no2: 0, no3: 12, temp: 24 })).status, 200);
      assert.equal((await item('no2')).used, 1);
      assert.equal((await item('no3')).used, 1);
      assert.equal((await item('fe')).used, 0);
      assert.equal((await measure({ no2: 900 })).status, 400);
      assert.equal((await measure({ no2: '', fe: null })).status, 400);
      assert.equal((await item('no2')).used, 1);
      assert.equal((await measure({ no2: 0 }, otherHeaders)).status, 404);
      assert.equal((await item('no2', otherHeaders)).used, 0);
    });

    await t.test('75-%-Grenze wird aufgerundet; keine doppelten Erinnerungen; Reset aktiviert neue Nachfüllung', async () => {
      sent.length = 0;
      await update('no2', { used: 36 });
      await measure({ no2: 0 });
      assert.equal(sent.length, 0);
      await measure({ no2: 0 });
      assert.equal(sent.length, 1);
      assert.equal(sent[0].test.key, 'no2');
      assert.equal(sent[0].test.used, 38);
      assert.equal(sent[0].user.email, user.email);
      await Promise.all(Array.from({ length: 5 }, () => measure({ no2: 0 })));
      assert.equal((await item('no2')).used, 43);
      assert.equal(sent.length, 1);
      await update('no2', { used: 37 });
      await measure({ no2: 0 });
      assert.equal(sent.length, 1, 'Korrektur ist keine neue Nachfüllung');
      await update('no2', { reset: true });
      assert.equal((await item('no2')).used, 0);
      assert.equal((await item('no2')).reminderSentAt, null);
      await update('no2', { used: 38 });
      assert.equal(sent.length, 2);
      sent.length = 0;
      await update('k', { used: 18 });
      assert.equal(sent.length, 0);
      await measure({ k: 10 });
      assert.equal(sent.length, 1, '25 Tests: Erinnerung erst beim 19. Test');
    });

    await t.test('Erinnerungen bleiben bei deaktiviertem SMTP offen und werden später einmalig geprüft', async () => {
      sent.length = 0;
      smtpEnabled = false;
      await update('fe', { used: 38 });
      assert.equal(sent.length, 0);
      assert.equal((await item('fe')).reminderSentAt, null);
      smtpEnabled = true;
      await Promise.all(Array.from({ length: 3 }, () => inventory.checkUserReminders(db, user.id)));
      assert.equal(sent.length, 1);
      assert.equal(sent[0].test.key, 'fe');
      assert.ok((await item('fe')).reminderSentAt);
      smtpEnabled = false;
      await update('po4', { used: 38 });
      smtpEnabled = true;
      const { reminderService } = require('../dist/backend/src/services/reminder-service');
      await reminderService.checkAndSendReminders(db);
      assert.equal(sent.length, 2);
      assert.equal(sent[1].test.key, 'po4');
    });

    await t.test('Nutzer kann E-Mail-Erinnerung deaktivieren; Fehler beim Einreihen sind wiederholbar', async () => {
      sent.length = 0;
      await update('no3', { used: 30, reminderEnabled: false });
      assert.equal(sent.length, 0);
      await update('no3', { reminderEnabled: true });
      assert.equal(sent.length, 1);
      const previous = mailService.sendTestRefillReminderEmail;
      mailService.sendTestRefillReminderEmail = () => { throw new Error('mock queue failure'); };
      assert.equal((await update('cu', { used: 38 })).status, 200);
      assert.equal((await item('cu')).reminderSentAt, null);
      mailService.sendTestRefillReminderEmail = previous;
      await inventory.checkUserReminders(db, user.id);
      assert.equal(sent.at(-1).test.key, 'cu');
    });

    await t.test('Alternative Suite und berechnetes CO₂ verbrauchen keine JBL-Reagenzien', async () => {
      const before = (await item('no2')).used;
      const suites = (await env.request('/api/suites', { headers })).data.suites;
      const alternate = suites.find(suite => suite.id !== 'jbl-pro');
      assert.equal((await measure({ no2: 0 }, headers, alternate.id)).status, 200);
      assert.equal((await item('no2')).used, before);
      await update('co2', { variant: 'calculated' });
      await measure({ co2: 20 });
      assert.equal((await item('co2')).used, 0);
    });

    await t.test('CSV-Import zählt jeden importierten Wert; Löschen gibt verbrauchtes Reagens nicht zurück', async () => {
      const before = (await item('nh4')).used;
      const imported = await env.request(`/api/aquariums/${aqId}/measurements/import-csv`, {
        method: 'POST', headers,
        body: { csvText: 'date;nh4\n2026-01-01;0\n2026-01-02;0.05', mapping: { 0: 'date', 1: 'nh4' }, delimiter: ';', hasHeader: true },
      });
      assert.equal(imported.status, 200);
      assert.equal((await item('nh4')).used, before + 2);
      const measurement = await measure({ nh4: 0 });
      await env.request(`/api/aquariums/${aqId}/measurements/${measurement.data.id}`, { method: 'DELETE', headers });
      assert.equal((await item('nh4')).used, before + 3);
    });

    await t.test('Validierung, Anmeldung und Isolation der Verbrauchszähler', async () => {
      assert.equal((await env.request('/api/me/test-inventory')).status, 401);
      for (const invalid of [{ used: -1 }, { used: 1.5 }, { used: '12' }, { capacity: 0 }, { variant: 'invalid' }, { reset: 'true' }]) {
        assert.equal((await update('no2', invalid)).status, 400);
      }
      assert.equal((await update('temp', { used: 5 })).status, 400);
      const otherData = await item('no2', otherHeaders);
      assert.equal(otherData.used, 0);
      await env.request('/api/me/test-inventory/no2', { method: 'PUT', headers: otherHeaders, body: { used: 9, userId: user.id } });
      assert.equal((await item('no2', otherHeaders)).used, 9);
      assert.notEqual((await item('no2')).used, 9);
    });

    await t.test('Geteiltes Aquarium: Verbrauch gehört dem Messenden; reine Leser zählen nicht', async () => {
      const ownerBefore = (await item('nh4')).used;
      const otherBefore = (await item('nh4', otherHeaders)).used;
      await db.shares.upsert(aqId, other.id, 'write', 'accepted');
      assert.equal((await measure({ nh4: 0 }, otherHeaders)).status, 200);
      assert.equal((await item('nh4', otherHeaders)).used, otherBefore + 1);
      assert.equal((await item('nh4')).used, ownerBefore);
      await db.shares.updateRole(aqId, other.id, 'view');
      assert.equal((await measure({ nh4: 0 }, otherHeaders)).status, 403);
      assert.equal((await item('nh4', otherHeaders)).used, otherBefore + 1);
    });

    await t.test('Backup & Restore erhält Verbrauch, Varianten und Erinnerungssperre', async () => {
      const before = await read();
      const { backupService } = require('../dist/backend/src/services/backup-service');
      const backup = await backupService.generateBackupData({ includeFiles: false, dbAdapter: db });
      await update('no2', { reset: true });
      await backupService.restoreBackup(backup);
      const restored = inventory.inventoryItems(await db.users.findById(user.id), 'jbl-pro');
      assert.deepEqual(restored, before);
    });
  });
}

test('Nachkauferinnerung: Deutsch/Englisch, Testname, Zähler und HTML-Escaping', (t) => {
  const { createTestRefillReminderMail } = require('../dist/backend/src/services/mail-template');
  const { mailService } = require('../dist/backend/src/services/mail-service');
  const queued = [];
  t.mock.method(mailService, 'enqueueMail', (mail) => { queued.push(mail); return { ok: true }; });
  for (const lang of ['de', 'en']) {
    const mail = createTestRefillReminderMail({ username: '<script>user</script>', testName: 'Nitrit (NO2)', used: 38, capacity: 50, profileUrl: 'https://example.com/aquarium/#/profile', lang });
    assert.ok(mail.subject.includes('Nitrit (NO2)'));
    assert.ok(mail.text.includes('38') && mail.text.includes('50') && mail.text.includes('12'));
    assert.ok(mail.text.includes('75'));
    assert.ok(mail.html.includes(`lang="${lang}"`));
    assert.ok(!mail.html.includes('<script>user</script>'));
    assert.ok(mail.html.includes('&lt;script&gt;user&lt;/script&gt;'));
    assert.ok(mail.html.includes('https://example.com/aquarium/#/profile'));
    assert.ok(!mail.html.includes('{{'));
    mailService.sendTestRefillReminderEmail({
      user: { username: 'Aquarist', email: 'refill@example.com', language: lang },
      test: { name: 'Nitrit (NO2)', used: 38, capacity: 50 },
    });
    assert.equal(queued.at(-1).to, 'refill@example.com');
    assert.ok(queued.at(-1).html.includes(`lang="${lang}"`));
    assert.ok(queued.at(-1).subject.includes('Nitrit (NO2)'));
  }
});

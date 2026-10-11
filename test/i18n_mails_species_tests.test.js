'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { createTestEnvironment } = require('./helpers/env');
const {
  getTemplatePath,
  renderTemplate,
  createEmailVerificationMail,
  createPasswordResetMail,
  createTestEmailMail,
  createAccountDeletionMail,
  createInvitationMail,
  createShareAquariumMail,
  createMeasureReminderMail,
  createFertilizeReminderMail,
} = require('../src/services/mail-template');
const { MailService } = require('../src/services/mail-service');
const { suiteService } = require('../config');
const { speciesService } = require('../config');

test('i18n: Mails, Besatz (Species) und Testsuiten (Deutsch & Englisch)', async (t) => {
  const env = createTestEnvironment();
  await env.start();

  t.after(async () => {
    await env.cleanup();
  });

  await t.test('1. Mail-Templates: Deutsch und Englisch Templates existieren und rendern sprachspezifisch', () => {
    // Verifizierung
    const deVerify = createEmailVerificationMail({ username: 'Fischfreund', verifyUrl: 'http://localhost/verify', expiresHours: 24, lang: 'de' });
    const enVerify = createEmailVerificationMail({ username: 'FishFriend', verifyUrl: 'http://localhost/verify', expiresHours: 24, lang: 'en' });
    assert.ok(deVerify.subject.includes('Bitte bestätige deine E-Mail-Adresse'));
    assert.ok(enVerify.subject.includes('Please verify your email address'));
    assert.ok(deVerify.html.includes('Hallo <strong>Fischfreund</strong>'));
    assert.ok(enVerify.html.includes('Hello <strong>FishFriend</strong>'));

    // Passwort-Reset
    const deReset = createPasswordResetMail({ username: 'Fischfreund', resetUrl: 'http://localhost/reset', expiresMinutes: 60, lang: 'de' });
    const enReset = createPasswordResetMail({ username: 'FishFriend', resetUrl: 'http://localhost/reset', expiresMinutes: 60, lang: 'en' });
    assert.ok(deReset.subject.includes('Passwort zurücksetzen'));
    assert.ok(enReset.subject.includes('Reset your password'));
    assert.ok(deReset.html.includes('Neues Passwort festlegen'));
    assert.ok(enReset.html.includes('Set New Password'));

    // Konto-Löschung
    const deDelete = createAccountDeletionMail({ username: 'Fischfreund', deleteUrl: 'http://localhost/delete', expiresMinutes: 60, lang: 'de' });
    const enDelete = createAccountDeletionMail({ username: 'FishFriend', deleteUrl: 'http://localhost/delete', expiresMinutes: 60, lang: 'en' });
    assert.ok(deDelete.subject.includes('Bestätigung zur Löschung'));
    assert.ok(enDelete.subject.includes('permanently delete your user account'));
    assert.ok(deDelete.html.includes('Konto jetzt endgültig löschen'));
    assert.ok(enDelete.html.includes('Permanently Delete My Account Now'));

    // Einladung
    const deInvite = createInvitationMail({ inviterName: 'Admin', inviteUrl: 'http://localhost/invite', inviteCode: 'ABC-123', expiresDays: 14, lang: 'de' });
    const enInvite = createInvitationMail({ inviterName: 'Admin', inviteUrl: 'http://localhost/invite', inviteCode: 'ABC-123', expiresDays: 14, lang: 'en' });
    assert.ok(deInvite.subject.includes('Einladung zu Aquarium-Logbuch'));
    assert.ok(enInvite.subject.includes('Invitation to Aquarium Logbook'));
    assert.ok(deInvite.html.includes('Dein Einladungscode'));
    assert.ok(enInvite.html.includes('Your Invite Code'));

    // Aquarium-Freigabe (Sharing)
    const deShare = createShareAquariumMail({ username: 'Gast', ownerUsername: 'Besitzer', aquariumName: 'Südamerika 240L', role: 'write', acceptUrl: 'http://localhost/share', lang: 'de' });
    const enShare = createShareAquariumMail({ username: 'Guest', ownerUsername: 'Owner', aquariumName: 'South America 240L', role: 'write', acceptUrl: 'http://localhost/share', lang: 'en' });
    assert.ok(deShare.subject.includes('hat das Aquarium „Südamerika 240L“ mit dir geteilt'));
    assert.ok(enShare.subject.includes('shared the aquarium "South America 240L" with you'));
    assert.ok(deShare.html.includes('Schreibrechte'));
    assert.ok(enShare.html.includes('Write permissions'));

    // Mess-Erinnerung
    const deMeasure = createMeasureReminderMail({ username: 'Aquarianer', aquariumName: 'Nano Scape', cycleLabel: 'Alle 7 Tage', lastDateStr: '01.10.2026', statusLabel: 'Fällig heute', measureUrl: 'http://localhost/messen', lang: 'de' });
    const enMeasure = createMeasureReminderMail({ username: 'Aquarist', aquariumName: 'Nano Scape', cycleLabel: 'Every 7 days', lastDateStr: '10/01/2026', statusLabel: 'Due today', measureUrl: 'http://localhost/messen', lang: 'en' });
    assert.ok(deMeasure.subject.includes('Erinnerung: Messung fällig'));
    assert.ok(enMeasure.subject.includes('Reminder: Test measurement due'));
    assert.ok(deMeasure.html.includes('Messung jetzt eintragen'));
    assert.ok(enMeasure.html.includes('Record Measurement Now'));

    // Dünge-Erinnerung
    const deFert = createFertilizeReminderMail({ username: 'Aquarianer', aquariumName: 'Nano Scape', cycleLabel: 'Wöchentlich', lastDateStr: '01.10.2026', statusLabel: 'Fällig heute', fertilizeUrl: 'http://localhost/fertilize', lang: 'de' });
    const enFert = createFertilizeReminderMail({ username: 'Aquarist', aquariumName: 'Nano Scape', cycleLabel: 'Weekly', lastDateStr: '10/01/2026', statusLabel: 'Due today', fertilizeUrl: 'http://localhost/fertilize', lang: 'en' });
    assert.ok(deFert.subject.includes('Erinnerung: Düngung fällig'));
    assert.ok(enFert.subject.includes('Reminder: Fertilization due'));
    assert.ok(deFert.html.includes('Düngung im Logbuch eintragen'));
    assert.ok(enFert.html.includes('Log Fertilization Now'));

    // Test-E-Mail
    const deTestMail = createTestEmailMail({ adminUsername: 'Admin', serverInfo: 'localhost:587', lang: 'de' });
    const enTestMail = createTestEmailMail({ adminUsername: 'Admin', serverInfo: 'localhost:587', lang: 'en' });
    assert.ok(deTestMail.subject.includes('Test-E-Mail von Aquarium-Logbuch'));
    assert.ok(enTestMail.subject.includes('Test Email from Aquarium Logbook'));
    assert.ok(deTestMail.html.includes('SMTP-Konfiguration erfolgreich!'));
    assert.ok(enTestMail.html.includes('SMTP Configuration Successful!'));
  });

  await t.test('2. Besatz & Artenkatalog: Daten und Kompatibilität in Deutsch und Englisch', () => {
    // 1. Deutsche Arten
    const deSpecies = speciesService.getAllSpecies('de');
    const bettaDe = speciesService.getSpeciesById('betta-splendens', 'de');
    assert.equal(bettaDe.name, 'Siamesischer Kampffisch');
    assert.equal(bettaDe.category, 'Labyrinthfische');
    assert.ok(bettaDe.description.includes('Siamesische Kampffisch'));

    // 2. Englische Arten
    const enSpecies = speciesService.getAllSpecies('en');
    const bettaEn = speciesService.getSpeciesById('betta-splendens', 'en');
    assert.equal(bettaEn.name, 'Siamese Fighting Fish');
    assert.equal(bettaEn.category, 'Labyrinth Fish');
    assert.ok(bettaEn.description.includes('Siamese fighting fish'));

    // 3. Suche in beiden Sprachen
    const foundByGerman = speciesService.findSpeciesByName('Siamesischer Kampffisch', 'en');
    assert.ok(foundByGerman, 'Gefunden über deutschen Namen');
    assert.equal(foundByGerman.name, 'Siamese Fighting Fish', 'Ausgabe auf Englisch');

    const foundByEnglish = speciesService.findSpeciesByName('Siamese Fighting Fish', 'de');
    assert.ok(foundByEnglish, 'Gefunden über englischen Namen');
    assert.equal(foundByEnglish.name, 'Siamesischer Kampffisch', 'Ausgabe auf Deutsch');

    // 4. Kompatibilitätsanalyse in Deutsch vs. Englisch
    const testAq = { volume_l: 30, water_type: 'fresh' };
    const stockItems = [
      { species: 'Betta splendens', count: 2 },
      { species: 'Tiger Barb', count: 4 },
    ];

    const analysisDe = speciesService.analyzeStockCompatibility(testAq, stockItems, 'de');
    const analysisEn = speciesService.analyzeStockCompatibility(testAq, stockItems, 'en');

    assert.equal(analysisDe.isCompatible, false);
    assert.equal(analysisEn.isCompatible, false);

    // DE Meldung
    const deBettaIssue = analysisDe.issues.find((i) => i.type === 'betta_multiple_solitary');
    assert.ok(deBettaIssue);
    assert.ok(deBettaIssue.title.includes('Kampffischen'));
    assert.ok(deBettaIssue.message.includes('Revierkämpfe') || deBettaIssue.message.includes('mehrfach'));

    // EN Meldung
    const enBettaIssue = analysisEn.issues.find((i) => i.type === 'betta_multiple_solitary');
    assert.ok(enBettaIssue);
    assert.ok(enBettaIssue.title.includes('Fighting Fish'));
    assert.ok(enBettaIssue.message.includes('solitary'));
  });

  await t.test('3. Wassertests & Suiten: Lokalisierte Parameter, Namen und Anleitungen', () => {
    // 1. Deutsche Testsuiten
    const deSuites = suiteService.getSuites('de');
    const deJbl = suiteService.getSuite('jbl-pro', 'de');
    assert.equal(deJbl.name, 'JBL Pro Tröpfchentest');
    const dePh = deJbl.tests.find((t) => t.key === 'ph');
    assert.equal(dePh.name, 'pH-Wert');
    assert.ok(dePh.hint.includes('Probewasser'));

    // 2. Englische Testsuiten
    const enSuites = suiteService.getSuites('en');
    const enJbl = suiteService.getSuite('jbl-pro', 'en');
    assert.equal(enJbl.name, 'JBL Pro Drop Test');
    const enPh = enJbl.tests.find((t) => t.key === 'ph');
    assert.equal(enPh.name, 'pH Value');
    assert.ok(enPh.hint.includes('sample water'));

    // Teststreifen 7in1
    const deStrips = suiteService.getSuite('jbl-easy-7in1', 'de');
    const enStrips = suiteService.getSuite('jbl-easy-7in1', 'en');
    assert.equal(deStrips.name, 'JBL ProAquatest Easy 7in1 (Teststreifen)');
    assert.equal(enStrips.name, 'JBL ProAquatest Easy 7in1 (Test Strips)');
  });

  await t.test('4. API Endpunkte: /api/config, /api/species und /api/suites liefern sprachspezifische Daten aus', async () => {
    // Deutscher Benutzer
    const deUser = await env.createUserAndLogin('de_user', 'password123', 'de_user@example.com');
    // Englischer Benutzer
    const enUser = await env.createUserAndLogin('en_user', 'password123', 'en_user@example.com');
    await env.request('/api/me', {
      method: 'PUT',
      headers: { Cookie: enUser.cookie },
      body: { language: 'en' },
    });

    // 1. /api/config für DE User
    const resConfigDe = await env.request('/api/config', { headers: { Cookie: deUser.cookie } });
    assert.equal(resConfigDe.status, 200);
    const phParamDe = resConfigDe.data.parameters.find((p) => p.key === 'ph');
    assert.equal(phParamDe.name, 'pH-Wert');
    const bettaDe = resConfigDe.data.species.find((s) => s.id === 'betta-splendens');
    assert.equal(bettaDe.name, 'Siamesischer Kampffisch');

    // 2. /api/config für EN User
    const resConfigEn = await env.request('/api/config', { headers: { Cookie: enUser.cookie } });
    assert.equal(resConfigEn.status, 200);
    const phParamEn = resConfigEn.data.parameters.find((p) => p.key === 'ph');
    assert.equal(phParamEn.name, 'pH Value');
    const bettaEn = resConfigEn.data.species.find((s) => s.id === 'betta-splendens');
    assert.equal(bettaEn.name, 'Siamese Fighting Fish');

    // 3. /api/species mit X-Language Header
    const resSpeciesEn = await env.request('/api/species', {
      headers: { Cookie: deUser.cookie, 'X-Language': 'en' },
    });
    assert.equal(resSpeciesEn.status, 200);
    const neonEn = resSpeciesEn.data.species.find((s) => s.id === 'paracheirodon-innesi');
    assert.equal(neonEn.name, 'Neon Tetra');

    // 4. /api/suites mit ?lang=en
    const resSuitesEn = await env.request('/api/suites?lang=en', {
      headers: { Cookie: deUser.cookie },
    });
    assert.equal(resSuitesEn.status, 200);
    const dropSuite = resSuitesEn.data.suites.find((s) => s.id === 'jbl-pro');
    assert.equal(dropSuite.name, 'JBL Pro Drop Test');
  });

  await t.test('5. Aquarium-Detail und Sharing mit Benutzer-Sprache', async () => {
    const enUser = await env.createUserAndLogin('en_owner', 'password123', 'en_owner@example.com');
    await env.request('/api/me', {
      method: 'PUT',
      headers: { Cookie: enUser.cookie },
      body: { language: 'en' },
    });

    // Aquarium erstellen
    const createAqRes = await env.request('/api/aquariums', {
      method: 'POST',
      headers: { Cookie: enUser.cookie },
      body: {
        name: 'My English Reef',
        volume_l: 300,
        water_type: 'salt',
      },
    });
    assert.equal(createAqRes.status, 200);
    const aqId = createAqRes.data.id;

    // Besatz hinzufügen
    await env.request(`/api/aquariums/${aqId}/stock`, {
      method: 'POST',
      headers: { Cookie: enUser.cookie },
      body: {
        species: 'Amphiprion ocellaris',
        count: 2,
      },
    });

    // Aquarium Detailansicht abrufen
    const aqDetailRes = await env.request(`/api/aquariums/${aqId}`, {
      headers: { Cookie: enUser.cookie },
    });
    assert.equal(aqDetailRes.status, 200);
    assert.ok(aqDetailRes.data.stock.length > 0);
    assert.equal(aqDetailRes.data.stock[0].category, 'Marine Fish');
  });
});

'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createTestEnvironment } = require('./helpers/env');

test('App-weiter modularer i18n Support (Deutsch & Englisch)', async (t) => {
  const env = createTestEnvironment();
  await env.start();

  t.after(async () => {
    await env.cleanup();
  });

  await t.test('1. JSON-Sprachdateien existieren und sind wohlgeformt', () => {
    const dePath = path.join(__dirname, '..', 'public', 'locales', 'de.json');
    const enPath = path.join(__dirname, '..', 'public', 'locales', 'en.json');

    assert.ok(fs.existsSync(dePath), 'public/locales/de.json existiert');
    assert.ok(fs.existsSync(enPath), 'public/locales/en.json existiert');

    const deJson = JSON.parse(fs.readFileSync(dePath, 'utf8'));
    const enJson = JSON.parse(fs.readFileSync(enPath, 'utf8'));

    assert.ok(deJson.common && deJson.common.appName, 'de.json enthält common.appName');
    assert.ok(enJson.common && enJson.common.appName, 'en.json enthält en.json.common.appName');

    assert.equal(deJson.common.appName, 'Aquarium-Logbuch');
    assert.equal(enJson.common.appName, 'Aquarium Logbook');

    // Prüfe Struktur-Übereinstimmung der Top-Level-Sektionen
    const deSections = Object.keys(deJson).sort();
    const enSections = Object.keys(enJson).sort();
    assert.deepEqual(deSections, enSections, 'de.json und en.json besitzen dieselben Top-Level Sektionen');

    // Prüfe Unterkategorien
    for (const sec of deSections) {
      const deKeys = Object.keys(deJson[sec]).sort();
      const enKeys = Object.keys(enJson[sec]).sort();
      assert.deepEqual(deKeys, enKeys, `Sektion "${sec}" hat in de und en dieselben Übersetzungsschlüssel`);
    }
  });

  await t.test('2. Vue i18n verwendet TypeScript und die bestehenden Sprachdateien', () => {
    const source = fs.readFileSync(path.join(__dirname, '../public/frontend/state.ts'), 'utf8');
    assert.match(source, /export function t\(/);
    assert.match(source, /locales\/de.json/);
    assert.match(source, /locales\/en.json/);
    assert.match(source, /export function fmtDate/);
    assert.match(source, /export function fmtNum/);
    assert.ok(source.includes('aquarium_lang'));
  });
  await t.test('3. Sprachumschalter ist eine native Vue-Komponente', () => {
    const source = fs.readFileSync(path.join(__dirname, '../public/frontend/components/Topbar.vue'), 'utf8');
    assert.ok(source.includes('id="btn-lang-topbar"'));
    assert.ok(source.includes('$emit(\'language\')'));
  });

  await t.test('4. Benutzerprofil API unterstützt Sprachspeicherung', async () => {
    const user = await env.createUserAndLogin('lang_tester', 'password123', 'lang@example.com');
    const cookie = user.cookie;

    // Standard-Sprache prüfen
    const meRes1 = await env.request('/api/me', { headers: { Cookie: cookie } });
    assert.equal(meRes1.status, 200);
    assert.equal(meRes1.data.language, 'de', 'Standard-Sprache ist de');

    // Sprache auf Englisch aktualisieren
    const putRes = await env.request('/api/me', {
      method: 'PUT',
      headers: { Cookie: cookie },
      body: {
        language: 'en',
      },
    });
    assert.equal(putRes.status, 200);
    assert.equal(putRes.data.user.language, 'en', 'Sprache auf en geändert');

    // Erneut abrufen
    const meRes2 = await env.request('/api/me', { headers: { Cookie: cookie } });
    assert.equal(meRes2.status, 200);
    assert.equal(meRes2.data.language, 'en', 'Persistierte Sprache bleibt en');

    // Ungültige Sprache wird abgefangen (Fallback de)
    const putResInvalid = await env.request('/api/me', {
      method: 'PUT',
      headers: { Cookie: cookie },
      body: {
        language: 'fr',
      },
    });
    assert.equal(putResInvalid.status, 200);
    assert.equal(putResInvalid.data.user.language, 'de', 'Fallback auf de bei unbekanntem Code');
  });

  await t.test('5. Frontend-Bundle enthält kompilierte i18n Daten', () => {
    const bundlePath = path.join(__dirname, '..', 'public', 'dist', 'app.js');
    if (fs.existsSync(bundlePath)) {
      const bundle = fs.readFileSync(bundlePath, 'utf8');
      assert.ok(bundle.includes('Aquarium Logbook'), 'Bundle enthält englische Übersetzungen');
      assert.ok(bundle.includes('Aquarium-Logbuch'), 'Bundle enthält deutsche Übersetzungen');
      assert.ok(bundle.includes('setLanguage'), 'Bundle enthält setLanguage Funktion');
    }
  });
});

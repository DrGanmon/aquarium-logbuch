'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('Footer, Impressum, EU AI Act, Datenschutz & Lizenzen Validierung', async (t) => {
  const indexPath = path.join(__dirname, '..', 'public', 'index.html');
  const indexHtml = fs.readFileSync(path.join(__dirname, '..', 'public/frontend/components/SiteFooter.vue'), 'utf8') + fs.readFileSync(path.join(__dirname, '..', 'public/locales/de.json'), 'utf8');

  const jsDir = path.join(__dirname, '..', 'public', 'frontend');
  const readAllJs = (dir) => {
    let out = '';
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const ent of entries) {
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) out += '\n' + readAllJs(full);
      else if (/\.(ts|vue)$/.test(ent.name)) out += '\n' + fs.readFileSync(full, 'utf8');
    }
    return out;
  };
  const appJsPath = path.join(__dirname, '..', 'public/frontend/App.vue');
  const appJs = fs.readFileSync(appJsPath, 'utf8') + '\n' + (fs.existsSync(jsDir) ? readAllJs(jsDir) : '');
  const legalView = fs.readFileSync(path.join(jsDir, 'views/LegalView.vue'), 'utf8');
  const legalDe = require('../public/locales/de.json').legal.content;
  const legalEn = require('../public/locales/en.json').legal.content;

  const styleCssPath = path.join(__dirname, '..', 'public', 'style.css');
  const styleCss = fs.readFileSync(styleCssPath, 'utf8');

  await t.test('index.html enthält den Site-Footer mit allen vorgeschriebenen Links', () => {
    assert.ok(/<footer\s+class="site-footer"\s+id="site-footer"/.test(indexHtml), 'Footer-Element muss existieren');
    assert.ok(indexHtml.includes('href="#/impressum"'), 'Link zu Impressum muss vorhanden sein');
    assert.ok(indexHtml.includes('href="#/datenschutz"'), 'Link zu Datenschutz muss vorhanden sein');
    assert.ok(indexHtml.includes('href="#/lizenzen"'), 'Link zu Lizenzen & Copyright muss vorhanden sein');
    assert.ok(indexHtml.includes('href="#/kontakt"'), 'Link zu Kontakt muss vorhanden sein');
    assert.ok(indexHtml.includes('href="https://github.com/DrGanmon/aquarium-logbuch"'), 'Link zum Repository muss vorhanden sein');
    assert.ok(indexHtml.includes('EU AI Act'), 'EU AI Act Hinweis-Badge im Footer');
  });

  await t.test('style.css enthält Styling für Footer und Rechtliche Ansichten', () => {
    assert.ok(styleCss.includes('.site-footer'), 'CSS für .site-footer vorhanden');
    assert.ok(styleCss.includes('.footer-container'), 'CSS für .footer-container vorhanden');
    assert.ok(styleCss.includes('.legal-tabs'), 'CSS für .legal-tabs vorhanden');
    assert.ok(styleCss.includes('.legal-box'), 'CSS für .legal-box vorhanden');
    assert.ok(styleCss.includes('.license-card'), 'CSS für .license-card vorhanden');
  });

  await t.test('app.js enthält Routing für alle rechtlichen Seiten (auch ohne Login)', () => {
    assert.ok(appJs.includes('impressum'), 'Route impressum registriert');
    assert.ok(appJs.includes('datenschutz'), 'Route datenschutz registriert');
    assert.ok(appJs.includes('lizenzen'), 'Route lizenzen registriert');
    assert.ok(appJs.includes('kontakt'), 'Route kontakt registriert');
    assert.ok(appJs.includes('LegalView'), 'Funktion viewLegal implementiert');
  });

  await t.test('viewLegal enthält EU AI Act Transparenzangaben gem. Art. 50', () => {
    for (const content of [legalDe, legalEn]) {
      assert.ok(content.transparencyHeading.includes('Art. 50 EU AI Act'));
      assert.ok(content.transparencyHeading.includes('2024/1689'));
      for (const tool of ['JetBrains Junie', 'OpenAI Codex', 'ChatGPT']) {
        assert.ok(content.developmentNotice.includes(tool));
      }
    }
    assert.ok(legalView.includes('t("legal.content.developmentNotice")'));
  });

  await t.test('viewLegal enthält Impressum gem. § 5 DDG und § 18 MStV', () => {
    assert.ok(legalDe.providerHeading.includes('§ 5 Digitale-Dienste-Gesetz (DDG)'), '§ 5 DDG Anbieterkennzeichnung');
    assert.ok(legalDe.editorialHeading.includes('§ 18 Abs. 2 MStV'), '§ 18 Abs. 2 MStV Verantwortlichkeit');
    assert.ok(legalEn.providerHeading.includes('§ 5'));
    assert.ok(legalEn.editorialHeading.includes('MStV'));
    assert.ok(appJs.includes('ec.europa.eu/consumers/odr'), 'EU-Streitschlichtungsplattform');
  });

  await t.test('viewLegal enthält vollständige DSGVO-Datenschutzerklärung', () => {
    assert.ok(legalDe.privacyIntro.includes('Datenschutz-Grundverordnung (DSGVO)'), 'DSGVO Erwähnung');
    assert.ok(legalDe.accountLabel.includes('Art. 6 Abs. 1'), 'Rechtsgrundlagen nach Art. 6 DSGVO');
    for (const content of [legalDe, legalEn]) {
      assert.ok(content.accessLabel.includes('Art. 15'));
      assert.ok(content.erasureLabel.includes('Art. 17'));
      assert.ok(content.portabilityLabel.includes('Art. 20'));
    }
  });

  await t.test('Alle Rechtsseiten verwenden vollständige DE/EN-Übersetzungen', () => {
    assert.deepEqual(Object.keys(legalDe).sort(), Object.keys(legalEn).sort());
    const keys = [...legalView.matchAll(/t\("legal\.content\.([^"\)]+)"\)/g)].map((match) => match[1]);
    for (const key of keys) {
      assert.ok(legalDe[key]?.trim(), `Deutsche Übersetzung: ${key}`);
      assert.ok(legalEn[key]?.trim(), `Englische Übersetzung: ${key}`);
    }
    for (const key of ['imprintHeading', 'privacyHeading', 'licensesHeading', 'contactHeading']) {
      assert.ok(keys.includes(key), `Übersetzte Seite: ${key}`);
      assert.notEqual(legalDe[key], legalEn[key]);
    }
  });

  await t.test('viewLegal listet alle Module und Open-Source-Lizenzen auf', () => {
    assert.ok(appJs.includes('express'), 'express Modul aufgeführt');
    assert.ok(appJs.includes('better-sqlite3'), 'better-sqlite3 Modul aufgeführt');
    assert.ok(appJs.includes('mongodb'), 'mongodb Modul aufgeführt');
    assert.ok(appJs.includes('chart.js'), 'chart.js Modul aufgeführt');
    assert.ok(appJs.includes('The MIT License (MIT)'), 'MIT License Text');
    assert.ok(appJs.includes('Apache License, Version 2.0'), 'Apache License Text');
    assert.ok(appJs.includes('CC BY-NC-SA 4.0'), 'CC BY-NC-SA 4.0 Erwähnung vorhanden');
  });

  await t.test('LICENSE Datei und package.json sind unter CC BY-NC-SA 4.0 lizenziert', () => {
    const licensePath = path.join(__dirname, '..', 'LICENSE');
    assert.ok(fs.existsSync(licensePath), 'LICENSE Datei muss im Projektstamm existieren');
    const licenseText = fs.readFileSync(licensePath, 'utf8');

    assert.ok(licenseText.includes('CC BY-NC-SA 4.0'), 'CC BY-NC-SA 4.0 in LICENSE');
    assert.ok(licenseText.includes('NonCommercial'), 'NonCommercial Klausel in LICENSE');
    assert.ok(licenseText.includes('ShareAlike'), 'ShareAlike / Copyleft Klausel in LICENSE');
    assert.ok(licenseText.includes('Attribution'), 'Attribution / Urhebernennung in LICENSE');

    const pkgPath = path.join(__dirname, '..', 'package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    assert.equal(pkg.license, 'CC-BY-NC-SA-4.0', 'package.json muss CC-BY-NC-SA-4.0 als Lizenz deklarieren');
  });

  await t.test('legalConfigService speichert und liefert konfigurierte E-Mail-Adressen', () => {
    const { legalConfigService } = require('../dist/backend/src/services/legal-config-service');
    const initial = legalConfigService.getConfig();
    assert.ok(initial.contactEmail, 'contactEmail vorhanden');
    assert.ok(initial.imprintEmail, 'imprintEmail vorhanden');
    assert.equal(initial.license.identifier, 'CC-BY-NC-SA-4.0', 'Lizenz-Identifier korrekt');

    // Test Validierung
    assert.throws(() => {
      legalConfigService.saveConfig({ contactEmail: 'invalid-email' });
    }, /Ungültige Kontakt-E-Mail-Adresse/);

    assert.throws(() => {
      legalConfigService.saveConfig({ imprintEmail: 'not-an-email' });
    }, /Ungültige Impressums-E-Mail-Adresse/);

    // Test Speichern
    const updated = legalConfigService.saveConfig({
      contactEmail: 'support@aquarium-custom.local',
      imprintEmail: 'rechtliches@aquarium-custom.local',
    });
    assert.equal(updated.contactEmail, 'support@aquarium-custom.local');
    assert.equal(updated.imprintEmail, 'rechtliches@aquarium-custom.local');

    // Wieder zurücksetzen
    legalConfigService.saveConfig({
      contactEmail: null,
      imprintEmail: null,
    });
  });

  await t.test('Öffentliche API und Admin-Endpunkte für rechtliche Konfiguration', async () => {
    const { createTestEnvironment } = require('./helpers/env');
    const env = createTestEnvironment({
      ADMIN_EMAIL: 'admin@aquarium-test.local',
      CONTACT_EMAIL: 'kontakt-env@aquarium-test.local',
      IMPRINT_EMAIL: 'impressum-env@aquarium-test.local',
    });

    try {
      // 1. Öffentlich ohne Login abrufen
      const pubRes = await env.request('/api/legal-info');
      assert.equal(pubRes.status, 200);
      assert.equal(pubRes.data.license.identifier, 'CC-BY-NC-SA-4.0');
      assert.ok(pubRes.data.contactEmail);
      assert.ok(pubRes.data.imprintEmail);

      // 2. Regulärer Benutzer versucht Admin-Legal-Config aufzurufen -> 403
      const regularUser = await env.createUserAndLogin('reg_user', 'password123', 'reg@example.com');
      const forbiddenGet = await env.request('/api/admin/legal-config', {
        headers: { Cookie: regularUser.cookie },
      });
      assert.equal(forbiddenGet.status, 403);

      const forbiddenPut = await env.request('/api/admin/legal-config', {
        method: 'PUT',
        headers: { Cookie: regularUser.cookie },
        body: { contactEmail: 'hacker@example.com' },
      });
      assert.equal(forbiddenPut.status, 403);

      // 3. Admin ruft ab und aktualisiert Legal Config
      const adminUser = await env.createUserAndLogin('admin_legal', 'password123', 'admin@aquarium-test.local');
      const adminGet = await env.request('/api/admin/legal-config', {
        headers: { Cookie: adminUser.cookie },
      });
      assert.equal(adminGet.status, 200);

      const adminPut = await env.request('/api/admin/legal-config', {
        method: 'PUT',
        headers: { Cookie: adminUser.cookie },
        body: {
          contactEmail: 'neu-kontakt@aquarium-test.local',
          imprintEmail: 'neu-impressum@aquarium-test.local',
        },
      });
      assert.equal(adminPut.status, 200);
      assert.equal(adminPut.data.config.contactEmail, 'neu-kontakt@aquarium-test.local');
      assert.equal(adminPut.data.config.imprintEmail, 'neu-impressum@aquarium-test.local');

      // 4. Öffentlicher Abruf reflektiert nun die neuen Adressen
      const updatedPub = await env.request('/api/legal-info');
      assert.equal(updatedPub.status, 200);
      assert.equal(updatedPub.data.contactEmail, 'neu-kontakt@aquarium-test.local');
      assert.equal(updatedPub.data.imprintEmail, 'neu-impressum@aquarium-test.local');
    } finally {
      await env.cleanup();
    }
  });
});

'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createTestEnvironment } = require('./helpers/env');

test('Theme: Light, Dark und System-Modus Konfiguration & Frontend-Assets', async (t) => {
  const env = createTestEnvironment();
  await env.start();

  t.after(async () => {
    await env.cleanup();
  });

  await t.test('CSS: Style-Definitionen für Light, Dark und System-Präferenz vorhanden', () => {
    const cssPath = path.join(__dirname, '..', 'public', 'style.css');
    assert.ok(fs.existsSync(cssPath), 'style.css existiert');
    const css = fs.readFileSync(cssPath, 'utf8');

    // Prüfen, ob CSS-Variablen für Standard/Light und Dark definiert sind
    assert.ok(css.includes(':root'), 'CSS enthält :root Definitionen');
    assert.ok(css.includes('@media (prefers-color-scheme: dark)'), 'CSS unterstützt Systemstandard via prefers-color-scheme: dark');
    assert.ok(css.includes('html[data-theme="dark"]'), 'CSS unterstützt expliziten Dunkelmodus data-theme="dark"');
    assert.ok(css.includes('html[data-theme="light"]'), 'CSS unterstützt expliziten Hellmodus data-theme="light"');
    assert.ok(css.includes('--glass'), 'CSS definiert Hintergrundvariable --glass');
    assert.ok(css.includes('--paper'), 'CSS definiert Kartenvariable --paper');
    assert.ok(css.includes('--ink'), 'CSS definiert Textvariable --ink');
    assert.ok(css.includes('--input-bg'), 'CSS definiert Formularfeld-Hintergrund --input-bg');
    assert.ok(css.includes('.theme-options'), 'CSS enthält Klassen für Theme-Auswahl');
  });

  await t.test('HTML: Frühe Theme-Initialisierung gegen FOUC und Topbar-Schalter', async () => {
    const res = await env.request('/');
    assert.equal(res.status, 200);
    const html = res.text;

    assert.ok(html.includes('data-theme'), 'HTML enthält Script zur Auswertung von data-theme');
    assert.ok(html.includes('id="btn-theme-topbar"'), 'HTML enthält Topbar Theme-Toggle-Button');
    assert.ok(html.includes('id="meta-theme-color"'), 'HTML enthält dynamische meta theme-color');
  });

  await t.test('JavaScript: Theme-Logik und Umschaltfunktionen vorhanden', async () => {
    const resTheme = await env.request('/js/theme.js');
    assert.equal(resTheme.status, 200);
    const jsTheme = resTheme.text;

    const resProfile = await env.request('/js/views/profile.js');
    assert.equal(resProfile.status, 200);
    const jsProfile = resProfile.text;

    const js = jsTheme + '\n' + jsProfile;

    assert.ok(js.includes('applyTheme'), 'theme.js definiert applyTheme');
    assert.ok(js.includes('toggleTheme'), 'theme.js definiert toggleTheme');
    assert.ok(js.includes('getThemeSetting'), 'theme.js definiert getThemeSetting');
    assert.ok(js.includes('isEffectiveDark'), 'theme.js definiert isEffectiveDark');
    assert.ok(js.includes('prefers-color-scheme: dark'), 'theme.js reagiert auf Media-Query Event Listener');
    assert.ok(js.includes('Erscheinungsbild / Farbschema'), 'profile.js enthält Theme-Sektion im Profil');
  });
});

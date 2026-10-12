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

  await t.test('Vue-Shell bindet den Theme-Schalter und die Theme-Farbe ein', async () => {
    const res = await env.request('/');
    assert.equal(res.status, 200);
    assert.ok(res.text.includes('id="vue-root"'));
    assert.ok(res.text.includes('id="meta-theme-color"'));
    const topbar = fs.readFileSync(path.join(__dirname, '../public/frontend/components/Topbar.vue'), 'utf8');
    assert.ok(topbar.includes('id="btn-theme-topbar"'));
    assert.ok(topbar.includes('@click="toggleTheme"'));
  });
  await t.test('Theme-Zustand ist reaktiv, persistent und folgt dem Systemstandard', () => {
    const source = fs.readFileSync(path.join(__dirname, '../public/frontend/state.ts'), 'utf8');
    assert.ok(source.includes('prefers-color-scheme: dark'));
    assert.ok(source.includes('aquarium_theme'));
    assert.ok(source.includes('export function toggleTheme'));
    assert.ok(source.includes('document.documentElement.dataset.theme'));
  });
});

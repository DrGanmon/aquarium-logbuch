'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('Checkbox & Radio-Button Styling', async (t) => {
  const cssPath = path.join(__dirname, '..', 'public', 'style.css');
  assert.ok(fs.existsSync(cssPath), 'style.css existiert');
  const css = fs.readFileSync(cssPath, 'utf8');

  await t.test('CSS: Checkboxen und Radio-Buttons sind von 44px Text-Input-Regeln ausgenommen', () => {
    // Sicherstellen, dass die generelle Input-Regel Checkboxen/Radios nicht auf 44px Mindesthöhe oder 100% Breite aufbläht
    assert.ok(
      css.includes('input:not([type="checkbox"]):not([type="radio"])'),
      'Text-Input-Regel schließt Checkboxen und Radio-Buttons explizit aus'
    );
  });

  await t.test('CSS: Dedizierte Styling-Regeln für Checkboxen und Radio-Buttons vorhanden', () => {
    assert.ok(css.includes('input[type="checkbox"], input[type="radio"]'), 'Spezifischer Selektor für Checkboxen & Radios vorhanden');
    assert.ok(css.includes('accent-color: var(--water)'), 'Akzentfarbe für Checkboxen/Radios definiert');
    assert.ok(css.includes('width: 1.15rem'), 'Angemessene Breite für Checkboxen definiert');
    assert.ok(css.includes('height: 1.15rem'), 'Angemessene Höhe für Checkboxen definiert');
    assert.ok(css.includes('min-height: 0'), 'min-height für Checkboxen zurückgesetzt');
  });

  await t.test('CSS: Picker / Options-Auswahl für Wassertests kompakt und klickbar formatiert', () => {
    assert.ok(css.includes('.picker label'), 'Picker-Labels gestylt');
    assert.ok(css.includes('.picker input'), 'Picker-Inputs explizit dimensioniert');
    assert.ok(css.includes('border-radius: 99px'), 'Pill-Form für Testauswahl');
  });
});

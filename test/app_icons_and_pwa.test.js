'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const publicDir = path.join(__dirname, '..', 'public');

describe('App Icons & PWA Mobile Shortcuts', () => {
  it('sollte ein valides manifest.json mit vollständigen Icons für PWA und Shortcuts bereitstellen', () => {
    const manifestPath = path.join(publicDir, 'manifest.json');
    assert.ok(fs.existsSync(manifestPath), 'manifest.json existiert nicht');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

    assert.equal(manifest.name, 'Aquarium-Logbuch');
    assert.equal(manifest.short_name, 'Aquarium');
    assert.ok(Array.isArray(manifest.icons), 'icons ist kein Array');
    assert.ok(manifest.icons.length >= 4, 'Zu wenige Icons im Manifest konfiguriert');

    const purposes = manifest.icons.map((i) => i.purpose).filter(Boolean);
    assert.ok(purposes.some((p) => p.includes('any')), 'Standard "any" Icon fehlt im Manifest');
    assert.ok(purposes.some((p) => p.includes('maskable')), 'Maskable Icon für mobile Adaptive Icons fehlt im Manifest');

    for (const icon of manifest.icons) {
      const iconPath = path.join(publicDir, icon.src);
      assert.ok(fs.existsSync(iconPath), `Icon-Datei ${icon.src} existiert nicht in public/`);
    }
  });

  it('sollte apple-touch-icon und Favicons in den Standardgrößen bereitstellen', () => {
    const requiredFiles = [
      'apple-touch-icon.png',
      'icon-192.png',
      'icon-512.png',
      'icon-maskable-192.png',
      'icon-maskable-512.png',
      'favicon-32x32.png',
      'favicon-16x16.png',
      'favicon.ico',
    ];

    for (const file of requiredFiles) {
      const filePath = path.join(publicDir, file);
      assert.ok(fs.existsSync(filePath), `Erwartete Icon-Datei ${file} existiert nicht`);
      const stat = fs.statSync(filePath);
      assert.ok(stat.size > 100, `Icon-Datei ${file} ist verdächtig klein (${stat.size} Bytes)`);
    }
  });

  it('sollte in index.html alle Meta- und Link-Tags für mobile Home-Screen Shortcuts und Browser-Icons enthalten', () => {
    const htmlPath = path.join(publicDir, 'index.html');
    const html = fs.readFileSync(htmlPath, 'utf8');

    assert.ok(html.includes('apple-touch-icon'), 'apple-touch-icon Link fehlt in index.html');
    assert.ok(html.includes('apple-mobile-web-app-capable'), 'apple-mobile-web-app-capable fehlt');
    assert.ok(html.includes('manifest.json'), 'manifest.json Link fehlt');
    assert.ok(html.includes('favicon'), 'Favicon Link fehlt');
  });

  it('sollte das App-Logo in README.md eingebunden haben', () => {
    const readmePath = path.join(__dirname, '..', 'README.md');
    const readme = fs.readFileSync(readmePath, 'utf8');

    assert.ok(readme.includes('public/icon-192.png'), 'README.md bindet das Logo nicht ein');
    assert.ok(readme.includes('Aquarium-Logbuch Logo'), 'Alt-Text für Logo fehlt in README.md');
  });
});

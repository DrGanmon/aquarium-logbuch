'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { buildUserGuide } = require('../scripts/build-user-guide');
const { createTestEnvironment } = require('./helpers/env');
const directory = path.resolve(__dirname, '../public/handbuch');

test('Nutzerhandbuch: erzeugte Dateien, Kapitelanker und Screenshots sind vollständig', async () => {
  buildUserGuide({ check: true });
  const html = fs.readFileSync(path.join(directory, 'index.html'), 'utf8');
  const sharp = require('sharp');
  const manifest = JSON.parse(fs.readFileSync(path.join(directory, 'images/manifest.json'), 'utf8'));
  const chapters = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../docs/user-guide/chapters.json'), 'utf8'));
  assert.ok(chapters.length >= 20);
  for (const chapter of chapters) assert.ok(chapter.steps.length >= 3, chapter.id);
  for (const [, id] of html.matchAll(/href="#([^"]+)"/g)) assert.ok(html.includes(`id="${id}"`), `Fehlender Anker: ${id}`);
  for (const [, target] of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
    if (target.startsWith('#') || target.startsWith('https://')) continue;
    assert.ok(fs.existsSync(path.join(directory, target)), `Fehlende lokale Datei: ${target}`);
  }
  for (const [name, expected] of Object.entries(manifest)) {
    const metadata = await sharp(path.join(directory, `images/${name}.webp`)).metadata();
    assert.equal(metadata.width, expected.width);assert.equal(metadata.height, expected.height);
    assert.equal(metadata.format, 'webp');
  }
});

test('Nutzerhandbuch: keine Skripte, externen Ressourcen oder automatischen App-Anfragen', () => {
  const html = fs.readFileSync(path.join(directory, 'index.html'), 'utf8');
  const css = fs.readFileSync(path.join(directory, 'guide.css'), 'utf8');
  assert.doesNotMatch(html, /<script\b|<iframe\b|<form\b|\bon\w+\s*=|rel="(?:preload|prefetch|preconnect)"/i);
  assert.doesNotMatch(html, /(?:src|poster)="(?:https?:)?\/\//i);
  assert.doesNotMatch(css, /@import|url\(/i);
  const images = [...html.matchAll(/<img\b[^>]*>/g)].map(match => match[0]);
  assert.ok(images.length >= 20);
  for (const image of images) {
    assert.match(image, /loading="lazy"/);assert.match(image, /decoding="async"/);
    assert.match(image, /width="\d+"/);assert.match(image, /height="\d+"/);assert.match(image, /alt="[^"]+"/);
  }
  const footer = fs.readFileSync(path.resolve(__dirname, '../public/frontend/components/SiteFooter.vue'), 'utf8');
  assert.match(footer, /href="handbuch\/" target="_blank" rel="noopener noreferrer"/);
  assert.doesNotMatch(footer, /import\([^)]*handbuch|fetch\([^)]*handbuch|prefetch|preload/i);
  assert.doesNotMatch(fs.readFileSync(path.resolve(__dirname, '../public/frontend/service-worker.ts'), 'utf8'), /handbuch/);
});

test('Nutzerhandbuch: ohne Anmeldung und vor Ersteinrichtung öffentlich erreichbar', async t => {
  const env = createTestEnvironment({ DB_TYPE: 'sqlite', ENFORCE_SETUP_GATE: 'true' });
  t.after(() => env.cleanup());
  assert.equal((await env.request('/api/config')).status, 428);
  const response = await env.request('/handbuch/');
  assert.equal(response.status, 200);assert.match(response.headers.get('content-type'), /text\/html/);
  assert.match(response.text, /Nutzerhandbuch/);assert.equal(response.headers.get('set-cookie'), null);
  assert.equal((await env.request('/handbuch/guide.css')).status, 200);
  const image = await env.request('/handbuch/images/uebersicht.webp');
  assert.equal(image.status, 200);assert.match(image.headers.get('content-type'), /image\/webp/);
});

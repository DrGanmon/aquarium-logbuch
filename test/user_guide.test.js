'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { buildUserGuide, renderUserGuide } = require('../scripts/build-user-guide');
const { createTestEnvironment } = require('./helpers/env');
const directory = path.resolve(__dirname, '../public/handbuch');

test('Nutzerhandbuch: erzeugte Dateien, Kapitelanker und Screenshots sind vollständig', async () => {
  buildUserGuide({ check: true });
  const sharp = require('sharp');
  const manifest = JSON.parse(fs.readFileSync(path.join(directory, 'images/manifest.json'), 'utf8'));
  const locales = JSON.parse(fs.readFileSync('docs/user-guide/locales.json', 'utf8'));
  const original = JSON.parse(fs.readFileSync('docs/user-guide/chapters.json', 'utf8'));
  for (const [language, locale] of Object.entries(locales)) {
    const base = path.join(directory, locale.directory);
    const html = fs.readFileSync(path.join(base, 'index.html'), 'utf8');
    const chapters = JSON.parse(fs.readFileSync(path.join('docs/user-guide', locale.chapters), 'utf8'));
    assert.deepEqual(chapters.map(chapter => chapter.id), original.map(chapter => chapter.id));
    assert.ok(chapters.length >= 20);
    assert.match(html, new RegExp(`<html lang="${language}">`));
    assert.ok(html.includes(`aria-label="${locale.languages}"`));
    for (const chapter of chapters) assert.ok(chapter.steps.length >= 3, chapter.id);
    for (const chapter of chapters) {
      assert.ok(chapter.features.length >= 2, chapter.id);
      for (const feature of chapter.features) {
        assert.ok(feature.title.trim() && feature.text.trim(), chapter.id);
        assert.ok(html.includes(`<dt>${feature.title}</dt>`), chapter.id);
      }
    }
    for (const [, id] of html.matchAll(/href="#([^"]+)"/g)) assert.ok(html.includes(`id="${id}"`), `Fehlender Anker: ${id}`);
    for (const [, target] of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
      if (target.startsWith('#') || target.startsWith('https://')) continue;
      assert.ok(fs.existsSync(path.join(base, target)), `Fehlende lokale Datei: ${target}`);
    }
    for (const [code, other] of Object.entries(locales)) {
      const url = new URL(other.directory ? other.directory + '/' : './', 'https://example.test/handbuch/').pathname;
      const target = new URL((locale.directory ? '../' : '') + (other.directory ? other.directory + '/' : './'), 'https://example.test/handbuch/' + (locale.directory ? locale.directory + '/' : '')).pathname;
      assert.equal(target, url);
      assert.ok(html.includes(`hreflang="${code}"`));
    }
  }
  for (const [name, expected] of Object.entries(manifest)) {
    const metadata = await sharp(path.join(directory, `images/${name}.webp`)).metadata();
    assert.equal(metadata.width, expected.width);assert.equal(metadata.height, expected.height);
    assert.equal(metadata.format, 'webp');
  }
});

test('Nutzerhandbuch: keine Skripte, externen Ressourcen oder automatischen App-Anfragen', () => {
  const html = ['index.html', 'en/index.html'].map(file => fs.readFileSync(path.join(directory, file), 'utf8')).join('\n');
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
  const english = await env.request('/handbuch/en/');
  assert.equal(english.status, 200);assert.match(english.text, /<html lang="en">/);
  assert.match(english.text, /Sign in and get started/);assert.equal(english.headers.get('set-cookie'), null);
  const image = await env.request('/handbuch/images/uebersicht.webp');
  assert.equal(image.status, 200);assert.match(image.headers.get('content-type'), /image\/webp/);
});


test('Nutzerhandbuch: englische Kapitel vollständig übersetzt, unbekannte Sprache abweisen', () => {
  const german = JSON.parse(fs.readFileSync('docs/user-guide/chapters.json', 'utf8'));
  const english = JSON.parse(fs.readFileSync('docs/user-guide/chapters.en.json', 'utf8'));
  for (const [index, chapter] of english.entries()) {
    const original = german[index];
    for (const field of ['title', 'intro']) assert.notEqual(chapter[field], original[field], chapter.id);
    assert.equal(chapter.steps.length, original.steps.length);
    assert.equal(chapter.extra.length, original.extra.length);
    for (const [step, text] of chapter.steps.entries()) assert.notEqual(text, original.steps[step], chapter.id);
    for (const [note, item] of chapter.extra.entries()) {
      assert.notEqual(item.title, original.extra[note].title);assert.notEqual(item.text, original.extra[note].text);
    }
    assert.equal(chapter.features.length, original.features.length);
    for (const [feature, item] of chapter.features.entries()) {
      assert.ok(item.title.trim());assert.notEqual(item.text, original.features[feature].text);
    }
    if (chapter.image) assert.notEqual(chapter.caption, original.caption);
  }
  assert.match(renderUserGuide('en'), /Screenshots show the German interface/);
  assert.throws(() => renderUserGuide('../../secret'), /Unbekannte Handbuchsprache/);
});

test('Nutzerhandbuch: Themenbereiche decken alle Kapitel genau einmal in beiden Sprachen ab', () => {
  const groups = JSON.parse(fs.readFileSync('docs/user-guide/groups.json', 'utf8'));
  const chapters = JSON.parse(fs.readFileSync('docs/user-guide/chapters.json', 'utf8'));
  assert.equal(groups.length, 9);assert.equal(chapters.length, 40);
  assert.deepEqual(groups.flatMap(group => group.chapters), chapters.map(chapter => chapter.id));
  assert.equal(new Set(groups.flatMap(group => group.chapters)).size, chapters.length);
  for (const language of ['de', 'en']) {
    const html = renderUserGuide(language);
    assert.equal([...html.matchAll(/class="guide-group"/g)].length, groups.length);
    for (const group of groups) {
      assert.ok(html.includes(`href="#bereich-${group.id}"`));
      assert.ok(html.includes(`id="bereich-${group.id}"`));
      assert.ok(html.includes(group[language].title));
    }
    assert.match(html, /href="#schnellstart"/);
    assert.match(html, /<h4>[^<]+<\/h4><dl class="features">/);
  }
});

test('Nutzerhandbuch: fehlende Kapitel oder Übersetzungen verhindern unvollständige Ausgabe', t => {
  const temporary = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'aquarium-guide-language-'));
  t.after(() => fs.rmSync(temporary, { recursive: true, force: true }));
  fs.mkdirSync(path.join(temporary, 'scripts'));
  fs.mkdirSync(path.join(temporary, 'public/handbuch/images'), { recursive: true });
  fs.cpSync('docs/user-guide', path.join(temporary, 'docs/user-guide'), { recursive: true });
  fs.copyFileSync('public/handbuch/images/manifest.json', path.join(temporary, 'public/handbuch/images/manifest.json'));
  fs.copyFileSync('scripts/build-user-guide.js', path.join(temporary, 'scripts/build-user-guide.js'));
  const { buildUserGuide: build } = require(path.join(temporary, 'scripts/build-user-guide.js'));
  const file = path.join(temporary, 'docs/user-guide/chapters.en.json');
  const chapters = JSON.parse(fs.readFileSync(file, 'utf8'));
  fs.writeFileSync(file, JSON.stringify(chapters.slice(1)));
  assert.throws(() => build(), /Unvollständige Kapitelübersetzung/);
  assert.equal(fs.existsSync(path.join(temporary, 'public/handbuch/index.html')), false);
  chapters[0].steps[0] = '';
  fs.writeFileSync(file, JSON.stringify(chapters));
  assert.throws(() => build(), /Fehlender Kapiteltext/);
  chapters[0].steps[0] = 'Restored step';
  chapters[0].features.pop();
  fs.writeFileSync(file, JSON.stringify(chapters));
  assert.throws(() => build(), /Abweichende Kapitelstruktur/);
  const groupsFile = path.join(temporary, 'docs/user-guide/groups.json');
  const groups = JSON.parse(fs.readFileSync(groupsFile, 'utf8'));
  groups[0].chapters.push(groups[0].chapters[0]);
  fs.writeFileSync(groupsFile, JSON.stringify(groups));
  assert.throws(() => build(), /jedes Kapitel genau einmal/);
});

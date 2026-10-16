#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const escape = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
function renderUserGuide() {
  const chapters = JSON.parse(fs.readFileSync(path.join(root, 'docs/user-guide/chapters.json'), 'utf8'));
  const screenshots = JSON.parse(fs.readFileSync(path.join(root, 'public/handbuch/images/manifest.json'), 'utf8'));
  const ids = new Set();
  for (const chapter of chapters) {
    if (!/^[a-z][a-z0-9-]*$/.test(chapter.id) || ids.has(chapter.id)) throw new Error('Ungültige oder doppelte Kapitel-ID.');
    ids.add(chapter.id);
    if (chapter.image && !/^[a-z][a-z0-9-]*$/.test(chapter.image)) throw new Error('Ungültiger Bildname.');
  }
  const toc = chapters.map((chapter, index) => `<li><a href="#${chapter.id}"><span>${String(index + 1).padStart(2, '0')}</span> ${escape(chapter.title)}</a></li>`).join('\n');
  const sections = chapters.map((chapter, index) => {
    let figure = '';
    if (chapter.image) {
      const metadata = screenshots[chapter.image];
      if (!metadata || !Number.isSafeInteger(metadata.width) || metadata.width < 1 || !Number.isSafeInteger(metadata.height) || metadata.height < 1) throw new Error(`Screenshot-Maße fehlen oder sind ungültig: ${chapter.image}`);
      figure = `<figure><a href="images/${chapter.image}.webp" aria-label="${escape(chapter.title)}: Screenshot in voller Größe öffnen"><img src="images/${chapter.image}.webp" width="${metadata.width}" height="${metadata.height}" loading="lazy" decoding="async" alt="${escape(chapter.caption)}"></a><figcaption>${escape(chapter.caption)} <a href="images/${chapter.image}.webp">Vergrößern</a></figcaption></figure>`;
    }
    return `<section id="${chapter.id}" aria-labelledby="title-${chapter.id}"><p class="eyebrow">Kapitel ${String(index + 1).padStart(2, '0')}</p><h2 id="title-${chapter.id}">${escape(chapter.title)}</h2><p class="intro">${escape(chapter.intro)}</p>${figure}<ol class="steps">${chapter.steps.map(step => `<li>${escape(step)}</li>`).join('')}</ol>${chapter.extra.map(note => `<aside class="note"><h3>${escape(note.title)}</h3><p>${escape(note.text)}</p></aside>`).join('')}<a class="back-top" href="#inhalt">↑ Zum Inhaltsverzeichnis</a></section>`;
  }).join('\n');
  return `<!doctype html>
<html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="description" content="Öffentliches Aquarium-Logbuch Nutzerhandbuch: Alle Funktionen einfach erklärt, mit echten Demo-Screenshots, Schrittfolgen und Hilfe für Handy und Offline-Nutzung."><meta name="referrer" content="no-referrer"><title>Nutzerhandbuch · Aquarium-Logbuch</title><link rel="stylesheet" href="guide.css"></head>
<body><a class="skip-link" href="#kapitel">Direkt zum Handbuch</a><header class="hero"><div class="hero-inner"><p class="eyebrow">AQUARIUM-LOGBUCH · NUTZERHANDBUCH</p><h1>Dein Aquarium.<br>Einfach im Blick.</h1><p>Vom ersten Becken bis zur Offline-Messung: Hier findest du jeden wichtigen Handgriff, verständlich erklärt und mit Bildern aus der App.</p><div class="hero-meta"><span>Ohne Anmeldung lesbar</span><span>Echte Demo-Screenshots</span><span>Für Handy &amp; Computer</span></div><a class="primary" href="#start">Mit der Anmeldung beginnen <span aria-hidden="true">→</span></a></div></header>
<div class="layout"><nav id="inhalt" class="toc" aria-label="Kapitelübersicht"><details open><summary>Was möchtest du machen?</summary><ol>${toc}</ol></details><p class="toc-note">Tipp: Mit der Suchfunktion deines Browsers findest du Begriffe auf dieser Seite. Du kannst das Handbuch auch über das Browsermenü drucken.</p></nav><main id="kapitel"><div class="welcome"><strong>Willkommen!</strong><p>Du musst hier nichts der Reihe nach lesen. Wähle links ein Thema und folge den nummerierten Schritten. Auf dem Handy steht das Inhaltsverzeichnis oberhalb der Kapitel.</p><p>Alle abgebildeten Konten und Aquariendaten sind erfunden. Beispielillustrationen dienen nur der Demo. Die tatsächlichen Menüs hängen von deinen Rechten und der Einrichtung deines Servers ab. Bilder lassen sich durch Antippen vergrößern.</p></div>${sections}</main></div>
<footer><p>Aquarium-Logbuch · Öffentliches Nutzerhandbuch</p><p>Keine Anmeldung, keine externen Schriftarten, kein Tracking und kein JavaScript auf dieser Seite. Das Handbuch lädt keine App-Daten.</p><p><a href="https://github.com/DrGanmon/aquarium-logbuch">Projekt und technische Dokumentation</a> · <a href="#inhalt">Zur Kapitelübersicht</a></p></footer></body></html>\n`;
}
function buildUserGuide({ check = false } = {}) {
  const target = path.join(root, 'public/handbuch');
  const files = { 'index.html': renderUserGuide(), 'guide.css': fs.readFileSync(path.join(root, 'docs/user-guide/guide.css'), 'utf8') };
  for (const [name, content] of Object.entries(files)) {
    const file = path.join(target, name);
    if (check) {
      if (!fs.existsSync(file) || fs.readFileSync(file, 'utf8') !== content) throw new Error(`Handbuch veraltet: ${name}. node scripts/build-user-guide.js ausführen.`);
    } else { fs.mkdirSync(target, { recursive: true });fs.writeFileSync(file, content); }
  }
}
if (require.main === module) {
  try { buildUserGuide({ check: process.argv.includes('--check') });console.log('Nutzerhandbuch geprüft/erstellt: public/handbuch/'); }
  catch (error) { console.error(error.message);process.exitCode = 1; }
}
module.exports = { buildUserGuide, renderUserGuide };

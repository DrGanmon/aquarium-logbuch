#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const escape = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const source = name => JSON.parse(fs.readFileSync(path.join(root, 'docs/user-guide', name), 'utf8'));
function loadLocales() {
  const locales = source('locales.json');
  const directories = new Set();
  for (const [language, locale] of Object.entries(locales)) {
    if (!/^[a-z]{2}(?:-[A-Z]{2})?$/.test(language) || !/^(?:[a-z]{2}(?:-[A-Z]{2})?)?$/.test(locale.directory) || directories.has(locale.directory) || !/^chapters(?:\.[a-z]{2}(?:-[A-Z]{2})?)?\.json$/.test(locale.chapters)) throw new Error('Ungültige Sprache oder doppeltes Handbuchverzeichnis.');
    directories.add(locale.directory);
    for (const [key, value] of Object.entries(locale)) {
      if (key === 'directory') continue;
      if (!(typeof value === 'string' && value.trim()) && !(Array.isArray(value) && value.length && value.every(item => typeof item === 'string' && item.trim()))) throw new Error(`Fehlende Übersetzung: ${language}.${key}`);
    }
  }
  for (const [language, locale] of Object.entries(locales)) {
    if (locales.de && Object.keys(locales.de).some(key => !(key in locale))) throw new Error(`Unvollständige Handbuchsprache: ${language}`);
  }
  if (!locales.de || locales.de.directory !== '') throw new Error('Die bestehende deutsche Handbuchadresse muss erhalten bleiben.');
  return locales;
}
function renderUserGuide(language = 'de') {
  const locales = loadLocales();
  const text = locales[language];
  if (!text) throw new Error(`Unbekannte Handbuchsprache: ${language}`);
  const chapters = source(text.chapters);
  const reference = source(locales.de.chapters);
  if (chapters.length !== reference.length) throw new Error(`Unvollständige Kapitelübersetzung: ${language}`);
  const groups = source('groups.json');
  const groupedIds = groups.flatMap(group => group.chapters);
  if (JSON.stringify(groupedIds) !== JSON.stringify(reference.map(chapter => chapter.id))) throw new Error('Handbuchbereiche müssen jedes Kapitel genau einmal in Kapitelreihenfolge enthalten.');
  const groupIds = new Set();
  for (const group of groups) {
    if (!/^[a-z][a-z0-9-]*$/.test(group.id) || groupIds.has(group.id) || !group.chapters.length) throw new Error('Ungültiger oder doppelter Handbuchbereich.');
    groupIds.add(group.id);
    for (const code of Object.keys(locales)) if (!group[code]?.title?.trim() || !group[code]?.intro?.trim()) throw new Error(`Fehlende Bereichsübersetzung: ${code}.${group.id}`);
  }
  const screenshots = JSON.parse(fs.readFileSync(path.join(root, 'public/handbuch/images/manifest.json'), 'utf8'));
  const prefix = text.directory ? '../' : '';
  const ids = new Set();
  for (const [index, chapter] of chapters.entries()) {
    if (!/^[a-z][a-z0-9-]*$/.test(chapter.id) || ids.has(chapter.id)) throw new Error('Ungültige oder doppelte Kapitel-ID.');
    ids.add(chapter.id);
    const original = reference[index];
    if (chapter.id !== original.id || chapter.image !== original.image || chapter.steps?.length !== original.steps.length || chapter.extra?.length !== original.extra.length || chapter.features?.length !== original.features?.length) throw new Error(`Abweichende Kapitelstruktur: ${language}.${chapter.id}`);
    if (!Array.isArray(chapter.features) || chapter.features.length < 2) throw new Error(`Fehlende Funktionserklärungen: ${language}.${chapter.id}`);
    const strings = [chapter.title, chapter.intro, ...chapter.features.flatMap(feature => [feature.title, feature.text]), ...chapter.steps, ...chapter.extra.flatMap(note => [note.title, note.text]), ...(chapter.image ? [chapter.caption] : [])];
    if (strings.some(value => typeof value !== 'string' || !value.trim())) throw new Error(`Fehlender Kapiteltext: ${language}.${chapter.id}`);
    if (chapter.image && !/^[a-z][a-z0-9-]*$/.test(chapter.image)) throw new Error('Ungültiger Bildname.');
  }
  const localeUrl = locale => `${prefix}${locale.directory ? locale.directory + '/' : './'}`;
  const alternatives = Object.entries(locales).map(([code, locale]) => `<link rel="alternate" hreflang="${code}" href="${localeUrl(locale)}">`).join('');
  const languages = `<nav class="languages" aria-label="${escape(text.languages)}">${Object.entries(locales).map(([code, locale]) => `<a href="${localeUrl(locale)}" lang="${code}" hreflang="${code}"${code === language ? ' aria-current="page"' : ''}>${escape(locale.name)}</a>`).join('')}</nav>`;
  const numbered = new Map(chapters.map((chapter, index) => [chapter.id, { ...chapter, number: String(index + 1).padStart(2, '0') }]));
  const toc = groups.map(group => `<li class="toc-group"><details><summary class="toc-group-title">${escape(group[language].title)}</summary><ol>${group.chapters.map(id => { const chapter = numbered.get(id);return `<li><a href="#${id}"><span>${chapter.number}</span> ${escape(chapter.title)}</a></li>`; }).join('')}</ol></details></li>`).join('\n');
  const areas = `<nav class="areas" aria-label="${escape(text.areas)}">${groups.map(group => `<a href="#bereich-${group.id}"><strong>${escape(group[language].title)}</strong><span>${escape(group[language].intro)}</span></a>`).join('')}</nav>`;
  const chapterSections = chapters.map((chapter, index) => {
    let figure = '';
    if (chapter.image) {
      const metadata = screenshots[chapter.image];
      if (!metadata || !Number.isSafeInteger(metadata.width) || metadata.width < 1 || !Number.isSafeInteger(metadata.height) || metadata.height < 1) throw new Error(`Screenshot-Maße fehlen oder sind ungültig: ${chapter.image}`);
      const image = `${prefix}images/${chapter.image}.webp`;
      figure = `<figure><a href="${image}" aria-label="${escape(chapter.title)}: ${escape(text.openImage)}"><img src="${image}" width="${metadata.width}" height="${metadata.height}" loading="lazy" decoding="async" alt="${escape(chapter.caption)}"></a><figcaption>${escape(chapter.caption)} <a href="${image}">${escape(text.enlarge)}</a></figcaption></figure>`;
    }
    const features = `<h4>${escape(text.functions)}</h4><dl class="features">${chapter.features.map(feature => `<div><dt>${escape(feature.title)}</dt><dd>${escape(feature.text)}</dd></div>`).join('')}</dl>`;
    return `<section class="chapter" id="${chapter.id}" aria-labelledby="title-${chapter.id}"><p class="eyebrow">${escape(text.chapter)} ${String(index + 1).padStart(2, '0')}</p><h3 id="title-${chapter.id}">${escape(chapter.title)}</h3><p class="intro">${escape(chapter.intro)}</p>${features}${figure}<h4>${escape(text.instructions)}</h4><ol class="steps">${chapter.steps.map(step => `<li>${escape(step)}</li>`).join('')}</ol>${chapter.extra.map(note => `<aside class="note"><h4>${escape(note.title)}</h4><p>${escape(note.text)}</p></aside>`).join('')}<a class="back-top" href="#inhalt">↑ ${escape(text.back)}</a></section>`;
  });
  const rendered = new Map(chapters.map((chapter, index) => [chapter.id, chapterSections[index]]));
  const sections = groups.map((group, index) => `<section class="guide-group" id="bereich-${group.id}" aria-labelledby="group-${group.id}"><header class="group-heading"><p class="eyebrow">${escape(text.area)} ${index + 1}</p><h2 id="group-${group.id}">${escape(group[language].title)}</h2><p>${escape(group[language].intro)}</p></header>${group.chapters.map(id => rendered.get(id)).join('\n')}</section>`).join('\n');
  return `<!doctype html>
<html lang="${language}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="description" content="${escape(text.description)}"><meta name="referrer" content="no-referrer"><title>${escape(text.title)} · Aquarium-Logbuch</title><link rel="stylesheet" href="${prefix}guide.css">${alternatives}</head>
<body><a class="skip-link" href="#kapitel">${escape(text.skip)}</a><header class="hero"><div class="hero-inner">${languages}<p class="eyebrow">AQUARIUM-LOGBUCH · ${escape(text.title)}</p><h1>${text.heading.map(escape).join('<br>')}</h1><p>${escape(text.intro)}</p><div class="hero-meta">${text.badges.map(badge => `<span>${escape(badge)}</span>`).join('')}</div><a class="primary" href="#schnellstart">${escape(text.start)} <span aria-hidden="true">→</span></a></div></header>
<div class="layout"><nav id="inhalt" class="toc" aria-label="${escape(text.contents)}"><details open><summary>${escape(text.question)}</summary><ol>${toc}</ol></details><p class="toc-note">${escape(text.tip)}</p></nav><main id="kapitel"><div class="welcome"><strong>${escape(text.welcome)}</strong><p>${escape(text.welcomeText)}</p><p>${escape(text.demo)}</p><p>${escape(text.screenshots)}</p></div>${areas}${sections}</main></div>
<footer><p>Aquarium-Logbuch · ${escape(text.public)}</p><p>${escape(text.privacy)}</p><p><a href="https://github.com/DrGanmon/aquarium-logbuch">${escape(text.project)}</a> · <a href="#inhalt">${escape(text.contents)}</a></p></footer></body></html>\n`;
}
function buildUserGuide({ check = false } = {}) {
  const target = path.join(root, 'public/handbuch');
  const locales = loadLocales();
  const files = { 'guide.css': fs.readFileSync(path.join(root, 'docs/user-guide/guide.css'), 'utf8') };
  for (const [language, locale] of Object.entries(locales)) files[locale.directory ? `${locale.directory}/index.html` : 'index.html'] = renderUserGuide(language);
  for (const [name, content] of Object.entries(files)) {
    const file = path.join(target, name);
    if (check) {
      if (!fs.existsSync(file) || fs.readFileSync(file, 'utf8') !== content) throw new Error(`Handbuch veraltet: ${name}. node scripts/build-user-guide.js ausführen.`);
    } else { fs.mkdirSync(path.dirname(file), { recursive: true });fs.writeFileSync(file, content); }
  }
}
if (require.main === module) {
  try { buildUserGuide({ check: process.argv.includes('--check') });console.log('Nutzerhandbuch geprüft/erstellt: public/handbuch/'); }
  catch (error) { console.error(error.message);process.exitCode = 1; }
}
module.exports = { buildUserGuide, renderUserGuide };

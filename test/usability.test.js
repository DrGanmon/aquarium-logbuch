'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const vue = require('vue');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const frontendFiles = dir => fs.readdirSync(path.join(root, dir), { withFileTypes: true }).flatMap(entry =>
  entry.isDirectory() ? frontendFiles(path.join(dir, entry.name)) : /\.(vue|ts)$/.test(entry.name) ? [path.join(dir, entry.name)] : []);

/** Loads public/frontend/state.ts with minimal browser stubs. */
function loadState() {
  const source = ts.transpileModule(read('public/frontend/state.ts'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const listeners = {}, documentListeners = {};
  const document = { documentElement: { dataset: {}, lang: '' }, title: '', visibilityState: 'visible', querySelector: () => null,
    addEventListener: (name, handler) => { (documentListeners[name] ||= []).push(handler); } };
  const exports = {};
  new Function('require', 'exports', 'localStorage', 'matchMedia', 'document', 'addEventListener', source)(name => {
    if (name === 'vue') return vue;
    if (name.endsWith('.json')) return { default: require(path.join(root, 'public/frontend', name)) };
    return {};
  }, exports, { getItem: () => null, setItem() {} }, () => ({ matches: false, addEventListener() {} }), document,
  (name, handler) => { (listeners[name] ||= []).push(handler); });
  return { state: exports, listeners, documentListeners, document };
}

test('Navigation: Tab-Leiste unten mit Hauptzielen, Anmelde-Navigation wird nachgeladen', () => {
  const topbar = read('public/frontend/components/Topbar.vue');
  assert.match(topbar, /defineAsyncComponent\(\(\) => import\("\.\/UserNav\.vue"\)\)/, 'Navigation angemeldeter Nutzer gehört nicht ins Startbundle');
  assert.doesNotMatch(topbar, /import UserNav|import Icon/);
  assert.match(topbar, /class="skip-link"/, 'Link „Zum Inhalt springen“');
  const nav = read('public/frontend/components/UserNav.vue');
  const bottom = nav.slice(nav.indexOf('class="bottom-nav"'));
  const primary = bottom.slice(0, bottom.indexOf('id="bottom-nav-more"'));
  assert.equal((primary.match(/<a href=/g) || []).length + (primary.match(/<button /g) || []).length, 5, 'Fünf Hauptziele inklusive „Mehr“');
  assert.deepEqual([...primary.matchAll(/<a href="([^"]+)"/g)].map(match => match[1]), ['#/profile', '#/social', '#/health', '#/species'], 'Reihenfolge: Profil, Social, Gesundheit, Arten, Mehr');
  assert.match(bottom, /aria-expanded="moreOpen"/);
  const more = bottom.slice(bottom.indexOf('id="bottom-nav-more"'));
  for (const target of ['#/', '#/plants', '#/notifications', '#/admin']) assert.ok(more.includes(`href="${target}"`), `${target} im Menü „Mehr“`);
  assert.match(primary, /<button ref="moreButton"[^]*class="notification-count"/, 'Ungelesene Hinweise am Menü „Mehr“');
  assert.match(nav, /key === "Escape"/, 'Menü lässt sich mit Escape schließen');
  const css = read('public/style.css');
  assert.match(css, /@media \(max-width: 720px\)[\s\S]*\.bottom-nav \{[\s\S]*position: fixed/);
  assert.match(css, /scroll-padding-bottom: calc\(1rem \+ var\(--bottom-nav-h\)\)/, 'Fokus wird nicht von der Leiste verdeckt');
  assert.match(read('public/index.html'), /viewport-fit=cover/, 'Safe-Area-Abstände sind verfügbar');
  assert.match(css, /\.bottom-nav \{[^}]*padding: 0 max\(1rem, env\(safe-area-inset-right\)\) max\(\.5rem, env\(safe-area-inset-bottom\)\) max\(1rem, env\(safe-area-inset-left\)\)/, 'Beschriftungen halten Abstand zu abgerundeten Displayecken');
});

test('Aquarium-Detail: Abschnitte als Tabs mit Adresse und Tastatursteuerung', () => {
  const view = read('public/frontend/views/AquariumView.vue');
  const ids = [...view.matchAll(/\{ id: "(\w+)", icon:/g)].map(match => match[1]);
  assert.deepEqual(ids, ['overview', 'values', 'stock', 'tech', 'tasks', 'log', 'gallery']);
  assert.match(view, /role="tablist"/);
  assert.match(view, /role="tab"/);
  assert.match(view, /role="tabpanel"/);
  assert.match(view, /:aria-selected="tab === item\.id"/);
  assert.match(view, /:tabindex="tab === item\.id \? 0 : -1"/);
  assert.match(view, /event\.key === "ArrowRight"/);
  assert.match(view, /query\.set\("tab", next\)/, 'Aktiver Tab steht in der Adresse');
  assert.match(view, /route\.value\.query\.get\("tab"\)/);
  for (const tab of ['values', 'stock', 'tech', 'tasks', 'log', 'gallery']) assert.ok(view.includes(`tab === '${tab}'`), `Tab ${tab} wird bedingt gerendert`);
  assert.match(view, /data-aquarium-summary/, 'Übersicht beginnt mit einer Zusammenfassung');
  assert.match(view, /'more-right': tabOverflow\.right/, 'Seitlich weitergehende Tabs werden angezeigt');
  assert.match(view, /class="aq-tabs-scroll right"/);
  assert.match(view, /scrollIntoView\(\{ block: "nearest", inline: "nearest"/, 'Aktiver Tab wird ins Bild gerollt');
  assert.match(read('public/style.css'), /\.aq-tabs-wrap\.more-right \.aq-tabs \{ -webkit-mask-image/);
  const tabsRule = read('public/style.css').match(/^\.aq-tabs \{[^}]*\}/m)?.[0] || '';
  assert.match(tabsRule, /overflow-y: hidden/, 'Tab-Leiste scrollt nicht vertikal');
  assert.doesNotMatch(read('public/style.css'), /\.aq-tabs \[role="tab"\] \{[^}]*margin-bottom: -/, 'Tabs ragen nicht unten aus der Leiste heraus');
});

test('Bestätigungen: keine Browserdialoge mehr, Löschungen im Bestand rückgängig machbar', () => {
  for (const file of frontendFiles('public/frontend')) {
    const source = read(file);
    assert.doesNotMatch(source.replace(/askConfirm\(|function confirm\w*\(|confirmEntryDeletion\(/g, ''), /(?<![\w.])(window\.)?confirm\(/, `${file} nutzt window.confirm`);
  }
  const dialog = read('public/frontend/dialog.ts');
  assert.match(dialog, /export function askConfirm/);
  assert.match(read('public/frontend/App.vue'), /ConfirmHost v-if="confirmRequest"/);
  assert.match(read('public/frontend/App.vue'), /ConfirmHost = lazyComponent/, 'Dialog wird erst bei Bedarf geladen');
  for (const file of ['components/StockSection.vue', 'components/PlantSection.vue', 'views/AquariumView.vue']) assert.match(read(`public/frontend/${file}`), /undoable\(/, `${file} bietet Rückgängig`);
});

test('Bestätigungsdialog liefert die Entscheidung und ersetzt offene Anfragen', async () => {
  const source = ts.transpileModule(read('public/frontend/dialog.ts'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports = {};
  new Function('require', 'exports', source)(name => name === 'vue' ? vue : {}, exports);
  const first = exports.askConfirm({ title: 'A', message: 'a' });
  assert.equal(exports.confirmRequest.value.title, 'A');
  assert.equal(exports.confirmRequest.value.danger, true);
  const second = exports.askConfirm({ title: 'B', message: 'b', danger: false });
  assert.equal(await first, false, 'Eine neue Anfrage bricht die alte ab');
  exports.confirmRequest.value.resolve(true);
  assert.equal(await second, true);
  assert.equal(exports.confirmRequest.value, null);
});

test('Rückgängig: sofort ausblenden, wiederherstellen oder nach Ablauf bzw. beim Verlassen ausführen', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { state, listeners } = loadState();
  const log = [];
  const options = name => ({ hide: () => log.push(`hide ${name}`), restore: () => log.push(`restore ${name}`), commit: async () => { log.push(`commit ${name}`); } });
  state.undoable('Gelöscht', options('a'));
  assert.equal(state.notification.value, 'Gelöscht');
  assert.equal(state.notificationAction.value.label, 'Rückgängig');
  state.notificationAction.value.run();
  assert.deepEqual(log, ['hide a', 'restore a']);
  assert.equal(state.notification.value, '');

  state.undoable('Gelöscht', options('b'));
  t.mock.timers.tick(8000);await Promise.resolve();
  assert.deepEqual(log.slice(2), ['hide b', 'commit b']);

  state.undoable('Gelöscht', options('c'));
  listeners.pagehide.forEach(handler => handler());await Promise.resolve();
  assert.deepEqual(log.slice(4), ['hide c', 'commit c'], 'Beim Verlassen der Seite geht nichts verloren');
  t.mock.timers.tick(8000);await Promise.resolve();
  assert.equal(log.filter(entry => entry === 'commit c').length, 1, 'Keine doppelte Ausführung');

  state.undoable('Gelöscht', { ...options('d'), commit: async () => { throw new Error('Netzwerkfehler'); } });
  t.mock.timers.tick(8000);await Promise.resolve();await Promise.resolve();
  assert.deepEqual(log.slice(6), ['hide d', 'restore d'], 'Fehlgeschlagene Löschungen werden wieder angezeigt');
  assert.equal(state.notification.value, 'Netzwerkfehler');
});

test('Datumsformat: einheitlich, sprachabhängig und relativ für nahe Termine', () => {
  const { state } = loadState();
  assert.equal(state.fmtDate('2026-11-08T14:30:00'), '08.11.2026, 14:30');
  assert.equal(state.fmtDay('2026-11-08'), '08.11.2026');
  assert.match(state.fmtDay('2026-11-08', true), /^So\.?, 08\.11\.2026$/);
  assert.equal(state.fmtDate(null), '–');
  assert.equal(state.fmtDate('kein Datum'), '–');
  const today = new Date();
  const inDays = days => new Date(today.getFullYear(), today.getMonth(), today.getDate() + days, 12).toISOString();
  assert.equal(state.fmtRelative(inDays(0)), 'heute');
  assert.equal(state.fmtRelative(inDays(3)), 'in 3 Tagen');
  assert.equal(state.fmtRelative(inDays(30)), state.fmtDay(inDays(30)), 'Ferne Termine als Datum');
  state.notification.value = '';
  require('vue');
  const language = state.language;
  language.value = 'en';
  assert.equal(state.fmtDate('2026-11-08T14:30:00'), '08/11/2026, 14:30');
  assert.equal(state.fmtRelative(inDays(1)), 'tomorrow');
  for (const file of frontendFiles('public/frontend')) {
    if (file.endsWith('state.ts')) continue;
    assert.doesNotMatch(read(file), /\.toLocale(Date|Time)?String\(\)/, `${file} formatiert Datumswerte ohne gemeinsames Format`);
  }
});

test('Kontrast: Textfarben auf Chips und Tags erfüllen WCAG AA (4,5:1) in beiden Farbschemata', () => {
  const css = read('public/style.css');
  const luminance = hex => {
    const [r, g, b] = [0, 2, 4].map(index => parseInt(hex.slice(1 + index, 3 + index), 16) / 255)
      .map(value => value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const ratio = (a, b) => { const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m);return (x + 0.05) / (y + 0.05); };
  const blocks = [css.slice(0, css.indexOf('}')), css.slice(css.indexOf('@media (prefers-color-scheme: dark)'), css.indexOf('color-scheme: dark;'))];
  for (const block of blocks) {
    const vars = Object.fromEntries([...block.matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{6})/g)].map(match => [match[1], match[2]]));
    const text = name => vars[`${name}-text`] || vars[name];
    for (const [color, background] of [['kelp', 'kelp-bg'], ['amber', 'amber-bg'], ['coral', 'coral-bg'], ['water', 'water-soft'], ['water', 'paper'], ['kelp', 'paper']]) {
      assert.ok(ratio(text(color), vars[background]) >= 4.5, `${color} auf ${background}: ${ratio(text(color), vars[background]).toFixed(2)}`);
    }
  }
  assert.doesNotMatch(css.replace(/border(-\w+)*-color/g, ''), /(?<![-\w])color:\s*var\(--(kelp|amber|coral|water)\)/, 'Text nutzt die kontrastreichen Varianten');
});

test('Touch-Ziele, Messformular und Kataloge', () => {
  const css = read('public/style.css');
  assert.match(css, /input\[type="checkbox"\], input\[type="radio"\] \{ width: 1\.5rem; height: 1\.5rem;/, 'Checkboxen mindestens 24 px');
  assert.match(css, /@media \(pointer: coarse\) \{\n {2}\.btn\.small \{ min-height: 44px; \}/);
  assert.match(css, /\.footer-link \{ display: inline-flex; align-items: center; min-height: 32px;/);
  const measure = read('public/frontend/views/MeasureView.vue');
  assert.match(measure, /<h2 class="test-group-title">\{\{ group\.name \}\}<\/h2>/, 'Überschriften folgen h1 → h2 → h3');
  assert.match(measure, /:aria-describedby="targetText/, 'Zielbereich ist mit dem Eingabefeld verknüpft');
  assert.doesNotMatch(measure, /Kein Warten nötig|z\. B\. nach Wasserwechsel|Timer-Benachrichtigungen<\/strong>/);
  const search = read('public/frontend/composables/catalog-search.ts');
  assert.match(search, /initial\.get\("q"\)/);
  assert.match(search, /window\.history\.replaceState/, 'Suche und Filter bleiben in der Adresse');
  assert.match(search, /watch\(\(\) => route\.value\.query\.toString\(\)/, 'Neue Adresse mit anderer Suche aktualisiert die Felder');
  assert.match(read('public/frontend/views/HealthView.vue'), /route\.value\.query\.get\('q'\)/);
  for (const view of ['PlantsView', 'SpeciesView']) assert.match(read(`public/frontend/views/${view}.vue`), /<h2 class="species-card-title">/);
});

test('Erste Schritte, Synchronisationsstatus und Übersetzungen', () => {
  const list = read('public/frontend/views/AquariumList.vue');
  assert.match(list, /data-onboarding/);
  for (const step of ['create', 'measure', 'cycle', 'care']) assert.ok(list.includes(`id: "${step}"`));
  assert.match(list, /aquarium_onboarding_hidden:/, 'Ausblenden wird je Benutzer gemerkt');
  const sync = read('public/frontend/composables/sync-status.ts');
  assert.match(sync, /Number\(id\) < 0/, 'Offline angelegte Einträge haben negative temporäre IDs');
  for (const file of ['views/AquariumView.vue', 'components/StockSection.vue', 'components/PlantSection.vue', 'views/AquariumList.vue']) assert.match(read(`public/frontend/${file}`), /<SyncBadge :show="isUnsynced\(/, file);
  const de = JSON.parse(read('public/locales/features.de.json')), en = JSON.parse(read('public/locales/features.en.json'));
  const keys = object => Object.entries(object).flatMap(([key, value]) => value && typeof value === 'object' ? keys(value).map(child => `${key}.${child}`) : [key]);
  assert.deepEqual(keys(en).sort(), keys(de).sort(), 'Deutsche und englische Zusatztexte sind vollständig');
  for (const namespace of ['aquariumView', 'confirmTexts', 'measureForm', 'aquariumList', 'stockSection']) assert.ok(de[namespace], namespace);
  const view = read('public/frontend/views/AquariumView.vue');
  for (const text of ['Freigabe verlassen?', '★ Titelbild', 'Noch keine Fotos in der Galerie', 'Nächste Fälligkeit:', 'Bilddatei (bis 5 MB)']) assert.ok(!view.includes(text), text);
});

'use strict';

const $app = document.getElementById('app');
const $topbar = document.getElementById('topbar');
let CONFIG = null;
let ME = null;
let cleanups = [];
let RANGE = 90;

/* ---------- Farbschema & Theme Management ---------- */
const THEME_KEY = 'aquarium_theme';
let activeCharts = [];

function getThemeSetting() {
  return localStorage.getItem(THEME_KEY) || localStorage.getItem('theme') || 'system';
}

function isSystemDark() {
  return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function isEffectiveDark() {
  const t = getThemeSetting();
  if (t === 'dark') return true;
  if (t === 'light') return false;
  return isSystemDark();
}

function updateThemeUI(setting = getThemeSetting()) {
  const effectiveDark = isEffectiveDark();
  const iconSpan = document.getElementById('topbar-theme-icon');
  const topbarBtn = document.getElementById('btn-theme-topbar');

  const icon = setting === 'system' ? (effectiveDark ? '🌓' : '🌓') : (setting === 'dark' ? '🌙' : '☀️');
  const label = setting === 'system' ? 'Systemstandard' : (setting === 'dark' ? 'Dunkel' : 'Hell');

  if (iconSpan) iconSpan.textContent = icon;
  if (topbarBtn) {
    topbarBtn.title = `Farbschema: ${label} (klicken zum Umschalten)`;
    topbarBtn.setAttribute('aria-label', topbarBtn.title);
  }

  const metaTheme = document.getElementById('meta-theme-color');
  if (metaTheme) {
    metaTheme.setAttribute('content', effectiveDark ? '#091315' : '#12343b');
  }
}

function applyTheme(setting, showNotification = false) {
  if (setting === 'light' || setting === 'dark') {
    document.documentElement.setAttribute('data-theme', setting);
  } else {
    document.documentElement.removeAttribute('data-theme');
    setting = 'system';
  }
  localStorage.setItem(THEME_KEY, setting);
  updateThemeUI(setting);

  if (showNotification) {
    const text = setting === 'system'
      ? `Farbschema: Systemstandard (${isSystemDark() ? 'Dunkel' : 'Hell'})`
      : (setting === 'dark' ? 'Farbschema: Dunkel' : 'Farbschema: Hell');
    toast(text);
  }

  // Aktive Charts dynamisch anpassen
  if (activeCharts.length > 0) {
    const isDark = isEffectiveDark();
    for (const chart of activeCharts) {
      if (chart && typeof chart.update === 'function') {
        if (chart.options && chart.options.scales) {
          if (chart.options.scales.x) {
            chart.options.scales.x.ticks = chart.options.scales.x.ticks || {};
            chart.options.scales.x.ticks.color = isDark ? '#8fa9ad' : '#4a6a70';
            chart.options.scales.x.grid = chart.options.scales.x.grid || {};
            chart.options.scales.x.grid.color = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)';
          }
          if (chart.options.scales.y) {
            chart.options.scales.y.ticks = chart.options.scales.y.ticks || {};
            chart.options.scales.y.ticks.color = isDark ? '#8fa9ad' : '#4a6a70';
            chart.options.scales.y.grid = chart.options.scales.y.grid || {};
            chart.options.scales.y.grid.color = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)';
            if (chart.options.scales.y.title) {
              chart.options.scales.y.title.color = isDark ? '#8fa9ad' : '#4a6a70';
            }
          }
        }
        if (chart.options && chart.options.plugins && chart.options.plugins.tooltip) {
          chart.options.plugins.tooltip.backgroundColor = isDark ? '#091315' : '#12343b';
          chart.options.plugins.tooltip.titleColor = isDark ? '#e2eeed' : '#ffffff';
          chart.options.plugins.tooltip.bodyColor = isDark ? '#e2eeed' : '#ffffff';
          chart.options.plugins.tooltip.borderColor = isDark ? '#22383c' : '#bccfcc';
        }
        if (chart.data && chart.data.datasets && chart.data.datasets[0]) {
          chart.data.datasets[0].borderColor = isDark ? '#38bdf8' : '#12343b';
          chart.data.datasets[0].backgroundColor = isDark ? '#38bdf8' : '#12343b';
        }
        chart.update('none');
      }
    }
  }
}

function toggleTheme() {
  const current = getThemeSetting();
  const next = current === 'system' ? 'light' : (current === 'light' ? 'dark' : 'system');
  applyTheme(next, true);
  if (location.hash === '#/profile') {
    route();
  }
}

if (window.matchMedia) {
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (getThemeSetting() === 'system') {
      applyTheme('system', false);
    }
  });
}

// Initiales Farbschema anwenden
applyTheme(getThemeSetting(), false);

const btnThemeTopbar = document.getElementById('btn-theme-topbar');
if (btnThemeTopbar) {
  btnThemeTopbar.addEventListener('click', toggleTheme);
}

/* ---------- Hilfsfunktionen ---------- */
function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  let value;
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'class') el.className = v;
    else if (k === 'value') value = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  append(el, kids);
  if (value !== undefined) el.value = value;
  return el;
}
function append(el, kids) {
  for (const k of kids.flat(Infinity)) {
    if (k == null || k === false) continue;
    el.append(k instanceof Node ? k : document.createTextNode(String(k)));
  }
}
function mount(...nodes) {
  runCleanups();
  $app.replaceChildren(...nodes.flat().filter(Boolean));
  window.scrollTo(0, 0);
}
function runCleanups() { cleanups.forEach((fn) => { try { fn(); } catch (e) { /* ignorieren */ } }); cleanups = []; }

function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => t.classList.remove('show'), 3500);
}

async function api(path, { method = 'GET', body } = {}) {
  // relativ zu <base href>, damit die App auch unter einem Unterpfad läuft
  const res = await fetch('api' + path, {
    method,
    headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'fetch' },
    body: body ? JSON.stringify(body) : undefined,
    credentials: 'same-origin',
  });
  let data = {};
  try { data = await res.json(); } catch (e) { /* leer */ }
  if (res.status === 401 && !path.startsWith('/login') && !path.startsWith('/me')) {
    ME = null; showAuth(); throw new Error(data.error || 'Bitte neu anmelden.');
  }
  if (!res.ok) throw new Error(data.error || 'Etwas ist schiefgelaufen.');
  return data;
}

const param = (key) => (CONFIG?.allParameters || CONFIG?.parameters || []).find((p) => p.key === key) || { key, name: key, unit: '', decimals: 1 };
const fmtNum = (p, v) => Number(v).toLocaleString('de-DE', { minimumFractionDigits: p.decimals, maximumFractionDigits: p.decimals });
const fmtDate = (iso) => new Date(iso).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' });
const sqlDate = (s) => new Date(s.replace(' ', 'T') + 'Z').toISOString();
const STATUS_LABEL = { ok: 'im Bereich', warn: 'auffällig', crit: 'kritisch' };

function evaluate(range, v) {
  if (!range || (range.okMin == null && range.okMax == null && range.critMin == null && range.critMax == null)) return null;
  if ((range.critMin != null && v < range.critMin) || (range.critMax != null && v > range.critMax)) return 'crit';
  if ((range.okMin != null && v < range.okMin) || (range.okMax != null && v > range.okMax)) return 'warn';
  return 'ok';
}
const chip = (status) => h('span', { class: 'chip ' + (status || 'none') }, status ? STATUS_LABEL[status] : 'keine Grenzwerte');

function localInputValue(d = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function mmss(sec) { sec = Math.max(0, Math.ceil(sec)); return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`; }

function socialLabel(type, minCount) {
  if (type === 'solitary') return 'Einzelhaltung';
  if (type === 'pair') return 'Paarhaltung';
  if (type === 'harem') return 'Haremshaltung';
  if (type === 'school') return `Schwarmfisch (ab ${minCount || 8})`;
  if (type === 'group') return `Gruppe (ab ${minCount || 5})`;
  return 'Gruppenhaltung';
}

function territorialLabel(t) {
  if (t === 'solitary_aggressive') return 'Strikt territorial / Einzelgänger';
  if (t === 'strong') return 'Stark territorial';
  if (t === 'breeding') return 'Revierbildend bei Brut';
  if (t === 'territorial_bottom') return 'Bodenrevierbildend';
  if (t === 'mild') return 'Leicht territorial';
  return 'Friedlich';
}

async function showSpeciesModal(spOrName) {
  let sp = typeof spOrName === 'object' ? spOrName : null;
  if (!sp || !sp.temp) {
    try {
      const res = await api(`/species/${encodeURIComponent(typeof spOrName === 'string' ? spOrName : spOrName?.name || spOrName?.species)}`);
      sp = res.species;
    } catch (e) {
      if (!sp) {
        toast('Keine detaillierten Arteninformationen gefunden.');
        return;
      }
    }
  }

  const d = h('dialog', { class: 'wide stack' });
  const close = () => { d.close(); d.remove(); };

  const tags = Array.isArray(sp.tags) ? sp.tags : [];
  const tagNodes = [];
  if (tags.includes('solitary_betta')) tagNodes.push(h('span', { class: 'tag danger' }, 'Kampffisch / Einzelhaltung'));
  if (tags.includes('fin_nipper')) tagNodes.push(h('span', { class: 'tag danger' }, 'Flossenbeißer'));
  if (tags.includes('long_fins')) tagNodes.push(h('span', { class: 'tag warn' }, 'Lange Flossen'));
  if (tags.includes('predator_small_prey')) tagNodes.push(h('span', { class: 'tag warn' }, 'Räuber / Frisst Zwerggarnelen'));
  if (tags.includes('dwarf_shrimp')) tagNodes.push(h('span', { class: 'tag info' }, 'Zwerggarnele'));
  if (tags.includes('requires_sand')) tagNodes.push(h('span', { class: 'tag info' }, 'Sandboden Pflicht'));
  if (tags.includes('requires_wood')) tagNodes.push(h('span', { class: 'tag info' }, 'Wurzelholz Pflicht'));
  if (tags.includes('requires_caves')) tagNodes.push(h('span', { class: 'tag info' }, 'Höhlenbedarf'));
  if (tags.includes('coldwater')) tagNodes.push(h('span', { class: 'tag info' }, 'Kaltwasserfisch'));
  if (tags.includes('high_temp') || tags.includes('high_temp_required')) tagNodes.push(h('span', { class: 'tag warn' }, 'Wärmebedürftig'));
  if (tags.includes('malawi_cichlid') || tags.includes('tanganjika_cichlid')) tagNodes.push(h('span', { class: 'tag warn' }, 'Ostafrika-Felsenbiotop'));

  d.replaceChildren(
    h('div', { class: 'row between' },
      h('div', {},
        h('h2', { style: 'margin:0' }, sp.name),
        sp.scientificName ? h('div', { class: 'muted', style: 'font-style:italic' }, sp.scientificName) : null
      ),
      h('button', { class: 'btn small ghost', type: 'button', onclick: close, 'aria-label': 'Schließen' }, '✕')
    ),
    h('div', { class: 'row', style: 'margin-top:.4rem' },
      h('span', { class: 'tag ok' }, sp.category || 'Allgemein'),
      h('span', { class: `tag ${sp.waterType === 'salt' ? 'info' : 'ok'}` }, sp.waterType === 'salt' ? 'Meerwasser' : 'Süßwasser'),
      sp.profile ? h('span', { class: 'tag' }, `Profil: ${CONFIG.profiles[sp.profile] || sp.profile}`) : null,
      ...tagNodes
    ),
    sp.description ? h('p', { style: 'margin:.4rem 0 0' }, sp.description) : null,
    h('div', { class: 'grid2', style: 'margin-top:.5rem' },
      h('div', { class: 'card stack', style: 'gap:.3rem; padding:.8rem' },
        h('h3', { style: 'margin-bottom:.3rem' }, 'Wasserwerte'),
        h('div', {}, h('strong', {}, 'Temperatur: '), `${sp.temp?.min ?? '–'}–${sp.temp?.max ?? '–'} °C`, sp.temp?.idealMin != null ? h('span', { class: 'muted' }, ` (Ideal: ${sp.temp.idealMin}–${sp.temp.idealMax} °C)`) : ''),
        h('div', {}, h('strong', {}, 'pH-Wert: '), `${sp.ph?.min ?? '–'}–${sp.ph?.max ?? '–'}`, sp.ph?.idealMin != null ? h('span', { class: 'muted' }, ` (Ideal: ${sp.ph.idealMin}–${sp.ph.idealMax})`) : ''),
        sp.gh?.min != null ? h('div', {}, h('strong', {}, 'Gesamthärte (GH): '), `${sp.gh.min}–${sp.gh.max} °dH`) : null,
        sp.kh?.min != null ? h('div', {}, h('strong', {}, 'Karbonathärte (KH): '), `${sp.kh.min}–${sp.kh.max} °dH`) : null
      ),
      h('div', { class: 'card stack', style: 'gap:.3rem; padding:.8rem' },
        h('h3', { style: 'margin-bottom:.3rem' }, 'Becken & Verhalten'),
        h('div', {}, h('strong', {}, 'Mindestvolumen: '), sp.minVolumeL ? `${sp.minVolumeL} Liter (${sp.minTankLengthCm || '–'} cm)` : '–'),
        h('div', {}, h('strong', {}, 'Sozialform: '), socialLabel(sp.socialType, sp.minGroupCount)),
        h('div', {}, h('strong', {}, 'Territorialität: '), territorialLabel(sp.territorial)),
        h('div', {}, h('strong', {}, 'Schwimmzone: '), sp.tankRegion === 'top' ? 'Oberfläche' : sp.tankRegion === 'bottom' ? 'Boden' : sp.tankRegion === 'top_middle' ? 'Oben / Mitte' : 'Überall')
      )
    ),
    sp.decorHints ? h('div', { class: 'compat-box info' }, h('strong', {}, 'Einrichtung & Pflege: '), sp.decorHints) : null,
    sp.behaviorNotes ? h('div', { class: 'compat-box warn' }, h('strong', {}, 'Verhalten & Vergesellschaftung: '), sp.behaviorNotes) : null,
    h('div', { class: 'row between', style: 'margin-top:.8rem' },
      h('span', {}, ''),
      h('button', { class: 'btn', type: 'button', onclick: close }, 'Schließen')
    )
  );

  document.body.appendChild(d);
  d.showModal();
}

/* ---------- Router ---------- */
window.addEventListener('hashchange', route);

async function route() {
  if (!ME) return showAuth();
  const parts = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  try {
    if (parts[0] === 'species') return await viewSpeciesCatalog(parts[1]);
    if (parts[0] === 'profile') return await viewProfile();
    if (parts[0] === 'admin') {
      if (!ME.isAdmin) { location.hash = '#/'; return; }
      return await viewAdmin();
    }
    if (parts[0] === 'a' && parts[1] && parts[2] === 'messen') return await viewMeasure(Number(parts[1]));
    if (parts[0] === 'a' && parts[1]) return await viewAquarium(Number(parts[1]));
    return await viewList();
  } catch (e) {
    if (!ME) return;
    mount(h('div', { class: 'card stack' }, h('h1', {}, 'Das hat nicht geklappt'), h('p', { class: 'error' }, e.message), h('a', { class: 'btn', href: '#/' }, 'Zur Übersicht')));
  }
}

/* ---------- Anmeldung ---------- */
// Fehlermeldung vom OIDC-Rücksprung (?auth_error=...) einmalig übernehmen und aus der Adresse entfernen
let AUTH_ERROR = new URLSearchParams(location.search).get('auth_error') || '';
let OIDC_LINKED = new URLSearchParams(location.search).get('oidc_linked') === '1';
if (location.search) history.replaceState(null, '', location.pathname + location.hash);

async function showAuth(mode = 'login') {
  $topbar.hidden = true;
  let info = { registration: true, localLogin: true, oidc: false, oidcName: '' };
  try { info = await (await fetch('api/registration')).json(); } catch (e) { /* Standard */ }
  const registration = info.registration;
  const err = h('p', { class: 'error', role: 'alert' }, AUTH_ERROR);
  AUTH_ERROR = '';
  const oidcBtn = info.oidc ? h('a', { class: 'btn', href: 'auth/login' }, `Mit ${info.oidcName} anmelden`) : null;

  const currentTheme = getThemeSetting();
  const themeAuthIcon = currentTheme === 'system' ? '🌓' : (currentTheme === 'dark' ? '🌙' : '☀️');
  const themeAuthLabel = currentTheme === 'system' ? 'System' : (currentTheme === 'dark' ? 'Dunkel' : 'Hell');
  const themeAuthBtn = h('button', {
    class: 'btn small ghost',
    type: 'button',
    title: `Farbschema: ${themeAuthLabel} (klicken zum Umschalten)`,
    onclick: () => {
      toggleTheme();
      const nextTheme = getThemeSetting();
      themeAuthBtn.textContent = (nextTheme === 'system' ? '🌓 System' : (nextTheme === 'dark' ? '🌙 Dunkel' : '☀️ Hell'));
    }
  }, `${themeAuthIcon} ${themeAuthLabel}`);

  const headerRow = h('div', { class: 'row between', style: 'margin-bottom:.5rem; align-items:center;' },
    h('p', { class: 'muted', style: 'margin:0' }, 'Wasserwerte im Blick behalten.'),
    themeAuthBtn
  );

  if (!info.localLogin) {
    mount(h('div', { class: 'auth' }, headerRow,
      h('div', { class: 'card stack' }, h('h1', {}, 'Anmelden'), err, oidcBtn)));
    oidcBtn?.focus();
    return;
  }
  const user = h('input', { id: 'u', autocomplete: 'username', required: true });
  const mail = mode === 'register' ? h('input', { id: 'e', type: 'email', autocomplete: 'email' }) : null;
  const pass = h('input', { id: 'p', type: 'password', autocomplete: mode === 'login' ? 'current-password' : 'new-password', required: true, minlength: mode === 'login' ? null : '8' });
  const form = h('form', { class: 'card stack', onsubmit: async (e) => {
    e.preventDefault(); err.textContent = '';
    try {
      const body = { username: user.value, password: pass.value };
      if (mode === 'register' && mail && mail.value.trim()) body.email = mail.value.trim();
      await api(mode === 'login' ? '/login' : '/register', { method: 'POST', body });
      await start();
    } catch (ex) { err.textContent = ex.message; }
  } },
  h('h1', {}, mode === 'login' ? 'Anmelden' : 'Konto erstellen'),
  h('div', { class: 'field' }, h('label', { for: 'u' }, 'Benutzername'), user),
  mail ? h('div', { class: 'field' }, h('label', { for: 'e' }, 'E-Mail-Adresse (optional)'), mail) : null,
  h('div', { class: 'field' }, h('label', { for: 'p' }, mode === 'login' ? 'Passwort' : 'Passwort (mindestens 8 Zeichen)'), pass),
  err,
  h('button', { class: 'btn', type: 'submit' }, mode === 'login' ? 'Anmelden' : 'Konto erstellen'),
  mode === 'login' && oidcBtn ? [h('p', { class: 'muted' }, 'oder'), oidcBtn] : null,
  registration && h('button', { class: 'btn ghost', type: 'button', onclick: () => showAuth(mode === 'login' ? 'register' : 'login') }, mode === 'login' ? 'Neues Konto erstellen' : 'Ich habe schon ein Konto'));
  mount(h('div', { class: 'auth' }, headerRow, form));
  user.focus();
}

function updateTopbarUser() {
  if (!ME) return;
  const whoami = document.getElementById('whoami');
  if (whoami) {
    const fullName = [ME.firstName, ME.lastName].filter(Boolean).join(' ');
    whoami.textContent = (fullName ? `${fullName} (@${ME.username})` : ME.username) + (ME.isAdmin ? ' (Admin)' : '');
  }
  const avatarImg = document.getElementById('topbar-avatar');
  if (avatarImg) {
    if (ME.hasAvatar) {
      avatarImg.src = `api/me/avatar?t=${Date.now()}`;
      avatarImg.style.display = 'inline-block';
    } else {
      avatarImg.removeAttribute('src');
      avatarImg.style.display = 'none';
    }
  }
  const adminBtn = document.getElementById('btn-admin');
  if (adminBtn) adminBtn.hidden = !ME.isAdmin;
}

async function start() {
  ME = await api('/me');
  CONFIG = await api('/config');
  $topbar.hidden = false;
  updateTopbarUser();
  if (OIDC_LINKED) {
    toast(`Erfolgreich mit ${ME.oidcProviderName || 'Pocket ID'} verknüpft.`);
    OIDC_LINKED = false;
  }
  route();
}

document.getElementById('btn-logout').addEventListener('click', async () => {
  let r = {};
  try { r = await api('/logout', { method: 'POST' }); } catch (e) { /* egal */ }
  ME = null;
  if (r.redirect) { location.href = r.redirect; return; } // auch beim Anmeldedienst abmelden
  location.hash = '#/'; showAuth();
});

/* ---------- Aquarienliste ---------- */
async function viewList() {
  const list = await api('/aquariums');
  const cards = list.map((a) => {
    const s = a.open_crit ? 'crit' : (a.open_warn || a.overdue) ? 'warn' : a.last_measured_at ? 'ok' : 'none';
    const isOwner = a.role === 'owner';
    return h('a', { class: `card aq-card s-${s}`, href: `#/a/${a.id}` },
      a.has_image ? h('img', { class: 'aq-card-img', src: `api/aquariums/${a.id}/image`, alt: a.name, loading: 'lazy' }) : null,
      h('h2', {}, a.name),
      h('div', { class: 'muted' }, CONFIG.waterTypes[a.water_type], a.volume_l ? ` · ${a.volume_l} l` : ''),
      h('div', { class: 'row', style: 'margin-top:.6rem' },
        a.open_crit ? h('span', { class: 'chip crit' }, `${a.open_crit} kritisch`) : null,
        a.open_warn ? h('span', { class: 'chip warn' }, `${a.open_warn} auffällig`) : null,
        a.overdue ? h('span', { class: 'chip warn' }, 'Messung fällig') : null,
        !a.open_crit && !a.open_warn && !a.overdue && a.last_measured_at ? h('span', { class: 'chip ok' }, 'alles im Bereich') : null,
        !a.last_measured_at ? h('span', { class: 'chip none' }, 'noch keine Messung') : null,
        a.last_water_change_at ? h('span', { class: 'chip ok' }, `💧 WW: ${fmtDate(a.last_water_change_at)}${a.last_water_change_percent ? ' (' + a.last_water_change_percent + '%)' : ''}`) : null,
        !isOwner && a.role === 'write' ? h('span', { class: 'chip ok' }, `Geteilt: Schreiben (${a.owner_username || 'Besitzer'})`) : null,
        !isOwner && a.role === 'view' ? h('span', { class: 'chip none' }, `Geteilt: Lesen (${a.owner_username || 'Besitzer'})`) : null,
        isOwner && a.shares_count > 0 ? h('span', { class: 'chip none' }, `Geteilt (${a.shares_count})`) : null),
      a.last_measured_at ? h('div', { class: 'muted', style: 'margin-top:.4rem' }, 'Zuletzt gemessen: ', fmtDate(a.last_measured_at)) : null);
  });
  mount(h('div', { class: 'stack' },
    h('div', { class: 'row between' }, h('h1', {}, 'Meine Aquarien'), h('button', { class: 'btn', type: 'button', onclick: () => aquariumDialog() }, 'Aquarium anlegen')),
    cards.length ? h('div', { class: 'aq-list' }, cards)
      : h('div', { class: 'card stack' }, h('h2', {}, 'Noch kein Aquarium'), h('p', {}, 'Lege dein erstes Becken an, dann kannst du Wasserwerte eintragen und den Verlauf sehen.'), h('div', {}, h('button', { class: 'btn', type: 'button', onclick: () => aquariumDialog() }, 'Aquarium anlegen')))));
}

function aquariumDialog(aq) {
  const editing = !!aq;
  const isOwner = !editing || aq.role === 'owner';
  const err = h('p', { class: 'error', role: 'alert' });
  let imageBase64 = null;
  let removeExistingImage = false;

  const fileInput = h('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp,image/gif' });
  const previewImg = h('img', { class: 'img-preview', style: 'display:none' });
  const btnRemoveImg = h('button', { class: 'btn small ghost', type: 'button', style: 'display:none' }, 'Bild entfernen');

  if (aq?.has_image) {
    previewImg.src = `api/aquariums/${aq.id}/image?t=${Date.now()}`;
    previewImg.style.display = 'block';
    btnRemoveImg.style.display = 'inline-flex';
  }

  fileInput.addEventListener('change', () => {
    const file = fileInput.files[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      err.textContent = 'Das ausgewählte Bild ist größer als 5 MB.';
      fileInput.value = '';
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      imageBase64 = ev.target.result;
      removeExistingImage = false;
      previewImg.src = imageBase64;
      previewImg.style.display = 'block';
      btnRemoveImg.style.display = 'inline-flex';
      err.textContent = '';
    };
    reader.readAsDataURL(file);
  });

  btnRemoveImg.addEventListener('click', () => {
    imageBase64 = null;
    removeExistingImage = true;
    fileInput.value = '';
    previewImg.removeAttribute('src');
    previewImg.style.display = 'none';
    btnRemoveImg.style.display = 'none';
  });

  const f = {
    name: h('input', { required: true, maxlength: '80', value: aq?.name || '' }),
    water_type: h('select', { value: aq?.water_type || 'fresh' }, Object.entries(CONFIG.waterTypes).map(([k, v]) => h('option', { value: k }, v))),
    volume_l: h('input', { type: 'number', min: '1', max: '100000', inputmode: 'numeric', value: aq?.volume_l ?? '' }),
    reminder_days: h('input', { type: 'number', min: '0', max: '365', inputmode: 'numeric', value: aq?.reminder_days ?? 7 }),
    notes: h('textarea', { maxlength: '1000', value: aq?.notes || '' }),
  };
  const dlg = h('dialog', {}, h('form', { class: 'stack', method: 'dialog', onsubmit: async (e) => {
    e.preventDefault(); err.textContent = '';
    const body = Object.fromEntries(Object.entries(f).map(([k, el]) => [k, el.value]));
    try {
      let targetId = aq?.id;
      if (editing) {
        await api(`/aquariums/${aq.id}`, { method: 'PUT', body });
      } else {
        const r = await api('/aquariums', { method: 'POST', body });
        targetId = r.id;
      }
      if (imageBase64) {
        await api(`/aquariums/${targetId}/image`, { method: 'POST', body: { image: imageBase64 } });
      } else if (removeExistingImage && editing) {
        await api(`/aquariums/${targetId}/image`, { method: 'DELETE' });
      }
      dlg.close();
      toast('Gespeichert.');
      if (editing) route(); else location.hash = `#/a/${targetId}`;
    } catch (ex) { err.textContent = ex.message; }
  } },
  h('h2', {}, editing ? 'Aquarium bearbeiten' : 'Aquarium anlegen'),
  h('div', { class: 'field' }, h('label', {}, 'Name'), f.name),
  h('div', { class: 'grid2' },
    h('div', { class: 'field' }, h('label', {}, 'Wasserart'), f.water_type),
    h('div', { class: 'field' }, h('label', {}, 'Volumen (Liter)'), f.volume_l)),
  h('div', { class: 'field' }, h('label', {}, 'Messung fällig nach (Tagen, 0 = keine Erinnerung)'), f.reminder_days),
  h('div', { class: 'field' }, h('label', {}, 'Notizen'), f.notes),
  h('div', { class: 'field' },
    h('label', {}, 'Bild vom Aquarium (PNG, JPG, WebP, GIF, max. 5 MB)'),
    fileInput,
    previewImg,
    h('div', { style: 'margin-top:.4rem' }, btnRemoveImg)),
  err,
  h('div', { class: 'row' },
    h('button', { class: 'btn', type: 'submit' }, 'Speichern'),
    h('button', { class: 'btn ghost', type: 'button', onclick: () => dlg.close() }, 'Abbrechen'),
    editing && isOwner ? h('button', { class: 'btn danger', type: 'button', onclick: async () => {
      if (!confirm(`„${aq.name}“ mit allen Messwerten und Alarmen endgültig löschen?`)) return;
      try { await api(`/aquariums/${aq.id}`, { method: 'DELETE' }); dlg.close(); location.hash = '#/'; toast('Aquarium gelöscht.'); } catch (ex) { err.textContent = ex.message; }
    } }, 'Löschen') : null)));
  dlg.addEventListener('close', () => dlg.remove());
  document.body.append(dlg); dlg.showModal(); f.name.focus();
}

async function shareDialog(aq) {
  const dlg = h('dialog', { style: 'max-width:540px' });
  const err = h('p', { class: 'error', role: 'alert' });
  const listWrap = h('div', { class: 'stack', style: 'margin: 1rem 0' });

  const queryInput = h('input', { required: true, maxlength: '120', placeholder: 'Benutzername oder E-Mail-Adresse' });
  const roleSelect = h('select', {},
    h('option', { value: 'view' }, 'Nur Lesen (view)'),
    h('option', { value: 'write' }, 'Lesen & Schreiben (write)'));
  const addBtn = h('button', { class: 'btn', type: 'submit' }, 'Freigeben');

  async function loadShares() {
    listWrap.replaceChildren(h('p', { class: 'muted' }, 'Lade Freigaben...'));
    try {
      const shares = await api(`/aquariums/${aq.id}/shares`);
      if (!shares.length) {
        listWrap.replaceChildren(h('p', { class: 'muted' }, 'Dieses Aquarium ist aktuell mit niemandem geteilt.'));
        return;
      }
      const table = h('table', {},
        h('thead', {}, h('tr', {}, h('th', {}, 'Benutzer'), h('th', {}, 'Berechtigung'), h('th', {}, ''))),
        h('tbody', {}, shares.map((s) => {
          const sel = h('select', { style: 'min-height:34px;padding:.2rem .4rem' },
            h('option', { value: 'view', selected: s.role === 'view' }, 'Lesen'),
            h('option', { value: 'write', selected: s.role === 'write' }, 'Schreiben'));
          sel.addEventListener('change', async () => {
            try {
              await api(`/aquariums/${aq.id}/shares`, { method: 'POST', body: { username: s.username, role: sel.value } });
              toast(`Berechtigung für ${s.username} aktualisiert.`);
              loadShares();
            } catch (ex) { err.textContent = ex.message; }
          });
          return h('tr', {},
            h('td', {}, h('strong', {}, s.username), s.email ? h('div', { class: 'muted', style: 'font-size:.8rem' }, s.email) : null),
            h('td', {}, sel),
            h('td', {}, h('button', { class: 'btn small danger', type: 'button', onclick: async () => {
              if (!confirm(`Freigabe für „${s.username}“ wirklich entfernen?`)) return;
              try {
                await api(`/aquariums/${aq.id}/shares/${s.user_id}`, { method: 'DELETE' });
                toast(`Freigabe für ${s.username} entfernt.`);
                loadShares();
              } catch (ex) { err.textContent = ex.message; }
            } }, 'Entfernen')));
        })));
      listWrap.replaceChildren(h('div', { class: 'table-wrap' }, table));
    } catch (ex) {
      listWrap.replaceChildren(h('p', { class: 'error' }, ex.message));
    }
  }

  const addForm = h('form', { class: 'stack', onsubmit: async (e) => {
    e.preventDefault(); err.textContent = '';
    try {
      await api(`/aquariums/${aq.id}/shares`, { method: 'POST', body: { usernameOrEmail: queryInput.value.trim(), role: roleSelect.value } });
      toast('Aquarium erfolgreich freigegeben.');
      queryInput.value = '';
      loadShares();
    } catch (ex) { err.textContent = ex.message; }
  } },
  h('h3', {}, 'Neuen Benutzer hinzufügen'),
  h('div', { class: 'grid2' },
    h('div', { class: 'field' }, h('label', {}, 'Benutzername / E-Mail'), queryInput),
    h('div', { class: 'field' }, h('label', {}, 'Berechtigung'), roleSelect)),
  h('div', {}, addBtn));

  dlg.append(
    h('div', { class: 'stack' },
      h('h2', {}, `Aquarium teilen: „${aq.name}“`),
      h('p', { class: 'muted' }, 'Gib anderen registrierten Benutzern Lese- oder Schreibrechte für dieses Aquarium.'),
      err,
      h('h3', {}, 'Bestehende Freigaben'),
      listWrap,
      addForm,
      h('div', { class: 'row', style: 'margin-top:1rem' },
        h('button', { class: 'btn ghost', type: 'button', onclick: () => { dlg.close(); route(); } }, 'Schließen'))));

  dlg.addEventListener('close', () => dlg.remove());
  document.body.append(dlg);
  dlg.showModal();
  loadShares();
}

function maintenanceDialog(aq, existing = null) {
  const editing = !!existing;
  const dlg = h('dialog', { class: 'wide' });
  const err = h('p', { class: 'error', role: 'alert' });

  const types = CONFIG.maintenanceTypes || {
    water_change: { key: 'water_change', label: 'Wasserwechsel', icon: '💧', hasPercentage: true },
    filter_change: { key: 'filter_change', label: 'Filter wechseln', icon: '🔄', hasPercentage: false },
    filter_clean: { key: 'filter_clean', label: 'Filter reinigen', icon: '🧹', hasPercentage: false },
    plants_cut: { key: 'plants_cut', label: 'Pflanzen schneiden', icon: '✂️', hasPercentage: false },
    plants_new: { key: 'plants_new', label: 'Neue Pflanzen', icon: '🌱', hasPercentage: false },
    care: { key: 'care', label: 'Pflege & Reinigung', icon: '🧽', hasPercentage: false },
    fertilize: { key: 'fertilize', label: 'Düngung', icon: '🌿', hasPercentage: false },
    feeding: { key: 'feeding', label: 'Spezialfütterung', icon: '🦐', hasPercentage: false },
    other: { key: 'other', label: 'Sonstige Arbeit', icon: '📝', hasPercentage: false },
  };

  const initialDate = existing ? localInputValue(new Date(existing.timestamp || existing.logged_at)) : localInputValue();
  const dateInput = h('input', { type: 'datetime-local', required: true, value: initialDate });
  const typeSelect = h('select', { required: true },
    Object.entries(types).map(([k, t]) => h('option', { value: k, selected: existing?.type === k }, `${t.icon || ''} ${t.label}`))
  );

  const percentInput = h('input', { type: 'number', min: '1', max: '100', step: '1', placeholder: 'z. B. 30 oder 50', value: existing?.percentage ?? '30' });
  const percentField = h('div', { class: 'field' },
    h('label', {}, 'Wasserwechsel-Anteil (%)'),
    percentInput
  );

  const detailsInput = h('input', { maxlength: '500', value: existing?.details || '' });
  const detailsLabel = h('label', {}, 'Details zur Arbeit');
  const detailsField = h('div', { class: 'field' },
    detailsLabel,
    detailsInput
  );

  const noteInput = h('textarea', { maxlength: '1000', placeholder: 'Optionale Bemerkungen...', value: existing?.note || '' });

  const updateFormForType = (typeKey) => {
    if (typeKey === 'water_change') {
      percentField.style.display = 'block';
      detailsLabel.textContent = 'Zusatz / Wasseraufbereitung (optional)';
      detailsInput.placeholder = 'z. B. Osmosewasser 50:50, Wasseraufbereiter zugegeben';
    } else {
      percentField.style.display = 'none';
      if (typeKey === 'filter_change') {
        detailsLabel.textContent = 'Gewechselte Filtermedien (was wurde getauscht?)';
        detailsInput.placeholder = 'z. B. Filtervlies und Aktivkohle erneuert, Schwamm getauscht';
      } else if (typeKey === 'filter_clean') {
        detailsLabel.textContent = 'Gereinigte Filterteile';
        detailsInput.placeholder = 'z. B. Vorfilter im Altwasser ausgewaschen, Impeller gereinigt';
      } else if (typeKey === 'plants_cut') {
        detailsLabel.textContent = 'Gegärtnerte / geschnittene Pflanzen';
        detailsInput.placeholder = 'z. B. Stängelpflanzen gekürzt, Schwimmpflanzen ausgedünnt';
      } else if (typeKey === 'plants_new') {
        detailsLabel.textContent = 'Neu eingesetzte Pflanzenarten';
        detailsInput.placeholder = 'z. B. Anubias barteri, Cryptocoryne wendtii, Javafarn';
      } else if (typeKey === 'care') {
        detailsLabel.textContent = 'Pflegemaßnahmen';
        detailsInput.placeholder = 'z. B. Scheiben innen geputzt, Mulm im Vordergrund abgesaugt';
      } else if (typeKey === 'fertilize') {
        detailsLabel.textContent = 'Düngemittel & Dosierung';
        detailsInput.placeholder = 'z. B. 5 ml Eisenvolldünger, 2 ml NPK, CO2-Flasche gewechselt';
      } else if (typeKey === 'feeding') {
        detailsLabel.textContent = 'Futter & Spezialfütterung';
        detailsInput.placeholder = 'z. B. Lebendfutter weiße Mückenlarven, Spirulina-Tabs';
      } else {
        detailsLabel.textContent = 'Details / Beschreibung';
        detailsInput.placeholder = 'z. B. Heizstab neu eingestellt, Lichtzeit angepasst';
      }
    }
  };

  typeSelect.addEventListener('change', () => updateFormForType(typeSelect.value));
  updateFormForType(existing?.type || 'water_change');

  const form = h('form', { class: 'stack', method: 'dialog', onsubmit: async (e) => {
    e.preventDefault();
    err.textContent = '';
    const selectedType = typeSelect.value;
    const body = {
      type: selectedType,
      logged_at: dateInput.value ? new Date(dateInput.value).toISOString() : new Date().toISOString(),
      percentage: selectedType === 'water_change' ? (percentInput.value ? Number(percentInput.value) : null) : null,
      details: detailsInput.value.trim() || null,
      note: noteInput.value.trim() || null,
    };
    try {
      if (editing) {
        await api(`/aquariums/${aq.id}/maintenance/${existing.id}`, { method: 'PUT', body });
        toast('Aktivität aktualisiert.');
      } else {
        await api(`/aquariums/${aq.id}/maintenance`, { method: 'POST', body });
        toast('Aktivität eingetragen.');
      }
      dlg.close();
      route();
    } catch (ex) {
      err.textContent = ex.message;
    }
  } },
  h('h2', {}, editing ? 'Aktivität / Pflege bearbeiten' : 'Aktivität / Pflege eintragen'),
  h('div', { class: 'grid2' },
    h('div', { class: 'field' }, h('label', {}, 'Kategorie / Arbeit'), typeSelect),
    h('div', { class: 'field' }, h('label', {}, 'Datum & Uhrzeit'), dateInput)),
  percentField,
  detailsField,
  h('div', { class: 'field' }, h('label', {}, 'Zusätzliche Notizen'), noteInput),
  err,
  h('div', { class: 'row' },
    h('button', { class: 'btn', type: 'submit' }, editing ? 'Änderungen speichern' : 'Eintrag speichern'),
    h('button', { class: 'btn ghost', type: 'button', onclick: () => dlg.close() }, 'Abbrechen'),
    editing ? h('button', { class: 'btn danger', type: 'button', onclick: async () => {
      if (!confirm('Diesen Log-Eintrag wirklich löschen?')) return;
      try {
        await api(`/aquariums/${aq.id}/maintenance/${existing.id}`, { method: 'DELETE' });
        dlg.close();
        toast('Eintrag gelöscht.');
        route();
      } catch (ex) {
        err.textContent = ex.message;
      }
    } }, 'Löschen') : null));

  dlg.append(form);
  dlg.addEventListener('close', () => dlg.remove());
  document.body.append(dlg);
  dlg.showModal();
}

/* ---------- Aquarium-Hauptseite ---------- */
const bandPlugin = {
  id: 'band',
  beforeDatasetsDraw(chart, args, o) {
    const { ctx, chartArea: a, scales: { y } } = chart;
    if (!o || !a) return;
    const clamp = (px) => Math.min(Math.max(px, a.top), a.bottom);
    const isDark = isEffectiveDark();
    ctx.save();
    if (o.okMin != null || o.okMax != null) {
      const yTop = o.okMax != null ? clamp(y.getPixelForValue(o.okMax)) : a.top;
      const yBot = o.okMin != null ? clamp(y.getPixelForValue(o.okMin)) : a.bottom;
      ctx.fillStyle = isDark ? 'rgba(52, 211, 153, 0.16)' : 'rgba(47, 122, 88, 0.13)';
      ctx.fillRect(a.left, yTop, a.right - a.left, Math.max(0, yBot - yTop));
    }
    ctx.strokeStyle = isDark ? 'rgba(248, 113, 113, 0.85)' : 'rgba(184, 52, 31, 0.75)';
    ctx.setLineDash([5, 4]); ctx.lineWidth = 1;
    for (const v of [o.critMin, o.critMax]) {
      if (v == null || v < y.min || v > y.max) continue;
      const py = y.getPixelForValue(v);
      ctx.beginPath(); ctx.moveTo(a.left, py); ctx.lineTo(a.right, py); ctx.stroke();
    }
    ctx.restore();
  },
};

function makeChart(canvas, p, points, range) {
  const isDark = isEffectiveDark();
  const ys = points.map((q) => q.y);
  const lo = [Math.min(...ys), range.okMin].filter((v) => v != null);
  const hi = [Math.max(...ys), range.okMax].filter((v) => v != null);
  const minV = Math.min(...lo), maxV = Math.max(...hi);
  const pad = (maxV - minV || Math.abs(maxV) || 1) * 0.12;
  const xs = points.map((q) => q.x);
  let xMin = Math.min(...xs), xMax = Math.max(...xs);
  if (xMin === xMax) { xMin -= 12 * 3600e3; xMax += 12 * 3600e3; }
  const chartInstance = new Chart(canvas, {
    type: 'line',
    plugins: [bandPlugin],
    data: {
      datasets: [{
        data: points,
        borderColor: isDark ? '#38bdf8' : '#12343b',
        backgroundColor: isDark ? '#38bdf8' : '#12343b',
        borderWidth: 2,
        pointRadius: 3.5,
        pointHoverRadius: 5,
        tension: 0.2,
        pointBackgroundColor: points.map((q) => ({
          ok: isDark ? '#34d399' : '#2f7a58',
          warn: isDark ? '#fbbf24' : '#a86a00',
          crit: isDark ? '#f87171' : '#b8341f',
        }[evaluate(range, q.y)] || (isDark ? '#38bdf8' : '#12343b'))),
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      plugins: {
        legend: { display: false },
        band: range,
        tooltip: {
          backgroundColor: isDark ? '#091315' : '#12343b',
          titleColor: isDark ? '#e2eeed' : '#ffffff',
          bodyColor: isDark ? '#e2eeed' : '#ffffff',
          borderColor: isDark ? '#22383c' : '#bccfcc',
          borderWidth: 1,
          callbacks: {
            title: (it) => fmtDate(it[0].parsed.x),
            label: (it) => `${fmtNum(p, it.parsed.y)}${p.unit ? ' ' + p.unit : ''}`,
          },
        },
      },
      scales: {
        x: {
          type: 'linear',
          min: xMin,
          max: xMax,
          ticks: {
            color: isDark ? '#8fa9ad' : '#4a6a70',
            maxTicksLimit: 5,
            callback: (v) => new Date(v).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' }),
          },
          grid: {
            color: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)',
          },
        },
        y: {
          suggestedMin: Math.max(minV - pad, p.min),
          suggestedMax: Math.min(maxV + pad, p.max),
          ticks: {
            color: isDark ? '#8fa9ad' : '#4a6a70',
          },
          grid: {
            color: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)',
          },
          title: {
            display: !!p.unit,
            text: p.unit,
            color: isDark ? '#8fa9ad' : '#4a6a70',
          },
        },
      },
    },
  });
  activeCharts.push(chartInstance);
  return chartInstance;
}

async function viewAquarium(id) {
  const [d, ms, logs] = await Promise.all([
    api(`/aquariums/${id}`),
    api(`/aquariums/${id}/measurements?days=${RANGE}`),
    api(`/aquariums/${id}/logs?days=${RANGE}`),
  ]);
  const aq = d.aquarium;
  const role = d.role || aq.role || 'owner';
  const isOwner = role === 'owner';
  const isReadOnly = role === 'view';
  const nodes = [];

  const topActions = [];
  if (!isReadOnly) {
    topActions.push(h('a', { class: 'btn', href: `#/a/${id}/messen` }, '🧪 Werte eintragen'));
    topActions.push(h('button', { class: 'btn ghost', type: 'button', onclick: () => maintenanceDialog(aq) }, '🛠️ Arbeit eintragen'));
    if (isOwner) topActions.push(h('button', { class: 'btn ghost', type: 'button', onclick: () => shareDialog(aq) }, 'Teilen'));
    topActions.push(h('button', { class: 'btn ghost', type: 'button', onclick: () => aquariumDialog(aq) }, 'Bearbeiten'));
  }
  if (!isOwner) {
    topActions.push(h('button', { class: 'btn small ghost danger', type: 'button', onclick: async () => {
      if (!confirm(`Möchtest du die Freigabe für „${aq.name}“ wirklich verlassen?`)) return;
      try {
        await api(`/aquariums/${id}/shares/${ME.id}`, { method: 'DELETE' });
        toast('Freigabe verlassen.');
        location.hash = '#/';
      } catch (ex) { toast(ex.message); }
    } }, 'Freigabe verlassen'));
  }

  nodes.push(h('div', { class: 'row between' },
    h('div', {},
      h('a', { href: '#/', class: 'muted' }, '‹ Alle Aquarien'),
      h('h1', {}, aq.name),
      h('div', { class: 'muted' },
        CONFIG.waterTypes[aq.water_type],
        aq.volume_l ? ` · ${aq.volume_l} l` : '',
        aq.last_measured_at ? ` · zuletzt gemessen ${fmtDate(aq.last_measured_at)}` : '',
        aq.last_water_change_at ? ` · letzter Wasserwechsel ${fmtDate(aq.last_water_change_at)}${aq.last_water_change_percent ? ' (' + aq.last_water_change_percent + ' %)' : ''}` : ''),
      !isOwner ? h('div', { style: 'margin-top:.35rem' },
        h('span', { class: `chip ${isReadOnly ? 'none' : 'ok'}` }, `Geteilt von ${aq.owner_username || 'Besitzer'} · ${isReadOnly ? 'Nur Lesezugriff' : 'Schreibzugriff'}`)) : null),
    h('div', { class: 'row' }, topActions)));

  if (aq.has_image) {
    nodes.push(h('div', { class: 'aq-hero' },
      h('img', { class: 'aq-hero-img', src: `api/aquariums/${id}/image?t=${Date.now()}`, alt: aq.name })));
  }

  if (aq.notes) nodes.push(h('p', { class: 'muted' }, aq.notes));

  // Warnungen, Alarme und Besatz-Kompatibilität
  const notices = [];
  if (aq.overdue) notices.push(h('div', { class: 'alert warn' }, h('div', {}, h('strong', {}, 'Messung fällig'), `Die letzte Messung ist länger als ${aq.reminder_days} Tage her.`)));
  
  if (d.stockCompatibility) {
    if (d.stockCompatibility.issues && d.stockCompatibility.issues.length) {
      for (const issue of d.stockCompatibility.issues) {
        notices.push(h('div', { class: 'alert crit' },
          h('div', {}, h('strong', {}, issue.title || 'Besatzkonflikt'), issue.message)
        ));
      }
    }
    if (d.stockCompatibility.warnings && d.stockCompatibility.warnings.length) {
      for (const warn of d.stockCompatibility.warnings) {
        notices.push(h('div', { class: 'alert warn' },
          h('div', {}, h('strong', {}, warn.title || 'Besatzwarnung'), warn.message)
        ));
      }
    }
    if (d.stockCompatibility.infos && d.stockCompatibility.infos.length) {
      for (const info of d.stockCompatibility.infos) {
        notices.push(h('div', { class: 'alert info' },
          h('div', {}, h('strong', {}, info.title || 'Besatzhinweis'), info.message)
        ));
      }
    }
  } else if (d.conflicts && d.conflicts.length) {
    notices.push(h('div', { class: 'alert info' }, h('div', {}, h('strong', {}, 'Der Besatz passt bei einigen Werten nicht zusammen'),
      `Für ${d.conflicts.map((k) => param(k).name).join(', ')} haben die Fischarten unterschiedliche Ansprüche. Hier gelten die allgemeinen Grenzwerte.`)));
  }

  for (const a of d.alerts) {
    notices.push(h('div', { class: 'alert ' + a.level },
      h('div', {}, h('strong', {}, a.level === 'crit' ? 'Kritisch' : 'Auffällig'), a.message, h('div', { class: 'muted' }, fmtDate(sqlDate(a.created_at)))),
      !isReadOnly ? h('button', { class: 'btn small ghost', type: 'button', onclick: async () => { await api(`/aquariums/${id}/alerts/ack`, { method: 'POST', body: { ids: [a.id] } }); route(); } }, 'Erledigt') : null));
  }
  if (!isReadOnly && d.alerts.length > 1) {
    notices.push(h('div', {}, h('button', { class: 'btn small ghost', type: 'button', onclick: async () => { await api(`/aquariums/${id}/alerts/ack`, { method: 'POST', body: {} }); route(); } }, 'Alle als erledigt markieren')));
  }
  if (notices.length) nodes.push(h('section', { class: 'stack', 'aria-label': 'Warnungen' }, notices));

  // Aktuelle Werte
  const allKnownParams = CONFIG.allParameters || CONFIG.parameters;
  const keys = allKnownParams.map((p) => p.key).filter((k) => d.latest[k]);
  if (keys.length) {
    nodes.push(h('section', {}, h('h2', {}, 'Aktuelle Werte'), h('div', { class: 'values' }, keys.map((k) => {
      const p = param(k), l = d.latest[k];
      return h('div', { class: 'value ' + (l.status || '') }, h('div', { class: 'muted' }, p.name),
        h('div', {}, h('span', { class: 'num' }, fmtNum(p, l.value)), h('span', { class: 'unit' }, p.unit)),
        chip(l.status), h('div', { class: 'muted', style: 'font-size:.8rem;margin-top:.2rem' }, fmtDate(l.measured_at)));
    }))));
  } else {
    nodes.push(h('div', { class: 'card stack' },
      h('h2', {}, 'Noch keine Messwerte'),
      h('p', {}, 'Trage deine ersten Wasserwerte ein. Danach erscheinen hier Verlauf und Warnungen.'),
      !isReadOnly ? h('div', { class: 'row' },
        h('a', { class: 'btn', href: `#/a/${id}/messen` }, '🧪 Werte eintragen'),
        h('button', { class: 'btn ghost', type: 'button', onclick: () => maintenanceDialog(aq) }, '🛠️ Arbeit eintragen')
      ) : null));
  }

  // Graphen
  const charts = [];
  const chartCards = [];
  for (const p of allKnownParams) {
    const points = ms.filter((m) => m.values[p.key] != null).map((m) => ({ x: new Date(m.measured_at).getTime(), y: m.values[p.key] }));
    if (!points.length) continue;
    const canvas = h('canvas', { role: 'img', 'aria-label': `Verlauf ${p.name}` });
    chartCards.push({ p, points, canvas, card: h('div', { class: 'card chart-card' }, h('h3', {}, h('span', {}, p.name), h('span', { class: 'muted' }, p.unit)), h('div', { class: 'chart-wrap' }, canvas)) });
  }
  if (keys.length) {
    const tabs = h('div', { class: 'range-tabs', role: 'group', 'aria-label': 'Zeitraum' }, [[7, '7 Tage'], [30, '30 Tage'], [90, '90 Tage'], [365, '1 Jahr'], [3650, 'Alles']].map(([days, label]) =>
      h('button', { type: 'button', 'aria-pressed': String(RANGE === days), onclick: () => { RANGE = days; route(); } }, label)));
    nodes.push(h('section', { class: 'stack' }, h('div', { class: 'row between' }, h('h2', { style: 'margin:0' }, 'Verlauf'), tabs),
      chartCards.length ? h('div', { class: 'charts' }, chartCards.map((c) => c.card)) : h('p', { class: 'muted' }, 'In diesem Zeitraum gibt es keine Messungen.'),
      chartCards.length ? h('p', { class: 'muted' }, 'Grüner Bereich = Zielbereich, rot gestrichelt = kritische Grenze.') : null));
  }

  // Besatz
  const sp = h('input', { list: 'species', maxlength: '80', required: true, placeholder: 'z. B. Siamesischer Kampffisch, Neonsalmler...' });
  const cnt = h('input', { type: 'number', min: '1', max: '10000', value: '1', inputmode: 'numeric' });
  const prof = h('select', {}, Object.entries(CONFIG.profiles).map(([k, v]) => h('option', { value: k }, v)));
  const previewBox = h('div', { class: 'species-preview', style: 'display:none; margin-top:.4rem' });

  const updatePreview = () => {
    const val = sp.value.trim().toLowerCase();
    const m = CONFIG.species.find((s) => s.name.toLowerCase() === val || (s.scientificName && s.scientificName.toLowerCase() === val));
    if (m) {
      if (m.profile && CONFIG.profiles[m.profile]) prof.value = m.profile;
      previewBox.style.display = 'block';
      previewBox.replaceChildren(
        h('div', { class: 'row between' },
          h('div', {},
            h('strong', {}, m.name),
            m.scientificName ? h('span', { class: 'muted', style: 'font-style:italic; margin-left:.3rem' }, `(${m.scientificName})`) : null,
            h('div', { class: 'muted' }, `${m.category || ''} · ${m.waterType === 'salt' ? 'Meerwasser' : 'Süßwasser'} · ab ${m.minVolumeL || 30} L · ${socialLabel(m.socialType, m.minGroupCount)} · ${territorialLabel(m.territorial)}`)
          ),
          h('button', { class: 'btn small ghost', type: 'button', onclick: () => showSpeciesModal(m) }, 'Details anzeigen')
        )
      );
    } else {
      previewBox.style.display = 'none';
    }
  };
  sp.addEventListener('input', updatePreview);

  const stockErr = h('p', { class: 'error', role: 'alert' });

  const stockListItems = d.stock.map((s) => {
    const spMatch = CONFIG.species.find((spec) => spec.name.toLowerCase() === s.species.toLowerCase() || spec.id === s.species.toLowerCase());
    const chips = [];
    if (s.category || spMatch?.category) chips.push(h('span', { class: 'tag ok' }, s.category || spMatch?.category));
    if (s.minVolumeL || spMatch?.minVolumeL) chips.push(h('span', { class: 'tag' }, `ab ${s.minVolumeL || spMatch?.minVolumeL} L`));
    if (s.socialType || spMatch?.socialType) chips.push(h('span', { class: 'tag info' }, socialLabel(s.socialType || spMatch?.socialType, s.minGroupCount || spMatch?.minGroupCount)));
    if (s.territorial === 'solitary_aggressive' || spMatch?.territorial === 'solitary_aggressive') chips.push(h('span', { class: 'tag danger' }, 'Einzelhaltung'));
    else if (s.territorial === 'strong' || spMatch?.territorial === 'strong') chips.push(h('span', { class: 'tag warn' }, 'Stark territorial'));
    else if (s.territorial === 'breeding' || spMatch?.territorial === 'breeding') chips.push(h('span', { class: 'tag info' }, 'Revier bei Brut'));

    return h('li', { style: 'padding:.5rem 0;border-bottom:1px solid var(--line)' },
      h('div', { class: 'row between' },
        h('div', {},
          h('span', { style: 'font-weight:600' }, `${s.count} × ${s.species}`),
          s.scientificName ? h('span', { class: 'muted', style: 'font-style:italic;margin-left:.4rem' }, `(${s.scientificName})`) : null,
          h('span', { class: 'muted', style: 'margin-left:.4rem' }, `(${CONFIG.profiles[s.profile] || s.profile})`),
          chips.length ? h('div', { style: 'margin-top:.2rem' }, chips) : null
        ),
        h('div', { class: 'row' },
          h('button', { class: 'btn small ghost', type: 'button', onclick: () => showSpeciesModal(spMatch || s.species) }, 'Arten-Info'),
          !isReadOnly ? h('button', { class: 'btn small ghost', type: 'button', 'aria-label': `${s.species} entfernen`, onclick: async () => { await api(`/aquariums/${id}/stock/${s.id}`, { method: 'DELETE' }); route(); } }, 'Entfernen') : null
        )
      )
    );
  });

  const stockNodes = [
    h('div', { class: 'row between' },
      h('h2', { style: 'margin:0' }, 'Besatz & Tierwohl'),
      h('a', { class: 'btn small ghost', href: '#/species' }, '📖 Artenkatalog')
    ),
    h('p', { class: 'muted' }, 'Die Fisch- und Wirbellosenarten bestimmen die optimalen Grenzwerte und werden auf Verträglichkeit, Gruppengröße sowie Territorialverhalten geprüft.'),
    d.stock.length ? h('ul', { style: 'list-style:none;padding:0;margin:0' }, stockListItems)
      : h('p', {}, 'Noch kein Besatz eingetragen. Es gelten die allgemeinen Grenzwerte.')
  ];

  if (d.stockCompatibility?.decorHints?.length) {
    stockNodes.push(
      h('div', { class: 'compat-box info', style: 'margin-top:.8rem' },
        h('strong', {}, 'Haltungs- & Einrichtungsempfehlungen für diesen Besatz:'),
        h('ul', { style: 'margin:.4rem 0 0 1.2rem; padding:0' },
          d.stockCompatibility.decorHints.map((hint) => h('li', {}, hint))
        )
      )
    );
  }

  if (!isReadOnly) {
    stockNodes.push(
      h('datalist', { id: 'species' }, CONFIG.species.map((s) => h('option', { value: s.name }, s.scientificName ? `${s.name} (${s.scientificName})` : s.name))),
      h('form', { class: 'stack', style: 'margin-top:1rem', onsubmit: async (e) => {
        e.preventDefault(); stockErr.textContent = '';
        try { await api(`/aquariums/${id}/stock`, { method: 'POST', body: { species: sp.value, count: cnt.value, profile: prof.value } }); route(); } catch (ex) { stockErr.textContent = ex.message; }
      } },
      h('h3', { style: 'margin:0' }, 'Neuen Bewohner hinzufügen'),
      h('div', { class: 'grid2' }, h('div', { class: 'field' }, h('label', {}, 'Art / Bewohner'), sp), h('div', { class: 'field' }, h('label', {}, 'Anzahl'), cnt)),
      previewBox,
      h('div', { class: 'field' }, h('label', {}, 'Ansprüche an das Wasser'), prof),
      stockErr,
      h('div', {}, h('button', { class: 'btn', type: 'submit' }, 'Besatz hinzufügen'))));
  }
  nodes.push(h('section', { class: 'card stack' }, stockNodes));

  // Aquarium-Logbuch & Aktivitäten Timeline
  let currentLogFilter = 'all';
  const logContainer = h('div', { class: 'timeline' });

  const renderTimeline = () => {
    let items = logs || [];
    if (currentLogFilter === 'water_change') {
      items = items.filter((it) => it.type === 'water_change');
    } else if (currentLogFilter === 'maintenance') {
      items = items.filter((it) => it.kind === 'maintenance' && it.type !== 'water_change');
    } else if (currentLogFilter === 'plants') {
      items = items.filter((it) => it.type === 'plants_cut' || it.type === 'plants_new');
    } else if (currentLogFilter === 'measurement') {
      items = items.filter((it) => it.kind === 'measurement');
    }

    if (!items.length) {
      logContainer.replaceChildren(
        h('div', { class: 'card', style: 'text-align:center; padding: 2rem 1rem' },
          h('p', { class: 'muted', style: 'margin-bottom:.8rem' }, 'In diesem Zeitraum sind keine passenden Log-Einträge vorhanden.'),
          !isReadOnly ? h('div', { class: 'row', style: 'justify-content:center' },
            h('button', { class: 'btn small', type: 'button', onclick: () => maintenanceDialog(aq) }, '🛠️ Erste Aktivität eintragen'),
            h('a', { class: 'btn small ghost', href: `#/a/${id}/messen` }, '🧪 Messung eintragen')
          ) : null
        )
      );
      return;
    }

    logContainer.replaceChildren(
      ...items.map((it) => {
        const isMeas = it.kind === 'measurement';
        const typeClass = `t-${it.type || 'other'}`;

        const headerNodes = [
          h('div', { class: 'log-item-title' },
            h('span', { class: 'log-item-icon' }, it.icon || (isMeas ? '🧪' : '📝')),
            h('span', {},
              it.type === 'water_change' && it.percentage
                ? `Wasserwechsel (${it.percentage} %)`
                : (it.typeName || (isMeas ? 'Wassermessung' : 'Aktivität'))
            )
          ),
          h('div', { class: 'log-item-meta' },
            h('span', {}, fmtDate(it.timestamp)),
            it.created_by_username ? h('span', { class: 'tag' }, `von ${it.created_by_username}`) : null
          )
        ];

        const bodyNodes = [];
        if (it.type === 'water_change' && it.percentage) {
          bodyNodes.push(
            h('div', {},
              h('span', { class: 'chip ok' }, `💧 ${it.percentage} % Teilwasserwechsel`)
            )
          );
        }

        if (it.details) {
          let prefix = 'Details: ';
          if (it.type === 'filter_change') prefix = 'Gewechselte Medien: ';
          else if (it.type === 'filter_clean') prefix = 'Gereinigte Filterteile: ';
          else if (it.type === 'plants_new') prefix = 'Eingesetzte Pflanzen: ';
          else if (it.type === 'plants_cut') prefix = 'Geschnittene Pflanzen: ';
          else if (it.type === 'fertilize') prefix = 'Düngung: ';
          else if (it.type === 'feeding') prefix = 'Futter: ';

          bodyNodes.push(
            h('div', { class: 'log-details-box' },
              h('strong', {}, prefix),
              it.details
            )
          );
        }

        if (isMeas && it.values) {
          const valEntries = Object.entries(it.values);
          if (valEntries.length) {
            bodyNodes.push(
              h('div', { class: 'log-meas-grid' },
                valEntries.map(([k, val]) => {
                  const p = param(k);
                  const st = evaluate(d.thresholds[k], val);
                  return h('span', { class: `log-meas-pill ${st ? 'v-' + st : ''}` },
                    `${p.name.replace(/ \(.*\)/, '')}: ${fmtNum(p, val)}${p.unit ? ' ' + p.unit : ''}`
                  );
                })
              )
            );
          }
          if (it.alerts && it.alerts.length) {
            bodyNodes.push(
              h('div', { style: 'margin-top:.3rem' },
                it.alerts.map((al) => h('div', { class: `alert ${al.level}`, style: 'padding:.3rem .6rem; font-size:.85rem; margin-top:.2rem' },
                  h('strong', {}, al.level === 'crit' ? 'Kritisch' : 'Auffällig'),
                  al.message
                ))
              )
            );
          }
        }

        if (it.note) {
          bodyNodes.push(h('p', { class: 'muted', style: 'margin:0; font-size:.9rem; font-style:italic' }, it.note));
        }

        const actions = [];
        if (!isReadOnly) {
          if (!isMeas) {
            actions.push(h('button', { class: 'btn small ghost', type: 'button', onclick: () => maintenanceDialog(aq, it) }, 'Bearbeiten'));
            actions.push(h('button', { class: 'btn small ghost danger', type: 'button', onclick: async () => {
              if (!confirm('Diesen Log-Eintrag wirklich löschen?')) return;
              try {
                await api(`/aquariums/${id}/maintenance/${it.id}`, { method: 'DELETE' });
                toast('Eintrag gelöscht.');
                route();
              } catch (ex) { toast(ex.message); }
            } }, 'Löschen'));
          } else {
            actions.push(h('button', { class: 'btn small ghost danger', type: 'button', onclick: async () => {
              if (!confirm('Diese Messung wirklich löschen?')) return;
              try {
                await api(`/aquariums/${id}/measurements/${it.id}`, { method: 'DELETE' });
                toast('Messung gelöscht.');
                route();
              } catch (ex) { toast(ex.message); }
            } }, 'Löschen'));
          }
        }

        return h('div', { class: `log-item ${typeClass}` },
          h('div', { class: 'log-item-header' }, headerNodes),
          bodyNodes.length ? h('div', { class: 'stack', style: 'gap:.35rem' }, bodyNodes) : null,
          actions.length ? h('div', { class: 'row', style: 'margin-top:.4rem; justify-content:flex-end' }, actions) : null
        );
      })
    );
  };

  const logTabs = h('div', { class: 'picker', style: 'margin-top:.4rem' },
    [
      ['all', 'Alle Einträge'],
      ['water_change', '💧 Wasserwechsel'],
      ['maintenance', '🛠️ Pflege & Filter'],
      ['plants', '🌱 Pflanzen'],
      ['measurement', '🧪 Messungen'],
    ].map(([k, label]) =>
      h('button', {
        class: `btn small ${k === currentLogFilter ? '' : 'ghost'}`,
        type: 'button',
        onclick: (e) => {
          currentLogFilter = k;
          logTabs.querySelectorAll('button').forEach((b) => b.className = 'btn small ghost');
          e.target.className = 'btn small';
          renderTimeline();
        }
      }, label)
    )
  );

  renderTimeline();

  nodes.push(h('section', { class: 'card stack' },
    h('div', { class: 'row between' },
      h('div', {},
        h('h2', { style: 'margin:0' }, '📖 Aquarium-Logbuch & Aktivitäten'),
        h('div', { class: 'muted' }, 'Chronologisches Protokoll über alle Arbeiten, Wasserwechsel, Filterpflegen, Pflanzen und Messungen.')
      ),
      !isReadOnly ? h('div', { class: 'row' },
        h('button', { class: 'btn small', type: 'button', onclick: () => maintenanceDialog(aq) }, '🛠️ Aktivität eintragen'),
        h('a', { class: 'btn small ghost', href: `#/a/${id}/messen` }, '🧪 Messung eintragen')
      ) : null
    ),
    logTabs,
    logContainer
  ));

  // Verlaufstabelle der Messungen
  if (ms.length) {
    const used = (CONFIG.allParameters || CONFIG.parameters).filter((p) => ms.some((m) => m.values[p.key] != null));
    nodes.push(h('section', { class: 'card stack' }, h('h2', {}, 'Messwerte-Tabelle'),
      h('div', { class: 'table-wrap' }, h('table', {},
        h('thead', {}, h('tr', {}, h('th', {}, 'Zeitpunkt'), used.map((p) => h('th', {}, p.name.replace(/ \(.*\)/, ''), p.unit ? ` (${p.unit})` : ''), ), h('th', {}, 'Notiz'), !isReadOnly ? h('th', {}, '') : null)),
        h('tbody', {}, [...ms].reverse().slice(0, 40).map((m) => h('tr', {}, h('td', {}, fmtDate(m.measured_at)),
          used.map((p) => { const v = m.values[p.key]; const st = v == null ? null : evaluate(d.thresholds[p.key], v); return h('td', { class: st === 'crit' ? 'v-crit' : st === 'warn' ? 'v-warn' : '' }, v == null ? '–' : fmtNum(p, v)); }),
          h('td', {}, m.note || ''),
          !isReadOnly ? h('td', {}, h('button', { class: 'btn small ghost', type: 'button', onclick: async () => { if (!confirm('Diese Messung löschen?')) return; await api(`/aquariums/${id}/measurements/${m.id}`, { method: 'DELETE' }); route(); } }, 'Löschen')) : null))))),
      ms.length > 40 ? h('p', { class: 'muted' }, 'Es werden die letzten 40 Messungen des Zeitraums angezeigt.') : null));
  }

  mount(h('div', { class: 'stack' }, nodes));
  for (const c of chartCards) charts.push(makeChart(c.canvas, c.p, c.points, d.thresholds[c.p.key]));
  cleanups.push(() => {
    charts.forEach((c) => {
      c.destroy();
      const idx = activeCharts.indexOf(c);
      if (idx !== -1) activeCharts.splice(idx, 1);
    });
  });
}

/* ---------- Artenkatalog View ---------- */
async function viewSpeciesCatalog(selectedId = null) {
  const data = await api('/species');
  const all = data.species || [];
  const categories = ['Alle', ...(data.categories || [])];

  let currentCategory = 'Alle';
  let currentWaterType = 'all';
  let searchTerm = '';

  const searchInput = h('input', { type: 'search', placeholder: 'Art, wissenschaftlicher Name oder Verhalten suchen...' });
  const waterSelect = h('select', { style: 'width:auto' },
    h('option', { value: 'all' }, 'Alle Wassertypen'),
    h('option', { value: 'fresh' }, 'Nur Süßwasser'),
    h('option', { value: 'salt' }, 'Nur Meerwasser')
  );

  const grid = h('div', { class: 'species-grid' });

  const renderCards = () => {
    let list = all;
    if (currentWaterType !== 'all') {
      list = list.filter((s) => s.waterType === currentWaterType);
    }
    if (currentCategory !== 'Alle') {
      list = list.filter((s) => s.category.toLowerCase() === currentCategory.toLowerCase());
    }
    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      list = list.filter((s) =>
        s.name.toLowerCase().includes(q) ||
        s.scientificName.toLowerCase().includes(q) ||
        s.category.toLowerCase().includes(q) ||
        (s.tags && s.tags.some((t) => t.includes(q))) ||
        (s.description && s.description.toLowerCase().includes(q))
      );
    }

    if (!list.length) {
      grid.replaceChildren(h('p', { class: 'muted', style: 'grid-column: 1 / -1' }, 'Keine passenden Aquarienbewohner gefunden.'));
      return;
    }

    grid.replaceChildren(
      ...list.map((sp) => {
        const tags = Array.isArray(sp.tags) ? sp.tags : [];
        const chips = [];
        chips.push(h('span', { class: 'tag ok' }, sp.category));
        chips.push(h('span', { class: `tag ${sp.waterType === 'salt' ? 'info' : 'ok'}` }, sp.waterType === 'salt' ? 'Meerwasser' : 'Süßwasser'));
        if (sp.minVolumeL) chips.push(h('span', { class: 'tag' }, `ab ${sp.minVolumeL} L`));
        chips.push(h('span', { class: 'tag info' }, socialLabel(sp.socialType, sp.minGroupCount)));
        if (sp.territorial === 'solitary_aggressive') chips.push(h('span', { class: 'tag danger' }, 'Einzelgänger / Kampffisch'));
        else if (sp.territorial === 'strong') chips.push(h('span', { class: 'tag warn' }, 'Territorial'));
        else if (tags.includes('fin_nipper')) chips.push(h('span', { class: 'tag danger' }, 'Flossenbeißer'));

        return h('div', { class: `card species-card ${sp.waterType}` },
          h('div', { class: 'stack', style: 'gap:.4rem' },
            h('div', { class: 'row between' },
              h('div', {},
                h('h3', { style: 'margin:0; font-size:1.1rem' }, sp.name),
                sp.scientificName ? h('div', { class: 'muted', style: 'font-style:italic' }, sp.scientificName) : null
              )
            ),
            h('div', { style: 'margin-top:.2rem' }, chips),
            h('div', { class: 'muted', style: 'font-size:.85rem; line-height:1.4' },
              `Temp: ${sp.temp?.min ?? '–'}–${sp.temp?.max ?? '–'} °C · pH: ${sp.ph?.min ?? '–'}–${sp.ph?.max ?? '–'} · ${sp.diet === 'herbivore' ? 'Pflanzenfresser' : sp.diet === 'carnivore' ? 'Fleischfresser' : 'Allesfresser'}`
            ),
            sp.description ? h('p', { class: 'muted', style: 'margin:0; font-size:.88rem' }, sp.description) : null
          ),
          h('div', { style: 'margin-top:.8rem' },
            h('button', { class: 'btn small ghost', type: 'button', onclick: () => showSpeciesModal(sp) }, 'Vollständiges Profil & Haltungsansprüche')
          )
        );
      })
    );
  };

  searchInput.addEventListener('input', (e) => {
    searchTerm = e.target.value.trim();
    renderCards();
  });

  waterSelect.addEventListener('change', (e) => {
    currentWaterType = e.target.value;
    renderCards();
  });

  const catPills = h('div', { class: 'picker', style: 'margin-top:.4rem' },
    categories.map((c) =>
      h('button', {
        class: `btn small ${c === currentCategory ? '' : 'ghost'}`,
        type: 'button',
        onclick: (e) => {
          currentCategory = c;
          catPills.querySelectorAll('button').forEach((b) => b.className = 'btn small ghost');
          e.target.className = 'btn small';
          renderCards();
        }
      }, c)
    )
  );

  renderCards();

  mount(h('div', { class: 'stack' },
    h('div', { class: 'row between' },
      h('div', {},
        h('a', { href: '#/', class: 'muted' }, '‹ Zurück zur Übersicht'),
        h('h1', { style: 'margin-top:.3rem' }, 'Artenkatalog & Aquarienbewohner')
      )
    ),
    h('div', { class: 'card stack' },
      h('p', { class: 'muted', style: 'margin:0' }, 'Recherchiere gängige Fische, Wirbellose und Schnecken samt deren Wasserwerten, Mindestbeckengrößen, Sozialformen und Verhaltensweisen (z. B. Territorialverhalten bei Kampffischen & Buntbarschen).'),
      h('div', { class: 'grid2' },
        h('div', { class: 'field' }, h('label', {}, 'Suchbegriff'), searchInput),
        h('div', { class: 'field' }, h('label', {}, 'Wassertyp'), waterSelect)
      ),
      h('div', { class: 'field' },
        h('label', {}, 'Kategorie'),
        catPills
      )
    ),
    grid
  ));

  if (selectedId) {
    const target = all.find((s) => s.id === selectedId || s.name.toLowerCase() === selectedId.toLowerCase());
    if (target) showSpeciesModal(target);
  }
}

/* ---------- Messmaske mit Timern ---------- */
let audioCtx = null;
function beep() {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    [0, 0.25, 0.5].forEach((t) => {
      const o = audioCtx.createOscillator(), g = audioCtx.createGain();
      o.frequency.value = 880; o.connect(g); g.connect(audioCtx.destination);
      g.gain.setValueAtTime(0.0001, audioCtx.currentTime + t);
      g.gain.exponentialRampToValueAtTime(0.25, audioCtx.currentTime + t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + t + 0.18);
      o.start(audioCtx.currentTime + t); o.stop(audioCtx.currentTime + t + 0.2);
    });
  } catch (e) { /* kein Ton möglich */ }
  if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
}

async function viewMeasure(id) {
  const d = await api(`/aquariums/${id}`);
  const aq = d.aquarium;
  const role = d.role || aq.role || 'owner';
  if (role === 'view') {
    toast('Keine Schreibrechte für dieses Aquarium.');
    location.hash = `#/a/${id}`;
    return;
  }

  const suites = CONFIG.suites || [];
  let currentSuiteId = ME.selectedSuite || CONFIG.defaultSuiteId || 'jbl-pro';
  let activeSuite = suites.find((s) => s.id === currentSuiteId) || CONFIG.currentSuite || suites[0];

  const selKey = `tests:${ME.id}`;
  let selected = null;
  if (Array.isArray(ME.selectedTests)) {
    selected = [...ME.selectedTests];
  } else {
    try { selected = JSON.parse(localStorage.getItem(selKey)); } catch (e) { /* Standard */ }
  }
  if (!Array.isArray(selected)) {
    selected = activeSuite.tests.map((p) => p.key);
  }

  const timerKey = `timers:${id}`;
  const timers = (() => { try { return JSON.parse(sessionStorage.getItem(timerKey)) || {}; } catch (e) { return {}; } })();
  const saveTimers = () => sessionStorage.setItem(timerKey, JSON.stringify(timers));
  const finished = new Set(Object.entries(timers).filter(([, end]) => end <= Date.now()).map(([k]) => k));

  let wakeLock = null;
  const updateWake = async () => {
    const running = Object.values(timers).some((end) => end > Date.now());
    try {
      if (running && !wakeLock && navigator.wakeLock) { wakeLock = await navigator.wakeLock.request('screen'); wakeLock.addEventListener('release', () => { wakeLock = null; }); }
      if (!running && wakeLock) { await wakeLock.release(); wakeLock = null; }
    } catch (e) { /* nicht unterstützt */ }
  };

  const rows = new Map();
  const when = h('input', { type: 'datetime-local', required: true, value: localInputValue() });
  const note = h('input', { maxlength: '500', placeholder: 'z. B. nach Wasserwechsel' });
  const err = h('p', { class: 'error', role: 'alert' });
  const list = h('div', { class: 'tests' });

  const suiteSelect = h('select', { style: 'width: auto; max-width: 100%;' },
    suites.map((s) => h('option', { value: s.id, selected: s.id === activeSuite.id }, s.name))
  );

  const checkboxesContainer = h('div', { class: 'picker', style: 'margin-top:.6rem' });

  const renderCheckboxes = () => {
    checkboxesContainer.replaceChildren(
      ...activeSuite.tests.map((p) =>
        h('label', {},
          h('input', {
            type: 'checkbox',
            checked: selected.includes(p.key),
            onchange: async (e) => {
              selected = e.target.checked ? [...new Set([...selected, p.key])] : selected.filter((k) => k !== p.key);
              localStorage.setItem(selKey, JSON.stringify(selected));
              try { await api('/me/tests', { method: 'PUT', body: { selectedSuite: activeSuite.id, selectedTests: selected } }); } catch (ex) {}
              applyVisibility();
            }
          }),
          p.name.replace(/ \(.*\)/, '') + (p.wait ? ` (${mmss(p.wait)})` : '')
        )
      )
    );
  };

  const btnSelectAll = h('button', { class: 'btn small ghost', type: 'button', onclick: async () => {
    selected = activeSuite.tests.map((p) => p.key);
    localStorage.setItem(selKey, JSON.stringify(selected));
    try { await api('/me/tests', { method: 'PUT', body: { selectedSuite: activeSuite.id, selectedTests: selected } }); } catch (ex) {}
    renderCheckboxes();
    applyVisibility();
  } }, 'Alle auswählen');

  const btnSelectNone = h('button', { class: 'btn small ghost', type: 'button', onclick: async () => {
    selected = [];
    localStorage.setItem(selKey, JSON.stringify(selected));
    try { await api('/me/tests', { method: 'PUT', body: { selectedSuite: activeSuite.id, selectedTests: selected } }); } catch (ex) {}
    renderCheckboxes();
    applyVisibility();
  } }, 'Keine auswählen');

  suiteSelect.addEventListener('change', async (e) => {
    const chosen = suites.find((s) => s.id === e.target.value);
    if (!chosen) return;
    activeSuite = chosen;
    currentSuiteId = chosen.id;
    selected = chosen.tests.map((p) => p.key);
    localStorage.setItem(selKey, JSON.stringify(selected));
    try { await api('/me/tests', { method: 'PUT', body: { selectedSuite: activeSuite.id, selectedTests: selected } }); } catch (ex) {}
    rebuildRows();
    renderCheckboxes();
    applyVisibility();
    render();
  });

  const picker = h('details', {},
    h('summary', { style: 'cursor:pointer; font-weight:600' }, `Wassertests anpassen (${activeSuite.name})`),
    h('div', { class: 'stack', style: 'margin-top:.8rem; gap:.6rem' },
      suites.length > 1 ? h('div', { class: 'row' }, h('span', { class: 'muted' }, 'Testsuite:'), suiteSelect) : null,
      h('div', { class: 'row' }, btnSelectAll, btnSelectNone),
      checkboxesContainer
    )
  );

  function rebuildRows() {
    list.replaceChildren();
    rows.clear();
    for (const p of activeSuite.tests) {
      const range = d.thresholds[p.key];
      const input = h('input', { type: 'text', inputmode: 'decimal', id: 'in-' + p.key, autocomplete: 'off', 'aria-describedby': 'st-' + p.key });
      const status = h('span', { id: 'st-' + p.key });
      const clock = h('span', { class: 'clock', 'aria-live': 'off' }, p.wait ? mmss(p.wait) : '');
      const fill = h('div', { class: 'fill' });
      const tube = h('div', { class: 'tube' + (p.wait ? '' : ' idle') }, fill);
      const btn = h('button', { class: 'btn small ghost', type: 'button' }, 'Timer starten');
      const el = h('div', { class: 'test', 'data-key': p.key },
        tube,
        h('div', { class: 'test-head' }, h('h3', {}, h('label', { for: 'in-' + p.key, style: 'margin:0;font-size:1rem' }, p.name)), status),
        h('div', { class: 'test-body' },
          p.wait ? h('div', { class: 'timer-line' }, btn, clock) : h('span', { class: 'muted' }, 'Kein Warten nötig'),
          h('div', {}, input, p.unit ? h('span', { class: 'muted' }, ` ${p.unit}`) : null)),
        h('p', { class: 'hint' }, p.hint, ' ', p.wait ? (p.verified ? `Wartezeit: ${mmss(p.wait)} min (laut Anleitung).` : h('span', { class: 'unverified' }, `Wartezeit ${mmss(p.wait)} min: bitte mit deiner Packungsbeilage abgleichen.`)) : null));
      input.addEventListener('input', () => {
        const raw = input.value.trim().replace(',', '.');
        status.replaceChildren();
        if (!raw) return;
        const v = Number(raw);
        if (!Number.isFinite(v) || v < p.min || v > p.max) { status.append(h('span', { class: 'chip warn' }, `erlaubt: ${p.min} bis ${p.max}`)); return; }
        status.append(chip(evaluate(range, v)));
      });
      btn.addEventListener('click', () => {
        try { audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)(); audioCtx.resume(); } catch (e) { /* ohne Ton */ }
        if (timers[p.key] && timers[p.key] > Date.now()) { delete timers[p.key]; } else { timers[p.key] = Date.now() + p.wait * 1000; }
        finished.delete(p.key); saveTimers(); render(); updateWake();
      });
      rows.set(p.key, { p, el, fill, clock, btn, input });
      list.append(el);
    }
  }

  function applyVisibility() {
    for (const [k, r] of rows) r.el.hidden = !selected.includes(k);
  }

  function render() {
    const now = Date.now();
    for (const [k, r] of rows) {
      if (!r.p.wait) continue;
      const end = timers[k];
      if (!end) { r.fill.style.setProperty('--p', 0); r.clock.textContent = mmss(r.p.wait); r.btn.textContent = 'Timer starten'; r.el.classList.remove('done'); continue; }
      const left = (end - now) / 1000;
      if (left > 0) {
        r.fill.style.setProperty('--p', Math.min(100, (1 - left / r.p.wait) * 100));
        r.clock.textContent = mmss(left); r.btn.textContent = 'Abbrechen'; r.el.classList.remove('done');
      } else {
        r.fill.style.setProperty('--p', 100); r.clock.textContent = 'Fertig'; r.btn.textContent = 'Neu starten'; r.el.classList.add('done');
        if (!finished.has(k)) { finished.add(k); beep(); toast(`${r.p.name}: Zeit abgelaufen, jetzt ablesen.`); updateWake(); }
      }
    }
  }

  rebuildRows();
  renderCheckboxes();
  applyVisibility();
  render();
  updateWake();

  const form = h('form', { class: 'stack', onsubmit: async (e) => {
    e.preventDefault(); err.textContent = '';
    const values = {};
    for (const [k, r] of rows) if (!r.el.hidden && r.input.value.trim()) values[k] = r.input.value.trim().replace(',', '.');
    try {
      const r = await api(`/aquariums/${id}/measurements`, { method: 'POST', body: { measured_at: new Date(when.value).toISOString(), values, note: note.value } });
      sessionStorage.removeItem(timerKey);
      const crit = r.alerts.filter((a) => a.level === 'crit').length, warn = r.alerts.length - crit;
      toast(r.alerts.length ? `Gespeichert: ${crit ? crit + ' kritisch' : ''}${crit && warn ? ', ' : ''}${warn ? warn + ' auffällig' : ''}.` : 'Gespeichert. Alle Werte im Bereich.');
      location.hash = `#/a/${id}`;
    } catch (ex) { err.textContent = ex.message; err.scrollIntoView({ block: 'center' }); }
  } },
  h('div', { class: 'field' }, h('label', { for: 'when' }, 'Gemessen am'), (when.id = 'when', when)),
  picker, list,
  h('div', { class: 'field' }, h('label', {}, 'Notiz (optional)'), note),
  h('div', { class: 'sticky-save' }, err, h('div', { class: 'row' }, h('button', { class: 'btn', type: 'submit' }, 'Messung speichern'), h('a', { class: 'btn ghost', href: `#/a/${id}` }, 'Abbrechen'))));

  mount(h('div', { class: 'stack' },
    h('div', {}, h('a', { href: `#/a/${id}`, class: 'muted' }, `‹ ${aq.name}`), h('h1', {}, 'Werte eintragen'),
      h('p', { class: 'muted' }, 'Starte bei jedem Test den Timer, sobald das Reagenz im Wasser ist. Mehrere Timer können gleichzeitig laufen. Ausgefüllt wird nur, was du gemessen hast.')),
    form));

  const tick = setInterval(render, 250);
  cleanups.push(() => { clearInterval(tick); if (wakeLock) wakeLock.release().catch(() => {}); });
}

/* ---------- Admin / Benutzerverwaltung ---------- */
async function viewAdmin() {
  const users = await api('/admin/users');
  const rows = users.map((u) => {
    const isSelf = u.id === ME.id;
    const authTypes = [];
    if (u.hasPassword) authTypes.push('Passwort');
    if (u.hasOidc) authTypes.push(`Pocket ID${u.oidcSub ? ` (${u.oidcSub})` : ''}`);
    if (!authTypes.length) authTypes.push('–');

    return h('tr', {},
      h('td', {}, h('strong', {}, u.username), isSelf ? h('span', { class: 'muted' }, ' (Du)') : null),
      h('td', {}, u.email || h('span', { class: 'muted' }, '–')),
      h('td', {}, authTypes.join(' / ')),
      h('td', {}, String(u.aquariumCount)),
      h('td', {}, u.isAdmin ? h('span', { class: 'chip ok' }, 'Admin') : h('span', { class: 'chip none' }, 'Benutzer')),
      h('td', {}, fmtDate(u.createdAt)),
      h('td', {},
        h('div', { class: 'row', style: 'gap:.35rem' },
          h('button', { class: 'btn small ghost', type: 'button', onclick: () => adminUserDialog(u) }, 'Bearbeiten'),
          !isSelf ? h('button', { class: 'btn small danger', type: 'button', onclick: async () => {
            if (!confirm(`Benutzer „${u.username}“ mit allen zugehörigen Aquarien und Messwerten endgültig löschen?`)) return;
            try {
              await api(`/admin/users/${u.id}`, { method: 'DELETE' });
              toast(`Benutzer „${u.username}“ gelöscht.`);
              await viewAdmin();
            } catch (ex) { toast(ex.message); }
          } }, 'Löschen') : null
        )
      )
    );
  });

  const logData = await api('/admin/logs').catch(() => ({ logs: [], logPath: 'data/aquarium.log' }));
  const logBox = h('pre', {
    class: 'log-viewer-box',
    style: 'max-height: 320px; overflow-y: auto; background: var(--tube-bg); padding: .75rem; border: 1px solid var(--line); border-radius: 6px; font-family: monospace; font-size: .82rem; white-space: pre-wrap; word-break: break-all; line-height: 1.4;'
  }, logData.logs && logData.logs.length ? logData.logs.join('\n') : '(Keine Log-Einträge vorhanden)');

  // Automatischer Scroll nach unten
  setTimeout(() => { logBox.scrollTop = logBox.scrollHeight; }, 50);

  const btnRefreshLogs = h('button', { class: 'btn small ghost', type: 'button', onclick: async () => {
    try {
      const refreshed = await api('/admin/logs');
      logBox.textContent = refreshed.logs && refreshed.logs.length ? refreshed.logs.join('\n') : '(Keine Log-Einträge vorhanden)';
      logBox.scrollTop = logBox.scrollHeight;
      toast('Logs aktualisiert.');
    } catch (e) { toast(e.message); }
  } }, '🔄 Aktualisieren');

  const btnClearLogs = h('button', { class: 'btn small ghost danger', type: 'button', onclick: async () => {
    if (!confirm('Möchtest du die Log-Datei wirklich leeren?')) return;
    try {
      await api('/admin/logs', { method: 'DELETE' });
      logBox.textContent = '(Keine Log-Einträge vorhanden)';
      toast('Log-Datei geleert.');
    } catch (e) { toast(e.message); }
  } }, '🗑️ Log leeren');

  mount(h('div', { class: 'stack' },
    h('div', { class: 'row between' },
      h('div', {},
        h('a', { href: '#/', class: 'muted' }, '‹ Zurück zur Übersicht'),
        h('h1', { style: 'margin-top:.3rem' }, 'Benutzerverwaltung & System')
      ),
      h('button', { class: 'btn', type: 'button', onclick: () => adminUserDialog() }, 'Benutzer anlegen')
    ),
    h('div', { class: 'card stack' },
      h('div', { class: 'row between' },
        h('h2', { style: 'margin:0' }, `Registrierte Benutzer (${users.length})`),
        h('span', { class: 'muted' }, 'Admin-Rechte richten sich nach der konfigurierten E-Mail-Adresse.')
      ),
      h('div', { class: 'table-wrap' },
        h('table', {},
          h('thead', {},
            h('tr', {},
              h('th', {}, 'Benutzername'),
              h('th', {}, 'E-Mail'),
              h('th', {}, 'Anmeldung'),
              h('th', {}, 'Aquarien'),
              h('th', {}, 'Rolle'),
              h('th', {}, 'Erstellt am'),
              h('th', {}, 'Aktionen')
            )
          ),
          h('tbody', {}, rows)
        )
      )
    ),
    h('div', { class: 'card stack' },
      h('div', { class: 'row between' },
        h('div', {},
          h('h2', { style: 'margin:0' }, 'System-Logbuch & Fehlerprotokoll'),
          h('span', { class: 'muted' }, `Logdatei: ${logData.logPath || 'data/aquarium.log'}`)
        ),
        h('div', { class: 'row', style: 'gap:.5rem' }, btnRefreshLogs, btnClearLogs)
      ),
      h('p', { class: 'muted', style: 'margin:0; font-size:.85rem;' },
        'Protokolliert Systemmeldungen, Express-Fehler sowie Ereignisse des Überwachungsprozesses (Neustarts, Abstürze).'
      ),
      logBox
    )
  ));
}

function adminUserDialog(user) {
  const editing = !!user;
  const err = h('p', { class: 'error', role: 'alert' });
  const f = {
    username: h('input', { required: true, maxlength: '40', value: user?.username || '' }),
    email: h('input', { type: 'email', maxlength: '120', value: user?.email || '', placeholder: 'z. B. max@example.com' }),
    oidcSub: h('input', { maxlength: '255', value: user?.oidcSub || '', placeholder: 'z. B. Sub-ID aus Pocket ID (optional)' }),
    password: h('input', {
      type: 'password',
      autocomplete: 'new-password',
      minlength: '8',
      placeholder: editing ? 'Leer lassen für keine Änderung' : 'Mindestens 8 Zeichen',
    }),
  };

  const dlg = h('dialog', {}, h('form', { class: 'stack', method: 'dialog', onsubmit: async (e) => {
    e.preventDefault(); err.textContent = '';
    const body = {
      username: f.username.value.trim(),
      email: f.email.value.trim() || undefined,
      oidcSub: f.oidcSub.value.trim() || (editing ? null : undefined),
      password: f.password.value || undefined,
    };
    try {
      if (editing) {
        await api(`/admin/users/${user.id}`, { method: 'PUT', body });
        dlg.close();
        toast(`Benutzer „${body.username}“ aktualisiert.`);
        await viewAdmin();
      } else {
        await api('/admin/users', { method: 'POST', body });
        dlg.close();
        toast(`Benutzer „${body.username}“ angelegt.`);
        await viewAdmin();
      }
    } catch (ex) {
      err.textContent = ex.message;
    }
  } },
  h('h2', {}, editing ? `Benutzer „${user.username}“ bearbeiten` : 'Neuen Benutzer anlegen'),
  h('div', { class: 'field' }, h('label', {}, 'Benutzername'), f.username),
  h('div', { class: 'field' }, h('label', {}, 'E-Mail-Adresse'), f.email),
  h('div', { class: 'field' }, h('label', {}, 'OIDC-Benutzer-ID (sub / Pocket ID)'), f.oidcSub),
  h('div', { class: 'field' },
    h('label', {}, editing ? 'Neues Passwort (optional)' : 'Passwort (optional für OIDC, mindestens 8 Zeichen für lokale Anmeldung)'),
    f.password
  ),
  err,
  h('div', { class: 'row' },
    h('button', { class: 'btn', type: 'submit' }, editing ? 'Speichern' : 'Anlegen'),
    h('button', { class: 'btn ghost', type: 'button', onclick: () => dlg.close() }, 'Abbrechen')
  )));

  dlg.addEventListener('close', () => dlg.remove());
  document.body.append(dlg);
  dlg.showModal();
  f.username.focus();
}

/* ---------- Benutzerprofil ---------- */
async function viewProfile() {
  ME = await api('/me');
  updateTopbarUser();

  const initials = (ME.firstName ? ME.firstName[0] : (ME.username ? ME.username[0] : '?')).toUpperCase();

  // Avatar-Sektion
  const avatarErr = h('p', { class: 'error', role: 'alert' });
  const avatarImg = ME.hasAvatar
    ? h('img', { class: 'avatar-large', src: `api/me/avatar?t=${Date.now()}`, alt: ME.username })
    : h('div', { class: 'avatar-placeholder' }, initials);

  const fileInput = h('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp,image/gif', style: 'display:none' });
  const btnSelectImg = h('button', { class: 'btn small', type: 'button', onclick: () => fileInput.click() }, 'Neues Bild hochladen');
  const btnDeleteImg = ME.hasAvatar
    ? h('button', { class: 'btn small ghost danger', type: 'button', onclick: async () => {
        if (!confirm('Möchtest du dein Profilbild wirklich entfernen?')) return;
        try {
          await api('/me/avatar', { method: 'DELETE' });
          toast('Profilbild entfernt.');
          await viewProfile();
        } catch (ex) {
          avatarErr.textContent = ex.message;
        }
      } }, 'Bild entfernen')
    : null;

  fileInput.addEventListener('change', () => {
    const file = fileInput.files[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      avatarErr.textContent = 'Das ausgewählte Bild ist größer als 5 MB.';
      fileInput.value = '';
      return;
    }
    const reader = new FileReader();
    reader.onload = async (ev) => {
      avatarErr.textContent = '';
      try {
        await api('/me/avatar', { method: 'POST', body: { image: ev.target.result } });
        toast('Profilbild aktualisiert.');
        await viewProfile();
      } catch (ex) {
        avatarErr.textContent = ex.message;
      }
    };
    reader.readAsDataURL(file);
  });

  const avatarCard = h('div', { class: 'card stack' },
    h('h2', {}, 'Profilbild'),
    h('div', { class: 'profile-avatar-row' },
      avatarImg,
      h('div', { class: 'stack', style: 'gap:.5rem' },
        h('div', { class: 'row' }, btnSelectImg, btnDeleteImg),
        h('p', { class: 'muted', style: 'margin:0' }, 'Erlaubt sind JPG, PNG, WebP und GIF bis max. 5 MB.'),
        fileInput,
        avatarErr
      )
    )
  );

  // Formular: Persönliche Daten
  const profileErr = h('p', { class: 'error', role: 'alert' });
  const fUsername = h('input', { required: true, maxlength: '40', value: ME.username });
  const fFirstName = h('input', { maxlength: '100', value: ME.firstName || '', placeholder: 'z. B. Max' });
  const fLastName = h('input', { maxlength: '100', value: ME.lastName || '', placeholder: 'z. B. Mustermann' });
  const fBio = h('textarea', { maxlength: '1000', placeholder: 'Erzähle etwas über deine Aquarien oder dein Hobby...' }, ME.bio || '');
  const fEmail = h('input', { type: 'email', maxlength: '120', value: ME.email || '', placeholder: 'z. B. max@example.com' });

  const profileForm = h('form', { class: 'card stack', onsubmit: async (e) => {
    e.preventDefault();
    profileErr.textContent = '';
    const body = {
      username: fUsername.value.trim(),
      firstName: fFirstName.value.trim() || '',
      lastName: fLastName.value.trim() || '',
      bio: fBio.value.trim() || '',
      email: fEmail.value.trim() || null,
    };
    try {
      const res = await api('/me', { method: 'PUT', body });
      ME = res.user;
      updateTopbarUser();
      toast('Profil erfolgreich gespeichert.');
      await viewProfile();
    } catch (ex) {
      profileErr.textContent = ex.message;
    }
  } },
    h('h2', {}, 'Persönliche Daten'),
    h('div', { class: 'field' }, h('label', {}, 'Benutzername'), fUsername),
    h('div', { class: 'grid2' },
      h('div', { class: 'field' }, h('label', {}, 'Vorname'), fFirstName),
      h('div', { class: 'field' }, h('label', {}, 'Nachname'), fLastName)
    ),
    h('div', { class: 'field' }, h('label', {}, 'Über mich'), fBio),
    h('div', { class: 'field' }, h('label', {}, 'E-Mail-Adresse'), fEmail),
    profileErr,
    h('div', {}, h('button', { class: 'btn', type: 'submit' }, 'Profil speichern'))
  );

  // Passwort-Sektion
  let passwordCard = null;
  if (ME.hasPassword) {
    const pwErr = h('p', { class: 'error', role: 'alert' });
    const fCurPw = h('input', { type: 'password', autocomplete: 'current-password', required: true });
    const fNewPw = h('input', { type: 'password', autocomplete: 'new-password', required: true, minlength: '8' });
    const pwForm = h('form', { class: 'card stack', onsubmit: async (e) => {
      e.preventDefault();
      pwErr.textContent = '';
      try {
        await api('/password', { method: 'POST', body: { current: fCurPw.value, next: fNewPw.value } });
        fCurPw.value = '';
        fNewPw.value = '';
        toast('Passwort erfolgreich geändert.');
      } catch (ex) {
        pwErr.textContent = ex.message;
      }
    } },
      h('h2', {}, 'Passwort ändern'),
      h('div', { class: 'field' }, h('label', {}, 'Aktuelles Passwort'), fCurPw),
      h('div', { class: 'field' }, h('label', {}, 'Neues Passwort (mindestens 8 Zeichen)'), fNewPw),
      pwErr,
      h('div', {}, h('button', { class: 'btn', type: 'submit' }, 'Passwort ändern'))
    );
    passwordCard = pwForm;
  }

  // OIDC-Sektion
  let oidcCard = null;
  if (ME.oidcEnabled) {
    const oidcErr = h('p', { class: 'error', role: 'alert' });
    const providerName = ME.oidcProviderName || 'Pocket ID';
    let oidcBody;
    if (ME.hasOidc) {
      oidcBody = h('div', { class: 'stack', style: 'gap:.75rem' },
        h('p', {}, `Dieses Konto ist erfolgreich mit `, h('strong', {}, providerName), ` verknüpft.`),
        ME.hasPassword
          ? h('div', {},
              h('button', { class: 'btn small ghost danger', type: 'button', onclick: async () => {
                if (!confirm(`Möchtest du die Verknüpfung mit ${providerName} wirklich aufheben?`)) return;
                try {
                  await api('/me/unlink-oidc', { method: 'POST' });
                  toast(`Verknüpfung mit ${providerName} aufgehoben.`);
                  await viewProfile();
                } catch (ex) {
                  oidcErr.textContent = ex.message;
                }
              } }, 'Verknüpfung trennen')
            )
          : h('p', { class: 'muted' }, 'Da für dieses Konto kein lokales Passwort existiert, kann die Verknüpfung nicht getrennt werden.')
      );
    } else {
      oidcBody = h('div', { class: 'stack', style: 'gap:.75rem' },
        h('p', {}, `Dieses Konto ist noch nicht mit `, h('strong', {}, providerName), ` verknüpft. Du kannst es jetzt verbinden, um dich künftig per Single Sign-On anzumelden.`),
        h('div', {}, h('a', { class: 'btn', href: 'auth/link' }, `Mit ${providerName} verknüpfen`))
      );
    }

    oidcCard = h('div', { class: 'card stack' },
      h('h2', {}, `${providerName} / OIDC-Verknüpfung`),
      oidcBody,
      oidcErr
    );
  }

  // Testsuite & Wassertests Sektion
  const suites = CONFIG.suites || [];
  let userSuiteId = ME.selectedSuite || CONFIG.defaultSuiteId || 'jbl-pro';
  let curSuite = suites.find((s) => s.id === userSuiteId) || CONFIG.currentSuite || suites[0];
  let userTests = Array.isArray(ME.selectedTests) ? [...ME.selectedTests] : curSuite.tests.map((t) => t.key);

  const testsSuiteSelect = h('select', {},
    suites.map((s) => h('option', { value: s.id, selected: s.id === curSuite.id }, s.name))
  );

  const testListDiv = h('div', { class: 'stack', style: 'gap:.5rem; margin-top:.5rem' });

  const renderSuiteTests = () => {
    testListDiv.replaceChildren(
      h('p', { class: 'muted', style: 'margin:0' }, curSuite.description),
      h('div', { class: 'picker', style: 'margin-top:.4rem' },
        curSuite.tests.map((t) =>
          h('label', {},
            h('input', {
              type: 'checkbox',
              checked: userTests.includes(t.key),
              onchange: (e) => {
                userTests = e.target.checked ? [...new Set([...userTests, t.key])] : userTests.filter((k) => k !== t.key);
              }
            }),
            t.name + (t.wait ? ` (${mmss(t.wait)})` : '')
          )
        )
      )
    );
  };

  testsSuiteSelect.addEventListener('change', (e) => {
    const found = suites.find((s) => s.id === e.target.value);
    if (!found) return;
    curSuite = found;
    userSuiteId = found.id;
    userTests = found.tests.map((t) => t.key);
    renderSuiteTests();
  });

  const testSaveErr = h('p', { class: 'error', role: 'alert' });
  const testSuiteCard = h('form', { class: 'card stack', onsubmit: async (e) => {
    e.preventDefault();
    testSaveErr.textContent = '';
    try {
      const res = await api('/me/tests', { method: 'PUT', body: { selectedSuite: curSuite.id, selectedTests: userTests } });
      ME.selectedSuite = res.selectedSuite;
      ME.selectedTests = res.selectedTests;
      localStorage.setItem(`tests:${ME.id}`, JSON.stringify(res.selectedTests));
      CONFIG = await api('/config');
      toast('Testsuite und Wassertests gespeichert.');
    } catch (ex) {
      testSaveErr.textContent = ex.message;
    }
  } },
    h('h2', {}, 'Wassertests & Testsuite'),
    h('p', { class: 'muted', style: 'margin:0' }, 'Wähle deine bevorzugte Testsuite (Standard: JBL Pro Tröpfchentest) und hake die Tests an, die du besitzt oder routinemäßig messen möchtest.'),
    h('div', { class: 'field' }, h('label', {}, 'Aktive Testsuite'), testsSuiteSelect),
    testListDiv,
    testSaveErr,
    h('div', { class: 'row' },
      h('button', { class: 'btn', type: 'submit' }, 'Testauswahl speichern'),
      h('button', { class: 'btn ghost', type: 'button', onclick: () => {
        userTests = curSuite.tests.map((t) => t.key);
        renderSuiteTests();
      } }, 'Alle Tests auswählen'),
      h('button', { class: 'btn ghost', type: 'button', onclick: () => {
        userTests = [];
        renderSuiteTests();
      } }, 'Keine auswählen')
    )
  );
  renderSuiteTests();

  // Farbschema / Theme Sektion
  const currentTheme = getThemeSetting();
  const themeOptions = [
    { key: 'system', icon: '💻', title: 'Systemstandard', desc: 'Passt sich automatisch deinen Betriebssystem-Einstellungen an.' },
    { key: 'light', icon: '☀️', title: 'Heller Modus', desc: 'Helles, klares Farbschema für den Tag.' },
    { key: 'dark', icon: '🌙', title: 'Dunkler Modus', desc: 'Augenschonendes, kontrastreiches dunkles Farbschema.' },
  ];

  const themeOptionElements = [];
  const themeOptionsContainer = h('div', { class: 'theme-options' },
    themeOptions.map((opt) => {
      const card = h('div', {
        class: `theme-option ${currentTheme === opt.key ? 'active' : ''}`,
        role: 'button',
        tabindex: '0',
        onclick: () => {
          applyTheme(opt.key, true);
          themeOptionElements.forEach(({ el, key }) => {
            el.classList.toggle('active', key === opt.key);
          });
        },
        onkeydown: (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            card.click();
          }
        }
      },
        h('div', { class: 'theme-option-head' },
          h('span', { class: 'theme-option-icon' }, opt.icon),
          h('span', {}, opt.title)
        ),
        h('p', { class: 'theme-option-desc' }, opt.desc)
      );
      themeOptionElements.push({ el: card, key: opt.key });
      return card;
    })
  );

  const themeCard = h('div', { class: 'card stack' },
    h('h2', {}, 'Erscheinungsbild / Farbschema'),
    h('p', { class: 'muted', style: 'margin:0' }, 'Wähle dein bevorzugtes Design oder nutze den automatischen Modus entsprechend deinen Systemeinstellungen.'),
    themeOptionsContainer
  );

  mount(h('div', { class: 'stack' },
    h('div', { class: 'row between' },
      h('div', {},
        h('a', { href: '#/', class: 'muted' }, '‹ Zurück zur Übersicht'),
        h('h1', { style: 'margin-top:.3rem' }, 'Mein Profil')
      )
    ),
    avatarCard,
    profileForm,
    themeCard,
    testSuiteCard,
    passwordCard,
    oidcCard
  ));
}

/* ---------- Start ---------- */
(async () => {
  try { await start(); } catch (e) { showAuth(); }
})();

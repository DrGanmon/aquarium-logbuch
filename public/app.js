'use strict';

const $app = document.getElementById('app');
const $topbar = document.getElementById('topbar');
let CONFIG = null;
let ME = null;
let cleanups = [];

const GRAPH_RANGE_STORAGE_KEY = 'aquarium_graph_range';
const GRAPH_CUSTOM_FROM_KEY = 'aquarium_graph_custom_from';
const GRAPH_CUSTOM_TO_KEY = 'aquarium_graph_custom_to';

function getInitialGraphRange() {
  const saved = localStorage.getItem(GRAPH_RANGE_STORAGE_KEY);
  if (saved) return saved;
  if (ME?.defaultGraphRange) return String(ME.defaultGraphRange);
  return '90'; // 3 Monate Standard
}

let RANGE = getInitialGraphRange();
let CUSTOM_FROM = localStorage.getItem(GRAPH_CUSTOM_FROM_KEY) || '';
let CUSTOM_TO = localStorage.getItem(GRAPH_CUSTOM_TO_KEY) || '';

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

function showImageModal({ src, title = 'Bildvorschau', caption = null }) {
  const d = h('dialog', { class: 'stack wide', style: 'max-width: 760px; text-align: center;' });
  const close = () => { d.close(); d.remove(); };
  d.replaceChildren(
    h('div', { class: 'row between', style: 'align-items: center;' },
      h('h3', { style: 'margin:0' }, title),
      h('button', { class: 'btn small ghost', type: 'button', onclick: close, 'aria-label': 'Schließen' }, '✕')
    ),
    h('div', { style: 'margin: .5rem 0' },
      h('img', { class: 'image-lightbox-img', src, alt: title })
    ),
    caption ? h('p', { class: 'muted', style: 'margin: .3rem 0 0; font-size: .95rem;' }, caption) : null,
    h('div', { class: 'row between', style: 'margin-top: .8rem;' },
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
  const hash = location.hash.replace(/^#\/?/, '');
  const [routePath, queryString] = hash.split('?');
  const params = new URLSearchParams(queryString || location.search);
  const token = params.get('token') || '';

  if (routePath === 'verify-email') {
    return await viewVerifyEmail(token);
  }
  if (routePath === 'reset-password') {
    return await viewResetPassword(token);
  }
  if (routePath === 'register') {
    return showAuth('register', {
      inviteCode: params.get('invite') || params.get('code') || '',
      email: params.get('email') || '',
    });
  }
  if (routePath === 'forgot-password') {
    return showAuth('forgot');
  }
  if (routePath === 'share-invitation' || routePath === 'invite/share') {
    return await viewShareInvitation(token);
  }
  if (routePath === 'delete-account' || routePath === 'confirm-delete-account') {
    return await viewDeleteAccount(token);
  }
  if (routePath === 'impressum' || routePath === 'imprint') {
    return await viewLegal('impressum');
  }
  if (routePath === 'datenschutz' || routePath === 'privacy') {
    return await viewLegal('datenschutz');
  }
  if (routePath === 'lizenzen' || routePath === 'licenses' || routePath === 'copyright') {
    return await viewLegal('licenses');
  }
  if (routePath === 'kontakt' || routePath === 'contact') {
    return await viewLegal('kontakt');
  }

  if (!ME) return showAuth();
  const parts = routePath.split('/').filter(Boolean);
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

async function showAuth(mode = 'login', options = {}) {
  $topbar.hidden = true;
  let info = { registration: true, mode: 'open', isInviteOnly: false, isClosed: false, localLogin: true, oidc: false, oidcName: '' };
  try { info = await (await fetch('api/registration')).json(); } catch (e) { /* Standard */ }
  const registration = info.registration && !info.isClosed;
  const isInviteOnly = Boolean(info.isInviteOnly);
  const isClosed = Boolean(info.isClosed);
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
    h('div', { style: 'display:flex; align-items:center; gap:.5rem;' },
      h('img', { src: 'favicon-32x32.png', alt: 'Logo', style: 'width:28px; height:28px; border-radius:6px;' }),
      h('p', { class: 'muted', style: 'margin:0; font-weight:600;' }, 'Aquarium-Logbuch')
    ),
    themeAuthBtn
  );

  if (!info.localLogin && mode !== 'forgot') {
    mount(h('div', { class: 'auth' }, headerRow,
      h('div', { class: 'card stack' }, h('h1', {}, 'Anmelden'), err, oidcBtn)));
    oidcBtn?.focus();
    return;
  }

  // Modus: Registrierung geschlossen
  if (mode === 'register' && (isClosed || !info.registration)) {
    mount(h('div', { class: 'auth' }, headerRow,
      h('div', { class: 'card stack' },
        h('h1', {}, '⛔ Registrierung geschlossen'),
        h('div', { class: 'compat-box warn' },
          h('p', { style: 'margin:0;' }, 'Die Registrierung neuer Benutzerkonten ist derzeit geschlossen. Neue Einladungen oder Registrierungen sind aktuell nicht möglich.')
        ),
        h('button', { class: 'btn', type: 'button', onclick: () => { location.hash = '#/'; showAuth('login'); } }, 'Zurück zur Anmeldung')
      )
    ));
    return;
  }

  // Modus: Passwort vergessen
  if (mode === 'forgot') {
    const identInput = h('input', { id: 'ident', placeholder: 'E-Mail-Adresse oder Benutzername', required: true });
    const successMsg = h('div', { class: 'compat-box info', style: 'display:none' });
    const form = h('form', { class: 'card stack', onsubmit: async (e) => {
      e.preventDefault(); err.textContent = '';
      try {
        const res = await api('/forgot-password', {
          method: 'POST',
          body: { identifier: identInput.value.trim() },
        });
        successMsg.textContent = res.message || 'E-Mail zum Zurücksetzen wurde versendet.';
        successMsg.style.display = 'block';
        identInput.value = '';
      } catch (ex) {
        err.textContent = ex.message;
      }
    } },
    h('h1', {}, 'Passwort zurücksetzen'),
    h('p', { class: 'muted', style: 'margin:0 0 .5rem;' }, 'Gib deine E-Mail-Adresse oder deinen Benutzernamen ein. Wir senden dir einen Link, mit dem du ein neues Passwort festlegen kannst.'),
    h('div', { class: 'field' }, h('label', { for: 'ident' }, 'E-Mail oder Benutzername'), identInput),
    err,
    successMsg,
    h('button', { class: 'btn', type: 'submit' }, 'Link anfordern'),
    h('button', { class: 'btn ghost', type: 'button', onclick: () => { location.hash = '#/'; showAuth('login'); } }, 'Zurück zur Anmeldung')
    );
    mount(h('div', { class: 'auth' }, headerRow, form));
    identInput.focus();
    return;
  }

  // Modus: Login oder Register
  const user = h('input', { id: 'u', autocomplete: 'username', required: true });
  const mail = mode === 'register' ? h('input', { id: 'e', type: 'email', autocomplete: 'email', required: true, value: options.email || '' }) : null;
  const pass = h('input', { id: 'p', type: 'password', autocomplete: mode === 'login' ? 'current-password' : 'new-password', required: true, minlength: mode === 'login' ? null : '8' });
  const inviteInput = mode === 'register' ? h('input', {
    id: 'inv',
    value: options.inviteCode || '',
    placeholder: isInviteOnly ? 'z. B. AQU-9F2A-88CD' : 'Einladungscode (optional)',
    required: isInviteOnly,
  }) : null;

  const resendBox = h('div', { style: 'display:none; margin-top:.5rem;' });

  const form = h('form', { class: 'card stack', onsubmit: async (e) => {
    e.preventDefault(); err.textContent = ''; resendBox.style.display = 'none';
    try {
      const body = { username: user.value, password: pass.value };
      if (mode === 'register') {
        if (mail && mail.value.trim()) body.email = mail.value.trim();
        if (inviteInput && inviteInput.value.trim()) body.inviteCode = inviteInput.value.trim();
      }
      const res = await api(mode === 'login' ? '/login' : '/register', { method: 'POST', body });
      if (mode === 'register' && res.needsVerification) {
        mount(h('div', { class: 'auth' }, headerRow,
          h('div', { class: 'card stack' },
            h('h1', {}, '🎉 Fast geschafft!'),
            h('div', { class: 'compat-box info' },
              h('p', { style: 'margin:0 0 .5rem;' }, h('strong', {}, 'Bestätigungs-E-Mail versendet!')),
              h('p', { style: 'margin:0;' }, `Wir haben einen Aktivierungslink an `, h('strong', {}, res.email || mail.value), ` gesendet. Bitte öffne den Link in der E-Mail, um dein Konto zu bestätigen.`)
            ),
            h('p', { class: 'muted' }, 'Prüfe bitte auch deinen Spam-Ordner, falls die Nachricht nicht innerhalb weniger Minuten ankommt.'),
            h('button', { class: 'btn', type: 'button', onclick: () => { location.hash = '#/'; showAuth('login'); } }, 'Zur Anmeldung')
          )
        ));
        return;
      }
      await start();
    } catch (ex) {
      err.textContent = ex.message;
      if (ex.message && ex.message.includes('bestätige zuerst deine E-Mail')) {
        const usernameVal = user.value.trim();
        resendBox.replaceChildren(
          h('button', {
            class: 'btn small ghost',
            type: 'button',
            onclick: async () => {
              try {
                const r = await api('/resend-verification', { method: 'POST', body: { identifier: usernameVal } });
                toast(r.message || 'Bestätigungs-E-Mail versendet.');
              } catch (errResend) {
                toast(errResend.message);
              }
            }
          }, '📨 Bestätigungs-Link erneut senden')
        );
        resendBox.style.display = 'block';
      }
    }
  } },
  h('h1', {}, mode === 'login' ? 'Anmelden' : (isInviteOnly ? 'Einladung einlösen & Konto erstellen' : 'Konto erstellen')),
  isInviteOnly && mode === 'register' ? h('div', { class: 'compat-box info', style: 'margin-bottom:.5rem;' },
    h('p', { style: 'margin:0; font-size:.9rem;' }, '🔑 Für die Registrierung ist ein gültiger Einladungscode erforderlich.')
  ) : null,
  h('div', { class: 'field' }, h('label', { for: 'u' }, 'Benutzername'), user),
  mail ? h('div', { class: 'field' }, h('label', { for: 'e' }, 'E-Mail-Adresse (für Verifizierung & Passwort-Reset)'), mail) : null,
  inviteInput ? h('div', { class: 'field' },
    h('label', { for: 'inv' }, isInviteOnly ? 'Einladungscode / Registrierungscode' : 'Einladungscode (optional)'),
    inviteInput
  ) : null,
  h('div', { class: 'field' },
    h('div', { class: 'row between', style: 'align-items:baseline;' },
      h('label', { for: 'p' }, mode === 'login' ? 'Passwort' : 'Passwort (mindestens 8 Zeichen)'),
      mode === 'login' ? h('a', {
        href: '#/forgot-password',
        style: 'font-size:.85rem; color:var(--primary);',
        onclick: (e) => { e.preventDefault(); location.hash = '#/forgot-password'; showAuth('forgot'); }
      }, 'Passwort vergessen?') : null
    ),
    pass
  ),
  err,
  resendBox,
  h('button', { class: 'btn', type: 'submit' }, mode === 'login' ? 'Anmelden' : 'Konto erstellen'),
  mode === 'login' && oidcBtn ? [h('p', { class: 'muted' }, 'oder'), oidcBtn] : null,
  registration && h('button', {
    class: 'btn ghost',
    type: 'button',
    onclick: () => {
      if (mode === 'login') {
        location.hash = '#/register';
        showAuth('register');
      } else {
        location.hash = '#/';
        showAuth('login');
      }
    }
  }, mode === 'login' ? (isInviteOnly ? 'Einladung einlösen / Registrieren' : 'Neues Konto erstellen') : 'Ich habe schon ein Konto'));
  mount(h('div', { class: 'auth' }, headerRow, form));
  user.focus();
}

async function viewVerifyEmail(token) {
  $topbar.hidden = true;
  const headerRow = h('div', { class: 'row between', style: 'margin-bottom:.5rem; align-items:center;' },
    h('p', { class: 'muted', style: 'margin:0' }, 'Wasserwerte im Blick behalten.')
  );

  if (!token) {
    mount(h('div', { class: 'auth' }, headerRow,
      h('div', { class: 'card stack' },
        h('h1', {}, '❌ Ungültiger Link'),
        h('p', { class: 'error' }, 'Es wurde kein Bestätigungstoken übergeben.'),
        h('a', { class: 'btn', href: '#/' }, 'Zur Startseite')
      )
    ));
    return;
  }

  mount(h('div', { class: 'auth' }, headerRow,
    h('div', { class: 'card stack' },
      h('h1', {}, 'E-Mail-Adresse bestätigen'),
      h('p', { class: 'muted' }, 'Einen Moment bitte, deine E-Mail-Adresse wird überprüft...')
    )
  ));

  try {
    const res = await api('/verify-email', { method: 'POST', body: { token } });
    mount(h('div', { class: 'auth' }, headerRow,
      h('div', { class: 'card stack' },
        h('h1', {}, '✅ Erfolgreich bestätigt!'),
        h('div', { class: 'compat-box ok' },
          h('p', { style: 'margin:0;' }, res.message || 'Deine E-Mail-Adresse wurde erfolgreich bestätigt. Dein Konto ist nun aktiv.')
        ),
        h('button', { class: 'btn', type: 'button', onclick: () => { location.hash = '#/'; showAuth('login'); } }, 'Jetzt anmelden')
      )
    ));
  } catch (err) {
    const resendIdent = h('input', { placeholder: 'E-Mail oder Benutzername' });
    const resendStatus = h('p', { class: 'muted', style: 'display:none;' });
    mount(h('div', { class: 'auth' }, headerRow,
      h('div', { class: 'card stack' },
        h('h1', {}, '❌ Bestätigung fehlgeschlagen'),
        h('p', { class: 'error' }, err.message),
        h('div', { class: 'stack', style: 'margin-top:1rem; gap:.5rem;' },
          h('strong', {}, 'Neuen Bestätigungslink anfordern:'),
          resendIdent,
          resendStatus,
          h('button', {
            class: 'btn small',
            type: 'button',
            onclick: async () => {
              if (!resendIdent.value.trim()) return;
              try {
                const r = await api('/resend-verification', { method: 'POST', body: { identifier: resendIdent.value.trim() } });
                resendStatus.textContent = r.message || 'E-Mail versendet.';
                resendStatus.style.display = 'block';
              } catch (ex) {
                resendStatus.textContent = ex.message;
                resendStatus.style.display = 'block';
              }
            }
          }, 'Link erneut anfordern')
        ),
        h('button', { class: 'btn ghost', type: 'button', style: 'margin-top:.5rem;', onclick: () => { location.hash = '#/'; showAuth('login'); } }, 'Zurück zur Anmeldung')
      )
    ));
  }
}

async function viewResetPassword(token) {
  $topbar.hidden = true;
  const headerRow = h('div', { class: 'row between', style: 'margin-bottom:.5rem; align-items:center;' },
    h('p', { class: 'muted', style: 'margin:0' }, 'Wasserwerte im Blick behalten.')
  );

  if (!token) {
    mount(h('div', { class: 'auth' }, headerRow,
      h('div', { class: 'card stack' },
        h('h1', {}, '❌ Ungültiger Link'),
        h('p', { class: 'error' }, 'Es wurde kein Token zum Zurücksetzen des Passworts übergeben.'),
        h('a', { class: 'btn', href: '#/' }, 'Zur Startseite')
      )
    ));
    return;
  }

  const p1 = h('input', { type: 'password', required: true, minlength: '8', placeholder: 'Mindestens 8 Zeichen' });
  const p2 = h('input', { type: 'password', required: true, minlength: '8', placeholder: 'Passwort wiederholen' });
  const err = h('p', { class: 'error', role: 'alert' });

  const form = h('form', { class: 'card stack', onsubmit: async (e) => {
    e.preventDefault(); err.textContent = '';
    if (p1.value !== p2.value) {
      err.textContent = 'Die eingegebenen Passwörter stimmen nicht überein.';
      return;
    }
    try {
      const res = await api('/reset-password', {
        method: 'POST',
        body: { token, password: p1.value },
      });
      mount(h('div', { class: 'auth' }, headerRow,
        h('div', { class: 'card stack' },
          h('h1', {}, '🎉 Passwort geändert!'),
          h('div', { class: 'compat-box ok' },
            h('p', { style: 'margin:0;' }, res.message || 'Dein Passwort wurde erfolgreich aktualisiert. Du kannst dich jetzt damit anmelden.')
          ),
          h('button', { class: 'btn', type: 'button', onclick: () => { location.hash = '#/'; showAuth('login'); } }, 'Jetzt anmelden')
        )
      ));
    } catch (ex) {
      err.textContent = ex.message;
    }
  } },
  h('h1', {}, 'Neues Passwort festlegen'),
  h('p', { class: 'muted', style: 'margin:0 0 .5rem;' }, 'Gib bitte dein neues Passwort ein.'),
  h('div', { class: 'field' }, h('label', {}, 'Neues Passwort'), p1),
  h('div', { class: 'field' }, h('label', {}, 'Passwort wiederholen'), p2),
  err,
  h('button', { class: 'btn', type: 'submit' }, 'Passwort speichern'),
  h('button', { class: 'btn ghost', type: 'button', onclick: () => { location.hash = '#/'; showAuth('login'); } }, 'Abbrechen')
  );

  mount(h('div', { class: 'auth' }, headerRow, form));
  p1.focus();
}

async function viewDeleteAccount(token) {
  $topbar.hidden = true;
  const headerRow = h('div', { class: 'row between', style: 'margin-bottom:.5rem; align-items:center;' },
    h('p', { class: 'muted', style: 'margin:0' }, 'Wasserwerte im Blick behalten.')
  );

  if (!token) {
    mount(h('div', { class: 'auth' }, headerRow,
      h('div', { class: 'card stack' },
        h('h1', {}, '❌ Ungültiger Link'),
        h('p', { class: 'error' }, 'Es wurde kein Bestätigungstoken zum Löschen des Kontos übergeben.'),
        h('a', { class: 'btn', href: '#/' }, 'Zur Startseite')
      )
    ));
    return;
  }

  const err = h('p', { class: 'error', role: 'alert' });

  const confirmCard = h('div', { class: 'card stack' },
    h('h1', { style: 'color: var(--coral);' }, '🗑️ Konto endgültig löschen'),
    h('div', { class: 'compat-box danger' },
      h('p', { style: 'margin:0; font-weight:600;' }, '⚠️ Letzte Warnung:'),
      h('p', { style: 'margin:.4rem 0 0;' }, 'Wenn du jetzt auf „Konto jetzt endgültig löschen“ klickst, werden dein Benutzerkonto sowie alle deine Aquarien, Fotos, Messwerte, Alarme, Pflegemaßnahmen und Freigaben unwiderruflich und sofort gelöscht.')
    ),
    err,
    h('div', { class: 'row between', style: 'margin-top: .5rem;' },
      h('a', { class: 'btn ghost', href: '#/' }, 'Abbrechen'),
      h('button', {
        class: 'btn danger',
        type: 'button',
        onclick: async () => {
          err.textContent = '';
          try {
            const res = await api('/confirm-delete-account', {
              method: 'POST',
              body: { token },
            });
            ME = null;
            $topbar.hidden = true;
            mount(h('div', { class: 'auth' }, headerRow,
              h('div', { class: 'card stack' },
                h('h1', {}, '👋 Konto erfolgreich gelöscht'),
                h('div', { class: 'compat-box ok' },
                  h('p', { style: 'margin:0;' }, res.message || 'Dein Benutzerkonto wurde vollständig gelöscht.')
                ),
                h('button', { class: 'btn', type: 'button', onclick: () => { location.hash = '#/'; showAuth('login'); } }, 'Zur Startseite')
              )
            ));
          } catch (ex) {
            err.textContent = ex.message;
          }
        }
      }, 'Konto jetzt endgültig löschen')
    )
  );

  mount(h('div', { class: 'auth' }, headerRow, confirmCard));
}

async function viewShareInvitation(token) {
  $topbar.hidden = !ME;
  if (ME) updateTopbarUser();

  const headerRow = h('div', { class: 'row between', style: 'margin-bottom:.5rem; align-items:center;' },
    h('p', { class: 'muted', style: 'margin:0' }, 'Wasserwerte im Blick behalten.')
  );

  if (!token) {
    mount(h('div', { class: 'auth' }, headerRow,
      h('div', { class: 'card stack' },
        h('h1', {}, '⚠️ Ungültiger Link'),
        h('p', { class: 'error' }, 'Es wurde kein Einladungstoken übergeben.'),
        h('a', { class: 'btn', href: '#/' }, 'Zur Startseite')
      )
    ));
    return;
  }

  try {
    const info = await api(`/shares/invite/${encodeURIComponent(token)}`);
    const acceptBtn = h('button', { class: 'btn', type: 'button' }, 'Freigabe annehmen');
    const declineBtn = h('button', { class: 'btn ghost', type: 'button' }, 'Ablehnen');
    const err = h('p', { class: 'error', role: 'alert' });

    acceptBtn.onclick = async () => {
      acceptBtn.disabled = true;
      try {
        const res = await api('/shares/accept', { method: 'POST', body: { token } });
        toast(res.message || 'Freigabe erfolgreich angenommen!');
        CURRENT_AQ_TAB = 'shared';
        localStorage.setItem('aquarium_list_tab', 'shared');
        location.hash = `#/a/${res.aquarium_id}`;
      } catch (ex) {
        err.textContent = ex.message;
        acceptBtn.disabled = false;
      }
    };

    declineBtn.onclick = async () => {
      if (!confirm('Möchtest du diese Freigabe-Einladung wirklich ablehnen?')) return;
      declineBtn.disabled = true;
      try {
        await api('/shares/decline', { method: 'POST', body: { token } });
        toast('Einladung abgelehnt.');
        location.hash = '#/';
      } catch (ex) {
        err.textContent = ex.message;
        declineBtn.disabled = false;
      }
    };

    mount(h('div', { class: 'auth', style: 'max-width: 540px; margin: 2rem auto;' },
      h('div', { class: 'card stack' },
        h('div', { style: 'text-align:center;' },
          h('img', { src: 'icon-192.png', alt: 'Logo', style: 'width:64px; height:64px; border-radius:14px; margin-bottom:1rem;' }),
          h('h1', {}, '🐠 Aquarium-Freigabe'),
          h('p', { class: 'muted' }, `${info.owner_username} hat ein Aquarium mit dir geteilt`)
        ),
        h('div', { class: 'compat-box info stack', style: 'gap:.4rem;' },
          h('div', { style: 'display:flex; justify-content:space-between;' },
            h('strong', {}, 'Aquarium:'),
            h('span', {}, info.aquarium_name)
          ),
          h('div', { style: 'display:flex; justify-content:space-between;' },
            h('strong', {}, 'Wasserart & Volumen:'),
            h('span', {}, `${CONFIG?.waterTypes?.[info.water_type] || info.water_type}${info.volume_l ? ' · ' + info.volume_l + ' l' : ''}`)
          ),
          h('div', { style: 'display:flex; justify-content:space-between;' },
            h('strong', {}, 'Berechtigung:'),
            h('span', {}, info.roleLabel || (info.role === 'write' ? 'Schreibrechte' : 'Leserechte'))
          ),
          h('div', { style: 'display:flex; justify-content:space-between;' },
            h('strong', {}, 'Geteilt für:'),
            h('span', {}, info.target_username || info.target_email || 'Dich')
          )
        ),
        err,
        ME ? h('div', { class: 'row between', style: 'margin-top:1rem;' },
          declineBtn,
          acceptBtn
        ) : h('div', { class: 'stack', style: 'margin-top:1rem;' },
          h('p', { class: 'muted', style: 'text-align:center;' }, 'Bitte melde dich an oder erstelle ein Konto, um diese Freigabe anzunehmen:'),
          h('div', { class: 'row center', style: 'gap:.75rem;' },
            h('a', { class: 'btn', href: '#/', onclick: () => showAuth('login') }, 'Anmelden'),
            h('a', { class: 'btn ghost', href: '#/register', onclick: () => showAuth('register') }, 'Registrieren')
          )
        )
      )
    ));
  } catch (ex) {
    mount(h('div', { class: 'auth' }, headerRow,
      h('div', { class: 'card stack' },
        h('h1', {}, '⚠️ Einladung nicht verfügbar'),
        h('p', { class: 'error' }, ex.message),
        h('a', { class: 'btn', href: '#/' }, 'Zur Startseite')
      )
    ));
  }
}

async function viewLegal(requestedTab = 'impressum') {
  let activeTab = requestedTab || 'impressum';
  if (activeTab === 'imprint') activeTab = 'impressum';
  if (activeTab === 'privacy') activeTab = 'datenschutz';
  if (activeTab === 'licenses' || activeTab === 'copyright') activeTab = 'licenses';
  if (activeTab === 'contact') activeTab = 'kontakt';

  $topbar.hidden = !ME;
  if (ME) updateTopbarUser();

  let legalInfo = { contactEmail: 'dr@ganmon.org', imprintEmail: 'dr@ganmon.org' };
  try {
    const data = await api('/legal-info');
    if (data) legalInfo = data;
  } catch (e) {
    // Fallback auf Standardwerte
  }
  const contactMail = legalInfo.contactEmail || 'dr@ganmon.org';
  const imprintMail = legalInfo.imprintEmail || contactMail;

  const currentTheme = getThemeSetting();
  const themeAuthIcon = currentTheme === 'system' ? '🌓' : (currentTheme === 'dark' ? '🌙' : '☀️');
  const themeAuthLabel = currentTheme === 'system' ? 'System' : (currentTheme === 'dark' ? 'Dunkel' : 'Hell');
  const themeAuthBtn = !ME ? h('button', {
    class: 'btn small ghost',
    type: 'button',
    title: `Farbschema: ${themeAuthLabel} (klicken zum Umschalten)`,
    onclick: () => {
      toggleTheme();
      const nextTheme = getThemeSetting();
      themeAuthBtn.textContent = (nextTheme === 'system' ? '🌓 System' : (nextTheme === 'dark' ? '🌙 Dunkel' : '☀️ Hell'));
    }
  }, `${themeAuthIcon} ${themeAuthLabel}`) : null;

  const backLink = ME ? h('a', { class: 'btn ghost small', href: '#/' }, '← Zurück zur Übersicht')
                      : h('a', { class: 'btn ghost small', href: '#/', onclick: (e) => { e.preventDefault(); location.hash = '#/'; showAuth('login'); } }, '← Zurück zur Anmeldung');

  const topNavRow = h('div', { class: 'row between', style: 'margin-bottom:1rem; align-items:center;' },
    backLink,
    !ME ? h('div', { style: 'display:flex; align-items:center; gap:.5rem;' },
      h('img', { src: 'favicon-32x32.png', alt: 'Logo', style: 'width:24px; height:24px; border-radius:6px;' }),
      h('span', { class: 'muted', style: 'font-weight:600;' }, 'Aquarium-Logbuch'),
      themeAuthBtn
    ) : null
  );

  const tabs = [
    { id: 'impressum', hash: '#/impressum', label: '⚖️ Impressum & KI-Hinweis' },
    { id: 'datenschutz', hash: '#/datenschutz', label: '🔒 Datenschutz' },
    { id: 'licenses', hash: '#/lizenzen', label: '📜 Lizenzen & Copyright' },
    { id: 'kontakt', hash: '#/kontakt', label: '✉️ Kontakt' },
  ];

  const tabsBar = h('div', { class: 'legal-tabs', role: 'tablist' },
    ...tabs.map((t) => h('a', {
      class: `legal-tab ${activeTab === t.id ? 'active' : ''}`,
      href: t.hash,
      role: 'tab',
      'aria-selected': activeTab === t.id ? 'true' : 'false',
    }, t.label))
  );

  let contentNode = null;

  if (activeTab === 'impressum') {
    contentNode = h('div', { class: 'legal-box stack' },
      h('h1', {}, '⚖️ Impressum & Rechtliche Hinweise'),

      h('div', { class: 'legal-badge-box stack', style: 'gap:.4rem;' },
        h('h3', { style: 'margin:0; display:flex; align-items:center; gap:.4rem; color:var(--ink);' },
          '🤖 Transparenzpflicht nach Art. 50 EU AI Act (Verordnung (EU) 2024/1689)'
        ),
        h('p', { style: 'margin:0; font-size:.93rem;' },
          'Dieses Softwaresystem (Aquarium-Logbuch) wurde unter Einsatz generativer Künstlicher Intelligenz (JetBrains Junie / KI-Programmierassistenten) konzipiert, programmiert und strukturiert. Der Programmcode, die Datenbankadapter, Frontend-Ansichten sowie Hilfstexte wurden KI-gestützt generiert und qualitätsgesichert.'
        ),
        h('p', { style: 'margin:0; font-size:.9rem; color:var(--ink-soft);' },
          'Wichtiger Fachhinweis: Die in der App hinterlegten Wasserwertgrenzen, Richtwerte, Alarme, Pflegeregeln und Artendaten dienen der privaten aquaristischen Orientierung. Sie stellen keine tiermedizinische oder biologisch-chemische Fachberatung dar.'
        )
      ),

      h('h2', {}, '1. Angaben gemäß § 5 Digitale-Dienste-Gesetz (DDG)'),
      h('p', {},
        'Aquarium-Logbuch – Webanwendung zur Verwaltung und Protokollierung von Aquarien, Wasserwerten und Pflegemaßnahmen.',
        h('br'),
        h('strong', {}, 'Diensteanbieter / Betreiber:'), ' Betreiber der jeweiligen Server-Instanz / Administrator',
        h('br'),
        h('strong', {}, 'Kontakt-E-Mail (Impressum):'), ' ', h('a', { href: `mailto:${imprintMail}` }, imprintMail),
        h('br'),
        h('strong', {}, 'Hosting:'), ' Eigenbetriebene Instanz (Self-Hosted / On-Premises)'
      ),

      h('h2', {}, '2. Verantwortlich für den Inhalt nach § 18 Abs. 2 MStV'),
      h('p', {}, 'Verantwortlich für redaktionelle Inhalte ist der jeweilige Betreiber bzw. Administrator dieser Anwendungsinstanz.'),

      h('h2', {}, '3. Haftung für Inhalte und Links'),
      h('p', {},
        'Als Diensteanbieter sind wir gemäß § 7 Abs. 1 DDG für eigene Inhalte auf diesen Seiten nach den allgemeinen Gesetzen verantwortlich. Nach §§ 8 bis 10 DDG sind Diensteanbieter jedoch nicht verpflichtet, übermittelte oder gespeicherte fremde Informationen ständig zu überwachen oder nach Umständen zu forschen, die auf eine rechtswidrige Tätigkeit hinweisen. Verpflichtungen zur Entfernung oder Sperrung der Nutzung von Informationen nach den allgemeinen Gesetzen bleiben hiervon unberührt.'
      ),
      h('p', {},
        'Diese Anwendung enthält ggf. Links zu externen Websites Dritter, auf deren Inhalte kein Einfluss besteht. Deshalb kann für diese fremden Inhalte auch keine Gewähr übernommen werden. Für die Inhalte der verlinkten Seiten ist stets der jeweilige Anbieter oder Betreiber der Seiten verantwortlich.'
      ),

      h('h2', {}, '4. EU-Streitschlichtung & Verbraucherstreitbeilegung'),
      h('p', {},
        'Die Europäische Kommission stellt eine Plattform zur Online-Streitbeilegung (OS) bereit: ',
        h('a', { href: 'https://ec.europa.eu/consumers/odr/', target: '_blank', rel: 'noopener noreferrer' }, 'https://ec.europa.eu/consumers/odr/'),
        h('br'),
        'Wir sind nicht bereit oder verpflichtet, an Streitbeilegungsverfahren vor einer Verbraucherschlichtungsstelle im Sinne des Verbraucherstreitbeilegungsgesetzes (VSBG) teilzunehmen.'
      )
    );
  } else if (activeTab === 'datenschutz') {
    contentNode = h('div', { class: 'legal-box stack' },
      h('h1', {}, '🔒 Datenschutzerklärung'),
      h('p', { class: 'muted', style: 'margin:0;' }, 'Informationen über die Verarbeitung personenbezogener Daten nach Art. 12, 13, 14 und 21 der Datenschutz-Grundverordnung (DSGVO).'),

      h('h2', {}, '1. Verantwortliche Stelle'),
      h('p', {},
        'Verantwortlich für die Datenverarbeitung im Sinne der DSGVO ist der Administrator bzw. Betreiber dieser Serverinstanz.',
        h('br'),
        'Kontakt: ', h('a', { href: `mailto:${contactMail}` }, contactMail)
      ),

      h('h2', {}, '2. Erhobene Datenarten und Verarbeitungszwecke'),
      h('ul', { style: 'padding-left:1.2rem; margin:.4rem 0;' },
        h('li', {},
          h('strong', {}, 'Benutzerkonto & Registrierung (Art. 6 Abs. 1 lit. b DSGVO): '),
          'Bei der Registrierung werden Benutzername, E-Mail-Adresse und ein kryptografischer Passwort-Hash gespeichert. Die E-Mail-Adresse dient der Kontoaktivierung, Passwort-Wiederherstellung und sicherheitsrelevanten Benachrichtigungen.'
        ),
        h('li', {},
          h('strong', {}, 'Aquariendaten, Messwerte & Fotos (Art. 6 Abs. 1 lit. b DSGVO): '),
          'Die von Ihnen eingegebenen Daten (Aquariennamen, Abmessungen, Wasserparameter, Pflegemaßnahmen, Besatzlisten und hochgeladenen Bilder) werden zur Bereitstellung der Protokollierungs- und Auswertungsfunktionen in der Datenbank gespeichert.'
        ),
        h('li', {},
          h('strong', {}, 'Sitzungs-Cookies & Lokaler Speicher (Art. 6 Abs. 1 lit. f DSGVO / § 25 Abs. 2 TDDDG): '),
          'Zur Benutzerauthentifizierung wird ein technisch zwingend erforderliches, verschlüsseltes Session-Cookie (',
          h('code', {}, 'aquarium_session'),
          ', HttpOnly, SameSite=Lax) verwendet. Lokale Anzeigeeinstellungen (z. B. Dark Mode oder Filtereinstellungen) werden lokal im Browser (localStorage) abgelegt. Es werden keine Werbe- oder Tracking-Cookies eingesetzt.'
        ),
        h('li', {},
          h('strong', {}, 'E-Mail-Versand (Art. 6 Abs. 1 lit. b & f DSGVO): '),
          'Für Systembenachrichtigungen (Verifizierungslinks, Passwort-Reset, Freigabe-Einladungen, konfigurierte Mess-/Düngungserinnerungen) werden E-Mails über den hinterlegten SMTP-Server versendet.'
        ),
        h('li', {},
          h('strong', {}, 'Server-Logdateien (Art. 6 Abs. 1 lit. f DSGVO): '),
          'Beim Zugriff werden technische Serverprotokolle (IP-Adresse, Zeitstempel, HTTP-Status, Fehlermeldungen) erfasst, um die Funktionsfähigkeit, Verfügbarkeit und Sicherheit der Anwendung zu gewährleisten.'
        )
      ),

      h('h2', {}, '3. Lokale Verarbeitung, Keine externen Tracker & Keine Datenweitergabe'),
      h('p', {},
        'Diese Anwendung ist für den autarken Eigenbetrieb (Self-Hosting) konzipiert. Es findet keinerlei Weitergabe personenbezogener Daten an Dritte, Werbenetzwerke oder Analyseanbieter statt. Alle Bibliotheken (einschließlich Chart.js) und Schriftarten werden lokal vom Server geladen – es bestehen keine externen Abhängigkeiten von Drittanbieter-CDNs.'
      ),

      h('h2', {}, '4. Speicherdauer und vollständige Datenlöschung (Recht auf Vergessenwerden)'),
      h('p', {},
        'Ihre Daten werden so lange gespeichert, wie Ihr Benutzerkonto aktiv ist.',
        h('br'),
        h('strong', {}, '2-Stufen-Kontolöschung: '),
        'Sie können Ihr Konto jederzeit im Profil (', h('code', {}, '#/profile'), ') über die Kontolöschungsfunktion selbstständig und unwiderruflich löschen. Nach Bestätigung per E-Mail werden alle mit dem Konto verknüpften Daten – einschließlich aller eigenen Aquarien, Messwerte, Alarme, Pflegelogs und hochgeladenen Fotos – kaskadierend und rückstandslos vom Server gelöscht (Art. 17 DSGVO).'
      ),

      h('h2', {}, '5. Ihre Rechte als betroffene Person'),
      h('p', {}, 'Sie haben nach der DSGVO folgende Rechte gegenüber dem Verantwortlichen:'),
      h('ul', { style: 'padding-left:1.2rem; margin:.4rem 0;' },
        h('li', {}, h('strong', {}, 'Auskunftsrecht (Art. 15 DSGVO): '), 'Sie können jederzeit Auskunft über Ihre gespeicherten Daten verlangen.'),
        h('li', {}, h('strong', {}, 'Berichtigungsrecht (Art. 16 DSGVO): '), 'Sie können unrichtige Daten im Profil oder in den jeweiligen Aquarien korrigieren.'),
        h('li', {}, h('strong', {}, 'Löschungsrecht (Art. 17 DSGVO): '), 'Sie können die vollständige Löschung Ihrer Daten veranlassen.'),
        h('li', {}, h('strong', {}, 'Recht auf Datenübertragbarkeit (Art. 20 DSGVO): '), 'Sie können Ihre Messwerte jederzeit über die integrierte CSV/Excel-Exportfunktion in einem gängigen, maschinenlesbaren Format herunterladen.'),
        h('li', {}, h('strong', {}, 'Einschränkung der Verarbeitung (Art. 18 DSGVO) & Widerspruch (Art. 21 DSGVO): '), 'Sie können der Datenverarbeitung im gesetzlichen Rahmen widersprechen.'),
        h('li', {}, h('strong', {}, 'Beschwerderecht (Art. 77 DSGVO): '), 'Sie haben das Recht auf Beschwerde bei einer zuständigen Datenschutz-Aufsichtsbehörde.')
      )
    );
  } else if (activeTab === 'licenses') {
    contentNode = h('div', { class: 'legal-box stack' },
      h('h1', {}, '📜 Copyright & Open-Source-Lizenzen der Module'),
      h('p', { class: 'muted', style: 'margin:0;' }, 'Diese Webanwendung basiert auf quelloffener Software (Open Source). Nachfolgend sind alle verwendeten Module, Autoren und Lizenzbestimmungen aufgeführt:'),

      h('div', { class: 'license-card stack', style: 'gap:.4rem;' },
        h('div', { class: 'row between', style: 'align-items:center;' },
          h('h3', { style: 'margin:0; font-size:1.1rem;' }, '🐠 Aquarium-Logbuch (Hauptanwendung)'),
          h('span', { class: 'chip ok' }, 'CC BY-NC-SA 4.0 (Copyleft & Non-Commercial)')
        ),
        h('p', { style: 'margin:0; font-size:.92rem;' }, 'Copyright © 2026 Aquarium-Logbuch Projekt. Lizenz für private Nutzung und Weiterentwicklung.'),
        h('p', { class: 'muted', style: 'margin:0; font-size:.85rem;' }, 'Konzipiert und entwickelt unter Einsatz generativer KI (JetBrains Junie) gem. EU AI Act.'),
        h('div', { class: 'legal-badge-box', style: 'margin:.4rem 0 0 0; padding:.65rem .85rem;' },
          h('strong', { style: 'display:block; margin-bottom:.2rem;' }, '📜 Lizenzbedingungen für die Hauptanwendung (CC BY-NC-SA 4.0):'),
          h('ul', { style: 'margin:0; padding-left:1.2rem; font-size:.88rem;' },
            h('li', {}, h('strong', {}, 'Nur privater & nicht-kommerzieller Gebrauch (NonCommercial): '), 'Die kostenlose Nutzung und Modifikation ist ausschließlich für persönliche, private und gemeinnützige Zwecke gestattet. Jede kommerzielle Nutzung, der Weiterverkauf oder das Anbieten als kostenpflichtiger Dienst (SaaS/Hosting) ist strengstens untersagt.'),
            h('li', {}, h('strong', {}, 'Striktes Copyleft & Weitergabe unter gleichen Bedingungen (ShareAlike): '), 'Bearbeitungen, Abwandlungen oder Weiterentwicklungen dürfen AUSSCHLIESSLICH unter denselben Lizenzbedingungen (CC BY-NC-SA 4.0) weitergegeben werden.'),
            h('li', {}, h('strong', {}, 'Namensnennung (Attribution): '), 'Der Urhebervermerk und Verweis auf das Projekt sowie diese Lizenz müssen stets unverändert beibehalten werden.')
          )
        )
      ),

      h('h2', {}, 'Verwendete Module & Bibliotheken'),

      h('div', { class: 'license-card stack', style: 'gap:.3rem;' },
        h('div', { class: 'row between' },
          h('strong', {}, 'express (v5.3.0)'),
          h('span', { class: 'chip ok' }, 'MIT License')
        ),
        h('p', { class: 'muted', style: 'margin:0; font-size:.88rem;' }, 'Schnelles, unaufdringliches Web-Framework und Routing für Node.js.'),
        h('div', { class: 'muted', style: 'font-size:.82rem;' }, 'Copyright (c) StrongLoop, Inc., Express contributors')
      ),

      h('div', { class: 'license-card stack', style: 'gap:.3rem;' },
        h('div', { class: 'row between' },
          h('strong', {}, 'better-sqlite3 (v13.0.3)'),
          h('span', { class: 'chip ok' }, 'MIT License')
        ),
        h('p', { class: 'muted', style: 'margin:0; font-size:.88rem;' }, 'Schnellster und einfachster C++ SQLite3-Treiber für Node.js.'),
        h('div', { class: 'muted', style: 'font-size:.82rem;' }, 'Copyright (c) Joshua Wise')
      ),

      h('div', { class: 'license-card stack', style: 'gap:.3rem;' },
        h('div', { class: 'row between' },
          h('strong', {}, 'mongodb (v7.7.0)'),
          h('span', { class: 'chip ok' }, 'Apache License 2.0')
        ),
        h('p', { class: 'muted', style: 'margin:0; font-size:.88rem;' }, 'Offizieller MongoDB-Treiber für Node.js zur NoSQL-Datenspeicherung.'),
        h('div', { class: 'muted', style: 'font-size:.82rem;' }, 'Copyright (c) MongoDB, Inc.')
      ),

      h('div', { class: 'license-card stack', style: 'gap:.3rem;' },
        h('div', { class: 'row between' },
          h('strong', {}, 'chart.js (v4.5.1)'),
          h('span', { class: 'chip ok' }, 'MIT License')
        ),
        h('p', { class: 'muted', style: 'margin:0; font-size:.88rem;' }, 'Einfache, flexible HTML5-Canvas-Diagramme für Messwertverläufe.'),
        h('div', { class: 'muted', style: 'font-size:.82rem;' }, 'Copyright (c) Chart.js Contributors')
      ),

      h('div', { class: 'license-card stack', style: 'gap:.3rem;' },
        h('div', { class: 'row between' },
          h('strong', {}, 'Node.js Core Modules (crypto, fs, http, https, tls, net)'),
          h('span', { class: 'chip ok' }, 'MIT License')
        ),
        h('p', { class: 'muted', style: 'margin:0; font-size:.88rem;' }, 'Integrierte Laufzeitmodule für Verschlüsselung, Dateisystem und Netzwerkprotokolle.'),
        h('div', { class: 'muted', style: 'font-size:.82rem;' }, 'Copyright (c) Node.js contributors')
      ),

      h('h2', {}, 'Lizenztexte'),

      h('h3', {}, 'Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International (CC BY-NC-SA 4.0)'),
      h('pre', { class: 'license-pre' },
`Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International (CC BY-NC-SA 4.0)
<https://creativecommons.org/licenses/by-nc-sa/4.0/legalcode>

By exercising the Licensed Rights, You accept and agree to be bound by the terms and
conditions of this Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International
Public License ("Public License").

Summary of Terms:
- Attribution (BY): You must give appropriate credit, provide a link to the license,
  and indicate if changes were made.
- NonCommercial (NC): You may not use the material for commercial purposes.
- ShareAlike (SA / Copyleft): If you remix, transform, or build upon the material,
  you must distribute your contributions under the same license as the original.
- No additional restrictions: You may not apply legal terms or technological measures
  that legally restrict others from doing anything the license permits.

Section 2 – Scope:
Subject to the terms and conditions of this Public License, the Licensor hereby grants
You a worldwide, royalty-free, non-sublicensable, non-exclusive, irrevocable license to:
A. reproduce and Share the Licensed Material for NonCommercial purposes only; and
B. produce, reproduce, and Share Adapted Material for NonCommercial purposes only.

Section 3 – License Conditions:
a. Attribution: You must retain copyright notices, license notices, and author credits.
b. NonCommercial: Commercial advantage or monetary compensation is prohibited.
c. ShareAlike: If You Share Adapted Material You produce, the Adapter's License You apply
   must be this Public License with the same License Elements (CC BY-NC-SA 4.0).`
      ),

      h('h3', {}, 'The MIT License (MIT)'),
      h('pre', { class: 'license-pre' },
`Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.`
      ),

      h('h3', {}, 'Apache License, Version 2.0'),
      h('pre', { class: 'license-pre' },
`Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.`
      )
    );
  } else if (activeTab === 'kontakt') {
    contentNode = h('div', { class: 'legal-box stack' },
      h('h1', {}, '✉️ Kontakt & Support'),
      h('p', { class: 'muted', style: 'margin:0;' }, 'Haben Sie Fragen zur Anwendung, Feedback oder Anliegen bezüglich des Datenschutzes?'),

      h('div', { class: 'compat-box info stack', style: 'gap:.6rem; margin-top:.8rem;' },
        h('div', {},
          h('strong', {}, '📧 Kontakt & Support:'),
          h('br'),
          h('a', { href: `mailto:${contactMail}`, style: 'font-size:1.05rem; font-weight:600;' }, contactMail)
        ),
        h('div', {},
          h('strong', {}, '⚖️ Impressum & Rechtliche Anfragen:'),
          h('br'),
          h('a', { href: `mailto:${imprintMail}`, style: 'font-size:1rem; font-weight:500;' }, imprintMail)
        ),
        h('div', {},
          h('strong', {}, '🛠️ Technische Unterstützung:'),
          h('p', { style: 'margin:.2rem 0 0; font-size:.92rem;' },
            'Bei Fragen zur Installation, Konfiguration (z. B. SMTP-Mailserver, OIDC oder Backups) wenden Sie sich bitte an Ihren Server-Administrator oder konsultieren Sie die Dokumentation.'
          )
        ),
        h('div', {},
          h('strong', {}, '🔒 Datenschutz & Auskunftsersuchen:'),
          h('p', { style: 'margin:.2rem 0 0; font-size:.92rem;' },
            'Anfragen bezüglich gespeicherter Daten oder die Ausübung Ihrer Betroffenenrechte nach der DSGVO können direkt an die oben genannte Support-E-Mail-Adresse gerichtet werden.'
          )
        )
      )
    );
  }

  mount(h('div', { class: 'legal-container stack' },
    topNavRow,
    tabsBar,
    contentNode
  ));
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
  await initServiceWorker();
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
let CURRENT_AQ_TAB = localStorage.getItem('aquarium_list_tab') || 'own';

async function viewList() {
  const [list, pendingShares] = await Promise.all([
    api('/aquariums'),
    api('/shares/pending').catch(() => []),
  ]);

  const ownList = list.filter((a) => a.role === 'owner');
  const sharedList = list.filter((a) => a.role !== 'owner');

  const activeTab = CURRENT_AQ_TAB === 'shared' ? 'shared' : 'own';

  function renderCard(a) {
    const isDueMeasure = a.overdue || (a.measure_cycle_status && a.measure_cycle_status.is_due);
    const isDueFertilize = a.fertilize_overdue || (a.fertilize_cycle_status && a.fertilize_cycle_status.is_due);
    const s = a.open_crit ? 'crit' : (a.open_warn || isDueMeasure || isDueFertilize) ? 'warn' : a.last_measured_at ? 'ok' : 'none';
    const isOwner = a.role === 'owner';
    return h('a', { class: `card aq-card s-${s}`, href: `#/a/${a.id}` },
      a.has_image ? h('img', { class: 'aq-card-img', src: `api/aquariums/${a.id}/image`, alt: a.name, loading: 'lazy' }) : null,
      h('h2', {}, a.name),
      a.motto ? h('div', { class: 'aq-motto' }, a.motto) : null,
      h('div', { class: 'muted' }, CONFIG.waterTypes[a.water_type], a.volume_l ? ` · ${a.volume_l} l` : ''),
      h('div', { class: 'row', style: 'margin-top:.6rem' },
        a.open_crit ? h('span', { class: 'chip crit' }, `${a.open_crit} kritisch`) : null,
        a.open_warn ? h('span', { class: 'chip warn' }, `${a.open_warn} auffällig`) : null,
        isDueMeasure ? h('span', { class: 'chip warn' }, '🧪 Messung fällig') : null,
        isDueFertilize ? h('span', { class: 'chip warn' }, '🌿 Düngung fällig') : null,
        !a.open_crit && !a.open_warn && !isDueMeasure && !isDueFertilize && a.last_measured_at ? h('span', { class: 'chip ok' }, 'alles im Bereich') : null,
        !a.last_measured_at ? h('span', { class: 'chip none' }, 'noch keine Messung') : null,
        a.last_fertilized_at ? h('span', { class: 'chip ok' }, `🌿 Düngung: ${fmtDate(a.last_fertilized_at)}`) : null,
        a.last_water_change_at ? h('span', { class: 'chip ok' }, `💧 WW: ${fmtDate(a.last_water_change_at)}${a.last_water_change_percent ? ' (' + a.last_water_change_percent + '%)' : ''}`) : null,
        !isOwner && a.role === 'write' ? h('span', { class: 'chip ok' }, `Geteilt: Schreiben (${a.owner_username || 'Besitzer'})`) : null,
        !isOwner && a.role === 'view' ? h('span', { class: 'chip none' }, `Geteilt: Lesen (${a.owner_username || 'Besitzer'})`) : null,
        isOwner && a.shares_count > 0 ? h('span', { class: 'chip none' }, `Geteilt (${a.shares_count})`) : null),
      a.last_measured_at ? h('div', { class: 'muted', style: 'margin-top:.4rem' }, 'Zuletzt gemessen: ', fmtDate(a.last_measured_at)) : null);
  }

  // Tabs
  const tabOwnBtn = h('button', {
    class: `nav-tab-btn ${activeTab === 'own' ? 'active' : ''}`,
    type: 'button',
    onclick: () => {
      CURRENT_AQ_TAB = 'own';
      localStorage.setItem('aquarium_list_tab', 'own');
      viewList();
    }
  }, '🐠 Eigene Aquarien', h('span', { class: 'tab-badge' }, ownList.length));

  const tabSharedBtn = h('button', {
    class: `nav-tab-btn ${activeTab === 'shared' ? 'active' : ''}`,
    type: 'button',
    onclick: () => {
      CURRENT_AQ_TAB = 'shared';
      localStorage.setItem('aquarium_list_tab', 'shared');
      viewList();
    }
  }, '👥 Mit mir geteilte Aquarien', h('span', { class: 'tab-badge' }, pendingShares.length > 0 ? `${sharedList.length} (+${pendingShares.length})` : sharedList.length));

  const navTabs = h('div', { class: 'nav-tabs' }, tabOwnBtn, tabSharedBtn);

  let tabContent;
  if (activeTab === 'own') {
    const cards = ownList.map(renderCard);
    tabContent = cards.length
      ? h('div', { class: 'aq-list' }, cards)
      : h('div', { class: 'card stack' },
          h('h2', {}, 'Noch kein eigenes Aquarium'),
          h('p', {}, 'Lege dein erstes Becken an, dann kannst du Wasserwerte eintragen, Fotos hochladen und den Verlauf sehen.'),
          h('div', {}, h('button', { class: 'btn', type: 'button', onclick: () => aquariumDialog() }, 'Aquarium anlegen'))
        );
  } else {
    // Shared Tab
    const pendingSection = pendingShares.length > 0 ? h('div', { class: 'pending-shares-box stack' },
      h('h3', { style: 'margin:0; display:flex; align-items:center; gap:.5rem;' },
        '✉️ Offene Freigabe-Einladungen',
        h('span', { class: 'chip warn' }, `${pendingShares.length} ausstehend`)
      ),
      h('p', { class: 'muted', style: 'margin:0; font-size:.9rem;' }, 'Du wurdest eingeladen, auf folgende Aquarien zuzugreifen. Nimm die Einladung an, um das Becken einzusehen:'),
      h('div', { class: 'stack', style: 'gap:.5rem;' },
        pendingShares.map((ps) => {
          const roleLabel = ps.role === 'write' ? 'Schreibrechte' : 'Leserechte';
          return h('div', { class: 'pending-share-item' },
            h('div', {},
              h('strong', { style: 'font-size:1.05rem; display:block;' }, ps.aquarium_name),
              h('div', { class: 'muted', style: 'font-size:.85rem;' },
                `Geteilt von: `, h('strong', {}, ps.owner_username),
                ` · Berechtigung: `, h('span', { class: ps.role === 'write' ? 'chip ok' : 'chip none' }, roleLabel),
                ` · Eingeladen am: `, fmtDate(ps.created_at)
              )
            ),
            h('div', { class: 'row', style: 'gap:.5rem;' },
              h('button', {
                class: 'btn small',
                type: 'button',
                onclick: async (e) => {
                  e.target.disabled = true;
                  try {
                    await api('/shares/accept', { method: 'POST', body: { aquarium_id: ps.aquarium_id } });
                    toast(`Einladung für „${ps.aquarium_name}“ angenommen!`);
                    viewList();
                  } catch (err) {
                    toast(err.message);
                    e.target.disabled = false;
                  }
                }
              }, 'Annehmen'),
              h('button', {
                class: 'btn small ghost',
                type: 'button',
                onclick: async (e) => {
                  if (!confirm(`Einladung für „${ps.aquarium_name}“ wirklich ablehnen?`)) return;
                  e.target.disabled = true;
                  try {
                    await api('/shares/decline', { method: 'POST', body: { aquarium_id: ps.aquarium_id } });
                    toast('Einladung abgelehnt.');
                    viewList();
                  } catch (err) {
                    toast(err.message);
                    e.target.disabled = false;
                  }
                }
              }, 'Ablehnen')
            )
          );
        })
      )
    ) : null;

    const cards = sharedList.map(renderCard);
    const listSection = cards.length
      ? h('div', { class: 'aq-list' }, cards)
      : h('div', { class: 'card stack' },
          h('h2', {}, 'Keine geteilten Aquarien'),
          h('p', {}, 'Aktuell wurden keine Aquarien mit dir geteilt.'),
          h('p', { class: 'muted', style: 'margin:0;' }, 'Sobald andere Aquarianer ein Becken mit dir teilen und du die Einladung per E-Mail oder hier annimmst, wird es in diesem Bereich angezeigt.')
        );

    tabContent = h('div', { class: 'stack' }, pendingSection, listSection);
  }

  mount(h('div', { class: 'stack' },
    h('div', { class: 'row between', style: 'align-items:center;' },
      h('h1', { style: 'margin:0;' }, 'Meine Aquarien'),
      h('button', { class: 'btn', type: 'button', onclick: () => aquariumDialog() }, 'Aquarium anlegen')
    ),
    navTabs,
    tabContent
  ));
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

  const weekdaysList = [
    { val: '', label: 'Beliebiger Wochentag / Flexibel' },
    { val: '1', label: 'Montag' },
    { val: '2', label: 'Dienstag' },
    { val: '3', label: 'Mittwoch' },
    { val: '4', label: 'Donnerstag' },
    { val: '5', label: 'Freitag' },
    { val: '6', label: 'Samstag' },
    { val: '7', label: 'Sonntag' },
  ];

  const mInterval = aq?.measure_cycle_interval != null ? aq.measure_cycle_interval : (aq?.reminder_days ? aq.reminder_days : 7);
  const mUnit = aq?.measure_cycle_unit || 'days';
  const mDay = aq?.measure_cycle_day_of_week != null ? String(aq.measure_cycle_day_of_week) : '';
  const mMail = Boolean(aq?.measure_reminder_mail);

  const fInterval = aq?.fertilize_cycle_interval != null ? aq.fertilize_cycle_interval : '';
  const fUnit = aq?.fertilize_cycle_unit || 'weeks';
  const fDay = aq?.fertilize_cycle_day_of_week != null ? String(aq.fertilize_cycle_day_of_week) : '';
  const fMail = Boolean(aq?.fertilize_reminder_mail);

  const f = {
    name: h('input', { required: true, maxlength: '80', value: aq?.name || '' }),
    motto: h('input', { maxlength: '160', placeholder: 'z. B. Mein Amazonas-Biotop / Naturaquarium 120', value: aq?.motto || '' }),
    description: h('textarea', { maxlength: '4000', rows: '3', placeholder: 'Generelle Beschreibung (z. B. Scape, Bepflanzung, Beleuchtung, Technik & Philosophie)...', value: aq?.description || '' }),
    water_type: h('select', { value: aq?.water_type || 'fresh' }, Object.entries(CONFIG.waterTypes).map(([k, v]) => h('option', { value: k }, v))),
    volume_l: h('input', { type: 'number', min: '1', max: '100000', inputmode: 'numeric', value: aq?.volume_l ?? '' }),
    notes: h('textarea', { maxlength: '1000', placeholder: 'Kurze Notizen...', value: aq?.notes || '' }),

    // Messzyklus
    measure_cycle_interval: h('input', { type: 'number', min: '0', max: '365', placeholder: 'z. B. 7 oder 14 (0 = aus)', value: mInterval }),
    measure_cycle_unit: h('select', { value: mUnit },
      h('option', { value: 'days' }, 'Tage'),
      h('option', { value: 'weeks' }, 'Wochen')
    ),
    measure_cycle_day_of_week: h('select', { value: mDay },
      weekdaysList.map((w) => h('option', { value: w.val, selected: String(w.val) === String(mDay) }, w.label))
    ),
    measure_reminder_mail: h('input', { type: 'checkbox', checked: mMail }),

    // Düngzyklus
    fertilize_cycle_interval: h('input', { type: 'number', min: '0', max: '365', placeholder: 'z. B. 1 oder 2 (leer/0 = aus)', value: fInterval }),
    fertilize_cycle_unit: h('select', { value: fUnit },
      h('option', { value: 'days' }, 'Tage'),
      h('option', { value: 'weeks' }, 'Wochen')
    ),
    fertilize_cycle_day_of_week: h('select', { value: fDay },
      weekdaysList.map((w) => h('option', { value: w.val, selected: String(w.val) === String(fDay) }, w.label))
    ),
    fertilize_reminder_mail: h('input', { type: 'checkbox', checked: fMail }),
  };
  const dlg = h('dialog', { class: 'wide stack' }, h('form', { class: 'stack', method: 'dialog', onsubmit: async (e) => {
    e.preventDefault(); err.textContent = '';
    const body = {
      name: f.name.value,
      motto: f.motto.value,
      description: f.description.value,
      water_type: f.water_type.value,
      volume_l: f.volume_l.value,
      notes: f.notes.value,
      measure_cycle_interval: f.measure_cycle_interval.value,
      measure_cycle_unit: f.measure_cycle_unit.value,
      measure_cycle_day_of_week: f.measure_cycle_day_of_week.value,
      measure_reminder_mail: f.measure_reminder_mail.checked ? 1 : 0,
      fertilize_cycle_interval: f.fertilize_cycle_interval.value,
      fertilize_cycle_unit: f.fertilize_cycle_unit.value,
      fertilize_cycle_day_of_week: f.fertilize_cycle_day_of_week.value,
      fertilize_reminder_mail: f.fertilize_reminder_mail.checked ? 1 : 0,
    };
    try {
      let targetId = aq?.id;
      if (editing) {
        await api(`/aquariums/${aq.id}`, { method: 'PUT', body });
      } else {
        const r = await api('/aquariums', { method: 'POST', body });
        targetId = r.id;
      }
      if (imageBase64) {
        await api(`/aquariums/${targetId}/images`, { method: 'POST', body: { image: imageBase64, is_primary: 1 } });
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
  h('div', { class: 'field' }, h('label', {}, 'Motto / Leitspruch (optional)'), f.motto),
  h('div', { class: 'field' }, h('label', {}, 'Generelle Beschreibung des Aquariums (optional)'), f.description),
  h('div', { class: 'grid2' },
    h('div', { class: 'field' }, h('label', {}, 'Wasserart'), f.water_type),
    h('div', { class: 'field' }, h('label', {}, 'Volumen (Liter)'), f.volume_l)),

  // Messzyklus
  h('div', { class: 'cycle-edit-box stack' },
    h('strong', { style: 'display:flex; align-items:center; gap:.4rem; color: var(--accent);' }, '🧪 Messzyklus (Wasserwerte)'),
    h('div', { class: 'grid3' },
      h('div', { class: 'field' }, h('label', {}, 'Intervall'), f.measure_cycle_interval),
      h('div', { class: 'field' }, h('label', {}, 'Einheit'), f.measure_cycle_unit),
      h('div', { class: 'field' }, h('label', {}, 'Wochentag'), f.measure_cycle_day_of_week)),
    h('label', { class: 'row', style: 'gap:.5rem; align-items:center; font-size:.9rem; cursor:pointer; margin-top:.2rem;' },
      f.measure_reminder_mail,
      '📧 Erinnerungs-E-Mail senden, wenn Messung fällig ist'
    )
  ),

  // Düngzyklus
  h('div', { class: 'cycle-edit-box stack' },
    h('strong', { style: 'display:flex; align-items:center; gap:.4rem; color: #10b981;' }, '🌿 Düngzyklus (Pflanzendünger)'),
    h('div', { class: 'grid3' },
      h('div', { class: 'field' }, h('label', {}, 'Intervall'), f.fertilize_cycle_interval),
      h('div', { class: 'field' }, h('label', {}, 'Einheit'), f.fertilize_cycle_unit),
      h('div', { class: 'field' }, h('label', {}, 'Wochentag'), f.fertilize_cycle_day_of_week)),
    h('label', { class: 'row', style: 'gap:.5rem; align-items:center; font-size:.9rem; cursor:pointer; margin-top:.2rem;' },
      f.fertilize_reminder_mail,
      '📧 Erinnerungs-E-Mail senden, wenn Düngung fällig ist'
    )
  ),

  h('div', { class: 'field' }, h('label', {}, 'Kurze Notizen'), f.notes),
  h('div', { class: 'field' },
    h('label', {}, 'Titelbild vom Aquarium (PNG, JPG, WebP, GIF, max. 5 MB)'),
    fileInput,
    previewImg,
    h('div', { style: 'margin-top:.4rem' }, btnRemoveImg)),
  err,
  h('div', { class: 'row' },
    h('button', { class: 'btn', type: 'submit' }, 'Speichern'),
    h('button', { class: 'btn ghost', type: 'button', onclick: () => dlg.close() }, 'Abbrechen'),
    editing && isOwner ? h('button', { class: 'btn danger', type: 'button', onclick: async () => {
      if (!confirm(`„${aq.name}“ mit allen Messwerten, Bildern und Alarmen endgültig löschen?`)) return;
      try { await api(`/aquariums/${aq.id}`, { method: 'DELETE' }); dlg.close(); location.hash = '#/'; toast('Aquarium gelöscht.'); } catch (ex) { err.textContent = ex.message; }
    } }, 'Löschen') : null)));
  dlg.addEventListener('close', () => dlg.remove());
  document.body.append(dlg); dlg.showModal(); f.name.focus();
}

function uploadImageDialog(aq) {
  const dlg = h('dialog', { class: 'stack', style: 'max-width: 480px;' });
  const err = h('p', { class: 'error', role: 'alert' });
  let imageBase64 = null;

  const fileInput = h('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp,image/gif', required: true });
  const previewImg = h('img', { class: 'img-preview', style: 'display:none; max-height: 200px; width: 100%; object-fit: cover;' });
  const captionInput = h('input', { maxlength: '200', placeholder: 'z. B. Gesamtansicht nach dem Rückschnitt...' });
  const primaryChk = h('input', { type: 'checkbox' });

  fileInput.addEventListener('change', () => {
    const file = fileInput.files[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      err.textContent = 'Das Bild ist größer als 5 MB.';
      fileInput.value = '';
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      imageBase64 = ev.target.result;
      previewImg.src = imageBase64;
      previewImg.style.display = 'block';
      err.textContent = '';
    };
    reader.readAsDataURL(file);
  });

  const form = h('form', { class: 'stack', onsubmit: async (e) => {
    e.preventDefault(); err.textContent = '';
    if (!imageBase64) {
      err.textContent = 'Bitte ein Bild auswählen.';
      return;
    }
    try {
      await api(`/aquariums/${aq.id}/images`, {
        method: 'POST',
        body: {
          image: imageBase64,
          caption: captionInput.value.trim() || null,
          is_primary: primaryChk.checked,
        },
      });
      dlg.close();
      toast('Foto hochgeladen.');
      route();
    } catch (ex) {
      err.textContent = ex.message;
    }
  } },
  h('div', { class: 'row between' },
    h('h2', { style: 'margin:0' }, 'Foto hochladen'),
    h('button', { class: 'btn small ghost', type: 'button', onclick: () => dlg.close() }, '✕')
  ),
  h('div', { class: 'field' },
    h('label', {}, 'Bilddatei auswählen (PNG, JPG, WebP, GIF bis 5 MB)'),
    fileInput,
    previewImg
  ),
  h('div', { class: 'field' },
    h('label', {}, 'Bildunterschrift / Notiz (optional)'),
    captionInput
  ),
  h('label', { class: 'row', style: 'gap:.4rem; cursor:pointer;' },
    primaryChk,
    h('span', {}, 'Als Titelbild des Aquariums festlegen')
  ),
  err,
  h('div', { class: 'row' },
    h('button', { class: 'btn', type: 'submit' }, 'Hochladen'),
    h('button', { class: 'btn ghost', type: 'button', onclick: () => dlg.close() }, 'Abbrechen')
  ));

  dlg.appendChild(form);
  dlg.addEventListener('close', () => dlg.remove());
  document.body.appendChild(dlg);
  dlg.showModal();
}

function editImageCaptionDialog(aq, img) {
  const dlg = h('dialog', { class: 'stack', style: 'max-width: 440px;' });
  const err = h('p', { class: 'error', role: 'alert' });
  const captionInput = h('input', { maxlength: '200', value: img.caption || '', placeholder: 'z. B. Beckenansicht von links...' });

  const form = h('form', { class: 'stack', onsubmit: async (e) => {
    e.preventDefault(); err.textContent = '';
    try {
      await api(`/aquariums/${aq.id}/images/${img.id}`, {
        method: 'PUT',
        body: { caption: captionInput.value.trim() || null },
      });
      dlg.close();
      toast('Bildunterschrift gespeichert.');
      route();
    } catch (ex) {
      err.textContent = ex.message;
    }
  } },
  h('h2', { style: 'margin:0' }, 'Bildunterschrift bearbeiten'),
  h('div', { class: 'field' },
    h('label', {}, 'Bildunterschrift'),
    captionInput
  ),
  err,
  h('div', { class: 'row' },
    h('button', { class: 'btn', type: 'submit' }, 'Speichern'),
    h('button', { class: 'btn ghost', type: 'button', onclick: () => dlg.close() }, 'Abbrechen')
  ));

  dlg.appendChild(form);
  dlg.addEventListener('close', () => dlg.remove());
  document.body.appendChild(dlg);
  dlg.showModal();
  captionInput.focus();
}

function editStockDialog(aq, s) {
  const dlg = h('dialog', { class: 'stack', style: 'max-width: 500px;' });
  const err = h('p', { class: 'error', role: 'alert' });
  let imageBase64 = null;
  let removeExistingImage = false;

  const spInput = h('input', { required: true, maxlength: '80', value: s.species, list: 'species' });
  const nameInput = h('input', { maxlength: '80', placeholder: 'z. B. Bubbles, Nemo, Gruppe 1...', value: s.name || '' });
  const cntInput = h('input', { type: 'number', min: '1', max: '10000', inputmode: 'numeric', required: true, value: s.count || 1 });
  const profSelect = h('select', {}, Object.entries(CONFIG.profiles).map(([k, v]) => h('option', { value: k }, v)));
  profSelect.value = s.profile || 'allgemein';

  const fileInput = h('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp,image/gif' });
  const previewImg = h('img', { class: 'img-preview', style: 'display:none; max-height: 160px; object-fit: cover;' });
  const btnRemoveImg = h('button', { class: 'btn small ghost', type: 'button', style: 'display:none' }, 'Foto entfernen');

  if (s.has_image) {
    previewImg.src = `api/aquariums/${aq.id}/stock/${s.id}/image?t=${Date.now()}`;
    previewImg.style.display = 'block';
    btnRemoveImg.style.display = 'inline-flex';
  }

  fileInput.addEventListener('change', () => {
    const file = fileInput.files[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      err.textContent = 'Das Bild ist größer als 5 MB.';
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

  const form = h('form', { class: 'stack', onsubmit: async (e) => {
    e.preventDefault(); err.textContent = '';
    try {
      await api(`/aquariums/${aq.id}/stock/${s.id}`, {
        method: 'PUT',
        body: {
          species: spInput.value.trim(),
          name: nameInput.value.trim() || null,
          count: cntInput.value,
          profile: profSelect.value,
          image: imageBase64,
          remove_image: removeExistingImage,
        },
      });
      dlg.close();
      toast('Bewohner aktualisiert.');
      route();
    } catch (ex) {
      err.textContent = ex.message;
    }
  } },
  h('div', { class: 'row between' },
    h('h2', { style: 'margin:0' }, 'Bewohner bearbeiten'),
    h('button', { class: 'btn small ghost', type: 'button', onclick: () => dlg.close() }, '✕')
  ),
  h('div', { class: 'field' },
    h('label', {}, 'Art / Spezies'),
    spInput
  ),
  h('div', { class: 'field' },
    h('label', {}, 'Individueller Name / Bezeichnung (optional)'),
    nameInput
  ),
  h('div', { class: 'grid2' },
    h('div', { class: 'field' }, h('label', {}, 'Anzahl'), cntInput),
    h('div', { class: 'field' }, h('label', {}, 'Wasser-Ansprüche'), profSelect)
  ),
  h('div', { class: 'field' },
    h('label', {}, 'Foto des Bewohners (PNG, JPG, WebP, GIF bis 5 MB)'),
    fileInput,
    previewImg,
    h('div', { style: 'margin-top:.4rem' }, btnRemoveImg)
  ),
  err,
  h('div', { class: 'row' },
    h('button', { class: 'btn', type: 'submit' }, 'Speichern'),
    h('button', { class: 'btn ghost', type: 'button', onclick: () => dlg.close() }, 'Abbrechen')
  ));

  dlg.appendChild(form);
  dlg.addEventListener('close', () => dlg.remove());
  document.body.appendChild(dlg);
  dlg.showModal();
}

async function shareDialog(aq) {
  const dlg = h('dialog', { style: 'max-width:620px' });
  const err = h('p', { class: 'error', role: 'alert' });
  const listWrap = h('div', { class: 'stack', style: 'margin: 1rem 0' });

  const queryInput = h('input', { required: true, maxlength: '120', placeholder: 'Benutzername oder E-Mail-Adresse' });
  const roleSelect = h('select', {},
    h('option', { value: 'view' }, 'Nur Lesen (view)'),
    h('option', { value: 'write' }, 'Lesen & Schreiben (write)'));
  const addBtn = h('button', { class: 'btn', type: 'submit' }, 'Einladen / Freigeben');

  async function loadShares() {
    listWrap.replaceChildren(h('p', { class: 'muted' }, 'Lade Freigaben...'));
    try {
      const shares = await api(`/aquariums/${aq.id}/shares`);
      if (!shares.length) {
        listWrap.replaceChildren(h('p', { class: 'muted' }, 'Dieses Aquarium ist aktuell mit niemandem geteilt.'));
        return;
      }
      const table = h('table', {},
        h('thead', {}, h('tr', {}, h('th', {}, 'Benutzer'), h('th', {}, 'Berechtigung'), h('th', {}, 'Status'), h('th', {}, ''))),
        h('tbody', {}, shares.map((s) => {
          const isPending = s.status === 'pending';
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

          const statusChip = isPending
            ? h('span', { class: 'chip warn', title: 'Wartet auf Annahme durch den Benutzer' }, 'Ausstehend')
            : h('span', { class: 'chip ok', title: 'Einladung wurde angenommen' }, 'Angenommen');

          const actionBtns = [
            h('button', {
              class: 'btn small danger',
              type: 'button',
              onclick: async () => {
                if (!confirm(`Freigabe für „${s.username}“ wirklich entfernen?`)) return;
                try {
                  await api(`/aquariums/${aq.id}/shares/${s.user_id}`, { method: 'DELETE' });
                  toast(`Freigabe für ${s.username} entfernt.`);
                  loadShares();
                } catch (ex) { err.textContent = ex.message; }
              }
            }, 'Entfernen'),
          ];

          if (isPending) {
            actionBtns.unshift(
              h('button', {
                class: 'btn small ghost',
                type: 'button',
                title: 'Einladungs-E-Mail erneut senden',
                onclick: async (e) => {
                  e.target.disabled = true;
                  try {
                    await api(`/aquariums/${aq.id}/shares/${s.user_id}/resend`, { method: 'POST' });
                    toast(`Einladungs-E-Mail an ${s.username} erneut gesendet.`);
                  } catch (ex) {
                    err.textContent = ex.message;
                  } finally {
                    e.target.disabled = false;
                  }
                }
              }, '📧 Erneut senden')
            );
          }

          return h('tr', {},
            h('td', {}, h('strong', {}, s.username), s.email ? h('div', { class: 'muted', style: 'font-size:.8rem' }, s.email) : null),
            h('td', {}, sel),
            h('td', {}, statusChip),
            h('td', {}, h('div', { class: 'row', style: 'gap:.35rem;' }, ...actionBtns)));
        })));
      listWrap.replaceChildren(h('div', { class: 'table-wrap' }, table));
    } catch (ex) {
      listWrap.replaceChildren(h('p', { class: 'error' }, ex.message));
    }
  }

  const addForm = h('form', { class: 'stack', onsubmit: async (e) => {
    e.preventDefault(); err.textContent = '';
    try {
      const res = await api(`/aquariums/${aq.id}/shares`, { method: 'POST', body: { usernameOrEmail: queryInput.value.trim(), role: roleSelect.value } });
      toast(res.message || 'Einladungs-E-Mail erfolgreich versendet.');
      queryInput.value = '';
      loadShares();
    } catch (ex) { err.textContent = ex.message; }
  } },
  h('h3', {}, 'Neuen Benutzer einladen'),
  h('div', { class: 'grid2' },
    h('div', { class: 'field' }, h('label', {}, 'Benutzername / E-Mail'), queryInput),
    h('div', { class: 'field' }, h('label', {}, 'Berechtigung'), roleSelect)),
  h('div', {}, addBtn));

  dlg.append(
    h('div', { class: 'stack' },
      h('h2', {}, `Aquarium teilen: „${aq.name}“`),
      h('p', { class: 'muted' }, 'Gib anderen registrierten Benutzern Lese- oder Schreibrechte für dieses Aquarium. Der Benutzer erhält eine Einladungs-E-Mail und muss die Freigabe annehmen.'),
      err,
      h('h3', {}, 'Bestehende Freigaben & Einladungen'),
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
  const isObj = existing && typeof existing === 'object';
  const editing = isObj;
  const initialType = isObj ? existing.type : (typeof existing === 'string' ? existing : 'water_change');
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

  const initialDate = isObj ? localInputValue(new Date(existing.timestamp || existing.logged_at)) : localInputValue();
  const dateInput = h('input', { type: 'datetime-local', required: true, value: initialDate });
  const typeSelect = h('select', { required: true },
    Object.entries(types).map(([k, t]) => h('option', { value: k, selected: initialType === k }, `${t.icon || ''} ${t.label}`))
  );

  const percentInput = h('input', { type: 'number', min: '1', max: '100', step: '1', placeholder: 'z. B. 30 oder 50', value: isObj ? (existing?.percentage ?? '30') : '30' });
  const percentField = h('div', { class: 'field' },
    h('label', {}, 'Wasserwechsel-Anteil (%)'),
    percentInput
  );

  const detailsInput = h('input', { maxlength: '500', value: isObj ? (existing?.details || '') : '' });
  const detailsLabel = h('label', {}, 'Details zur Arbeit');
  const detailsField = h('div', { class: 'field' },
    detailsLabel,
    detailsInput
  );

  const noteInput = h('textarea', { maxlength: '1000', placeholder: 'Optionale Bemerkungen...', value: isObj ? (existing?.note || '') : '' });

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
  updateFormForType(initialType);

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

function exportMeasurementsDialog(aq) {
  const dlg = h('dialog', { class: 'stack', style: 'max-width: 500px;' });
  const formatSelect = h('select', {},
    h('option', { value: 'excel_csv' }, 'Excel-kompatibles CSV (Semikolon „;“, UTF-8 mit BOM)'),
    h('option', { value: 'standard_csv' }, 'Standard-CSV (Komma „,“, UTF-8)')
  );
  const rangeSelect = h('select', {},
    h('option', { value: 'all' }, 'Alle Messungen (gesamter Verlauf)'),
    h('option', { value: 'current' }, 'Aktuell gefilterter Zeitraum')
  );

  const form = h('form', { class: 'stack', onsubmit: (e) => {
    e.preventDefault();
    const delimiter = formatSelect.value === 'standard_csv' ? ',' : ';';
    const params = new URLSearchParams();
    params.set('delimiter', delimiter);

    if (rangeSelect.value === 'current') {
      if (RANGE === 'custom' && (CUSTOM_FROM || CUSTOM_TO)) {
        if (CUSTOM_FROM) params.set('from', CUSTOM_FROM);
        if (CUSTOM_TO) params.set('to', CUSTOM_TO);
      } else {
        params.set('days', Number(RANGE) || 90);
      }
    } else {
      params.set('all', 'true');
    }

    const exportUrl = `api/aquariums/${aq.id}/measurements/export?${params.toString()}`;
    const a = document.createElement('a');
    a.href = exportUrl;
    a.download = `messwerte_${(aq.name || 'aquarium').replace(/[^a-zA-Z0-9_\u00C0-\u017F-]/g, '_')}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    dlg.close();
    toast('Export gestartet.');
  } },
  h('div', { class: 'row between' },
    h('h2', { style: 'margin:0' }, '📤 Messwerte exportieren'),
    h('button', { class: 'btn small ghost', type: 'button', onclick: () => dlg.close() }, '✕')
  ),
  h('p', { class: 'muted' }, `Exportiere alle Wasserwerte und Notizen von „${aq.name}“ als CSV-Datei zur Weiterverarbeitung in Excel, Numbers oder Google Sheets.`),
  h('div', { class: 'field' },
    h('label', {}, 'Dateiformat & Trennzeichen'),
    formatSelect
  ),
  h('div', { class: 'field' },
    h('label', {}, 'Export-Zeitraum'),
    rangeSelect
  ),
  h('div', { class: 'row', style: 'margin-top:.5rem' },
    h('button', { class: 'btn', type: 'submit' }, '📥 Datei herunterladen'),
    h('button', { class: 'btn ghost', type: 'button', onclick: () => dlg.close() }, 'Abbrechen')
  ));

  dlg.appendChild(form);
  dlg.addEventListener('close', () => dlg.remove());
  document.body.appendChild(dlg);
  dlg.showModal();
}

function importMeasurementsDialog(aq) {
  const dlg = h('dialog', { class: 'wide stack', style: 'max-width: 820px;' });
  const err = h('p', { class: 'error', role: 'alert' });
  const infoMsg = h('div', { class: 'muted' });

  let rawCsvText = '';
  let parsedHeaders = [];
  let parsedSampleRows = [];
  let currentDelimiter = ';';
  let totalDataRowCount = 0;
  const columnSelects = [];

  const fileInput = h('input', { type: 'file', accept: '.csv,.txt,text/csv,text/plain', style: 'display:none;' });
  const dropZone = h('div', { class: 'csv-drop-zone stack', style: 'gap:.4rem;' },
    h('div', { style: 'font-size: 2rem;' }, '📄'),
    h('strong', {}, 'CSV-Datei hier ablegen oder zum Auswählen klicken'),
    h('span', { class: 'muted', style: 'font-size: .85rem;' }, 'Unterstützt .csv und .txt mit Trennzeichen Semikolon, Komma oder Tabulator')
  );

  dropZone.addEventListener('click', () => fileInput.click());
  dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('dragover'); });
  dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('dragover');
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  });

  fileInput.addEventListener('change', () => {
    if (fileInput.files && fileInput.files[0]) {
      handleFile(fileInput.files[0]);
    }
  });

  const pasteTextarea = h('textarea', { rows: '3', placeholder: 'Alternativ CSV-Inhalt direkt hier einfügen...', style: 'display:none; width: 100%; font-family: monospace; font-size: .85rem;' });
  const togglePasteBtn = h('button', { class: 'btn small ghost', type: 'button' }, '📝 CSV-Text manuell einfügen');
  togglePasteBtn.addEventListener('click', () => {
    if (pasteTextarea.style.display === 'none') {
      pasteTextarea.style.display = 'block';
      togglePasteBtn.textContent = '📂 Datei-Upload bevorzugen';
      pasteTextarea.focus();
    } else {
      pasteTextarea.style.display = 'none';
      togglePasteBtn.textContent = '📝 CSV-Text manuell einfügen';
    }
  });

  pasteTextarea.addEventListener('input', () => {
    if (pasteTextarea.value.trim()) {
      processCsvText(pasteTextarea.value);
    }
  });

  function handleFile(file) {
    if (!file) return;
    err.textContent = '';
    const reader = new FileReader();
    reader.onload = (e) => {
      processCsvText(e.target.result);
    };
    reader.onerror = () => {
      err.textContent = 'Fehler beim Lesen der Datei.';
    };
    reader.readAsText(file, 'utf-8');
  }

  const mappingSection = h('div', { class: 'stack', style: 'display:none; margin-top:.5rem;' });
  const mappingTableWrap = h('div', { class: 'table-wrap' });
  const hasHeaderCheckbox = h('input', { type: 'checkbox', checked: true });
  const delimiterSelect = h('select', { style: 'width: auto;' },
    h('option', { value: ';' }, 'Semikolon (;)'),
    h('option', { value: ',' }, 'Komma (,)'),
    h('option', { value: '\t' }, 'Tabulator (Tab)'),
    h('option', { value: '|' }, 'Pipe (|)')
  );

  delimiterSelect.addEventListener('change', () => {
    currentDelimiter = delimiterSelect.value;
    if (rawCsvText) {
      processCsvText(rawCsvText, currentDelimiter);
    }
  });

  const submitBtn = h('button', { class: 'btn', type: 'button', style: 'display:none;' }, '🚀 Messungen importieren');

  async function processCsvText(text, explicitDelimiter = null) {
    rawCsvText = text;
    err.textContent = '';
    infoMsg.textContent = 'Lese Spalten ein...';

    try {
      const res = await api(`/aquariums/${aq.id}/measurements/parse-csv-header`, {
        method: 'POST',
        body: { csvText: text, delimiter: explicitDelimiter },
      });

      parsedHeaders = res.headers || [];
      parsedSampleRows = res.sampleRows || [];
      currentDelimiter = res.delimiter || ';';
      delimiterSelect.value = currentDelimiter;
      totalDataRowCount = res.totalDataRows || 0;

      renderMappingMask(res.autoMapping || {});
    } catch (ex) {
      err.textContent = ex.message;
      mappingSection.style.display = 'none';
      submitBtn.style.display = 'none';
    }
  }

  function renderMappingMask(autoMapping) {
    columnSelects.length = 0;
    const allParams = CONFIG.allParameters || CONFIG.parameters || [];

    const rows = parsedHeaders.map((headerText, colIdx) => {
      const select = h('select', {});
      select.appendChild(h('option', { value: 'ignore' }, '-- Spalte ignorieren --'));
      select.appendChild(h('option', { value: 'measured_at' }, '📅 Datum / Messzeitpunkt (Pflicht)'));
      select.appendChild(h('option', { value: 'time' }, '🕒 Uhrzeit (optional)'));
      select.appendChild(h('option', { value: 'note' }, '📝 Notiz / Bemerkung'));

      const optGroup = document.createElement('optgroup');
      optGroup.label = 'Wasserparameter';
      allParams.forEach((p) => {
        const label = p.unit ? `${p.name} (${p.unit})` : p.name;
        optGroup.appendChild(h('option', { value: p.key }, `🧪 ${label}`));
      });
      select.appendChild(optGroup);

      const detected = autoMapping[colIdx] || 'ignore';
      select.value = detected;
      columnSelects.push(select);

      const samples = parsedSampleRows.map((r) => r[colIdx] || '').filter(Boolean).slice(0, 2);
      const sampleText = samples.length ? samples.join(' | ') : '–';

      return h('tr', {},
        h('td', {}, h('strong', {}, headerText || `Spalte ${colIdx + 1}`)),
        h('td', { class: 'csv-sample-preview', title: sampleText }, sampleText),
        h('td', {}, select)
      );
    });

    const table = h('table', { class: 'csv-mapping-table' },
      h('thead', {},
        h('tr', {},
          h('th', { style: 'width: 30%;' }, 'CSV-Spalte'),
          h('th', { style: 'width: 35%;' }, 'Beispielwerte'),
          h('th', { style: 'width: 35%;' }, 'Zuordnung zu Aquarium-Feld')
        )
      ),
      h('tbody', {}, rows)
    );

    mappingTableWrap.replaceChildren(table);
    mappingSection.style.display = 'block';
    submitBtn.style.display = 'inline-block';
    infoMsg.textContent = `📊 ${parsedHeaders.length} Spalten und ${totalDataRowCount} Messzeilen erkannt. Bitte prüfe die automatische Zuordnung.`;
  }

  submitBtn.addEventListener('click', async () => {
    err.textContent = '';
    const mapping = {};
    let dateMapped = false;

    columnSelects.forEach((sel, idx) => {
      const val = sel.value;
      mapping[idx] = val;
      if (val === 'measured_at' || val === 'date') dateMapped = true;
    });

    if (!dateMapped) {
      err.textContent = 'Bitte ordne mindestens eine Spalte dem „Datum / Messzeitpunkt“ zu.';
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = '⏳ Importiere...';

    try {
      const res = await api(`/aquariums/${aq.id}/measurements/import-csv`, {
        method: 'POST',
        body: {
          csvText: rawCsvText,
          mapping,
          delimiter: currentDelimiter,
          hasHeader: hasHeaderCheckbox.checked,
        },
      });

      dlg.close();
      let msg = `Erfolgreich ${res.imported} Messungen importiert!`;
      if (res.skipped > 0) msg += ` (${res.skipped} Zeilen übersprungen)`;
      if (res.alerts > 0) msg += ` · ⚠️ ${res.alerts} Alarme ausgelöst`;
      toast(msg);
      route();
    } catch (ex) {
      err.textContent = ex.message;
      submitBtn.disabled = false;
      submitBtn.textContent = '🚀 Messungen importieren';
    }
  });

  const content = h('div', { class: 'stack' },
    h('div', { class: 'row between' },
      h('h2', { style: 'margin:0' }, `📥 Messwerte importieren: „${aq.name}“`),
      h('button', { class: 'btn small ghost', type: 'button', onclick: () => dlg.close() }, '✕')
    ),
    h('p', { class: 'muted' }, 'Lade eine CSV-Datei hoch (z. B. aus Excel, Google Sheets, Testkoffern oder anderen Apps). Die Spalten können interaktiv den Wasserparametern zugeordnet werden.'),
    fileInput,
    dropZone,
    h('div', { class: 'row between', style: 'align-items: center;' },
      togglePasteBtn,
      h('div', { class: 'row', style: 'align-items: center; gap: .5rem;' },
        h('label', { class: 'muted', style: 'font-size:.85rem;' }, 'Trennzeichen:'),
        delimiterSelect
      )
    ),
    pasteTextarea,
    infoMsg,
    err,
    mappingSection,
    h('div', { class: 'row between', style: 'margin-top: 1rem; align-items: center;' },
      h('label', { class: 'row', style: 'gap:.4rem; cursor:pointer; font-size:.9rem;' },
        hasHeaderCheckbox,
        h('span', {}, 'Erste Zeile enthält Spaltennamen (Kopfzeile)')
      ),
      h('div', { class: 'row' },
        submitBtn,
        h('button', { class: 'btn ghost', type: 'button', onclick: () => dlg.close() }, 'Abbrechen')
      )
    )
  );

  mappingSection.appendChild(mappingTableWrap);
  dlg.appendChild(content);
  dlg.addEventListener('close', () => dlg.remove());
  document.body.appendChild(dlg);
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
  let measUrl = `/aquariums/${id}/measurements`;
  let logsUrl = `/aquariums/${id}/logs`;
  if (RANGE === 'custom' && (CUSTOM_FROM || CUSTOM_TO)) {
    const params = new URLSearchParams();
    if (CUSTOM_FROM) params.append('from', CUSTOM_FROM);
    if (CUSTOM_TO) params.append('to', CUSTOM_TO);
    measUrl += `?${params.toString()}`;
    logsUrl += `?${params.toString()}`;
  } else {
    const days = Number(RANGE) || 90;
    measUrl += `?days=${days}`;
    logsUrl += `?days=${days}`;
  }

  const [d, ms, logs, images] = await Promise.all([
    api(`/aquariums/${id}`),
    api(measUrl),
    api(logsUrl),
    api(`/aquariums/${id}/images`),
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
    topActions.push(h('button', { class: 'btn ghost', type: 'button', onclick: () => importMeasurementsDialog(aq) }, '📥 CSV-Import'));
    if (isOwner) topActions.push(h('button', { class: 'btn ghost', type: 'button', onclick: () => shareDialog(aq) }, 'Teilen'));
    topActions.push(h('button', { class: 'btn ghost', type: 'button', onclick: () => aquariumDialog(aq) }, 'Bearbeiten'));
  }
  topActions.push(h('button', { class: 'btn ghost', type: 'button', onclick: () => exportMeasurementsDialog(aq) }, '📤 Exportieren'));
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
      h('h1', { style: 'margin-bottom:.2rem' }, aq.name),
      aq.motto ? h('div', { class: 'aq-motto' }, aq.motto) : null,
      h('div', { class: 'muted' },
        CONFIG.waterTypes[aq.water_type],
        aq.volume_l ? ` · ${aq.volume_l} l` : '',
        aq.last_measured_at ? ` · zuletzt gemessen ${fmtDate(aq.last_measured_at)}` : '',
        aq.last_water_change_at ? ` · letzter Wasserwechsel ${fmtDate(aq.last_water_change_at)}${aq.last_water_change_percent ? ' (' + aq.last_water_change_percent + ' %)' : ''}` : ''),
      !isOwner ? h('div', { style: 'margin-top:.35rem' },
        h('span', { class: `chip ${isReadOnly ? 'none' : 'ok'}` }, `Geteilt von ${aq.owner_username || 'Besitzer'} · ${isReadOnly ? 'Nur Lesezugriff' : 'Schreibzugriff'}`)) : null),
    h('div', { class: 'row' }, topActions)));

  if (aq.description) {
    nodes.push(h('div', { class: 'aq-desc-box stack' },
      h('strong', { style: 'font-size:.95rem' }, '📖 Über dieses Aquarium'),
      h('div', {}, aq.description)
    ));
  }

  if (aq.notes) nodes.push(h('p', { class: 'muted' }, aq.notes));

  // Fotogalerie & Beckenbilder
  const galleryCards = (images || []).map((img) => {
    return h('div', { class: 'gallery-card' },
      h('div', { class: 'gallery-img-wrap', onclick: () => showImageModal({ src: `api/aquariums/${id}/images/${img.id}`, title: aq.name, caption: img.caption }) },
        h('img', { class: 'gallery-img', src: `api/aquariums/${id}/images/${img.id}`, alt: img.caption || aq.name, loading: 'lazy' }),
        img.is_primary ? h('span', { class: 'gallery-primary-badge' }, '★ Titelbild') : null
      ),
      h('div', { class: 'gallery-card-body' },
        img.caption ? h('div', { class: 'gallery-caption' }, img.caption) : h('div', { class: 'muted', style: 'font-size:.82rem' }, 'Keine Bildunterschrift'),
        h('div', { class: 'muted', style: 'font-size:.78rem' }, fmtDate(img.created_at)),
        !isReadOnly ? h('div', { class: 'gallery-actions' },
          !img.is_primary ? h('button', { class: 'btn small ghost', type: 'button', title: 'Als Titelbild festlegen', onclick: async () => {
            await api(`/aquariums/${id}/images/${img.id}/primary`, { method: 'PUT' });
            toast('Titelbild festgelegt.');
            route();
          } }, '★ Titelbild') : null,
          h('button', { class: 'btn small ghost', type: 'button', title: 'Bildunterschrift bearbeiten', onclick: () => editImageCaptionDialog(aq, img) }, '✏️ Text'),
          h('button', { class: 'btn small ghost danger', type: 'button', title: 'Foto löschen', onclick: async () => {
            if (!confirm('Dieses Foto wirklich löschen?')) return;
            await api(`/aquariums/${id}/images/${img.id}`, { method: 'DELETE' });
            toast('Foto gelöscht.');
            route();
          } }, '🗑️ Löschen')
        ) : null
      )
    );
  });

  const galleryHeader = h('div', { class: 'row between', style: 'align-items: center;' },
    h('h2', { style: 'margin:0' }, `📸 Fotogalerie (${images?.length || 0})`),
    !isReadOnly ? h('button', { class: 'btn small', type: 'button', onclick: () => uploadImageDialog(aq) }, '➕ Foto hochladen') : null
  );

  const gallerySection = h('section', { class: 'card stack' },
    galleryHeader,
    galleryCards.length
      ? h('div', { class: 'gallery-grid' }, galleryCards)
      : h('div', { class: 'muted', style: 'text-align:center; padding: 1.2rem 0;' },
          'Noch keine Fotos in der Galerie vorhanden.',
          !isReadOnly ? h('div', { style: 'margin-top:.6rem' },
            h('button', { class: 'btn small ghost', type: 'button', onclick: () => uploadImageDialog(aq) }, 'Erstes Foto hochladen')
          ) : null
        )
  );
  nodes.push(gallerySection);

  // Warnungen, Alarme und Besatz-Kompatibilität
  const notices = [];
  if (aq.measure_cycle_status?.configured) {
    if (aq.measure_cycle_status.is_due) {
      notices.push(h('div', { class: 'alert warn' },
        h('div', {},
          h('strong', {}, '🧪 Messung fällig: '),
          `${aq.measure_cycle_status.status_label} (Messzyklus: ${aq.measure_cycle_status.cycle_label})`
        ),
        !isReadOnly ? h('a', { class: 'btn small', href: `#/a/${id}/messen` }, 'Jetzt messen') : null
      ));
    }
  } else if (aq.overdue) {
    notices.push(h('div', { class: 'alert warn' },
      h('div', {},
        h('strong', {}, '🧪 Messung fällig: '),
        `Die letzte Messung ist länger als ${aq.reminder_days} Tage her.`
      ),
      !isReadOnly ? h('a', { class: 'btn small', href: `#/a/${id}/messen` }, 'Jetzt messen') : null
    ));
  }

  if (aq.fertilize_cycle_status?.configured && aq.fertilize_cycle_status.is_due) {
    notices.push(h('div', { class: 'alert warn' },
      h('div', {},
        h('strong', {}, '🌿 Düngung fällig: '),
        `${aq.fertilize_cycle_status.status_label} (Düngzyklus: ${aq.fertilize_cycle_status.cycle_label})`
      ),
      !isReadOnly ? h('button', { class: 'btn small', type: 'button', onclick: () => maintenanceDialog(aq, 'fertilize') }, 'Düngung eintragen') : null
    ));
  }
  
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

  // Mess- & Düngzyklus Übersicht
  const mStatus = aq.measure_cycle_status || {};
  const fStatus = aq.fertilize_cycle_status || {};

  const mChipClass = !mStatus.configured ? 'none' : mStatus.is_overdue ? 'crit' : mStatus.is_due ? 'warn' : 'ok';
  const fChipClass = !fStatus.configured ? 'none' : fStatus.is_overdue ? 'crit' : fStatus.is_due ? 'warn' : 'ok';

  const cycleSection = h('section', { class: 'card stack' },
    h('div', { class: 'row between', style: 'align-items: center;' },
      h('h2', { style: 'margin:0' }, '📅 Mess- & Düngzyklen'),
      !isReadOnly ? h('button', { class: 'btn small ghost', type: 'button', onclick: () => aquariumDialog(aq) }, '⚙️ Zyklen einstellen') : null
    ),
    h('div', { class: 'grid2', style: 'gap: 1rem;' },
      // Card 1: Messzyklus
      h('div', { class: 'cycle-card stack' },
        h('div', { class: 'row between', style: 'align-items: center;' },
          h('strong', { style: 'font-size: 1.05rem; display:flex; align-items:center; gap:.4rem;' }, '🧪 Messzyklus'),
          h('span', { class: `chip ${mChipClass}` }, mStatus.configured ? mStatus.status_label : 'Nicht festgelegt')
        ),
        h('div', { class: 'muted', style: 'font-size: .9rem;' },
          mStatus.configured
            ? `Intervall: ${mStatus.cycle_label}`
            : 'Kein Messzyklus hinterlegt.'
        ),
        mStatus.configured ? h('div', { class: 'muted', style: 'font-size: .85rem;' },
          `Nächste Fälligkeit: `, h('strong', {}, mStatus.next_due_at ? fmtDate(mStatus.next_due_at) : '–'),
          mStatus.last_action_at ? ` · Zuletzt: ${fmtDate(mStatus.last_action_at)}` : ''
        ) : null,
        h('div', { class: 'row between', style: 'align-items: center; margin-top: .4rem; font-size: .85rem;' },
          h('span', { class: 'muted' }, mStatus.reminder_mail ? '📧 E-Mail-Erinnerung aktiv' : '🔕 Keine E-Mail-Erinnerung'),
          !isReadOnly ? h('a', { class: 'btn small', href: `#/a/${id}/messen` }, '🧪 Jetzt messen') : null
        )
      ),
      // Card 2: Düngzyklus
      h('div', { class: 'cycle-card stack' },
        h('div', { class: 'row between', style: 'align-items: center;' },
          h('strong', { style: 'font-size: 1.05rem; display:flex; align-items:center; gap:.4rem;' }, '🌿 Düngzyklus'),
          h('span', { class: `chip ${fChipClass}` }, fStatus.configured ? fStatus.status_label : 'Nicht festgelegt')
        ),
        h('div', { class: 'muted', style: 'font-size: .9rem;' },
          fStatus.configured
            ? `Intervall: ${fStatus.cycle_label}`
            : 'Kein Düngzyklus hinterlegt.'
        ),
        fStatus.configured ? h('div', { class: 'muted', style: 'font-size: .85rem;' },
          `Nächste Fälligkeit: `, h('strong', {}, fStatus.next_due_at ? fmtDate(fStatus.next_due_at) : '–'),
          fStatus.last_action_at ? ` · Zuletzt: ${fmtDate(fStatus.last_action_at)}` : ''
        ) : null,
        h('div', { class: 'row between', style: 'align-items: center; margin-top: .4rem; font-size: .85rem;' },
          h('span', { class: 'muted' }, fStatus.reminder_mail ? '📧 E-Mail-Erinnerung aktiv' : '🔕 Keine E-Mail-Erinnerung'),
          !isReadOnly ? h('button', { class: 'btn small', type: 'button', onclick: () => maintenanceDialog(aq, 'fertilize') }, '🌿 Düngung eintragen') : null
        )
      )
    )
  );
  nodes.push(cycleSection);

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
    const rangePresets = [
      ['7', '7 Tage'],
      ['14', '14 Tage'],
      ['30', '30 Tage'],
      ['90', '3 Monate (Standard)'],
      ['180', '6 Monate'],
      ['365', '1 Jahr'],
      ['3650', 'Alles'],
      ['custom', '📅 Eigener Zeitraum'],
    ];

    const rangeButtons = rangePresets.map(([val, label]) =>
      h('button', {
        type: 'button',
        'aria-pressed': String(String(RANGE) === String(val)),
        onclick: () => {
          RANGE = val;
          localStorage.setItem(GRAPH_RANGE_STORAGE_KEY, val);
          route();
        }
      }, label)
    );

    const tabs = h('div', { class: 'range-tabs', role: 'group', 'aria-label': 'Zeitraum' }, rangeButtons);

    let customBar = null;
    if (RANGE === 'custom') {
      const fromInput = h('input', { type: 'date', value: CUSTOM_FROM, 'aria-label': 'Startdatum' });
      const toInput = h('input', { type: 'date', value: CUSTOM_TO, 'aria-label': 'Enddatum' });
      const btnApply = h('button', {
        class: 'btn small',
        type: 'button',
        onclick: () => {
          CUSTOM_FROM = fromInput.value;
          CUSTOM_TO = toInput.value;
          localStorage.setItem(GRAPH_CUSTOM_FROM_KEY, CUSTOM_FROM);
          localStorage.setItem(GRAPH_CUSTOM_TO_KEY, CUSTOM_TO);
          route();
        }
      }, 'Filter anwenden');

      const btnReset = h('button', {
        class: 'btn small ghost',
        type: 'button',
        onclick: () => {
          RANGE = '90';
          CUSTOM_FROM = '';
          CUSTOM_TO = '';
          localStorage.setItem(GRAPH_RANGE_STORAGE_KEY, '90');
          localStorage.removeItem(GRAPH_CUSTOM_FROM_KEY);
          localStorage.removeItem(GRAPH_CUSTOM_TO_KEY);
          route();
        }
      }, 'Zurücksetzen (3 Monate)');

      customBar = h('div', { class: 'custom-range-bar' },
        h('label', {}, 'Von:', fromInput),
        h('label', {}, 'Bis:', toInput),
        btnApply,
        btnReset
      );
    }

    let rangeDesc = '';
    if (RANGE === 'custom') {
      if (CUSTOM_FROM && CUSTOM_TO) rangeDesc = `Benutzerdefinierter Zeitraum: ${CUSTOM_FROM} bis ${CUSTOM_TO}`;
      else if (CUSTOM_FROM) rangeDesc = `Ab ${CUSTOM_FROM}`;
      else if (CUSTOM_TO) rangeDesc = `Bis ${CUSTOM_TO}`;
      else rangeDesc = 'Benutzerdefinierter Zeitraum (Bitte Start- und/oder Enddatum wählen)';
    } else {
      const match = rangePresets.find(([v]) => v === String(RANGE));
      rangeDesc = match ? `Zeitraum: ${match[1]}` : `Zeitraum: ${RANGE} Tage`;
    }

    nodes.push(h('section', { class: 'stack' },
      h('div', { class: 'row between', style: 'align-items:flex-start; flex-wrap:wrap; gap:.6rem;' },
        h('div', {},
          h('h2', { style: 'margin:0' }, 'Verlauf'),
          h('div', { class: 'muted', style: 'font-size:.85rem; margin-top:.2rem;' }, rangeDesc)
        ),
        tabs
      ),
      customBar,
      chartCards.length ? h('div', { class: 'charts' }, chartCards.map((c) => c.card)) : h('p', { class: 'muted' }, 'In diesem Zeitraum gibt es keine Messungen.'),
      chartCards.length ? h('p', { class: 'muted' }, 'Grüner Bereich = Zielbereich, rot gestrichelt = kritische Grenze.') : null
    ));
  }

  // Besatz & Bewohner
  const sp = h('input', { list: 'species', maxlength: '80', required: true, placeholder: 'z. B. Siamesischer Kampffisch, Neonsalmler...' });
  const inhabitantName = h('input', { maxlength: '80', placeholder: 'z. B. Bubbles, Nemo, Rambo, Gruppe 1...' });
  const cnt = h('input', { type: 'number', min: '1', max: '10000', value: '1', inputmode: 'numeric' });
  const prof = h('select', {}, Object.entries(CONFIG.profiles).map(([k, v]) => h('option', { value: k }, v)));
  const previewBox = h('div', { class: 'species-preview', style: 'display:none; margin-top:.4rem' });

  let stockImageBase64 = null;
  const stockFileInput = h('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp,image/gif' });
  const stockPreviewImg = h('img', { class: 'img-preview', style: 'display:none; max-height: 120px; object-fit: cover;' });
  const btnRemoveStockImg = h('button', { class: 'btn small ghost', type: 'button', style: 'display:none' }, 'Foto entfernen');

  stockFileInput.addEventListener('change', () => {
    const file = stockFileInput.files[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      stockErr.textContent = 'Das Bild ist größer als 5 MB.';
      stockFileInput.value = '';
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      stockImageBase64 = ev.target.result;
      stockPreviewImg.src = stockImageBase64;
      stockPreviewImg.style.display = 'block';
      btnRemoveStockImg.style.display = 'inline-flex';
      stockErr.textContent = '';
    };
    reader.readAsDataURL(file);
  });

  btnRemoveStockImg.addEventListener('click', () => {
    stockImageBase64 = null;
    stockFileInput.value = '';
    stockPreviewImg.removeAttribute('src');
    stockPreviewImg.style.display = 'none';
    btnRemoveStockImg.style.display = 'none';
  });

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

    const avatarNode = s.has_image
      ? h('img', {
          class: 'stock-avatar',
          src: `api/aquariums/${id}/stock/${s.id}/image?t=${Date.now()}`,
          alt: s.name || s.species,
          title: 'Klicken für Großansicht',
          onclick: () => showImageModal({
            src: `api/aquariums/${id}/stock/${s.id}/image`,
            title: s.name ? `${s.name} (${s.species})` : s.species,
            caption: `${s.count} × ${s.species}${s.scientificName ? ' (' + s.scientificName + ')' : ''}`,
          }),
        })
      : h('div', { class: 'stock-avatar-placeholder', title: s.species },
          (s.category === 'Wirbellose' || spMatch?.category === 'Wirbellose') ? '🦐'
          : (aq.water_type === 'salt' || spMatch?.waterType === 'salt') ? '🐠'
          : '🐟'
        );

    return h('li', { class: 'stock-item' },
      h('div', { class: 'stock-item-main' },
        avatarNode,
        h('div', {},
          s.name ? [
            h('div', { class: 'stock-name-title' }, s.name),
            h('div', { class: 'stock-species-sub' },
              `${s.count} × ${s.species}`,
              s.scientificName ? h('span', { style: 'font-style:italic;margin-left:.3rem' }, `(${s.scientificName})`) : null,
              h('span', { class: 'muted', style: 'margin-left:.3rem' }, `· ${CONFIG.profiles[s.profile] || s.profile}`)
            )
          ] : [
            h('div', { class: 'stock-name-title' }, `${s.count} × ${s.species}`),
            h('div', { class: 'stock-species-sub' },
              s.scientificName ? h('span', { style: 'font-style:italic;margin-right:.3rem' }, `(${s.scientificName}) · `) : null,
              `${CONFIG.profiles[s.profile] || s.profile}`
            )
          ],
          chips.length ? h('div', { style: 'margin-top:.3rem' }, chips) : null
        )
      ),
      h('div', { class: 'row', style: 'gap:.35rem' },
        h('button', { class: 'btn small ghost', type: 'button', onclick: () => showSpeciesModal(spMatch || s.species) }, 'Arten-Info'),
        !isReadOnly ? h('button', { class: 'btn small ghost', type: 'button', onclick: () => editStockDialog(aq, s) }, '✏️ Bearbeiten') : null,
        !isReadOnly ? h('button', { class: 'btn small ghost danger', type: 'button', 'aria-label': `${s.name || s.species} entfernen`, onclick: async () => {
          if (!confirm(`„${s.name || s.species}“ wirklich entfernen?`)) return;
          await api(`/aquariums/${id}/stock/${s.id}`, { method: 'DELETE' });
          route();
        } }, 'Entfernen') : null
      )
    );
  });

  const stockNodes = [
    h('div', { class: 'row between' },
      h('h2', { style: 'margin:0' }, 'Besatz & Tierwohl'),
      h('a', { class: 'btn small ghost', href: '#/species' }, '📖 Artenkatalog')
    ),
    h('p', { class: 'muted' }, 'Die Fisch- und Wirbellosenarten bestimmen die optimalen Grenzwerte und werden auf Verträglichkeit, Gruppengröße sowie Territorialverhalten geprüft.'),
    d.stock.length ? h('ul', { class: 'stock-list' }, stockListItems)
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
      h('form', { class: 'stack', style: 'margin-top:1.2rem', onsubmit: async (e) => {
        e.preventDefault(); stockErr.textContent = '';
        try {
          await api(`/aquariums/${id}/stock`, {
            method: 'POST',
            body: {
              species: sp.value.trim(),
              name: inhabitantName.value.trim() || null,
              count: cnt.value,
              profile: prof.value,
              image: stockImageBase64,
            },
          });
          route();
        } catch (ex) {
          stockErr.textContent = ex.message;
        }
      } },
      h('h3', { style: 'margin:0' }, 'Neuen Bewohner hinzufügen'),
      h('div', { class: 'grid2' },
        h('div', { class: 'field' }, h('label', {}, 'Art / Spezies'), sp),
        h('div', { class: 'field' }, h('label', {}, 'Individueller Name / Bezeichnung (optional)'), inhabitantName)
      ),
      h('div', { class: 'grid2' },
        h('div', { class: 'field' }, h('label', {}, 'Anzahl'), cnt),
        h('div', { class: 'field' }, h('label', {}, 'Ansprüche an das Wasser'), prof)
      ),
      previewBox,
      h('div', { class: 'field' },
        h('label', {}, 'Foto des Bewohners (optional, PNG, JPG, WebP, GIF bis 5 MB)'),
        stockFileInput,
        stockPreviewImg,
        h('div', { style: 'margin-top:.3rem' }, btnRemoveStockImg)
      ),
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
    nodes.push(h('section', { class: 'card stack' },
      h('div', { class: 'row between', style: 'align-items: center;' },
        h('h2', { style: 'margin:0' }, 'Messwerte-Tabelle'),
        h('div', { class: 'row' },
          h('button', { class: 'btn small ghost', type: 'button', onclick: () => exportMeasurementsDialog(aq) }, '📤 Exportieren (CSV/Excel)'),
          !isReadOnly ? h('button', { class: 'btn small ghost', type: 'button', onclick: () => importMeasurementsDialog(aq) }, '📥 Messungen importieren (CSV)') : null
        )
      ),
      h('div', { class: 'table-wrap' }, h('table', {},
        h('thead', {}, h('tr', {}, h('th', {}, 'Zeitpunkt'), used.map((p) => h('th', {}, p.name.replace(/ \(.*\)/, ''), p.unit ? ` (${p.unit})` : ''), ), h('th', {}, 'Notiz'), !isReadOnly ? h('th', {}, '') : null)),
        h('tbody', {}, [...ms].reverse().slice(0, 40).map((m) => h('tr', {}, h('td', {}, fmtDate(m.measured_at)),
          used.map((p) => { const v = m.values[p.key]; const st = v == null ? null : evaluate(d.thresholds[p.key], v); return h('td', { class: st === 'crit' ? 'v-crit' : st === 'warn' ? 'v-warn' : '' }, v == null ? '–' : fmtNum(p, v)); }),
          h('td', {}, m.note || ''),
          !isReadOnly ? h('td', {}, h('button', { class: 'btn small ghost', type: 'button', onclick: async () => { if (!confirm('Diese Messung löschen?')) return; await api(`/aquariums/${id}/measurements/${m.id}`, { method: 'DELETE' }); route(); } }, 'Löschen')) : null))))),
      ms.length > 40 ? h('p', { class: 'muted' }, 'Es werden die letzten 40 Messungen des Zeitraums angezeigt.') : null
    ));
  } else if (!isReadOnly) {
    nodes.push(h('section', { class: 'card stack' },
      h('div', { class: 'row between', style: 'align-items: center;' },
        h('div', {},
          h('h2', { style: 'margin:0' }, '🧪 Noch keine Messwerte im gewählten Zeitraum'),
          h('div', { class: 'muted' }, 'Trage eine neue Messung ein oder importiere historische Messdaten bequem per CSV / Excel.')
        ),
        h('div', { class: 'row' },
          h('a', { class: 'btn small', href: `#/a/${id}/messen` }, '🧪 Messung eintragen'),
          h('button', { class: 'btn small ghost', type: 'button', onclick: () => importMeasurementsDialog(aq) }, '📥 CSV-Import')
        )
      )
    ));
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

/* ---------- Push- & Timer-Benachrichtigungen ---------- */
let swRegistration = null;

async function initServiceWorker() {
  if ('serviceWorker' in navigator) {
    try {
      swRegistration = await navigator.serviceWorker.register('sw.js');
    } catch (e) {
      /* Service Worker nicht registrierbar */
    }
  }
}

const pushNotificationManager = {
  isSupported() {
    return 'Notification' in window;
  },
  getPermission() {
    if (!this.isSupported()) return 'unsupported';
    return Notification.permission;
  },
  async requestPermission() {
    if (!this.isSupported()) return 'unsupported';
    try {
      const p = await Notification.requestPermission();
      return p;
    } catch (e) {
      return Notification.permission;
    }
  },
  scheduleTimer(data) {
    if (navigator.serviceWorker && navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage({
        type: 'SCHEDULE_TIMER',
        ...data,
      });
    }
  },
  cancelTimer(data) {
    if (navigator.serviceWorker && navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage({
        type: 'CANCEL_TIMER',
        ...data,
      });
    }
  },
  clearAllTimers() {
    if (navigator.serviceWorker && navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage({
        type: 'CLEAR_ALL_TIMERS',
      });
    }
  },
  async notify({ title, body, tag, waitSec, url }) {
    beep();
    if (!this.isSupported() || Notification.permission !== 'granted') return;

    const mins = waitSec ? Math.max(1, Math.round(waitSec / 60)) : null;
    const desc = body || (mins ? `Die Wartezeit (${mins} Min.) ist abgelaufen. Bitte Farbwert ablesen!` : 'Wartezeit abgelaufen!');

    try {
      if (swRegistration && swRegistration.showNotification) {
        await swRegistration.showNotification(title, {
          body: desc,
          icon: 'icon-192.png',
          badge: 'favicon-32x32.png',
          tag: tag || 'aquarium-timer',
          renotify: true,
          requireInteraction: true,
          vibrate: [250, 100, 250, 100, 350],
          data: { url: url || location.href },
        });
        return;
      }
    } catch (e) {
      /* Fallback */
    }

    try {
      const n = new Notification(title, {
        body: desc,
        icon: 'icon-192.png',
        badge: 'favicon-32x32.png',
        tag: tag || 'aquarium-timer',
        renotify: true,
        requireInteraction: true,
      });
      n.onclick = () => {
        window.focus();
        n.close();
      };
    } catch (e) {
      /* Benachrichtigung nicht darstellbar */
    }
  }
};

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
      btn.addEventListener('click', async () => {
        try { audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)(); audioCtx.resume(); } catch (e) { /* ohne Ton */ }
        if (pushNotificationManager.getPermission() === 'default') {
          pushNotificationManager.requestPermission().then(() => updateNotificationBanner());
        }
        if (timers[p.key] && timers[p.key] > Date.now()) {
          delete timers[p.key];
          pushNotificationManager.cancelTimer({ timerId: `${id}:${p.key}`, testKey: p.key, aquariumId: id });
        } else {
          timers[p.key] = Date.now() + p.wait * 1000;
          pushNotificationManager.scheduleTimer({
            timerId: `${id}:${p.key}`,
            testKey: p.key,
            testName: p.name,
            aquariumId: id,
            aquariumName: aq.name,
            waitSec: p.wait,
            endTime: timers[p.key],
            url: location.href,
          });
        }
        finished.delete(p.key); saveTimers(); render(); updateWake();
      });
      rows.set(p.key, { p, el, fill, clock, btn, input });
      list.append(el);
    }
  }

  function applyVisibility() {
    for (const [k, r] of rows) r.el.hidden = !selected.includes(k);
  }

  const notificationBanner = h('div');
  const updateNotificationBanner = () => {
    notificationBanner.replaceChildren();
    if (!pushNotificationManager.isSupported()) return;
    const perm = pushNotificationManager.getPermission();
    if (perm === 'default') {
      const btnEnable = h('button', {
        class: 'btn small',
        type: 'button',
        onclick: async () => {
          const res = await pushNotificationManager.requestPermission();
          updateNotificationBanner();
          if (res === 'granted') toast('Push-Benachrichtigungen aktiviert!');
        }
      }, '🔔 Aktivieren');

      notificationBanner.className = 'notification-banner info';
      notificationBanner.append(
        h('div', { class: 'notification-banner-content' },
          h('span', { class: 'notification-banner-icon' }, '🔔'),
          h('div', {},
            h('strong', {}, 'Push-Benachrichtigungen für Timer'),
            h('p', { style: 'margin:0; font-size:.84rem; color:var(--ink-soft)' },
              'Erhalte automatische Benachrichtigungen bei Timer-Ablauf – auch wenn der Tab im Hintergrund liegt.'
            )
          )
        ),
        btnEnable
      );
    } else if (perm === 'granted') {
      notificationBanner.className = 'notification-banner active';
      notificationBanner.append(
        h('div', { class: 'notification-banner-content' },
          h('span', { class: 'notification-banner-icon' }, '🔔'),
          h('div', {},
            h('strong', {}, 'Push-Benachrichtigungen aktiv'),
            h('p', { style: 'margin:0; font-size:.84rem; color:var(--ink-soft)' },
              'Du wirst zuverlässig benachrichtigt, sobald ein Test bereit zur Auswertung ist.'
            )
          )
        )
      );
    } else if (perm === 'denied') {
      notificationBanner.className = 'notification-banner warn';
      notificationBanner.append(
        h('div', { class: 'notification-banner-content' },
          h('span', { class: 'notification-banner-icon' }, '🔕'),
          h('div', {},
            h('strong', {}, 'Push-Benachrichtigungen im Browser blockiert'),
            h('p', { style: 'margin:0; font-size:.84rem; color:var(--ink-soft)' },
              'Für Hintergrund-Alarme bitte Benachrichtigungen in den Website-Einstellungen deines Browsers erlauben.'
            )
          )
        )
      );
    }
  };
  updateNotificationBanner();

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
        if (!finished.has(k)) {
          finished.add(k);
          pushNotificationManager.notify({
            title: `⏱️ ${r.p.name}: Wartezeit abgelaufen!`,
            body: `Die Wartezeit (${Math.max(1, Math.round(r.p.wait / 60))} Min.) für „${aq.name}“ ist vorbei. Bitte jetzt Farbwert ablesen!`,
            tag: `timer-${id}-${k}`,
            waitSec: r.p.wait,
            url: location.href,
          });
          toast(`${r.p.name}: Zeit abgelaufen, jetzt ablesen.`);
          updateWake();
        }
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
    notificationBanner,
    form));

  const tick = setInterval(render, 250);
  cleanups.push(() => { clearInterval(tick); if (wakeLock) wakeLock.release().catch(() => {}); });
}

/* ---------- Admin / Benutzerverwaltung ---------- */
async function viewAdmin() {
  const [users, logData, backupData, mailData, regData, legalData] = await Promise.all([
    api('/admin/users'),
    api('/admin/logs').catch(() => ({ logs: [], logPath: 'data/aquarium.log' })),
    api('/admin/backups').catch(() => ({ backups: [], config: { enabled: false, intervalHours: 24, retentionCount: 10, includeFiles: true } })),
    api('/admin/mail').catch(() => ({ config: { enabled: false, host: '', port: 587, secure: false, requireTls: false, from: '', user: '', rateLimitMs: 500, hasPassword: false }, queue: { queueLength: 0, sentCount: 0, failedCount: 0 } })),
    api('/admin/registration').catch(() => ({ config: { mode: 'open', userCodeMaxDays: 7, mailInviteMaxDays: 14 }, invitations: [] })),
    api('/admin/legal-config').catch(() => ({ config: { contactEmail: '', imprintEmail: '' } })),
  ]);

  const backups = backupData.backups || [];
  const backupConfig = backupData.config || { enabled: false, intervalHours: 24, retentionCount: 10, includeFiles: true };
  const mailConfig = mailData.config || { enabled: false, host: '', port: 587, secure: false, requireTls: false, from: '', user: '', rateLimitMs: 500, hasPassword: false };
  const mailQueue = mailData.queue || { queueLength: 0, sentCount: 0, failedCount: 0, lastSentAt: null, lastError: null };
  const regConfig = regData.config || { mode: 'open', userCodeMaxDays: 7, mailInviteMaxDays: 14 };
  const adminInvitations = regData.invitations || [];

  const rows = users.map((u) => {
    const isSelf = u.id === ME.id;
    const authTypes = [];
    if (u.hasPassword) authTypes.push('Passwort');
    if (u.hasOidc) authTypes.push(`Pocket ID${u.oidcSub ? ` (${u.oidcSub})` : ''}`);
    if (!authTypes.length) authTypes.push('–');

    return h('tr', {},
      h('td', {}, h('strong', {}, u.username), isSelf ? h('span', { class: 'muted' }, ' (Du)') : null),
      h('td', {}, u.email || h('span', { class: 'muted' }, '–')),
      h('td', {}, u.emailVerified ? h('span', { class: 'chip ok' }, '✓ Verifiziert') : h('span', { class: 'chip warn' }, 'Unbestätigt')),
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
              toast(`Benutzer „${u.username}�� gelöscht.`);
              await viewAdmin();
            } catch (ex) { toast(ex.message); }
          } }, 'Löschen') : null
        )
      )
    );
  });

  /* ---------- Registrierungs- & Einladungs-Verwaltung (Admin) ---------- */
  const regErr = h('p', { class: 'error', role: 'alert' });

  const selMode = h('select', { style: 'max-width:340px;' },
    h('option', { value: 'open', selected: regConfig.mode === 'open' }, '🟢 Offen (Jeder kann sich einfach registrieren)'),
    h('option', { value: 'invite_admin', selected: regConfig.mode === 'invite_admin' }, '🔒 Einladung (Admin) (Nur Admins können einladen)'),
    h('option', { value: 'invite_open', selected: regConfig.mode === 'invite_open' }, '👥 Einladung (Offen) (Jeder registrierte Nutzer kann einladen)'),
    h('option', { value: 'closed', selected: regConfig.mode === 'closed' }, '⛔ Geschlossen (Keine neuen Einladungen/Registrierungen)')
  );

  const inpUserCodeMaxDays = h('input', {
    type: 'number',
    min: '1',
    max: '365',
    value: String(regConfig.userCodeMaxDays || 7),
    style: 'max-width:110px;',
  });

  const btnSaveRegConfig = h('button', {
    class: 'btn small',
    type: 'button',
    onclick: async () => {
      regErr.textContent = '';
      try {
        const body = {
          mode: selMode.value,
          userCodeMaxDays: Number(inpUserCodeMaxDays.value) || 7,
          mailInviteMaxDays: 14,
        };
        await api('/admin/registration/config', { method: 'PUT', body });
        toast('Registrierungs-Einstellungen erfolgreich gespeichert.');
        await viewAdmin();
      } catch (ex) {
        regErr.textContent = ex.message;
      }
    }
  }, 'Registrierungs-Einstellungen speichern');

  // Admin-Einladung erstellen
  const selAdminInvType = h('select', { style: 'max-width:140px;' },
    h('option', { value: 'code', selected: true }, 'Code erstellen'),
    h('option', { value: 'mail' }, 'Per E-Mail versenden')
  );
  const inpAdminCustomCode = h('input', { placeholder: 'Code (leer für Zufall)', maxlength: '40', style: 'max-width:200px;' });
  const inpAdminMailTo = h('input', { type: 'email', placeholder: 'empfaenger@example.com', maxlength: '120', style: 'max-width:240px; display:none;' });
  const inpAdminMaxUses = h('input', { type: 'number', min: '0', max: '10000', value: '1', placeholder: '0 = unbegrenzt', style: 'max-width:110px;' });
  const inpAdminDays = h('input', { type: 'number', min: '1', max: '365', value: '14', style: 'max-width:90px;' });
  const inpAdminNote = h('input', { placeholder: 'Optionale Notiz', maxlength: '200', style: 'max-width:220px;' });

  selAdminInvType.addEventListener('change', () => {
    const isMail = selAdminInvType.value === 'mail';
    inpAdminMailTo.style.display = isMail ? '' : 'none';
    inpAdminCustomCode.style.display = isMail ? 'none' : '';
    inpAdminMaxUses.style.display = isMail ? 'none' : '';
    if (isMail) {
      inpAdminDays.value = '14';
      inpAdminDays.max = '14';
    } else {
      inpAdminDays.max = '365';
    }
  });

  const btnAdminCreateInv = h('button', {
    class: 'btn small',
    type: 'button',
    onclick: async () => {
      regErr.textContent = '';
      try {
        const isMail = selAdminInvType.value === 'mail';
        const body = {
          type: selAdminInvType.value,
          code: !isMail && inpAdminCustomCode.value.trim() ? inpAdminCustomCode.value.trim() : undefined,
          email: isMail ? inpAdminMailTo.value.trim() : undefined,
          maxUses: isMail ? 1 : (Number(inpAdminMaxUses.value) || 0),
          days: Number(inpAdminDays.value) || 14,
          note: inpAdminNote.value.trim() || undefined,
        };
        const res = await api('/admin/invitations', { method: 'POST', body });
        toast(res.message || 'Einladung erfolgreich erstellt.');
        inpAdminCustomCode.value = '';
        inpAdminMailTo.value = '';
        inpAdminNote.value = '';
        await viewAdmin();
      } catch (ex) {
        regErr.textContent = ex.message;
      }
    }
  }, '➕ Einladung erstellen');

  const baseUrl = location.origin + location.pathname;
  const adminInvRows = adminInvitations.map((inv) => {
    let statusBadge = h('span', { class: 'chip ok' }, '✓ Aktiv');
    if (inv.status === 'exhausted') statusBadge = h('span', { class: 'chip none' }, 'Eingelöst');
    else if (inv.status === 'expired') statusBadge = h('span', { class: 'chip warn' }, 'Abgelaufen');

    const usesText = inv.maxUses === 0 || inv.maxUses == null ? `${inv.usedCount} / ∞` : `${inv.usedCount} / ${inv.maxUses}`;
    const inviteLink = `${baseUrl}#/register?invite=${encodeURIComponent(inv.code)}${inv.email ? `&email=${encodeURIComponent(inv.email)}` : ''}`;

    const btnCopy = h('button', {
      class: 'btn small ghost',
      type: 'button',
      title: 'Einladungslink kopieren',
      onclick: async () => {
        try {
          await navigator.clipboard.writeText(inviteLink);
          toast('Einladungslink kopiert!');
        } catch (e) {
          prompt('Einladungslink kopieren:', inviteLink);
        }
      }
    }, '📋 Kopieren');

    const btnDel = h('button', {
      class: 'btn small danger',
      type: 'button',
      onclick: async () => {
        if (!confirm(`Einladung „${inv.code}“ wirklich löschen?`)) return;
        try {
          await api(`/admin/invitations/${inv.id}`, { method: 'DELETE' });
          toast('Einladung gelöscht.');
          await viewAdmin();
        } catch (ex) {
          toast(ex.message);
        }
      }
    }, 'Löschen');

    return h('tr', {},
      h('td', {},
        h('strong', { style: 'font-family:monospace; font-size:1.05rem;' }, inv.code),
        inv.email ? h('div', { class: 'muted', style: 'font-size:.82rem;' }, `E-Mail: ${inv.email}`) : null
      ),
      h('td', {}, inv.type === 'mail' ? 'E-Mail' : 'Code'),
      h('td', {}, inv.createdByUsername || 'System'),
      h('td', {}, usesText),
      h('td', {}, fmtDate(inv.expiresAt)),
      h('td', {}, statusBadge),
      h('td', {}, inv.note || h('span', { class: 'muted' }, '–')),
      h('td', {}, h('div', { class: 'row', style: 'gap:.35rem;' }, btnCopy, btnDel))
    );
  });

  const registrationCard = h('div', { class: 'card stack' },
    h('div', { class: 'row between', style: 'align-items:center;' },
      h('div', {},
        h('h2', { style: 'margin:0' }, '🔑 Registrierungs-Modus & Einladungen'),
        h('span', { class: 'muted' }, 'Steuere, wer neue Konten erstellen oder Einladungen verschicken darf.')
      ),
      regConfig.mode === 'open'
        ? h('span', { class: 'chip ok' }, '🟢 Offen')
        : (regConfig.mode === 'invite_admin'
          ? h('span', { class: 'chip info' }, '🔒 Einladung (Admin)')
          : (regConfig.mode === 'invite_open'
            ? h('span', { class: 'chip ok' }, '👥 Einladung (Offen)')
            : h('span', { class: 'chip warn' }, '⛔ Geschlossen')))
    ),
    regErr,
    h('div', { class: 'card stack', style: 'background: var(--paper); border: 1px solid var(--line); padding: 1rem; gap: .75rem;' },
      h('h3', { style: 'margin:0;' }, 'Modus-Auswahl & Code-Gültigkeit'),
      h('div', { class: 'row', style: 'gap: 1rem; flex-wrap: wrap; align-items: center;' },
        h('label', { class: 'row', style: 'gap:.4rem;' }, h('span', { class: 'muted' }, 'Registrierungs-Modus:'), selMode),
        h('label', { class: 'row', style: 'gap:.4rem;' }, h('span', { class: 'muted' }, 'Nutzer-Code Gültigkeit max. (Tage):'), inpUserCodeMaxDays),
        btnSaveRegConfig
      ),
      h('div', { class: 'muted', style: 'font-size:.82rem; line-height:1.4;' },
        '• 🟢 Offen: Jeder Besucher kann sich direkt registrieren. ',
        '• 🔒 Einladung (Admin): Registrierung nur mit Code/Mail-Einladung von Administratoren. ',
        '• 👥 Einladung (Offen): Jeder registrierte Nutzer kann im Profil Einladungen erstellen. ',
        '• ⛔ Geschlossen: Registrierung und Einladungen komplett deaktiviert.'
      )
    ),
    h('div', { class: 'card stack', style: 'background: var(--paper); border: 1px solid var(--line); padding: 1rem; gap: .75rem;' },
      h('h3', { style: 'margin:0;' }, '➕ Neue Einladung erstellen / versenden'),
      h('div', { class: 'row', style: 'gap: .8rem; flex-wrap: wrap; align-items: center;' },
        selAdminInvType,
        inpAdminCustomCode,
        inpAdminMailTo,
        inpAdminMaxUses,
        h('label', { class: 'row', style: 'gap:.3rem;' }, h('span', { class: 'muted' }, 'Tage:'), inpAdminDays),
        inpAdminNote,
        btnAdminCreateInv
      )
    ),
    h('h3', { style: 'margin:.5rem 0 0 0;' }, `Alle erstellten Einladungen (${adminInvitations.length})`),
    h('div', { class: 'table-wrap' },
      h('table', {},
        h('thead', {},
          h('tr', {},
            h('th', {}, 'Code / Empfänger'),
            h('th', {}, 'Typ'),
            h('th', {}, 'Erstellt von'),
            h('th', {}, 'Verwendung'),
            h('th', {}, 'Gültig bis'),
            h('th', {}, 'Status'),
            h('th', {}, 'Notiz'),
            h('th', {}, 'Aktionen')
          )
        ),
        h('tbody', {}, adminInvRows.length ? adminInvRows : h('tr', {}, h('td', { colspan: '8', class: 'muted', style: 'text-align:center; padding:1.2rem;' }, 'Keine Einladungen vorhanden.')))
      )
    )
  );

  /* ---------- Mail / SMTP UI Komponenten ---------- */
  const chkMailEnabled = h('input', { type: 'checkbox', checked: !!mailConfig.enabled, id: 'chk-mail-enabled' });
  const inpMailHost = h('input', { value: mailConfig.host || '', placeholder: 'z. B. smtp.example.com', style: 'max-width:240px;' });
  const inpMailPort = h('input', { type: 'number', value: String(mailConfig.port || 587), style: 'max-width:90px;' });
  
  const encInitial = mailConfig.secure ? 'ssl' : (mailConfig.ignoreTls ? 'none' : 'starttls');
  const selMailEnc = h('select', { style: 'max-width:180px;' },
    h('option', { value: 'starttls', selected: encInitial === 'starttls' }, 'STARTTLS (Standard / 587)'),
    h('option', { value: 'ssl', selected: encInitial === 'ssl' }, 'SSL / TLS direkt (465)'),
    h('option', { value: 'none', selected: encInitial === 'none' }, 'Keine / Unverschlüsselt (25/1025)')
  );

  const inpMailUser = h('input', { value: mailConfig.user || '', placeholder: 'SMTP-Benutzername', style: 'max-width:200px;' });
  const inpMailPass = h('input', {
    type: 'password',
    autocomplete: 'new-password',
    placeholder: mailConfig.hasPassword ? '•••••••• (unverändert)' : 'SMTP-Passwort',
    style: 'max-width:200px;'
  });
  const inpMailFrom = h('input', {
    value: mailConfig.from || 'Aquarium-Logbuch <noreply@aquarium.local>',
    placeholder: 'Absenderadresse',
    style: 'max-width:280px;'
  });
  const inpMailRateLimit = h('input', {
    type: 'number',
    min: '100',
    max: '60000',
    step: '100',
    value: String(mailConfig.rateLimitMs || 500),
    style: 'max-width:100px;'
  });

  const mailErr = h('p', { class: 'error', role: 'alert' });

  const btnSaveMailConfig = h('button', {
    class: 'btn small',
    type: 'button',
    onclick: async () => {
      mailErr.textContent = '';
      try {
        const encVal = selMailEnc.value;
        const body = {
          enabled: chkMailEnabled.checked,
          host: inpMailHost.value.trim(),
          port: Number(inpMailPort.value) || 587,
          secure: encVal === 'ssl',
          requireTls: encVal === 'starttls',
          ignoreTls: encVal === 'none',
          user: inpMailUser.value.trim(),
          from: inpMailFrom.value.trim(),
          rateLimitMs: Number(inpMailRateLimit.value) || 500,
        };
        if (inpMailPass.value) {
          body.pass = inpMailPass.value;
        }
        await api('/admin/mail', { method: 'PUT', body });
        toast('SMTP-Einstellungen erfolgreich gespeichert.');
        await viewAdmin();
      } catch (err) {
        mailErr.textContent = err.message;
      }
    }
  }, 'SMTP-Einstellungen speichern');

  const inpTestMailTo = h('input', {
    type: 'email',
    placeholder: 'Empfänger-E-Mail',
    value: ME.email || '',
    style: 'max-width: 240px;'
  });
  const testMailStatus = h('span', { class: 'muted', style: 'font-size:.85rem;' });

  const btnSendTestMail = h('button', {
    class: 'btn small ghost',
    type: 'button',
    onclick: async () => {
      const target = inpTestMailTo.value.trim();
      if (!target) {
        toast('Bitte gib eine gültige Empfänger-E-Mail ein.');
        return;
      }
      testMailStatus.textContent = 'Sende Test-E-Mail...';
      try {
        const res = await api('/admin/mail/test', { method: 'POST', body: { to: target } });
        testMailStatus.textContent = '✅ ' + (res.message || 'Test-E-Mail erfolgreich versendet.');
        toast('Test-E-Mail versendet!');
      } catch (err) {
        testMailStatus.textContent = '❌ ' + err.message;
        toast(`Fehler beim Senden: ${err.message}`);
      }
    }
  }, '✉️ Test-E-Mail senden');

  /* Backup & Restore UI Komponenten */
  const fileInput = h('input', {
    type: 'file',
    accept: '.json,.gz,.json.gz',
    style: 'display:none',
    onchange: async (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      if (!confirm(`⚠️ WARNUNG: Beim Wiederherstellen von „${file.name}“ werden alle vorhandenen Benutzer, Aquarien, Messwerte und Fotos überschrieben.\n\nMöchtest du fortfahren?`)) {
        fileInput.value = '';
        return;
      }
      try {
        toast('Lese und spiele Backup ein...');
        const reader = new FileReader();
        reader.onload = async () => {
          try {
            const arrayBuffer = reader.result;
            const bytes = new Uint8Array(arrayBuffer);
            let binary = '';
            for (let i = 0; i < bytes.byteLength; i++) {
              binary += String.fromCharCode(bytes[i]);
            }
            const base64 = btoa(binary);
            const res = await api('/admin/backups/restore-upload', {
              method: 'POST',
              body: { backupBase64: base64 },
            });
            toast(`Backup erfolgreich wiederhergestellt! (${res.stats?.users || 0} Benutzer, ${res.stats?.aquariums || 0} Aquarien, ${res.stats?.measurements || 0} Messungen)`);
            fileInput.value = '';
            await viewAdmin();
          } catch (err) {
            toast(`Fehler beim Wiederherstellen: ${err.message}`);
            fileInput.value = '';
          }
        };
        reader.readAsArrayBuffer(file);
      } catch (err) {
        toast(`Fehler beim Lesen der Datei: ${err.message}`);
        fileInput.value = '';
      }
    },
  });

  const btnDownloadNow = h('button', {
    class: 'btn small',
    type: 'button',
    onclick: () => {
      window.location.href = 'api/admin/backups/create?download=1';
      toast('Backup-Download gestartet.');
    },
  }, '📥 Jetzt herunterladen');

  const btnCreateLocal = h('button', {
    class: 'btn small ghost',
    type: 'button',
    onclick: async () => {
      try {
        toast('Erstelle lokales Backup...');
        const res = await api('/admin/backups/create', { method: 'POST', body: { includeFiles: backupConfig.includeFiles } });
        toast(`Lokales Backup „${res.filename}“ gespeichert.`);
        await viewAdmin();
      } catch (e) {
        toast(e.message);
      }
    },
  }, '💾 Lokal sichern');

  const btnUploadRestore = h('button', {
    class: 'btn small ghost danger',
    type: 'button',
    onclick: () => fileInput.click(),
  }, '📤 Datei einspielen');

  // Konfiguration automatische Backups
  const chkAutoEnabled = h('input', { type: 'checkbox', checked: !!backupConfig.enabled, id: 'chk-auto-backup' });
  const selAutoInterval = h('select', { style: 'max-width: 180px;' },
    h('option', { value: '1', selected: backupConfig.intervalHours === 1 }, 'Jede Stunde (1h)'),
    h('option', { value: '6', selected: backupConfig.intervalHours === 6 }, 'Alle 6 Stunden'),
    h('option', { value: '12', selected: backupConfig.intervalHours === 12 }, 'Alle 12 Stunden'),
    h('option', { value: '24', selected: backupConfig.intervalHours === 24 }, 'Täglich (24h)'),
    h('option', { value: '48', selected: backupConfig.intervalHours === 48 }, 'Alle 2 Tage (48h)'),
    h('option', { value: '168', selected: backupConfig.intervalHours === 168 }, 'Wöchentlich (7 Tage)')
  );
  const inpAutoRetention = h('input', {
    type: 'number',
    min: '1',
    max: '100',
    value: String(backupConfig.retentionCount || 10),
    style: 'max-width: 90px;',
  });
  const chkIncludeFiles = h('input', { type: 'checkbox', checked: backupConfig.includeFiles !== false, id: 'chk-include-files' });

  const btnSaveConfig = h('button', {
    class: 'btn small',
    type: 'button',
    onclick: async () => {
      try {
        const body = {
          enabled: chkAutoEnabled.checked,
          intervalHours: Number(selAutoInterval.value) || 24,
          retentionCount: Number(inpAutoRetention.value) || 10,
          includeFiles: chkIncludeFiles.checked,
        };
        await api('/admin/backups/config', { method: 'PUT', body });
        toast('Backup-Einstellungen gespeichert.');
        await viewAdmin();
      } catch (e) {
        toast(e.message);
      }
    },
  }, 'Einstellungen speichern');

  const backupRows = backups.length > 0 ? backups.map((b) => {
    return h('tr', {},
      h('td', {},
        h('strong', {}, b.filename),
        b.isAuto ? h('span', { class: 'chip ok', style: 'margin-left:.5rem; font-size:.7rem;' }, 'Auto') : h('span', { class: 'chip none', style: 'margin-left:.5rem; font-size:.7rem;' }, 'Manuell')
      ),
      h('td', {}, b.sizeFormatted || '–'),
      h('td', {}, fmtDate(b.createdAt)),
      h('td', {},
        h('div', { class: 'row', style: 'gap:.35rem' },
          h('button', {
            class: 'btn small ghost',
            type: 'button',
            onclick: () => {
              window.location.href = `api/admin/backups/${encodeURIComponent(b.filename)}/download`;
            },
          }, 'Download'),
          h('button', {
            class: 'btn small ghost danger',
            type: 'button',
            onclick: async () => {
              if (!confirm(`Sicherung „${b.filename}“ wirklich wiederherstellen? Alle aktuellen Daten werden überschrieben.`)) return;
              try {
                toast('Stelle Backup wieder her...');
                const res = await api(`/admin/backups/${encodeURIComponent(b.filename)}/restore`, { method: 'POST' });
                toast(`Backup erfolgreich wiederhergestellt! (${res.stats?.users || 0} Benutzer, ${res.stats?.aquariums || 0} Becken)`);
                await viewAdmin();
              } catch (e) {
                toast(e.message);
              }
            },
          }, 'Wiederherstellen'),
          h('button', {
            class: 'btn small danger',
            type: 'button',
            onclick: async () => {
              if (!confirm(`Backup-Datei „${b.filename}“ wirklich löschen?`)) return;
              try {
                await api(`/admin/backups/${encodeURIComponent(b.filename)}`, { method: 'DELETE' });
                toast(`Backup „${b.filename}“ gelöscht.`);
                await viewAdmin();
              } catch (e) {
                toast(e.message);
              }
            },
          }, 'Löschen')
        )
      )
    );
  }) : [
    h('tr', {}, h('td', { colspan: '4', class: 'muted', style: 'text-align:center; padding:1.2rem;' }, '(Noch keine lokalen Sicherungen vorhanden)'))
  ];

  /* ---------- Rechtliches & Kontakt-E-Mails (Admin) ---------- */
  const legalConfig = (legalData && legalData.config) || { contactEmail: '', imprintEmail: '' };
  const legalErr = h('p', { class: 'error', role: 'alert' });

  const inpContactEmail = h('input', {
    type: 'email',
    placeholder: 'z. B. kontakt@example.com (Standard: Admin-E-Mail)',
    value: legalConfig.contactEmail || '',
    style: 'max-width:320px;',
  });

  const inpImprintEmail = h('input', {
    type: 'email',
    placeholder: 'z. B. impressum@example.com (Standard: Kontakt-E-Mail)',
    value: legalConfig.imprintEmail || '',
    style: 'max-width:320px;',
  });

  const btnSaveLegalConfig = h('button', {
    class: 'btn small',
    type: 'button',
    onclick: async () => {
      legalErr.textContent = '';
      try {
        const body = {
          contactEmail: inpContactEmail.value.trim() || null,
          imprintEmail: inpImprintEmail.value.trim() || null,
        };
        await api('/admin/legal-config', { method: 'PUT', body });
        toast('Rechtliche E-Mail-Einstellungen erfolgreich gespeichert.');
        await viewAdmin();
      } catch (ex) {
        legalErr.textContent = ex.message;
      }
    },
  }, 'Rechtliche Einstellungen speichern');

  const legalCard = h('div', { class: 'card stack' },
    h('div', { class: 'row between', style: 'align-items:center;' },
      h('div', {},
        h('h2', { style: 'margin:0' }, '⚖️ Rechtliches, Kontakt & Lizenz'),
        h('span', { class: 'muted' }, 'Konfiguriere Kontakt- und Impressums-E-Mail-Adressen für öffentliche Seiten (#/impressum, #/kontakt, #/datenschutz).')
      ),
      h('span', { class: 'chip ok' }, 'CC BY-NC-SA 4.0')
    ),
    legalErr,
    h('div', { class: 'card stack', style: 'background: var(--paper); border: 1px solid var(--line); padding: 1rem; gap: .75rem;' },
      h('div', { class: 'row', style: 'gap: 1.25rem; flex-wrap: wrap; align-items: center;' },
        h('label', { class: 'stack', style: 'gap:.25rem;' },
          h('span', { class: 'muted', style: 'font-weight:600;' }, 'Kontakt-E-Mail (Support & Datenschutz):'),
          inpContactEmail
        ),
        h('label', { class: 'stack', style: 'gap:.25rem;' },
          h('span', { class: 'muted', style: 'font-weight:600;' }, 'Impressums-E-Mail (§ 5 DDG):'),
          inpImprintEmail
        )
      ),
      h('div', { class: 'muted', style: 'font-size:.84rem;' },
        'Bleiben die Felder leer oder werden sie zurückgesetzt, greift automatisch die globale Admin-E-Mail-Adresse.'
      ),
      h('div', { class: 'row', style: 'margin-top:.4rem;' }, btnSaveLegalConfig)
    )
  );

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
        h('h1', { style: 'margin-top:.3rem' }, 'Benutzerverwaltung & Administration')
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
              h('th', {}, 'Status'),
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
    registrationCard,
    legalCard,
    h('div', { class: 'card stack' },
      h('div', { class: 'row between', style: 'align-items:center;' },
        h('div', {},
          h('h2', { style: 'margin:0' }, '📧 E-Mail- & SMTP-Server-Konfiguration'),
          h('span', { class: 'muted' }, 'Konfiguriere den SMTP-Ausgangsserver für E-Mail-Verifizierungen und Passwort-Reset.')
        ),
        mailConfig.enabled ? h('span', { class: 'chip ok' }, 'Aktiviert') : h('span', { class: 'chip none' }, 'Deaktiviert')
      ),
      mailErr,
      h('div', { class: 'card stack', style: 'background: var(--paper); border: 1px solid var(--line); padding: 1rem; gap: .75rem;' },
        h('div', { class: 'row', style: 'gap: 1rem; flex-wrap: wrap; align-items: center;' },
          h('label', { class: 'row', style: 'gap:.4rem; cursor:pointer;' }, chkMailEnabled, h('strong', {}, 'E-Mail-Versand via SMTP aktivieren')),
          h('label', { class: 'row', style: 'gap:.4rem;' }, h('span', { class: 'muted' }, 'SMTP-Host:'), inpMailHost),
          h('label', { class: 'row', style: 'gap:.4rem;' }, h('span', { class: 'muted' }, 'Port:'), inpMailPort),
          h('label', { class: 'row', style: 'gap:.4rem;' }, h('span', { class: 'muted' }, 'Verschlüsselung:'), selMailEnc)
        ),
        h('div', { class: 'row', style: 'gap: 1rem; flex-wrap: wrap; align-items: center;' },
          h('label', { class: 'row', style: 'gap:.4rem;' }, h('span', { class: 'muted' }, 'Benutzer:'), inpMailUser),
          h('label', { class: 'row', style: 'gap:.4rem;' }, h('span', { class: 'muted' }, 'Passwort:'), inpMailPass),
          h('label', { class: 'row', style: 'gap:.4rem;' }, h('span', { class: 'muted' }, 'Absender (From):'), inpMailFrom),
          h('label', { class: 'row', style: 'gap:.4rem;' }, h('span', { class: 'muted' }, 'Warteschlangen-Pause (ms):'), inpMailRateLimit)
        ),
        h('div', { class: 'row', style: 'margin-top:.4rem;' }, btnSaveMailConfig)
      ),
      h('div', { class: 'row between', style: 'align-items: center; flex-wrap: wrap; gap: .75rem; background: var(--paper); border: 1px solid var(--line); border-radius: 8px; padding: .75rem 1rem;' },
        h('div', { class: 'row', style: 'align-items: center; gap: .5rem; flex-wrap: wrap;' },
          h('strong', {}, '🧪 Test-E-Mail:'),
          inpTestMailTo,
          btnSendTestMail,
          testMailStatus
        ),
        h('div', { class: 'row', style: 'gap: .5rem; font-size: .85rem;' },
          h('span', { class: 'chip none' }, `Queue: ${mailQueue.queueLength || 0}`),
          h('span', { class: 'chip ok' }, `Gesendet: ${mailQueue.sentCount || 0}`),
          mailQueue.failedCount > 0 ? h('span', { class: 'chip crit' }, `Fehler: ${mailQueue.failedCount}`) : null,
          mailQueue.lastSentAt ? h('span', { class: 'muted' }, `Letzte: ${fmtDate(mailQueue.lastSentAt)}`) : null
        )
      )
    ),
    h('div', { class: 'card stack' },
      fileInput,
      h('div', { class: 'row between' },
        h('div', {},
          h('h2', { style: 'margin:0' }, '📦 Datensicherung & Wiederherstellung (Backup & Restore)'),
          h('span', { class: 'muted' }, 'Sichere die gesamte Datenbank samt Fotos oder spiele Backups ein (auch aus älteren Versionen).')
        ),
        h('div', { class: 'row', style: 'gap:.5rem' }, btnDownloadNow, btnCreateLocal, btnUploadRestore)
      ),
      h('div', { class: 'card stack', style: 'background: var(--paper); border: 1px solid var(--line); padding: 1rem; gap: .75rem;' },
        h('h3', { style: 'margin:0' }, '⚙️ Automatische lokale Sicherungen & Backup-Limit'),
        h('div', { class: 'row', style: 'gap: 1.25rem; flex-wrap: wrap; align-items: center;' },
          h('label', { class: 'row', style: 'gap:.4rem; cursor:pointer;' }, chkAutoEnabled, h('span', {}, 'Automatisch aktivieren')),
          h('label', { class: 'row', style: 'gap:.4rem;' }, h('span', { class: 'muted' }, 'Intervall:'), selAutoInterval),
          h('label', { class: 'row', style: 'gap:.4rem;' }, h('span', { class: 'muted' }, 'Max. Backups (Limit):'), inpAutoRetention),
          h('label', { class: 'row', style: 'gap:.4rem; cursor:pointer;' }, chkIncludeFiles, h('span', {}, 'Upload-Fotos einschließen')),
          btnSaveConfig
        ),
        h('div', { class: 'muted', style: 'font-size:.82rem;' },
          'Sobald das Limit erreicht ist, wird beim Erstellen neuer Sicherungen automatisch das jeweils älteste Backup gelöscht.',
          backupConfig.lastBackupAt ? ` Letzte automatische Sicherung: ${fmtDate(backupConfig.lastBackupAt)} (${backupConfig.lastBackupFile || '–'})` : ''
        )
      ),
      h('div', { class: 'table-wrap' },
        h('table', {},
          h('thead', {},
            h('tr', {},
              h('th', {}, 'Gespeicherte Sicherung'),
              h('th', {}, 'Größe'),
              h('th', {}, 'Erstellt am'),
              h('th', {}, 'Aktionen')
            )
          ),
          h('tbody', {}, backupRows)
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
    emailVerified: h('input', { type: 'checkbox', checked: user ? Boolean(user.emailVerified) : true }),
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
      emailVerified: f.emailVerified.checked,
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
  h('div', { class: 'field' },
    h('label', { class: 'row', style: 'gap:.4rem; cursor:pointer;' }, f.emailVerified, 'E-Mail-Adresse als verifiziert markieren')
  ),
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

  // Standard-Zeitraum für Graphen & Messverlauf
  const defaultRangeOptions = [
    { key: '7', label: '7 Tage (1 Woche)' },
    { key: '14', label: '14 Tage (2 Wochen)' },
    { key: '30', label: '30 Tage (1 Monat)' },
    { key: '90', label: '90 Tage (3 Monate – Standard)' },
    { key: '180', label: '180 Tage (6 Monate)' },
    { key: '365', label: '365 Tage (1 Jahr)' },
    { key: '3650', label: 'Alles (Gesamte Historie)' },
  ];

  const currentDefaultRange = String(ME.defaultGraphRange || '90');
  const graphRangeSelect = h('select', {},
    defaultRangeOptions.map((opt) =>
      h('option', { value: opt.key, selected: opt.key === currentDefaultRange }, opt.label)
    )
  );
  const graphRangeSaveErr = h('p', { class: 'error', role: 'alert' });

  const graphRangeCard = h('form', {
    class: 'card stack',
    onsubmit: async (e) => {
      e.preventDefault();
      graphRangeSaveErr.textContent = '';
      try {
        const selectedRange = graphRangeSelect.value;
        const res = await api('/me', { method: 'PUT', body: { defaultGraphRange: selectedRange } });
        ME = res.user;
        RANGE = selectedRange;
        localStorage.setItem(GRAPH_RANGE_STORAGE_KEY, selectedRange);
        toast('Standard-Zeitraum für Graphen gespeichert.');
      } catch (ex) {
        graphRangeSaveErr.textContent = ex.message;
      }
    }
  },
    h('h2', {}, 'Standard-Zeitraum für Graphen & Messverlauf'),
    h('p', { class: 'muted', style: 'margin:0' }, 'Lege fest, welcher Zeitraum beim Öffnen eines Aquariums standardmäßig in den Verlaufsgraphen und Messwert-Tabellen angezeigt werden soll (Standard: 3 Monate).'),
    h('div', { class: 'field' },
      h('label', {}, 'Bevorzugter Standard-Zeitraum'),
      graphRangeSelect
    ),
    graphRangeSaveErr,
    h('div', { class: 'row' },
      h('button', { class: 'btn', type: 'submit' }, 'Standard-Zeitraum speichern')
    )
  );

  // Push-Benachrichtigungen & Timer
  const perm = pushNotificationManager.getPermission();
  const permStatusMap = {
    granted: { text: 'Aktiviert (Benachrichtigungen erlaubt)', cls: 'tag ok', icon: '🔔' },
    denied: { text: 'Blockiert (im Browser abgelehnt)', cls: 'tag danger', icon: '🔕' },
    default: { text: 'Nicht aktiviert (Erlaubnis ausstehend)', cls: 'tag warn', icon: '⚠️' },
    unsupported: { text: 'Vom Browser nicht unterstützt', cls: 'tag', icon: 'ℹ️' }
  };
  const permInfo = permStatusMap[perm] || permStatusMap.default;

  const btnRequestPerm = h('button', {
    class: 'btn small',
    type: 'button',
    style: perm === 'granted' || perm === 'unsupported' ? 'display:none' : '',
    onclick: async () => {
      const res = await pushNotificationManager.requestPermission();
      toast(res === 'granted' ? 'Push-Benachrichtigungen aktiviert!' : 'Status: ' + res);
      viewProfile();
    }
  }, '🔔 Benachrichtigungen aktivieren');

  const btnTestNotification = h('button', {
    class: 'btn small ghost',
    type: 'button',
    onclick: async () => {
      if (pushNotificationManager.getPermission() !== 'granted') {
        const res = await pushNotificationManager.requestPermission();
        if (res !== 'granted') {
          toast('Bitte erlaube Benachrichtigungen im Browser, um den Test durchzuführen.');
          viewProfile();
          return;
        }
      }
      toast('Test-Benachrichtigung wird in 3 Sekunden gesendet...');
      setTimeout(() => {
        pushNotificationManager.notify({
          title: '⏱️ Test: Nitrit (NO2) – Wartezeit abgelaufen!',
          body: 'Push-Benachrichtigungen funktionieren einwandfrei! Du verpasst keinen Timer mehr.',
          tag: 'test-notification',
          waitSec: 300,
        });
      }, 3000);
    }
  }, '🧪 Test-Benachrichtigung senden (3s)');

  const notificationsCard = h('div', { class: 'card stack' },
    h('h2', {}, 'Push-Benachrichtigungen & Timer'),
    h('p', { class: 'muted', style: 'margin:0' },
      'Erhalte Push- und System-Benachrichtigungen bei ablaufenden Reagenz-Timern, damit Farbtests stets zum exakten Zeitpunkt abgelesen werden und keine Messfehler entstehen.'
    ),
    h('div', { class: 'row between', style: 'align-items:center; flex-wrap:wrap; gap:.6rem;' },
      h('div', { class: 'row', style: 'align-items:center; gap:.5rem;' },
        h('span', { style: 'font-size:1.2rem;' }, permInfo.icon),
        h('span', { class: permInfo.cls }, permInfo.text)
      ),
      h('div', { class: 'row', style: 'gap:.5rem;' }, btnRequestPerm, btnTestNotification)
    )
  );

  // Einladungs-Sektion (für Benutzer, wenn Modus "Einladung (Offen)" aktiv oder Admin)
  let invitationCard = null;
  if (ME.canInvite) {
    const invErr = h('p', { class: 'error', role: 'alert' });
    const maxDays = Number(ME.userCodeMaxDays) || 7;

    const inpCodeDays = h('select', { style: 'max-width:160px;' },
      h('option', { value: String(maxDays), selected: true }, `${maxDays} Tage (Standard)`),
      maxDays > 3 ? h('option', { value: '3' }, '3 Tage') : null,
      maxDays > 1 ? h('option', { value: '1' }, '1 Tag') : null
    );
    const inpCodeNote = h('input', { placeholder: 'Optionale Notiz (z. B. Für Alex)', maxlength: '200', style: 'max-width:240px;' });

    const inpMailTo = h('input', { type: 'email', placeholder: 'freund@example.com', maxlength: '120', style: 'max-width:260px;' });
    const inpMailNote = h('input', { placeholder: 'Optionale Notiz', maxlength: '200', style: 'max-width:200px;' });

    const invTableBody = h('tbody');
    const loadUserInvitations = async () => {
      try {
        const res = await api('/me/invitations');
        const list = res.invitations || [];
        if (!list.length) {
          invTableBody.replaceChildren(
            h('tr', {}, h('td', { colspan: '6', class: 'muted', style: 'text-align:center; padding:1.2rem;' }, 'Du hast noch keine Einladungen erstellt.'))
          );
          return;
        }

        const baseUrl = location.origin + location.pathname;
        const rows = list.map((inv) => {
          let statusBadge = h('span', { class: 'chip ok' }, '✓ Aktiv');
          if (inv.status === 'exhausted') statusBadge = h('span', { class: 'chip none' }, 'Eingelöst');
          else if (inv.status === 'expired') statusBadge = h('span', { class: 'chip warn' }, 'Abgelaufen');

          const inviteLink = `${baseUrl}#/register?invite=${encodeURIComponent(inv.code)}${inv.email ? `&email=${encodeURIComponent(inv.email)}` : ''}`;

          const btnCopy = h('button', {
            class: 'btn small ghost',
            type: 'button',
            title: 'Einladungslink kopieren',
            onclick: async () => {
              try {
                await navigator.clipboard.writeText(inviteLink);
                toast('Einladungslink in Zwischenablage kopiert!');
              } catch (e) {
                prompt('Einladungslink kopieren:', inviteLink);
              }
            }
          }, '📋 Link kopieren');

          const btnDel = h('button', {
            class: 'btn small danger',
            type: 'button',
            onclick: async () => {
              if (!confirm('Diese Einladung wirklich löschen/widerrufen?')) return;
              try {
                await api(`/me/invitations/${inv.id}`, { method: 'DELETE' });
                toast('Einladung gelöscht.');
                await loadUserInvitations();
              } catch (ex) {
                toast(ex.message);
              }
            }
          }, 'Löschen');

          return h('tr', {},
            h('td', {},
              h('strong', { style: 'font-family:monospace; font-size:1.05rem;' }, inv.code),
              inv.email ? h('div', { class: 'muted', style: 'font-size:.82rem;' }, `E-Mail: ${inv.email}`) : null
            ),
            h('td', {}, inv.type === 'mail' ? 'E-Mail' : 'Code'),
            h('td', {}, `${inv.usedCount} / ${inv.maxUses || 1}`),
            h('td', {}, fmtDate(inv.expiresAt)),
            h('td', {}, statusBadge),
            h('td', {}, h('div', { class: 'row', style: 'gap:.35rem;' }, btnCopy, btnDel))
          );
        });
        invTableBody.replaceChildren(...rows);
      } catch (e) {
        invTableBody.replaceChildren(
          h('tr', {}, h('td', { colspan: '6', class: 'error' }, e.message))
        );
      }
    };

    const btnCreateCode = h('button', {
      class: 'btn small',
      type: 'button',
      onclick: async () => {
        invErr.textContent = '';
        try {
          const res = await api('/me/invitations', {
            method: 'POST',
            body: {
              type: 'code',
              days: Number(inpCodeDays.value) || maxDays,
              note: inpCodeNote.value.trim() || undefined,
            },
          });
          inpCodeNote.value = '';
          toast(res.message || 'Einladungscode erstellt!');
          await loadUserInvitations();
        } catch (ex) {
          invErr.textContent = ex.message;
        }
      }
    }, '➕ Code generieren');

    const btnSendMail = h('button', {
      class: 'btn small',
      type: 'button',
      onclick: async () => {
        invErr.textContent = '';
        if (!inpMailTo.value.trim()) {
          invErr.textContent = 'Bitte gib eine Empfänger-E-Mail-Adresse ein.';
          return;
        }
        try {
          const res = await api('/me/invitations', {
            method: 'POST',
            body: {
              type: 'mail',
              email: inpMailTo.value.trim(),
              days: 14,
              note: inpMailNote.value.trim() || undefined,
            },
          });
          inpMailTo.value = '';
          inpMailNote.value = '';
          toast(res.message || 'Einladungs-E-Mail versendet!');
          await loadUserInvitations();
        } catch (ex) {
          invErr.textContent = ex.message;
        }
      }
    }, '✉️ Einladungs-Mail senden');

    loadUserInvitations();

    invitationCard = h('div', { class: 'card stack' },
      h('h2', {}, '💌 Freunde einladen'),
      h('p', { class: 'muted', style: 'margin:0;' },
        'Erstelle einen Registrierungscode oder versende eine Einladungs-E-Mail, um Freunde zum Aquarium-Logbuch einzuladen.'
      ),
      h('div', { class: 'grid2', style: 'gap:1rem; align-items:start;' },
        h('div', { class: 'card stack', style: 'background:var(--paper); border:1px solid var(--line);' },
          h('h3', { style: 'margin:0 0 .25rem 0;' }, '🔑 Registrierungscode erstellen'),
          h('p', { class: 'muted', style: 'margin:0; font-size:.85rem;' }, `Gültig für maximal ${maxDays} Tage. Kann 1-mal eingelöst werden.`),
          h('div', { class: 'field' }, h('label', {}, 'Gültigkeitsdauer'), inpCodeDays),
          h('div', { class: 'field' }, h('label', {}, 'Notiz (optional)'), inpCodeNote),
          h('div', {}, btnCreateCode)
        ),
        h('div', { class: 'card stack', style: 'background:var(--paper); border:1px solid var(--line);' },
          h('h3', { style: 'margin:0 0 .25rem 0;' }, '✉️ Per E-Mail einladen'),
          h('p', { class: 'muted', style: 'margin:0; font-size:.85rem;' }, 'Versendet eine E-Mail mit Registrierungslink. Gültig für maximal 14 Tage.'),
          h('div', { class: 'field' }, h('label', {}, 'Empfänger-E-Mail'), inpMailTo),
          h('div', { class: 'field' }, h('label', {}, 'Notiz (optional)'), inpMailNote),
          h('div', {}, btnSendMail)
        )
      ),
      invErr,
      h('h3', { style: 'margin:.5rem 0 0 0;' }, 'Meine erstellten Einladungen'),
      h('div', { class: 'table-wrap' },
        h('table', {},
          h('thead', {},
            h('tr', {},
              h('th', {}, 'Code / Empfänger'),
              h('th', {}, 'Typ'),
              h('th', {}, 'Verwendung'),
              h('th', {}, 'Gültig bis'),
              h('th', {}, 'Status'),
              h('th', {}, 'Aktionen')
            )
          ),
          invTableBody
        )
      )
    );
  }

  // Gefahrenbereich: Konto löschen
  let deleteAccountCard = null;
  if (!ME.isAdmin) {
    const btnDeleteAccount = h('button', {
      class: 'btn danger',
      type: 'button',
      onclick: () => confirmDeleteAccountDialog(ME),
    }, '🗑️ Konto löschen...');

    deleteAccountCard = h('div', { class: 'card stack danger-zone' },
      h('h2', { style: 'color: var(--coral); margin:0;' }, 'Gefahrenbereich / Konto löschen'),
      h('p', { style: 'margin:0;' },
        'Möchtest du dein Benutzerkonto löschen? Dabei werden alle deine Aquarien, Messreihen, Fotos, Alarme, Pflegemaßnahmen und Freigaben unwiderruflich und dauerhaft entfernt.'
      ),
      h('p', { class: 'muted', style: 'margin:0; font-size:.9rem;' },
        'Aus Sicherheitsgründen musst du die Löschung hier bestätigen und erhältst anschließend eine Bestätigungs-E-Mail mit einem Freigabelink.'
      ),
      h('div', { class: 'row' }, btnDeleteAccount)
    );
  }

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
    graphRangeCard,
    invitationCard,
    notificationsCard,
    testSuiteCard,
    passwordCard,
    oidcCard,
    deleteAccountCard
  ));
}

function confirmDeleteAccountDialog(me) {
  const dlg = h('dialog', { class: 'stack' });
  const err = h('p', { class: 'error', role: 'alert' });
  const statusMsg = h('div', { class: 'compat-box ok', style: 'display:none;' });

  let passInput = null;
  if (me.hasPassword) {
    passInput = h('input', { type: 'password', required: true, placeholder: 'Aktuelles Passwort eingeben' });
  }

  const form = h('form', {
    class: 'stack',
    onsubmit: async (e) => {
      e.preventDefault();
      err.textContent = '';
      try {
        const body = {};
        if (passInput) body.password = passInput.value;
        const res = await api('/me/delete-request', { method: 'POST', body });
        form.style.display = 'none';
        statusMsg.style.display = 'block';
        statusMsg.replaceChildren(
          h('h3', { style: 'margin:0 0 .5rem 0;' }, '✉️ Bestätigungs-E-Mail versendet!'),
          h('p', { style: 'margin:0;' }, res.message),
          h('div', { class: 'row', style: 'margin-top:1rem;' },
            h('button', { class: 'btn', type: 'button', onclick: () => { dlg.close(); } }, 'Verstanden')
          )
        );
      } catch (ex) {
        err.textContent = ex.message;
      }
    }
  },
    h('h2', { style: 'color: var(--coral); margin:0;' }, 'Konto wirklich löschen?'),
    h('div', { class: 'compat-box danger' },
      h('p', { style: 'margin:0; font-weight:600;' }, '⚠️ Diese Aktion kann nicht rückgängig gemacht werden!'),
      h('ul', { style: 'margin:.5rem 0 0 1.2rem; padding:0; font-size:.9rem; line-height:1.5;' },
        h('li', {}, 'Dein Benutzerkonto wird dauerhaft gelöscht.'),
        h('li', {}, 'Alle deine Aquarien, Messwerte, Alarme und Pflegemaßnahmen werden entfernt.'),
        h('li', {}, 'Alle hochgeladenen Fotos werden von den Servern gelöscht.'),
        h('li', {}, 'Bestehende Freigaben für andere Benutzer werden aufgelöst.')
      )
    ),
    h('p', {}, `Um die Löschung zu starten, senden wir eine Bestätigungs-E-Mail an `, h('strong', {}, me.email || 'deine E-Mail-Adresse'), `.`),
    passInput ? h('div', { class: 'field' },
      h('label', {}, 'Zur Bestätigung bitte dein aktuelles Passwort eingeben:'),
      passInput
    ) : null,
    err,
    h('div', { class: 'row between', style: 'margin-top:.5rem;' },
      h('button', { class: 'btn ghost', type: 'button', onclick: () => dlg.close() }, 'Abbrechen'),
      h('button', { class: 'btn danger', type: 'submit' }, 'Bestätigungs-E-Mail anfordern')
    )
  );

  dlg.replaceChildren(form, statusMsg);
  dlg.addEventListener('close', () => dlg.remove());
  document.body.append(dlg);
  dlg.showModal();
  if (passInput) passInput.focus();
}

/* ---------- Start ---------- */
(async () => {
  try { await start(); } catch (e) { showAuth(); }
})();

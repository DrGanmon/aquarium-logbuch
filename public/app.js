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
  if (routePath === 'forgot-password') {
    return showAuth('forgot');
  }
  if (routePath === 'delete-account' || routePath === 'confirm-delete-account') {
    return await viewDeleteAccount(token);
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

  if (!info.localLogin && mode !== 'forgot') {
    mount(h('div', { class: 'auth' }, headerRow,
      h('div', { class: 'card stack' }, h('h1', {}, 'Anmelden'), err, oidcBtn)));
    oidcBtn?.focus();
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
  const mail = mode === 'register' ? h('input', { id: 'e', type: 'email', autocomplete: 'email', required: true }) : null;
  const pass = h('input', { id: 'p', type: 'password', autocomplete: mode === 'login' ? 'current-password' : 'new-password', required: true, minlength: mode === 'login' ? null : '8' });
  const resendBox = h('div', { style: 'display:none; margin-top:.5rem;' });

  const form = h('form', { class: 'card stack', onsubmit: async (e) => {
    e.preventDefault(); err.textContent = ''; resendBox.style.display = 'none';
    try {
      const body = { username: user.value, password: pass.value };
      if (mode === 'register' && mail && mail.value.trim()) body.email = mail.value.trim();
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
  h('h1', {}, mode === 'login' ? 'Anmelden' : 'Konto erstellen'),
  h('div', { class: 'field' }, h('label', { for: 'u' }, 'Benutzername'), user),
  mail ? h('div', { class: 'field' }, h('label', { for: 'e' }, 'E-Mail-Adresse (für Verifizierung & Passwort-Reset)'), mail) : null,
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
  registration && h('button', { class: 'btn ghost', type: 'button', onclick: () => showAuth(mode === 'login' ? 'register' : 'login') }, mode === 'login' ? 'Neues Konto erstellen' : 'Ich habe schon ein Konto'));
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
async function viewList() {
  const list = await api('/aquariums');
  const cards = list.map((a) => {
    const s = a.open_crit ? 'crit' : (a.open_warn || a.overdue) ? 'warn' : a.last_measured_at ? 'ok' : 'none';
    const isOwner = a.role === 'owner';
    return h('a', { class: `card aq-card s-${s}`, href: `#/a/${a.id}` },
      a.has_image ? h('img', { class: 'aq-card-img', src: `api/aquariums/${a.id}/image`, alt: a.name, loading: 'lazy' }) : null,
      h('h2', {}, a.name),
      a.motto ? h('div', { class: 'aq-motto' }, a.motto) : null,
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
    motto: h('input', { maxlength: '160', placeholder: 'z. B. Mein Amazonas-Biotop / Naturaquarium 120', value: aq?.motto || '' }),
    description: h('textarea', { maxlength: '4000', rows: '3', placeholder: 'Generelle Beschreibung (z. B. Scape, Bepflanzung, Beleuchtung, Technik & Philosophie)...', value: aq?.description || '' }),
    water_type: h('select', { value: aq?.water_type || 'fresh' }, Object.entries(CONFIG.waterTypes).map(([k, v]) => h('option', { value: k }, v))),
    volume_l: h('input', { type: 'number', min: '1', max: '100000', inputmode: 'numeric', value: aq?.volume_l ?? '' }),
    reminder_days: h('input', { type: 'number', min: '0', max: '365', inputmode: 'numeric', value: aq?.reminder_days ?? 7 }),
    notes: h('textarea', { maxlength: '1000', placeholder: 'Kurze Notizen...', value: aq?.notes || '' }),
  };
  const dlg = h('dialog', { class: 'wide stack' }, h('form', { class: 'stack', method: 'dialog', onsubmit: async (e) => {
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
  h('div', { class: 'field' }, h('label', {}, 'Messung fällig nach (Tagen, 0 = keine Erinnerung)'), f.reminder_days),
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
          icon: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Ctext y='.9em' font-size='90'%3E%E2%8F%B1%EF%B8%8F%3C/text%3E%3C/svg%3E",
          badge: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Ctext y='.9em' font-size='90'%3E%F0%9F%90%A0%3C/text%3E%3C/svg%3E",
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
        icon: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Ctext y='.9em' font-size='90'%3E%E2%8F%B1%EF%B8%8F%3C/text%3E%3C/svg%3E",
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
  const [users, logData, backupData, mailData] = await Promise.all([
    api('/admin/users'),
    api('/admin/logs').catch(() => ({ logs: [], logPath: 'data/aquarium.log' })),
    api('/admin/backups').catch(() => ({ backups: [], config: { enabled: false, intervalHours: 24, retentionCount: 10, includeFiles: true } })),
    api('/admin/mail').catch(() => ({ config: { enabled: false, host: '', port: 587, secure: false, requireTls: false, from: '', user: '', rateLimitMs: 500, hasPassword: false }, queue: { queueLength: 0, sentCount: 0, failedCount: 0 } })),
  ]);

  const backups = backupData.backups || [];
  const backupConfig = backupData.config || { enabled: false, intervalHours: 24, retentionCount: 10, includeFiles: true };
  const mailConfig = mailData.config || { enabled: false, host: '', port: 587, secure: false, requireTls: false, from: '', user: '', rateLimitMs: 500, hasPassword: false };
  const mailQueue = mailData.queue || { queueLength: 0, sentCount: 0, failedCount: 0, lastSentAt: null, lastError: null };

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

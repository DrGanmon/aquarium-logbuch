'use strict';

const $app = document.getElementById('app');
const $topbar = document.getElementById('topbar');
let CONFIG = null;
let ME = null;
let cleanups = [];
let RANGE = 90;

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

const param = (key) => CONFIG.parameters.find((p) => p.key === key);
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

/* ---------- Router ---------- */
window.addEventListener('hashchange', route);

async function route() {
  if (!ME) return showAuth();
  const parts = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  try {
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
if (location.search) history.replaceState(null, '', location.pathname + location.hash);

async function showAuth(mode = 'login') {
  $topbar.hidden = true;
  let info = { registration: true, localLogin: true, oidc: false, oidcName: '' };
  try { info = await (await fetch('api/registration')).json(); } catch (e) { /* Standard */ }
  const registration = info.registration;
  const err = h('p', { class: 'error', role: 'alert' }, AUTH_ERROR);
  AUTH_ERROR = '';
  const oidcBtn = info.oidc ? h('a', { class: 'btn', href: 'auth/login' }, `Mit ${info.oidcName} anmelden`) : null;
  if (!info.localLogin) {
    mount(h('div', { class: 'auth' }, h('p', { class: 'muted' }, 'Wasserwerte im Blick behalten.'),
      h('div', { class: 'card stack' }, h('h1', {}, 'Anmelden'), err, oidcBtn)));
    oidcBtn?.focus();
    return;
  }
  const user = h('input', { id: 'u', autocomplete: 'username', required: true });
  const pass = h('input', { id: 'p', type: 'password', autocomplete: mode === 'login' ? 'current-password' : 'new-password', required: true, minlength: mode === 'login' ? null : '8' });
  const form = h('form', { class: 'card stack', onsubmit: async (e) => {
    e.preventDefault(); err.textContent = '';
    try {
      await api(mode === 'login' ? '/login' : '/register', { method: 'POST', body: { username: user.value, password: pass.value } });
      await start();
    } catch (ex) { err.textContent = ex.message; }
  } },
  h('h1', {}, mode === 'login' ? 'Anmelden' : 'Konto erstellen'),
  h('div', { class: 'field' }, h('label', { for: 'u' }, 'Benutzername'), user),
  h('div', { class: 'field' }, h('label', { for: 'p' }, mode === 'login' ? 'Passwort' : 'Passwort (mindestens 8 Zeichen)'), pass),
  err,
  h('button', { class: 'btn', type: 'submit' }, mode === 'login' ? 'Anmelden' : 'Konto erstellen'),
  mode === 'login' && oidcBtn ? [h('p', { class: 'muted' }, 'oder'), oidcBtn] : null,
  registration && h('button', { class: 'btn ghost', type: 'button', onclick: () => showAuth(mode === 'login' ? 'register' : 'login') }, mode === 'login' ? 'Neues Konto erstellen' : 'Ich habe schon ein Konto'));
  mount(h('div', { class: 'auth' }, h('p', { class: 'muted' }, 'Wasserwerte im Blick behalten.'), form));
  user.focus();
}

async function start() {
  ME = await api('/me');
  CONFIG = await api('/config');
  $topbar.hidden = false;
  document.getElementById('whoami').textContent = ME.username;
  document.getElementById('btn-pw').hidden = !ME.hasPassword;
  route();
}

document.getElementById('btn-logout').addEventListener('click', async () => {
  let r = {};
  try { r = await api('/logout', { method: 'POST' }); } catch (e) { /* egal */ }
  ME = null;
  if (r.redirect) { location.href = r.redirect; return; } // auch beim Anmeldedienst abmelden
  location.hash = '#/'; showAuth();
});
document.getElementById('btn-pw').addEventListener('click', () => {
  const err = h('p', { class: 'error', role: 'alert' });
  const cur = h('input', { type: 'password', autocomplete: 'current-password', required: true });
  const nxt = h('input', { type: 'password', autocomplete: 'new-password', required: true, minlength: '8' });
  const dlg = h('dialog', {}, h('form', { class: 'stack', method: 'dialog', onsubmit: async (e) => {
    e.preventDefault(); err.textContent = '';
    try { await api('/password', { method: 'POST', body: { current: cur.value, next: nxt.value } }); dlg.close(); toast('Passwort geändert.'); } catch (ex) { err.textContent = ex.message; }
  } },
  h('h2', {}, 'Passwort ändern'),
  h('div', { class: 'field' }, h('label', {}, 'Aktuelles Passwort'), cur),
  h('div', { class: 'field' }, h('label', {}, 'Neues Passwort (mindestens 8 Zeichen)'), nxt),
  err,
  h('div', { class: 'row' }, h('button', { class: 'btn', type: 'submit' }, 'Passwort ändern'), h('button', { class: 'btn ghost', type: 'button', onclick: () => dlg.close() }, 'Abbrechen'))));
  dlg.addEventListener('close', () => dlg.remove());
  document.body.append(dlg); dlg.showModal();
});

/* ---------- Aquarienliste ---------- */
async function viewList() {
  const list = await api('/aquariums');
  const cards = list.map((a) => {
    const s = a.open_crit ? 'crit' : (a.open_warn || a.overdue) ? 'warn' : a.last_measured_at ? 'ok' : 'none';
    return h('a', { class: `card aq-card s-${s}`, href: `#/a/${a.id}` },
      h('h2', {}, a.name),
      h('div', { class: 'muted' }, CONFIG.waterTypes[a.water_type], a.volume_l ? ` · ${a.volume_l} l` : ''),
      h('div', { class: 'row', style: 'margin-top:.6rem' },
        a.open_crit ? h('span', { class: 'chip crit' }, `${a.open_crit} kritisch`) : null,
        a.open_warn ? h('span', { class: 'chip warn' }, `${a.open_warn} auffällig`) : null,
        a.overdue ? h('span', { class: 'chip warn' }, 'Messung fällig') : null,
        !a.open_crit && !a.open_warn && !a.overdue && a.last_measured_at ? h('span', { class: 'chip ok' }, 'alles im Bereich') : null,
        !a.last_measured_at ? h('span', { class: 'chip none' }, 'noch keine Messung') : null),
      a.last_measured_at ? h('div', { class: 'muted', style: 'margin-top:.4rem' }, 'Zuletzt gemessen: ', fmtDate(a.last_measured_at)) : null);
  });
  mount(h('div', { class: 'stack' },
    h('div', { class: 'row between' }, h('h1', {}, 'Meine Aquarien'), h('button', { class: 'btn', type: 'button', onclick: () => aquariumDialog() }, 'Aquarium anlegen')),
    cards.length ? h('div', { class: 'aq-list' }, cards)
      : h('div', { class: 'card stack' }, h('h2', {}, 'Noch kein Aquarium'), h('p', {}, 'Lege dein erstes Becken an, dann kannst du Wasserwerte eintragen und den Verlauf sehen.'), h('div', {}, h('button', { class: 'btn', type: 'button', onclick: () => aquariumDialog() }, 'Aquarium anlegen')))));
}

function aquariumDialog(aq) {
  const editing = !!aq;
  const err = h('p', { class: 'error', role: 'alert' });
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
      if (editing) { await api(`/aquariums/${aq.id}`, { method: 'PUT', body }); dlg.close(); toast('Gespeichert.'); route(); } else {
        const r = await api('/aquariums', { method: 'POST', body }); dlg.close(); location.hash = `#/a/${r.id}`;
      }
    } catch (ex) { err.textContent = ex.message; }
  } },
  h('h2', {}, editing ? 'Aquarium bearbeiten' : 'Aquarium anlegen'),
  h('div', { class: 'field' }, h('label', {}, 'Name'), f.name),
  h('div', { class: 'grid2' },
    h('div', { class: 'field' }, h('label', {}, 'Wasserart'), f.water_type),
    h('div', { class: 'field' }, h('label', {}, 'Volumen (Liter)'), f.volume_l)),
  h('div', { class: 'field' }, h('label', {}, 'Messung fällig nach (Tagen, 0 = keine Erinnerung)'), f.reminder_days),
  h('div', { class: 'field' }, h('label', {}, 'Notizen'), f.notes),
  err,
  h('div', { class: 'row' },
    h('button', { class: 'btn', type: 'submit' }, 'Speichern'),
    h('button', { class: 'btn ghost', type: 'button', onclick: () => dlg.close() }, 'Abbrechen'),
    editing ? h('button', { class: 'btn danger', type: 'button', onclick: async () => {
      if (!confirm(`„${aq.name}“ mit allen Messwerten und Alarmen endgültig löschen?`)) return;
      try { await api(`/aquariums/${aq.id}`, { method: 'DELETE' }); dlg.close(); location.hash = '#/'; toast('Aquarium gelöscht.'); } catch (ex) { err.textContent = ex.message; }
    } }, 'Löschen') : null)));
  dlg.addEventListener('close', () => dlg.remove());
  document.body.append(dlg); dlg.showModal(); f.name.focus();
}

/* ---------- Aquarium-Hauptseite ---------- */
const bandPlugin = {
  id: 'band',
  beforeDatasetsDraw(chart, args, o) {
    const { ctx, chartArea: a, scales: { y } } = chart;
    if (!o || !a) return;
    const clamp = (px) => Math.min(Math.max(px, a.top), a.bottom);
    ctx.save();
    if (o.okMin != null || o.okMax != null) {
      const yTop = o.okMax != null ? clamp(y.getPixelForValue(o.okMax)) : a.top;
      const yBot = o.okMin != null ? clamp(y.getPixelForValue(o.okMin)) : a.bottom;
      ctx.fillStyle = 'rgba(47,122,88,0.13)';
      ctx.fillRect(a.left, yTop, a.right - a.left, Math.max(0, yBot - yTop));
    }
    ctx.strokeStyle = 'rgba(184,52,31,0.75)';
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
  const ys = points.map((q) => q.y);
  const lo = [Math.min(...ys), range.okMin].filter((v) => v != null);
  const hi = [Math.max(...ys), range.okMax].filter((v) => v != null);
  const minV = Math.min(...lo), maxV = Math.max(...hi);
  const pad = (maxV - minV || Math.abs(maxV) || 1) * 0.12;
  const xs = points.map((q) => q.x);
  let xMin = Math.min(...xs), xMax = Math.max(...xs);
  if (xMin === xMax) { xMin -= 12 * 3600e3; xMax += 12 * 3600e3; }
  return new Chart(canvas, {
    type: 'line',
    plugins: [bandPlugin],
    data: { datasets: [{ data: points, borderColor: '#12343b', backgroundColor: '#12343b', borderWidth: 2, pointRadius: 3.5, pointHoverRadius: 5, tension: 0.2,
      pointBackgroundColor: points.map((q) => ({ ok: '#2f7a58', warn: '#a86a00', crit: '#b8341f' }[evaluate(range, q.y)] || '#12343b')) }] },
    options: {
      responsive: true, maintainAspectRatio: false, animation: false,
      plugins: {
        legend: { display: false },
        band: range,
        tooltip: { callbacks: { title: (it) => fmtDate(it[0].parsed.x), label: (it) => `${fmtNum(p, it.parsed.y)}${p.unit ? ' ' + p.unit : ''}` } },
      },
      scales: {
        x: { type: 'linear', min: xMin, max: xMax, ticks: { maxTicksLimit: 5, callback: (v) => new Date(v).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' }) } },
        y: { suggestedMin: Math.max(minV - pad, p.min), suggestedMax: Math.min(maxV + pad, p.max), title: { display: !!p.unit, text: p.unit } },
      },
    },
  });
}

async function viewAquarium(id) {
  const [d, ms] = await Promise.all([api(`/aquariums/${id}`), api(`/aquariums/${id}/measurements?days=${RANGE}`)]);
  const aq = d.aquarium;
  const nodes = [];

  nodes.push(h('div', { class: 'row between' },
    h('div', {}, h('a', { href: '#/', class: 'muted' }, '‹ Alle Aquarien'), h('h1', {}, aq.name),
      h('div', { class: 'muted' }, CONFIG.waterTypes[aq.water_type], aq.volume_l ? ` · ${aq.volume_l} l` : '', aq.last_measured_at ? ` · zuletzt gemessen ${fmtDate(aq.last_measured_at)}` : '')),
    h('div', { class: 'row' },
      h('a', { class: 'btn', href: `#/a/${id}/messen` }, 'Werte eintragen'),
      h('button', { class: 'btn ghost', type: 'button', onclick: () => aquariumDialog(aq) }, 'Bearbeiten'))));
  if (aq.notes) nodes.push(h('p', { class: 'muted' }, aq.notes));

  // Warnungen und Alarme
  const notices = [];
  if (aq.overdue) notices.push(h('div', { class: 'alert warn' }, h('div', {}, h('strong', {}, 'Messung fällig'), `Die letzte Messung ist länger als ${aq.reminder_days} Tage her.`)));
  if (d.conflicts.length) notices.push(h('div', { class: 'alert info' }, h('div', {}, h('strong', {}, 'Der Besatz passt bei einigen Werten nicht zusammen'),
    `Für ${d.conflicts.map((k) => param(k).name).join(', ')} haben die Fischarten unterschiedliche Ansprüche. Hier gelten die allgemeinen Grenzwerte.`)));
  for (const a of d.alerts) {
    notices.push(h('div', { class: 'alert ' + a.level }, h('div', {}, h('strong', {}, a.level === 'crit' ? 'Kritisch' : 'Auffällig'), a.message, h('div', { class: 'muted' }, fmtDate(sqlDate(a.created_at)))),
      h('button', { class: 'btn small ghost', type: 'button', onclick: async () => { await api(`/aquariums/${id}/alerts/ack`, { method: 'POST', body: { ids: [a.id] } }); route(); } }, 'Erledigt')));
  }
  if (d.alerts.length > 1) notices.push(h('div', {}, h('button', { class: 'btn small ghost', type: 'button', onclick: async () => { await api(`/aquariums/${id}/alerts/ack`, { method: 'POST', body: {} }); route(); } }, 'Alle als erledigt markieren')));
  if (notices.length) nodes.push(h('section', { class: 'stack', 'aria-label': 'Warnungen' }, notices));

  // Aktuelle Werte
  const keys = CONFIG.parameters.map((p) => p.key).filter((k) => d.latest[k]);
  if (keys.length) {
    nodes.push(h('section', {}, h('h2', {}, 'Aktuelle Werte'), h('div', { class: 'values' }, keys.map((k) => {
      const p = param(k), l = d.latest[k];
      return h('div', { class: 'value ' + (l.status || '') }, h('div', { class: 'muted' }, p.name),
        h('div', {}, h('span', { class: 'num' }, fmtNum(p, l.value)), h('span', { class: 'unit' }, p.unit)),
        chip(l.status), h('div', { class: 'muted', style: 'font-size:.8rem;margin-top:.2rem' }, fmtDate(l.measured_at)));
    }))));
  } else {
    nodes.push(h('div', { class: 'card stack' }, h('h2', {}, 'Noch keine Messwerte'), h('p', {}, 'Trage deine ersten Wasserwerte ein. Danach erscheinen hier Verlauf und Warnungen.'), h('div', {}, h('a', { class: 'btn', href: `#/a/${id}/messen` }, 'Werte eintragen'))));
  }

  // Graphen
  const charts = [];
  const chartCards = [];
  for (const p of CONFIG.parameters) {
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
  const sp = h('input', { list: 'species', maxlength: '80', required: true, placeholder: 'z. B. Neon-Salmler' });
  const cnt = h('input', { type: 'number', min: '1', max: '10000', value: '1', inputmode: 'numeric' });
  const prof = h('select', {}, Object.entries(CONFIG.profiles).map(([k, v]) => h('option', { value: k }, v)));
  sp.addEventListener('input', () => { const m = CONFIG.species.find((s) => s.name.toLowerCase() === sp.value.trim().toLowerCase()); if (m) prof.value = m.profile; });
  const stockErr = h('p', { class: 'error', role: 'alert' });
  nodes.push(h('section', { class: 'card stack' },
    h('h2', {}, 'Besatz'),
    h('p', { class: 'muted' }, 'Die Fischarten bestimmen die Grenzwerte, zum Beispiel für pH, Härte oder Kupfer.'),
    d.stock.length ? h('ul', { style: 'list-style:none;padding:0;margin:0' }, d.stock.map((s) => h('li', { class: 'row between', style: 'padding:.3rem 0;border-bottom:1px solid var(--line)' },
      h('span', {}, `${s.count} × ${s.species}`, h('span', { class: 'muted' }, ` (${CONFIG.profiles[s.profile] || s.profile})`)),
      h('button', { class: 'btn small ghost', type: 'button', 'aria-label': `${s.species} entfernen`, onclick: async () => { await api(`/aquariums/${id}/stock/${s.id}`, { method: 'DELETE' }); route(); } }, 'Entfernen'))))
      : h('p', {}, 'Noch kein Besatz eingetragen. Es gelten die allgemeinen Grenzwerte.'),
    h('datalist', { id: 'species' }, CONFIG.species.map((s) => h('option', { value: s.name }))),
    h('form', { class: 'stack', onsubmit: async (e) => {
      e.preventDefault(); stockErr.textContent = '';
      try { await api(`/aquariums/${id}/stock`, { method: 'POST', body: { species: sp.value, count: cnt.value, profile: prof.value } }); route(); } catch (ex) { stockErr.textContent = ex.message; }
    } },
    h('div', { class: 'grid2' }, h('div', { class: 'field' }, h('label', {}, 'Art'), sp), h('div', { class: 'field' }, h('label', {}, 'Anzahl'), cnt)),
    h('div', { class: 'field' }, h('label', {}, 'Ansprüche an das Wasser'), prof),
    stockErr,
    h('div', {}, h('button', { class: 'btn', type: 'submit' }, 'Besatz hinzufügen')))));

  // Verlaufstabelle
  if (ms.length) {
    const used = CONFIG.parameters.filter((p) => ms.some((m) => m.values[p.key] != null));
    nodes.push(h('section', { class: 'card stack' }, h('h2', {}, 'Messungen'),
      h('div', { class: 'table-wrap' }, h('table', {},
        h('thead', {}, h('tr', {}, h('th', {}, 'Zeitpunkt'), used.map((p) => h('th', {}, p.name.replace(/ \(.*\)/, ''), p.unit ? ` (${p.unit})` : ''), ), h('th', {}, 'Notiz'), h('th', {}, ''))),
        h('tbody', {}, [...ms].reverse().slice(0, 40).map((m) => h('tr', {}, h('td', {}, fmtDate(m.measured_at)),
          used.map((p) => { const v = m.values[p.key]; const st = v == null ? null : evaluate(d.thresholds[p.key], v); return h('td', { class: st === 'crit' ? 'v-crit' : st === 'warn' ? 'v-warn' : '' }, v == null ? '–' : fmtNum(p, v)); }),
          h('td', {}, m.note || ''),
          h('td', {}, h('button', { class: 'btn small ghost', type: 'button', onclick: async () => { if (!confirm('Diese Messung löschen?')) return; await api(`/aquariums/${id}/measurements/${m.id}`, { method: 'DELETE' }); route(); } }, 'Löschen'))))))),
      ms.length > 40 ? h('p', { class: 'muted' }, 'Es werden die letzten 40 Messungen des Zeitraums angezeigt.') : null));
  }

  mount(h('div', { class: 'stack' }, nodes));
  for (const c of chartCards) charts.push(makeChart(c.canvas, c.p, c.points, d.thresholds[c.p.key]));
  cleanups.push(() => charts.forEach((c) => c.destroy()));
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
  const selKey = `tests:${ME.id}`;
  let selected = null;
  try { selected = JSON.parse(localStorage.getItem(selKey)); } catch (e) { /* Standard */ }
  if (!Array.isArray(selected)) selected = CONFIG.parameters.map((p) => p.key);

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
  const picker = h('details', {}, h('summary', {}, 'Welche Tests hast du?'), h('div', { class: 'picker', style: 'margin-top:.6rem' }, CONFIG.parameters.map((p) =>
    h('label', {}, h('input', { type: 'checkbox', checked: selected.includes(p.key), onchange: (e) => {
      selected = e.target.checked ? [...new Set([...selected, p.key])] : selected.filter((k) => k !== p.key);
      localStorage.setItem(selKey, JSON.stringify(selected)); applyVisibility();
    } }), p.name.replace(/ \(.*\)/, '')))));

  for (const p of CONFIG.parameters) {
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

  function applyVisibility() { for (const [k, r] of rows) r.el.hidden = !selected.includes(k); }

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
  applyVisibility(); render(); updateWake();
  // Erst nach mount() registrieren, denn mount() führt die Aufräumfunktionen der vorherigen Seite aus
  const tick = setInterval(render, 250);
  cleanups.push(() => { clearInterval(tick); if (wakeLock) wakeLock.release().catch(() => {}); });
}

/* ---------- Start ---------- */
(async () => {
  try { await start(); } catch (e) { showAuth(); }
})();

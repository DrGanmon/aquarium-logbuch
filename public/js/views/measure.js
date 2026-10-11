'use strict';

import { h, mount, toast } from '../dom.js';
import { api } from '../api.js';
import { CONFIG, ME, cleanups } from '../state.js';
import { param, fmtNum, evaluate, chip, localInputValue, mmss } from '../utils.js';
import { pushNotificationManager, beep } from '../notifications.js';
import { t } from '../i18n.js';

export async function viewMeasure(id) {
  const d = await api(`/aquariums/${id}`);
  const aq = d.aquarium;
  const role = d.role || aq.role || 'owner';
  if (role === 'view') {
    toast('Keine Schreibrechte für dieses Aquarium.');
    location.hash = `#/a/${id}`;
    return;
  }

  const suites = CONFIG?.suites || [];
  let currentSuiteId = ME?.selectedSuite || CONFIG?.defaultSuiteId || 'jbl-pro';
  let activeSuite =
    suites.find((s) => s.id === currentSuiteId) || CONFIG?.currentSuite || suites[0];

  const selKey = `tests:${ME?.id}`;
  let selected = null;
  if (Array.isArray(ME?.selectedTests)) {
    selected = [...ME.selectedTests];
  } else {
    try {
      selected = JSON.parse(localStorage.getItem(selKey));
    } catch (e) {
      /* Standard */
    }
  }
  if (!Array.isArray(selected)) {
    selected = activeSuite.tests.map((p) => p.key);
  }

  const timerKey = `timers:${id}`;
  const timers = (() => {
    try {
      return JSON.parse(sessionStorage.getItem(timerKey)) || {};
    } catch (e) {
      return {};
    }
  })();
  const saveTimers = () => sessionStorage.setItem(timerKey, JSON.stringify(timers));
  const finished = new Set(
    Object.entries(timers)
      .filter(([, end]) => end <= Date.now())
      .map(([k]) => k)
  );

  let wakeLock = null;
  const updateWake = async () => {
    const running = Object.values(timers).some((end) => end > Date.now());
    try {
      if (running && !wakeLock && navigator.wakeLock) {
        wakeLock = await navigator.wakeLock.request('screen');
        wakeLock.addEventListener('release', () => {
          wakeLock = null;
        });
      }
      if (!running && wakeLock) {
        await wakeLock.release();
        wakeLock = null;
      }
    } catch (e) {
      /* nicht unterstützt */
    }
  };

  const rows = new Map();
  const when = h('input', { type: 'datetime-local', required: true, value: localInputValue() });
  const note = h('input', { maxlength: '500', placeholder: 'z. B. nach Wasserwechsel' });
  const err = h('p', { class: 'error', role: 'alert' });
  const list = h('div', { class: 'tests' });

  const suiteSelect = h(
    'select',
    { style: 'width: auto; max-width: 100%;' },
    suites.map((s) => h('option', { value: s.id, selected: s.id === activeSuite.id }, s.name))
  );

  const checkboxesContainer = h('div', { class: 'picker', style: 'margin-top:.6rem' });

  const renderCheckboxes = () => {
    checkboxesContainer.replaceChildren(
      ...activeSuite.tests.map((p) =>
        h(
          'label',
          {},
          h('input', {
            type: 'checkbox',
            checked: selected.includes(p.key),
            onchange: async (e) => {
              selected = e.target.checked
                ? [...new Set([...selected, p.key])]
                : selected.filter((k) => k !== p.key);
              localStorage.setItem(selKey, JSON.stringify(selected));
              try {
                await api('/me/tests', {
                  method: 'PUT',
                  body: { selectedSuite: activeSuite.id, selectedTests: selected },
                });
              } catch (ex) {}
              applyVisibility();
            },
          }),
          p.name.replace(/ \(.*\)/, '') + (p.wait ? ` (${mmss(p.wait)})` : '')
        )
      )
    );
  };

  const btnSelectAll = h(
    'button',
    {
      class: 'btn small ghost',
      type: 'button',
      onclick: async () => {
        selected = activeSuite.tests.map((p) => p.key);
        localStorage.setItem(selKey, JSON.stringify(selected));
        try {
          await api('/me/tests', {
            method: 'PUT',
            body: { selectedSuite: activeSuite.id, selectedTests: selected },
          });
        } catch (ex) {}
        renderCheckboxes();
        applyVisibility();
      },
    },
    'Alle auswählen'
  );

  const btnSelectNone = h(
    'button',
    {
      class: 'btn small ghost',
      type: 'button',
      onclick: async () => {
        selected = [];
        localStorage.setItem(selKey, JSON.stringify(selected));
        try {
          await api('/me/tests', {
            method: 'PUT',
            body: { selectedSuite: activeSuite.id, selectedTests: selected },
          });
        } catch (ex) {}
        renderCheckboxes();
        applyVisibility();
      },
    },
    'Keine auswählen'
  );

  suiteSelect.addEventListener('change', async (e) => {
    const chosen = suites.find((s) => s.id === e.target.value);
    if (!chosen) return;
    activeSuite = chosen;
    currentSuiteId = chosen.id;
    selected = chosen.tests.map((p) => p.key);
    localStorage.setItem(selKey, JSON.stringify(selected));
    try {
      await api('/me/tests', {
        method: 'PUT',
        body: { selectedSuite: activeSuite.id, selectedTests: selected },
      });
    } catch (ex) {}
    rebuildRows();
    renderCheckboxes();
    applyVisibility();
    render();
  });

  const picker = h(
    'details',
    {},
    h('summary', { style: 'cursor:pointer; font-weight:600' }, `Wassertests anpassen (${activeSuite.name})`),
    h(
      'div',
      { class: 'stack', style: 'margin-top:.8rem; gap:.6rem' },
      suites.length > 1
        ? h('div', { class: 'row' }, h('span', { class: 'muted' }, 'Testsuite:'), suiteSelect)
        : null,
      h('div', { class: 'row' }, btnSelectAll, btnSelectNone),
      checkboxesContainer
    )
  );

  function rebuildRows() {
    list.replaceChildren();
    rows.clear();
    for (const p of activeSuite.tests) {
      const range = d.thresholds[p.key];
      const input = h('input', {
        type: 'text',
        inputmode: 'decimal',
        id: 'in-' + p.key,
        autocomplete: 'off',
        'aria-describedby': 'st-' + p.key,
      });
      const status = h('span', { id: 'st-' + p.key });
      const clock = h('span', { class: 'clock', 'aria-live': 'off' }, p.wait ? mmss(p.wait) : '');
      const fill = h('div', { class: 'fill' });
      const tube = h('div', { class: 'tube' + (p.wait ? '' : ' idle') }, fill);
      const btn = h('button', { class: 'btn small ghost', type: 'button' }, p.wait ? t('measure.timerStart', { time: mmss(p.wait) }) : 'Timer starten');
      const btnReset = h('button', { class: 'btn small ghost', type: 'button', style: 'display:none;' }, t('measure.timerReset'));
      const el = h(
        'div',
        { class: 'test', 'data-key': p.key },
        tube,
        h(
          'div',
          { class: 'test-head' },
          h('h3', {}, h('label', { for: 'in-' + p.key, style: 'margin:0;font-size:1rem' }, p.name)),
          status
        ),
        h(
          'div',
          { class: 'test-body' },
          p.wait
            ? h('div', { class: 'timer-line' }, btn, btnReset, clock)
            : h('span', { class: 'muted' }, 'Kein Warten nötig'),
          h('div', {}, input, p.unit ? h('span', { class: 'muted' }, ` ${p.unit}`) : null)
        ),
        h(
          'p',
          { class: 'hint' },
          p.hint,
          ' ',
          p.wait
            ? p.verified
              ? `Wartezeit: ${mmss(p.wait)} min (laut Anleitung).`
              : h(
                  'span',
                  { class: 'unverified' },
                  `Wartezeit ${mmss(p.wait)} min: bitte mit deiner Packungsbeilage abgleichen.`
                )
            : null
        )
      );
      input.addEventListener('input', () => {
        const raw = input.value.trim().replace(',', '.');
        status.replaceChildren();
        if (!raw) return;
        const v = Number(raw);
        if (!Number.isFinite(v) || v < p.min || v > p.max) {
          status.append(h('span', { class: 'chip warn' }, `erlaubt: ${p.min} bis ${p.max}`));
          return;
        }
        status.append(chip(evaluate(range, v)));
      });
      btn.addEventListener('click', async () => {
        beep();
        if (pushNotificationManager.getPermission() === 'default') {
          pushNotificationManager.requestPermission().then(() => updateNotificationBanner());
        }
        if (timers[p.key] && timers[p.key] > Date.now()) {
          delete timers[p.key];
          pushNotificationManager.cancelTimer({
            timerId: `${id}:${p.key}`,
            testKey: p.key,
            aquariumId: id,
          });
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
        finished.delete(p.key);
        saveTimers();
        render();
        updateWake();
      });
      btnReset.addEventListener('click', (e) => {
        e.preventDefault();
        delete timers[p.key];
        finished.delete(p.key);
        pushNotificationManager.cancelTimer({
          timerId: `${id}:${p.key}`,
          testKey: p.key,
          aquariumId: id,
        });
        saveTimers();
        render();
        updateWake();
      });
      rows.set(p.key, { p, el, fill, clock, btn, btnReset, input });
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
      const btnEnable = h(
        'button',
        {
          class: 'btn small',
          type: 'button',
          onclick: async () => {
            const res = await pushNotificationManager.requestPermission();
            updateNotificationBanner();
            if (res === 'granted') toast('Push-Benachrichtigungen aktiviert!');
          },
        },
        '🔔 Aktivieren'
      );

      notificationBanner.className = 'notification-banner info';
      notificationBanner.append(
        h(
          'div',
          { class: 'notification-banner-content' },
          h('span', { class: 'notification-banner-icon' }, '🔔'),
          h(
            'div',
            {},
            h('strong', {}, 'Push-Benachrichtigungen für Timer'),
            h(
              'p',
              { style: 'margin:0; font-size:.84rem; color:var(--ink-soft)' },
              'Erhalte automatische Benachrichtigungen bei Timer-Ablauf – auch wenn der Tab im Hintergrund liegt.'
            )
          )
        ),
        btnEnable
      );
    } else if (perm === 'granted') {
      notificationBanner.className = 'notification-banner active';
      notificationBanner.append(
        h(
          'div',
          { class: 'notification-banner-content' },
          h('span', { class: 'notification-banner-icon' }, '🔔'),
          h(
            'div',
            {},
            h('strong', {}, 'Push-Benachrichtigungen aktiv'),
            h(
              'p',
              { style: 'margin:0; font-size:.84rem; color:var(--ink-soft)' },
              'Du wirst zuverlässig benachrichtigt, sobald ein Test bereit zur Auswertung ist.'
            )
          )
        )
      );
    } else if (perm === 'denied') {
      notificationBanner.className = 'notification-banner warn';
      notificationBanner.append(
        h(
          'div',
          { class: 'notification-banner-content' },
          h('span', { class: 'notification-banner-icon' }, '🔕'),
          h(
            'div',
            {},
            h('strong', {}, 'Push-Benachrichtigungen im Browser blockiert'),
            h(
              'p',
              { style: 'margin:0; font-size:.84rem; color:var(--ink-soft)' },
              'Für Hintergrund-Alarme bitte Benachrichtigungen in den Website-Einstellungen deines Browsers erlauben.'
            )
          )
        )
      );
    }
  };
  updateNotificationBanner();

  const multiTimerDock = h('div', { class: 'multi-timer-dock card', style: 'display:none;' });

  const cancelAllTimers = () => {
    for (const k of Object.keys(timers)) {
      pushNotificationManager.cancelTimer({
        timerId: `${id}:${k}`,
        testKey: k,
        aquariumId: id,
      });
      delete timers[k];
      finished.delete(k);
    }
    saveTimers();
    render();
    updateWake();
  };

  const clearFinishedTimers = () => {
    const now = Date.now();
    for (const [k, end] of Object.entries(timers)) {
      if (end <= now) {
        delete timers[k];
        finished.delete(k);
      }
    }
    saveTimers();
    render();
    updateWake();
  };

  function render() {
    const now = Date.now();
    const activeItems = [];

    for (const [k, r] of rows) {
      if (!r.p.wait) continue;
      const end = timers[k];
      if (!end) {
        r.fill.style.setProperty('--p', 0);
        r.clock.textContent = mmss(r.p.wait);
        r.btn.textContent = t('measure.timerStart', { time: mmss(r.p.wait) });
        r.btnReset.style.display = 'none';
        r.el.classList.remove('done');
        continue;
      }
      const left = (end - now) / 1000;
      if (left > 0) {
        r.fill.style.setProperty('--p', Math.min(100, (1 - left / r.p.wait) * 100));
        r.clock.textContent = mmss(left);
        r.btn.textContent = t('measure.timerCancel');
        r.btnReset.style.display = 'none';
        r.el.classList.remove('done');
        activeItems.push({
          key: k,
          name: r.p.name,
          wait: r.p.wait,
          left,
          isDone: false,
          row: r,
        });
      } else {
        r.fill.style.setProperty('--p', 100);
        r.clock.textContent = t('measure.timerDone');
        r.btn.textContent = t('measure.timerRestart');
        r.btnReset.style.display = '';
        r.el.classList.add('done');
        activeItems.push({
          key: k,
          name: r.p.name,
          wait: r.p.wait,
          left: 0,
          isDone: true,
          row: r,
        });
        if (!finished.has(k)) {
          finished.add(k);
          pushNotificationManager.notify({
            title: `⏱️ ${r.p.name}: Wartezeit abgelaufen!`,
            body: `Die Wartezeit (${Math.max(1, Math.round(r.p.wait / 60))} Min.) für „${aq.name}“ ist vorbei. Bitte jetzt Farbwert ablesen!`,
            tag: `timer-${id}-${k}`,
            waitSec: r.p.wait,
            url: location.href,
          });
          toast(`${r.p.name}: ${t('measure.timerDone')}`);
          updateWake();
        }
      }
    }

    // Multi-Timer Dock Rendering
    if (activeItems.length === 0) {
      multiTimerDock.style.display = 'none';
      multiTimerDock.replaceChildren();
    } else {
      multiTimerDock.style.display = '';
      const runningCount = activeItems.filter((i) => !i.isDone).length;
      const finishedCount = activeItems.filter((i) => i.isDone).length;

      if (finishedCount > 0) {
        multiTimerDock.classList.add('has-finished');
      } else {
        multiTimerDock.classList.remove('has-finished');
      }

      // Sortieren: Fertige Tests zuerst, dann laufende Timer aufsteigend nach Restzeit
      activeItems.sort((a, b) => {
        if (a.isDone && !b.isDone) return -1;
        if (!a.isDone && b.isDone) return 1;
        return a.left - b.left;
      });

      let subtitleText = '';
      if (runningCount > 0 && finishedCount > 0) {
        subtitleText = t('measure.timersRunningAndFinished', { running: runningCount, finished: finishedCount });
      } else if (runningCount > 0) {
        subtitleText = t('measure.timersOnlyRunning', { running: runningCount });
      } else {
        subtitleText = t('measure.timersOnlyFinished', { finished: finishedCount });
      }

      const chips = activeItems.map((item) => {
        const chipEl = h(
          'span',
          {
            class: `multi-timer-chip ${item.isDone ? 'done' : 'running'}`,
            title: item.isDone ? t('measure.timerReadyClick') : `${item.name}: ${mmss(item.left)}`,
            onclick: (e) => {
              e.preventDefault();
              item.row.el.scrollIntoView({ behavior: 'smooth', block: 'center' });
              item.row.el.classList.add('timer-flash');
              setTimeout(() => item.row.el.classList.remove('timer-flash'), 1600);
              if (item.isDone) {
                setTimeout(() => item.row.input.focus(), 300);
              }
            },
          },
          item.isDone
            ? `✅ ${item.name}: ${t('measure.timerDone')}`
            : `⏳ ${item.name}: ${mmss(item.left)}`
        );
        return chipEl;
      });

      const actions = [];
      if (finishedCount > 0) {
        actions.push(
          h(
            'button',
            {
              class: 'btn small ghost',
              type: 'button',
              onclick: (e) => {
                e.preventDefault();
                clearFinishedTimers();
              },
            },
            t('measure.clearFinishedTimers')
          )
        );
      }
      actions.push(
        h(
          'button',
          {
            class: 'btn small ghost',
            type: 'button',
            onclick: (e) => {
              e.preventDefault();
              cancelAllTimers();
            },
          },
          t('measure.cancelAllTimers')
        )
      );

      multiTimerDock.replaceChildren(
        h(
          'div',
          { class: 'multi-timer-header' },
          h(
            'div',
            { class: 'multi-timer-title' },
            t('measure.activeTimersTitle', { count: activeItems.length }),
            h('span', { class: 'multi-timer-subtitle' }, ` • ${subtitleText}`)
          ),
          h('div', { class: 'multi-timer-actions' }, ...actions)
        ),
        h('div', { class: 'multi-timer-chips' }, ...chips)
      );
    }
  }

  rebuildRows();
  renderCheckboxes();
  applyVisibility();
  render();
  updateWake();

  const form = h(
    'form',
    {
      class: 'stack',
      onsubmit: async (e) => {
        e.preventDefault();
        err.textContent = '';
        const values = {};
        for (const [k, r] of rows)
          if (!r.el.hidden && r.input.value.trim())
            values[k] = r.input.value.trim().replace(',', '.');
        try {
          const r = await api(`/aquariums/${id}/measurements`, {
            method: 'POST',
            body: {
              measured_at: new Date(when.value).toISOString(),
              values,
              note: note.value,
            },
          });
          sessionStorage.removeItem(timerKey);
          const crit = r.alerts.filter((a) => a.level === 'crit').length,
            warn = r.alerts.length - crit;
          toast(
            r.alerts.length
              ? `Gespeichert: ${crit ? crit + ' kritisch' : ''}${crit && warn ? ', ' : ''}${warn ? warn + ' auffällig' : ''}.`
              : 'Gespeichert. Alle Werte im Bereich.'
          );
          location.hash = `#/a/${id}`;
        } catch (ex) {
          err.textContent = ex.message;
          err.scrollIntoView({ block: 'center' });
        }
      },
    },
    h('div', { class: 'field' }, h('label', { for: 'when' }, t('measure.dateTimeLabel')), ((when.id = 'when'), when)),
    picker,
    list,
    h('div', { class: 'field' }, h('label', {}, t('common.notesOptional')), note),
    h(
      'div',
      { class: 'sticky-save' },
      err,
      h(
        'div',
        { class: 'row' },
        h('button', { class: 'btn', type: 'submit' }, t('measure.saveBtn')),
        h('a', { class: 'btn ghost', href: `#/a/${id}` }, t('common.cancel'))
      )
    )
  );

  mount(
    h(
      'div',
      { class: 'stack' },
      h(
        'div',
        {},
        h('a', { href: `#/a/${id}`, class: 'muted' }, `‹ ${aq.name}`),
        h('h1', {}, t('measure.title')),
        h(
          'p',
          { class: 'muted' },
          t('measure.subtitle')
        )
      ),
      notificationBanner,
      multiTimerDock,
      form
    )
  );

  const tick = setInterval(render, 250);
  cleanups.push(() => {
    clearInterval(tick);
    if (wakeLock) wakeLock.release().catch(() => {});
  });
}

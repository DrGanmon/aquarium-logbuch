'use strict';

import { h, toast } from '../dom.js';
import { api } from '../api.js';
import { t } from '../i18n.js';
import { fmtDate } from '../utils.js';
import { route } from '../router.js';

export function formatDosingInterval(intervalDays, timeOfDay = null) {
  let intervalStr;
  const days = Number(intervalDays) || 1;
  if (days === 1) {
    intervalStr = t('dosing.intervalDaily');
  } else if (days === 2) {
    intervalStr = t('dosing.interval2Days');
  } else if (days === 3) {
    intervalStr = t('dosing.interval3Days');
  } else if (days === 7) {
    intervalStr = t('dosing.intervalWeekly');
  } else if (days === 14) {
    intervalStr = `Alle 14 ${t('common.days')}`;
  } else {
    intervalStr = `Alle ${days} ${t('common.days')}`;
  }

  if (timeOfDay) {
    intervalStr += ` (${timeOfDay} Uhr)`;
  }
  return intervalStr;
}

export function dosingPumpDialog(aq, existing = null, onSaved = null) {
  const isEditing = Boolean(existing && existing.id);
  const dlg = h('dialog', { class: 'wide' });
  const err = h('p', { class: 'error', role: 'alert' });

  const nameInput = h('input', {
    type: 'text',
    required: true,
    maxlength: '100',
    value: existing?.name || '',
    placeholder: t('dosing.namePlaceholder'),
  });

  const fertilizerInput = h('input', {
    type: 'text',
    required: true,
    maxlength: '100',
    list: 'dosing-fertilizer-suggestions',
    value: existing?.fertilizer_name || '',
    placeholder: t('dosing.fertilizerPlaceholder'),
  });

  const fertilizerDatalist = h(
    'datalist',
    { id: 'dosing-fertilizer-suggestions' },
    [
      'Eisen-Volldünger',
      'NPK Makro Basic',
      'Nitrat (GH Boost N / Makro Spezial N)',
      'Phosphat (Makro Basic Phosphat)',
      'Kalium (Makro Basic Kalium)',
      'Magnesium (Aqua Rebell Magnesium)',
      'Mikro Spezial Flowgrow',
      'Easy-Life ProFito',
      'Easy-Life EasyCarbo',
      'Flüssiges Filtermedium',
      'Spurenelemente / Mineralien',
    ].map((f) => h('option', { value: f }))
  );

  const amountInput = h('input', {
    type: 'number',
    required: true,
    min: '0.01',
    max: '1000',
    step: '0.1',
    value: existing?.amount_ml != null ? String(existing.amount_ml) : '2.0',
    placeholder: t('dosing.amountPlaceholder'),
  });

  const curDays = existing?.interval_days != null ? Number(existing.interval_days) : 1;
  const isPreset = [1, 2, 3, 7, 14].includes(curDays);

  const intervalSelect = h(
    'select',
    {},
    h('option', { value: '1', selected: curDays === 1 }, t('dosing.intervalDaily')),
    h('option', { value: '2', selected: curDays === 2 }, t('dosing.interval2Days')),
    h('option', { value: '3', selected: curDays === 3 }, t('dosing.interval3Days')),
    h('option', { value: '7', selected: curDays === 7 }, t('dosing.intervalWeekly')),
    h('option', { value: '14', selected: curDays === 14 }, 'Alle 14 Tage'),
    h('option', { value: 'custom', selected: !isPreset }, t('dosing.intervalCustom'))
  );

  const customIntervalInput = h('input', {
    type: 'number',
    min: '1',
    max: '365',
    step: '1',
    value: String(curDays),
    placeholder: 'z. B. 4 oder 10',
  });

  const customIntervalField = h(
    'div',
    { class: 'field', style: isPreset ? 'display:none' : 'display:block' },
    h('label', {}, t('dosing.intervalDays')),
    customIntervalInput
  );

  intervalSelect.addEventListener('change', () => {
    if (intervalSelect.value === 'custom') {
      customIntervalField.style.display = 'block';
    } else {
      customIntervalField.style.display = 'none';
      customIntervalInput.value = intervalSelect.value;
    }
  });

  const timeInput = h('input', {
    type: 'time',
    value: existing?.time_of_day ? existing.time_of_day.slice(0, 5) : '',
  });

  const activeCheckbox = h('input', {
    type: 'checkbox',
    checked: existing ? Boolean(existing.is_active) : true,
  });

  const noteInput = h('textarea', {
    maxlength: '500',
    rows: '2',
    placeholder: 'Optionale Bemerkungen...',
    value: existing?.note || '',
  });

  const submitBtn = h('button', { class: 'btn', type: 'submit' }, t('common.save'));
  const cancelBtn = h('button', { class: 'btn ghost', type: 'button', onclick: () => dlg.close() }, t('common.cancel'));
  let isSubmitting = false;

  const form = h(
    'form',
    {
      class: 'stack',
      onsubmit: async (e) => {
        e.preventDefault();
        if (isSubmitting) return;
        isSubmitting = true;
        submitBtn.disabled = true;
        cancelBtn.disabled = true;
        submitBtn.textContent = t('common.saving');
        err.textContent = '';

        let intervalDays = intervalSelect.value === 'custom'
          ? Number(customIntervalInput.value)
          : Number(intervalSelect.value);
        if (!intervalDays || intervalDays < 1) intervalDays = 1;

        const body = {
          name: nameInput.value.trim(),
          fertilizer_name: fertilizerInput.value.trim(),
          amount_ml: Number(amountInput.value.replace(',', '.')),
          interval_days: intervalDays,
          time_of_day: timeInput.value ? timeInput.value.slice(0, 5) : null,
          is_active: activeCheckbox.checked ? 1 : 0,
          note: noteInput.value.trim() || null,
        };

        try {
          if (isEditing) {
            await api(`/aquariums/${aq.id}/dosing-pumps/${existing.id}`, {
              method: 'PUT',
              body,
            });
            toast('Dosierpumpe aktualisiert.');
          } else {
            await api(`/aquariums/${aq.id}/dosing-pumps`, {
              method: 'POST',
              body,
            });
            toast('Dosierpumpe erfolgreich angelegt.');
          }
          dlg.close();
          if (typeof onSaved === 'function') onSaved();
          else route();
        } catch (ex) {
          err.textContent = ex.message;
          isSubmitting = false;
          submitBtn.disabled = false;
          cancelBtn.disabled = false;
          submitBtn.textContent = t('common.save');
        }
      },
    },
    fertilizerDatalist,
    h('h2', { style: 'margin:0' }, isEditing ? t('dosing.modalTitleEdit') : t('dosing.modalTitleNew')),
    h(
      'div',
      { class: 'grid2' },
      h('div', { class: 'field' }, h('label', {}, t('dosing.nameLabel')), nameInput),
      h('div', { class: 'field' }, h('label', {}, t('dosing.fertilizerLabel')), fertilizerInput)
    ),
    h(
      'div',
      { class: 'grid2' },
      h('div', { class: 'field' }, h('label', {}, t('dosing.amountLabel')), amountInput),
      h('div', { class: 'field' }, h('label', {}, t('dosing.intervalLabel')), intervalSelect)
    ),
    customIntervalField,
    h(
      'div',
      { class: 'grid2' },
      h('div', { class: 'field' }, h('label', {}, t('dosing.timeLabel')), timeInput),
      h(
        'div',
        { class: 'field', style: 'display:flex; align-items:center; gap:.5rem; margin-top:1.4rem;' },
        activeCheckbox,
        h('label', { style: 'margin:0; cursor:pointer;', onclick: () => { activeCheckbox.checked = !activeCheckbox.checked; } }, t('dosing.activeLabel'))
      )
    ),
    h('div', { class: 'field' }, h('label', {}, t('common.notesOptional')), noteInput),
    err,
    h('div', { class: 'row' }, submitBtn, cancelBtn)
  );

  dlg.append(form);
  dlg.addEventListener('close', () => dlg.remove());
  document.body.append(dlg);
  dlg.showModal();
}

export function renderDosingPumpsSection(aq, dosingPumps = [], isReadOnly = false, onRefresh = null) {
  const pumps = Array.isArray(dosingPumps) ? dosingPumps : [];

  const handleRefresh = onRefresh || (() => route());

  const addPumpBtn = !isReadOnly
    ? h(
        'button',
        {
          class: 'btn small',
          type: 'button',
          onclick: () => dosingPumpDialog(aq, null, handleRefresh),
        },
        t('dosing.addBtn')
      )
    : null;

  const headerRow = h(
    'div',
    { class: 'row between', style: 'align-items: center;' },
    h(
      'div',
      {},
      h('h2', { style: 'margin:0' }, t('dosing.sectionTitle')),
      h('div', { class: 'muted' }, t('dosing.sectionSubtitle'))
    ),
    addPumpBtn
  );

  if (!pumps.length) {
    return h(
      'section',
      { class: 'card stack' },
      headerRow,
      h(
        'div',
        { style: 'text-align: center; padding: 2rem 1rem;' },
        h('p', { class: 'muted', style: 'margin-bottom: 1rem;' }, t('dosing.emptyState')),
        !isReadOnly
          ? h(
              'button',
              {
                class: 'btn small',
                type: 'button',
                onclick: () => dosingPumpDialog(aq, null, handleRefresh),
              },
              '⚙️ ' + t('dosing.addBtn').replace('+ ', '')
            )
          : null
      )
    );
  }

  const pumpCards = pumps.map((p) => {
    const isActive = Boolean(p.is_active);
    const intervalText = formatDosingInterval(p.interval_days, p.time_of_day);

    const badges = [
      h('span', { class: 'chip ok' }, `💧 ${p.amount_ml} ml`),
      h('span', { class: 'chip' }, `📅 ${intervalText}`),
      h(
        'span',
        { class: `tag ${isActive ? 'ok' : 'muted'}` },
        isActive ? `✅ ${t('dosing.statusActive')}` : `⏸️ ${t('dosing.statusPaused')}`
      ),
    ];

    const actions = [];
    if (!isReadOnly) {
      actions.push(
        h(
          'button',
          {
            class: 'btn small',
            type: 'button',
            onclick: async (e) => {
              const btn = e.currentTarget;
              btn.disabled = true;
              btn.textContent = 'Wird dosiert...';
              try {
                await api(`/aquariums/${aq.id}/dosing-pumps/${p.id}/dose`, { method: 'POST' });
                toast(t('dosing.doseSuccess'));
                handleRefresh();
              } catch (ex) {
                toast(ex.message);
                btn.disabled = false;
                btn.textContent = t('dosing.doseNowBtn');
              }
            },
          },
          t('dosing.doseNowBtn')
        )
      );

      actions.push(
        h(
          'button',
          {
            class: 'btn small ghost',
            type: 'button',
            onclick: () => dosingPumpDialog(aq, p, handleRefresh),
          },
          t('dosing.editBtn')
        )
      );

      actions.push(
        h(
          'button',
          {
            class: 'btn small ghost danger',
            type: 'button',
            onclick: async () => {
              if (!confirm(t('dosing.deleteConfirm'))) return;
              try {
                await api(`/aquariums/${aq.id}/dosing-pumps/${p.id}`, { method: 'DELETE' });
                toast('Dosierpumpe gelöscht.');
                handleRefresh();
              } catch (ex) {
                toast(ex.message);
              }
            },
          },
          t('dosing.deleteBtn')
        )
      );
    }

    return h(
      'div',
      { class: 'card stack', style: 'padding: 1rem; border-left: 4px solid var(--accent, #00aa90);' },
      h(
        'div',
        { class: 'row between', style: 'align-items: center;' },
        h(
          'div',
          { style: 'display: flex; align-items: center; gap: .5rem;' },
          h('span', { style: 'font-size: 1.3rem;' }, '⚙️'),
          h('strong', { style: 'font-size: 1.05rem;' }, p.name),
          h('span', { class: 'muted' }, '—'),
          h('span', { style: 'font-weight: 600; color: var(--accent);' }, p.fertilizer_name)
        ),
        h('div', { class: 'row', style: 'gap: .3rem;' }, badges)
      ),
      h(
        'div',
        { class: 'row between', style: 'align-items: center; margin-top: .4rem;' },
        h(
          'div',
          { class: 'muted', style: 'font-size: .88rem;' },
          p.last_dosed_at
            ? `${t('dosing.lastDosed')} ${fmtDate(p.last_dosed_at)}`
            : t('dosing.lastDosedNever'),
          p.note ? ` • ${p.note}` : ''
        ),
        actions.length ? h('div', { class: 'row', style: 'gap: .4rem;' }, actions) : null
      )
    );
  });

  return h(
    'section',
    { class: 'card stack' },
    headerRow,
    h('div', { class: 'stack', style: 'gap: .8rem;' }, pumpCards)
  );
}

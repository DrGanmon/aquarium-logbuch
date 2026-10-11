'use strict';

import { h, toast } from '../dom.js';
import { api } from '../api.js';
import { CONFIG } from '../state.js';
import { localInputValue } from '../utils.js';
import { route } from '../router.js';
import { t } from '../i18n.js';

export function maintenanceDialog(aq, existing = null) {
  const isObj = existing && typeof existing === 'object';
  const editing = isObj;
  const initialType = isObj
    ? existing.type
    : typeof existing === 'string'
    ? existing
    : 'water_change';
  const dlg = h('dialog', { class: 'wide' });
  const err = h('p', { class: 'error', role: 'alert' });

  const types = CONFIG?.maintenanceTypes || {
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

  const initialDate = isObj
    ? localInputValue(new Date(existing.timestamp || existing.logged_at))
    : localInputValue();
  const dateInput = h('input', { type: 'datetime-local', required: true, value: initialDate });
  const typeSelect = h(
    'select',
    { required: true },
    Object.entries(types).map(([k, t]) =>
      h('option', { value: k, selected: initialType === k }, `${t.icon || ''} ${t.label}`)
    )
  );

  const percentInput = h('input', {
    type: 'number',
    min: '1',
    max: '100',
    step: '1',
    placeholder: 'z. B. 30 oder 50',
    value: isObj ? (existing?.percentage ?? '30') : '30',
  });
  const percentField = h(
    'div',
    { class: 'field' },
    h('label', {}, 'Wasserwechsel-Anteil (%)'),
    percentInput
  );

  const detailsInput = h('input', {
    maxlength: '500',
    value: isObj ? (existing?.details || '') : '',
  });
  const detailsLabel = h('label', {}, 'Details zur Arbeit');
  const detailsField = h('div', { class: 'field' }, detailsLabel, detailsInput);

  const noteInput = h('textarea', {
    maxlength: '1000',
    placeholder: 'Optionale Bemerkungen...',
    value: isObj ? (existing?.note || '') : '',
  });

  const updateFormForType = (typeKey) => {
    if (typeKey === 'water_change') {
      percentField.style.display = 'block';
      detailsLabel.textContent = 'Zusatz / Wasseraufbereitung (optional)';
      detailsInput.placeholder = 'z. B. Osmosewasser 50:50, Wasseraufbereiter zugegeben';
    } else {
      percentField.style.display = 'none';
      if (typeKey === 'filter_change') {
        detailsLabel.textContent = 'Gewechselte Filtermedien (was wurde getauscht?)';
        detailsInput.placeholder =
          'z. B. Filtervlies und Aktivkohle erneuert, Schwamm getauscht';
      } else if (typeKey === 'filter_clean') {
        detailsLabel.textContent = 'Gereinigte Filterteile';
        detailsInput.placeholder =
          'z. B. Vorfilter im Altwasser ausgewaschen, Impeller gereinigt';
      } else if (typeKey === 'plants_cut') {
        detailsLabel.textContent = 'Gegärtnerte / geschnittene Pflanzen';
        detailsInput.placeholder =
          'z. B. Stängelpflanzen gekürzt, Schwimmpflanzen ausgedünnt';
      } else if (typeKey === 'plants_new') {
        detailsLabel.textContent = 'Neu eingesetzte Pflanzenarten';
        detailsInput.placeholder =
          'z. B. Anubias barteri, Cryptocoryne wendtii, Javafarn';
      } else if (typeKey === 'care') {
        detailsLabel.textContent = 'Pflegemaßnahmen';
        detailsInput.placeholder =
          'z. B. Scheiben innen geputzt, Mulm im Vordergrund abgesaugt';
      } else if (typeKey === 'fertilize') {
        detailsLabel.textContent = 'Dünger & Dosierung';
        detailsInput.placeholder = 'z. B. 5 ml Eisen-Volldünger, 2 ml NPK Tagesdünger';
      } else if (typeKey === 'feeding') {
        detailsLabel.textContent = 'Futtersorte / Spezialnahrung';
        detailsInput.placeholder = 'z. B. Artemia-Nauplien, Futtertablette für Welse';
      } else {
        detailsLabel.textContent = 'Details zur Arbeit';
        detailsInput.placeholder = 'Was wurde am Aquarium gemacht?';
      }
    }
  };

  typeSelect.addEventListener('change', () => updateFormForType(typeSelect.value));
  updateFormForType(initialType);

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
        const body = {
          type: typeSelect.value,
          logged_at: dateInput.value,
          percentage: typeSelect.value === 'water_change' ? percentInput.value : null,
          details: detailsInput.value.trim() || null,
          note: noteInput.value.trim() || null,
        };
        try {
          if (editing) {
            await api(`/aquariums/${aq.id}/maintenance/${existing.id}`, {
              method: 'PUT',
              body,
            });
            toast('Aktivität aktualisiert.');
          } else {
            await api(`/aquariums/${aq.id}/maintenance`, { method: 'POST', body });
            toast('Aktivität im Logbuch gespeichert.');
          }
          dlg.close();
          route();
        } catch (ex) {
          err.textContent = ex.message;
          isSubmitting = false;
          submitBtn.disabled = false;
          cancelBtn.disabled = false;
          submitBtn.textContent = t('common.save');
        }
      },
    },
    h(
      'h2',
      { style: 'margin:0' },
      editing ? t('timeline.modalTitle') : '🛠️ ' + t('timeline.newEntryBtn').replace('+ ', '')
    ),
    h(
      'div',
      { class: 'grid2' },
      h('div', { class: 'field' }, h('label', {}, t('timeline.typeLabel')), typeSelect),
      h('div', { class: 'field' }, h('label', {}, t('timeline.dateLabel')), dateInput)
    ),
    percentField,
    detailsField,
    h('div', { class: 'field' }, h('label', {}, t('common.notesOptional')), noteInput),
    err,
    h(
      'div',
      { class: 'row' },
      submitBtn,
      cancelBtn,
      editing
        ? h(
            'button',
            {
              class: 'btn danger',
              type: 'button',
              onclick: async () => {
                if (!confirm(t('timeline.deleteConfirm'))) return;
                try {
                  await api(`/aquariums/${aq.id}/maintenance/${existing.id}`, {
                    method: 'DELETE',
                  });
                  dlg.close();
                  toast('Eintrag gelöscht.');
                  route();
                } catch (ex) {
                  err.textContent = ex.message;
                }
              },
            },
            t('common.delete')
          )
        : null
    )
  );

  dlg.append(form);
  dlg.addEventListener('close', () => dlg.remove());
  document.body.append(dlg);
  dlg.showModal();
}

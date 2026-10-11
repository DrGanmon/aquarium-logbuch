'use strict';

import { h, mount, toast } from '../dom.js';
import { api } from '../api.js';
import { CONFIG, ME, setMe, $topbar } from '../state.js';
import { fmtDate } from '../utils.js';
import { updateTopbarUser, route } from '../router.js';
import { showAuth } from './auth.js';
import { t } from '../i18n.js';

export let CURRENT_AQ_TAB = localStorage.getItem('aquarium_list_tab') || 'own';

export function setCurrentAqTab(tab) {
  CURRENT_AQ_TAB = tab;
  localStorage.setItem('aquarium_list_tab', tab);
}

export async function viewShareInvitation(token) {
  $topbar.hidden = !ME;
  if (ME) updateTopbarUser();

  const headerRow = h(
    'div',
    { class: 'row between', style: 'margin-bottom:.5rem; align-items:center;' },
    h('p', { class: 'muted', style: 'margin:0' }, 'Wasserwerte im Blick behalten.')
  );

  if (!token) {
    mount(
      h(
        'div',
        { class: 'auth' },
        headerRow,
        h(
          'div',
          { class: 'card stack' },
          h('h1', {}, '⚠️ Ungültiger Link'),
          h('p', { class: 'error' }, 'Es wurde kein Einladungstoken übergeben.'),
          h('a', { class: 'btn', href: '#/' }, 'Zur Startseite')
        )
      )
    );
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
        setCurrentAqTab('shared');
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

    mount(
      h(
        'div',
        { class: 'auth', style: 'max-width: 540px; margin: 2rem auto;' },
        h(
          'div',
          { class: 'card stack' },
          h(
            'div',
            { style: 'text-align:center;' },
            h('img', {
              src: 'icon-192.png',
              alt: 'Logo',
              style: 'width:64px; height:64px; border-radius:14px; margin-bottom:1rem;',
            }),
            h('h1', {}, '🐠 Aquarium-Freigabe'),
            h('p', { class: 'muted' }, `${info.owner_username} hat ein Aquarium mit dir geteilt`)
          ),
          h(
            'div',
            { class: 'compat-box info stack', style: 'gap:.4rem;' },
            h(
              'div',
              { style: 'display:flex; justify-content:space-between;' },
              h('strong', {}, 'Aquarium:'),
              h('span', {}, info.aquarium_name)
            ),
            h(
              'div',
              { style: 'display:flex; justify-content:space-between;' },
              h('strong', {}, 'Wasserart & Volumen:'),
              h(
                'span',
                {},
                `${CONFIG?.waterTypes?.[info.water_type] || info.water_type}${info.volume_l ? ' · ' + info.volume_l + ' l' : ''}`
              )
            ),
            h(
              'div',
              { style: 'display:flex; justify-content:space-between;' },
              h('strong', {}, 'Berechtigung:'),
              h(
                'span',
                {},
                info.roleLabel || (info.role === 'write' ? 'Schreibrechte' : 'Leserechte')
              )
            ),
            h(
              'div',
              { style: 'display:flex; justify-content:space-between;' },
              h('strong', {}, 'Geteilt für:'),
              h('span', {}, info.target_username || info.target_email || 'Dich')
            )
          ),
          err,
          ME
            ? h(
                'div',
                { class: 'row between', style: 'margin-top:1rem;' },
                declineBtn,
                acceptBtn
              )
            : h(
                'div',
                { class: 'stack', style: 'margin-top:1rem;' },
                h(
                  'p',
                  { class: 'muted', style: 'text-align:center;' },
                  'Bitte melde dich an oder erstelle ein Konto, um diese Freigabe anzunehmen:'
                ),
                h(
                  'div',
                  { class: 'row center', style: 'gap:.75rem;' },
                  h(
                    'a',
                    {
                      class: 'btn',
                      href: '#/',
                      onclick: (e) => {
                        e.preventDefault();
                        showAuth('login');
                      },
                    },
                    'Anmelden'
                  ),
                  h(
                    'a',
                    {
                      class: 'btn ghost',
                      href: '#/register',
                      onclick: (e) => {
                        e.preventDefault();
                        showAuth('register');
                      },
                    },
                    'Registrieren'
                  )
                )
              )
        )
      )
    );
  } catch (ex) {
    mount(
      h(
        'div',
        { class: 'auth' },
        headerRow,
        h(
          'div',
          { class: 'card stack' },
          h('h1', {}, '⚠️ Einladung nicht verfügbar'),
          h('p', { class: 'error' }, ex.message),
          h('a', { class: 'btn', href: '#/' }, 'Zur Startseite')
        )
      )
    );
  }
}

export function aquariumDialog(aq) {
  const editing = !!aq;
  const isOwner = !editing || aq.role === 'owner';
  const err = h('p', { class: 'error', role: 'alert' });
  let imageBase64 = null;
  let removeExistingImage = false;

  const fileInput = h('input', {
    type: 'file',
    accept: 'image/png,image/jpeg,image/webp,image/gif',
  });
  const previewImg = h('img', { class: 'img-preview', style: 'display:none' });
  const btnRemoveImg = h(
    'button',
    { class: 'btn small ghost', type: 'button', style: 'display:none' },
    'Bild entfernen'
  );

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
    { val: '', label: t('aquariums.noDay') },
    { val: '1', label: t('common.monday') },
    { val: '2', label: t('common.tuesday') },
    { val: '3', label: t('common.wednesday') },
    { val: '4', label: t('common.thursday') },
    { val: '5', label: t('common.friday') },
    { val: '6', label: t('common.saturday') },
    { val: '7', label: t('common.sunday') },
  ];

  const mInterval =
    aq?.measure_cycle_interval != null
      ? aq.measure_cycle_interval
      : aq?.reminder_days
      ? aq.reminder_days
      : 7;
  const mUnit = aq?.measure_cycle_unit || 'days';
  const mDay = aq?.measure_cycle_day_of_week != null ? String(aq.measure_cycle_day_of_week) : '';
  const mMail = Boolean(aq?.measure_reminder_mail);

  const fInterval = aq?.fertilize_cycle_interval != null ? aq.fertilize_cycle_interval : '';
  const fUnit = aq?.fertilize_cycle_unit || 'weeks';
  const fDay =
    aq?.fertilize_cycle_day_of_week != null ? String(aq.fertilize_cycle_day_of_week) : '';
  const fMail = Boolean(aq?.fertilize_reminder_mail);

  const f = {
    name: h('input', { required: true, maxlength: '80', value: aq?.name || '' }),
    motto: h('input', {
      maxlength: '160',
      placeholder: 'z. B. Mein Amazonas-Biotop / Naturaquarium 120',
      value: aq?.motto || '',
    }),
    description: h('textarea', {
      maxlength: '4000',
      rows: '3',
      placeholder:
        'Generelle Beschreibung (z. B. Scape, Bepflanzung, Beleuchtung, Technik & Philosophie)...',
      value: aq?.description || '',
    }),
    water_type: h(
      'select',
      { value: aq?.water_type || 'fresh' },
      Object.entries(CONFIG?.waterTypes || {}).map(([k, v]) => h('option', { value: k }, v))
    ),
    volume_l: h('input', {
      type: 'number',
      min: '1',
      max: '100000',
      inputmode: 'numeric',
      value: aq?.volume_l ?? '',
    }),
    notes: h('textarea', {
      maxlength: '1000',
      placeholder: 'Kurze Notizen...',
      value: aq?.notes || '',
    }),

    // Messzyklus
    measure_cycle_interval: h('input', {
      type: 'number',
      min: '0',
      max: '365',
      placeholder: 'z. B. 7 oder 14 (0 = aus)',
      value: mInterval,
    }),
    measure_cycle_unit: h(
      'select',
      { value: mUnit },
      h('option', { value: 'days' }, 'Tage'),
      h('option', { value: 'weeks' }, 'Wochen')
    ),
    measure_cycle_day_of_week: h(
      'select',
      { value: mDay },
      weekdaysList.map((w) =>
        h('option', { value: w.val, selected: String(w.val) === String(mDay) }, w.label)
      )
    ),
    measure_reminder_mail: h('input', { type: 'checkbox', checked: mMail }),

    // Düngzyklus
    fertilize_cycle_interval: h('input', {
      type: 'number',
      min: '0',
      max: '365',
      placeholder: 'z. B. 1 oder 2 (leer/0 = aus)',
      value: fInterval,
    }),
    fertilize_cycle_unit: h(
      'select',
      { value: fUnit },
      h('option', { value: 'days' }, 'Tage'),
      h('option', { value: 'weeks' }, 'Wochen')
    ),
    fertilize_cycle_day_of_week: h(
      'select',
      { value: fDay },
      weekdaysList.map((w) =>
        h('option', { value: w.val, selected: String(w.val) === String(fDay) }, w.label)
      )
    ),
    fertilize_reminder_mail: h('input', { type: 'checkbox', checked: fMail }),
  };

  const dlg = h(
    'dialog',
    { class: 'wide stack' },
    h(
      'form',
      {
        class: 'stack',
        method: 'dialog',
        onsubmit: async (e) => {
          e.preventDefault();
          err.textContent = '';
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
              await api(`/aquariums/${targetId}/images`, {
                method: 'POST',
                body: { image: imageBase64, is_primary: 1 },
              });
            } else if (removeExistingImage && editing) {
              await api(`/aquariums/${targetId}/image`, { method: 'DELETE' });
            }
            dlg.close();
            toast('Gespeichert.');
            if (editing) route();
            else location.hash = `#/a/${targetId}`;
          } catch (ex) {
            err.textContent = ex.message;
          }
        },
      },
      h('h2', {}, editing ? t('aquariums.modalEditTitle') : t('aquariums.modalNewTitle')),
      h('div', { class: 'field' }, h('label', {}, t('aquariums.nameLabel')), f.name),
      h('div', { class: 'field' }, h('label', {}, t('aquariums.mottoLabel')), f.motto),
      h(
        'div',
        { class: 'field' },
        h('label', {}, t('aquariums.descriptionLabel')),
        f.description
      ),
      h(
        'div',
        { class: 'grid2' },
        h('div', { class: 'field' }, h('label', {}, t('aquariums.waterTypeLabel')), f.water_type),
        h('div', { class: 'field' }, h('label', {}, t('aquariums.volumeLabel')), f.volume_l)
      ),

      // Messzyklus
      h(
        'div',
        { class: 'cycle-edit-box stack' },
        h(
          'strong',
          {
            style:
              'display:flex; align-items:center; gap:.4rem; color: var(--accent);',
          },
          t('aquariums.measureCycleLabel')
        ),
        h(
          'div',
          { class: 'grid3' },
          h('div', { class: 'field' }, h('label', {}, 'Intervall'), f.measure_cycle_interval),
          h('div', { class: 'field' }, h('label', {}, t('common.unit')), f.measure_cycle_unit),
          h(
            'div',
            { class: 'field' },
            h('label', {}, t('aquariums.cycleDayLabel')),
            f.measure_cycle_day_of_week
          )
        ),
        h(
          'label',
          {
            class: 'row',
            style:
              'gap:.5rem; align-items:center; font-size:.9rem; cursor:pointer; margin-top:.2rem;',
          },
          f.measure_reminder_mail,
          t('aquariums.measureReminderMail')
        )
      ),

      // Düngzyklus
      h(
        'div',
        { class: 'cycle-edit-box stack' },
        h(
          'strong',
          { style: 'display:flex; align-items:center; gap:.4rem; color: #10b981;' },
          t('aquariums.fertilizeCycleLabel')
        ),
        h(
          'div',
          { class: 'grid3' },
          h('div', { class: 'field' }, h('label', {}, 'Intervall'), f.fertilize_cycle_interval),
          h('div', { class: 'field' }, h('label', {}, t('common.unit')), f.fertilize_cycle_unit),
          h(
            'div',
            { class: 'field' },
            h('label', {}, t('aquariums.cycleDayLabel')),
            f.fertilize_cycle_day_of_week
          )
        ),
        h(
          'label',
          {
            class: 'row',
            style:
              'gap:.5rem; align-items:center; font-size:.9rem; cursor:pointer; margin-top:.2rem;',
          },
          f.fertilize_reminder_mail,
          t('aquariums.fertilizeReminderMail')
        )
      ),

      h('div', { class: 'field' }, h('label', {}, t('common.notesOptional')), f.notes),
      h(
        'div',
        { class: 'field' },
        h('label', {}, t('aquariums.imageLabel')),
        fileInput,
        previewImg,
        h('div', { style: 'margin-top:.4rem' }, btnRemoveImg)
      ),
      err,
      h(
        'div',
        { class: 'row' },
        h('button', { class: 'btn', type: 'submit' }, t('common.save')),
        h('button', { class: 'btn ghost', type: 'button', onclick: () => dlg.close() }, t('common.cancel')),
        editing && isOwner
          ? h(
              'button',
              {
                class: 'btn danger',
                type: 'button',
                onclick: async () => {
                  if (
                    !confirm(
                      t('aquariums.deleteConfirm', { name: aq.name })
                    )
                  )
                    return;
                  try {
                    await api(`/aquariums/${aq.id}`, { method: 'DELETE' });
                    dlg.close();
                    location.hash = '#/';
                    toast('Aquarium gelöscht.');
                  } catch (ex) {
                    err.textContent = ex.message;
                  }
                },
              },
              t('common.delete')
            )
          : null
      )
    )
  );
  dlg.addEventListener('close', () => dlg.remove());
  document.body.append(dlg);
  dlg.showModal();
  f.name.focus();
}

export async function viewList() {
  const [list, pendingShares] = await Promise.all([
    api('/aquariums'),
    api('/shares/pending').catch(() => []),
  ]);

  const ownList = list.filter((a) => a.role === 'owner');
  const sharedList = list.filter((a) => a.role !== 'owner');

  const activeTab = CURRENT_AQ_TAB === 'shared' ? 'shared' : 'own';

  function renderCard(a) {
    const isDueMeasure = a.overdue || (a.measure_cycle_status && a.measure_cycle_status.is_due);
    const isDueFertilize =
      a.fertilize_overdue || (a.fertilize_cycle_status && a.fertilize_cycle_status.is_due);
    const s = a.open_crit
      ? 'crit'
      : a.open_warn || isDueMeasure || isDueFertilize
      ? 'warn'
      : a.last_measured_at
      ? 'ok'
      : 'none';
    const isOwner = a.role === 'owner';
    return h(
      'a',
      { class: `card aq-card s-${s}`, href: `#/a/${a.id}` },
      a.has_image
        ? h('img', {
            class: 'aq-card-img',
            src: `api/aquariums/${a.id}/image`,
            alt: a.name,
            loading: 'lazy',
          })
        : null,
      h('h2', {}, a.name),
      a.motto ? h('div', { class: 'aq-motto' }, a.motto) : null,
      h(
        'div',
        { class: 'muted' },
        CONFIG?.waterTypes?.[a.water_type] || a.water_type,
        a.volume_l ? ` · ${a.volume_l} l` : ''
      ),
      h(
        'div',
        { class: 'row', style: 'margin-top:.6rem' },
        a.open_crit ? h('span', { class: 'chip crit' }, `${a.open_crit} kritisch`) : null,
        a.open_warn ? h('span', { class: 'chip warn' }, `${a.open_warn} auffällig`) : null,
        isDueMeasure ? h('span', { class: 'chip warn' }, '🧪 Messung fällig') : null,
        isDueFertilize ? h('span', { class: 'chip warn' }, '🌿 Düngung fällig') : null,
        !a.open_crit &&
          !a.open_warn &&
          !isDueMeasure &&
          !isDueFertilize &&
          a.last_measured_at
          ? h('span', { class: 'chip ok' }, 'alles im Bereich')
          : null,
        !a.last_measured_at ? h('span', { class: 'chip none' }, 'noch keine Messung') : null,
        a.last_fertilized_at
          ? h('span', { class: 'chip ok' }, `🌿 Düngung: ${fmtDate(a.last_fertilized_at)}`)
          : null,
        a.last_water_change_at
          ? h(
              'span',
              { class: 'chip ok' },
              `💧 WW: ${fmtDate(a.last_water_change_at)}${
                a.last_water_change_percent ? ' (' + a.last_water_change_percent + '%)' : ''
              }`
            )
          : null,
        !isOwner && a.role === 'write'
          ? h('span', { class: 'chip ok' }, `Geteilt: Schreiben (${a.owner_username || 'Besitzer'})`)
          : null,
        !isOwner && a.role === 'view'
          ? h('span', { class: 'chip none' }, `Geteilt: Lesen (${a.owner_username || 'Besitzer'})`)
          : null,
        isOwner && a.shares_count > 0 ? h('span', { class: 'chip none' }, `Geteilt (${a.shares_count})`) : null
      ),
      a.last_measured_at
        ? h('div', { class: 'muted', style: 'margin-top:.4rem' }, 'Zuletzt gemessen: ', fmtDate(a.last_measured_at))
        : null
    );
  }

  // Tabs
  const tabOwnBtn = h(
    'button',
    {
      class: `nav-tab-btn ${activeTab === 'own' ? 'active' : ''}`,
      type: 'button',
      onclick: () => {
        setCurrentAqTab('own');
        viewList();
      },
    },
    t('aquariums.tabMine'),
    h('span', { class: 'tab-badge' }, ownList.length)
  );

  const tabSharedBtn = h(
    'button',
    {
      class: `nav-tab-btn ${activeTab === 'shared' ? 'active' : ''}`,
      type: 'button',
      onclick: () => {
        setCurrentAqTab('shared');
        viewList();
      },
    },
    t('aquariums.tabShared'),
    h(
      'span',
      { class: 'tab-badge' },
      pendingShares.length > 0 ? `${sharedList.length} (+${pendingShares.length})` : sharedList.length
    )
  );

  const navTabs = h('div', { class: 'nav-tabs' }, tabOwnBtn, tabSharedBtn);

  let tabContent;
  if (activeTab === 'own') {
    const cards = ownList.map(renderCard);
    tabContent = cards.length
      ? h('div', { class: 'aq-list' }, cards)
      : h(
          'div',
          { class: 'card stack' },
          h('h2', {}, t('aquariums.emptyMine')),
          h(
            'p',
            {},
            t('aquariums.emptyMineDesc')
          ),
          h(
            'div',
            {},
            h('button', { class: 'btn', type: 'button', onclick: () => aquariumDialog() }, t('aquariums.newAquariumBtn'))
          )
        );
  } else {
    // Shared Tab
    const pendingSection =
      pendingShares.length > 0
        ? h(
            'div',
            { class: 'pending-shares-box stack' },
            h(
              'h3',
              { style: 'margin:0; display:flex; align-items:center; gap:.5rem;' },
              '✉️ ' + t('aquariums.sharedPendingBadge'),
              h('span', { class: 'chip warn' }, `${pendingShares.length} ausstehend`)
            ),
            h(
              'p',
              { class: 'muted', style: 'margin:0; font-size:.9rem;' },
              'Du wurdest eingeladen, auf folgende Aquarien zuzugreifen. Nimm die Einladung an, um das Becken einzusehen:'
            ),
            h(
              'div',
              { class: 'stack', style: 'gap:.5rem;' },
              pendingShares.map((ps) => {
                const roleLabel = ps.role === 'write' ? 'Schreibrechte' : 'Leserechte';
                return h(
                  'div',
                  { class: 'pending-share-item' },
                  h(
                    'div',
                    {},
                    h('strong', { style: 'font-size:1.05rem; display:block;' }, ps.aquarium_name),
                    h(
                      'div',
                      { class: 'muted', style: 'font-size:.85rem;' },
                      `Geteilt von: `,
                      h('strong', {}, ps.owner_username),
                      ` · Berechtigung: `,
                      h('span', { class: ps.role === 'write' ? 'chip ok' : 'chip none' }, roleLabel),
                      ` · Eingeladen am: `,
                      fmtDate(ps.created_at)
                    )
                  ),
                  h(
                    'div',
                    { class: 'row', style: 'gap:.5rem;' },
                    h(
                      'button',
                      {
                        class: 'btn small',
                        type: 'button',
                        onclick: async (e) => {
                          e.target.disabled = true;
                          try {
                            await api('/shares/accept', {
                              method: 'POST',
                              body: { aquarium_id: ps.aquarium_id },
                            });
                            toast(t('aquariums.inviteAccepted'));
                            viewList();
                          } catch (err) {
                            toast(err.message);
                            e.target.disabled = false;
                          }
                        },
                      },
                      t('aquariums.acceptInvite')
                    ),
                    h(
                      'button',
                      {
                        class: 'btn small ghost',
                        type: 'button',
                        onclick: async (e) => {
                          if (!confirm(`Einladung für „${ps.aquarium_name}“ wirklich ablehnen?`))
                            return;
                          e.target.disabled = true;
                          try {
                            await api('/shares/decline', {
                              method: 'POST',
                              body: { aquarium_id: ps.aquarium_id },
                            });
                            toast(t('aquariums.inviteDeclined'));
                            viewList();
                          } catch (err) {
                            toast(err.message);
                            e.target.disabled = false;
                          }
                        },
                      },
                      t('aquariums.declineInvite')
                    )
                  )
                );
              })
            )
          )
        : null;

    const cards = sharedList.map(renderCard);
    const listSection = cards.length
      ? h('div', { class: 'aq-list' }, cards)
      : h(
          'div',
          { class: 'card stack' },
          h('h2', {}, t('aquariums.emptyShared')),
          h('p', {}, t('aquariums.emptySharedDesc')),
          h(
            'p',
            { class: 'muted', style: 'margin:0;' },
            'Sobald andere Aquarianer ein Becken mit dir teilen und du die Einladung per E-Mail oder hier annimmst, wird es in diesem Bereich angezeigt.'
          )
        );

    tabContent = h('div', { class: 'stack' }, pendingSection, listSection);
  }

  mount(
    h(
      'div',
      { class: 'stack' },
      h(
        'div',
        { class: 'row between', style: 'align-items:center;' },
        h('h1', { style: 'margin:0;' }, t('aquariums.title')),
        h('button', { class: 'btn', type: 'button', onclick: () => aquariumDialog() }, t('aquariums.newAquariumBtn'))
      ),
      navTabs,
      tabContent
    )
  );
}

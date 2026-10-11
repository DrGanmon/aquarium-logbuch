'use strict';

import { h, mount, toast, showImageModal } from '../dom.js';
import { api } from '../api.js';
import {
  CONFIG,
  ME,
  cleanups,
  GRAPH_RANGE_STORAGE_KEY,
  GRAPH_CUSTOM_FROM_KEY,
  GRAPH_CUSTOM_TO_KEY,
  RANGE,
  CUSTOM_FROM,
  CUSTOM_TO,
  setRange,
  setCustomFrom,
  setCustomTo,
} from '../state.js';
import {
  param,
  fmtNum,
  fmtDate,
  sqlDate,
  chip,
  evaluate,
  socialLabel,
  territorialLabel,
} from '../utils.js';
import { makeChart } from '../charts.js';
import { activeCharts } from '../theme.js';
import { showSpeciesModal } from './species.js';
import { aquariumDialog } from './aquarium-list.js';
import { maintenanceDialog } from './timeline.js';
import { exportMeasurementsDialog, importMeasurementsDialog } from './export-import.js';
import { showAquariumChatModal } from './ai-chat.js';
import { route } from '../router.js';

export function uploadImageDialog(aq) {
  const dlg = h('dialog', { class: 'stack', style: 'max-width: 480px;' });
  const err = h('p', { class: 'error', role: 'alert' });
  let imageBase64 = null;

  const fileInput = h('input', {
    type: 'file',
    accept: 'image/png,image/jpeg,image/webp,image/gif',
    required: true,
  });
  const previewImg = h('img', {
    class: 'img-preview',
    style: 'display:none; max-height: 200px; width: 100%; object-fit: cover;',
  });
  const captionInput = h('input', {
    maxlength: '200',
    placeholder: 'z. B. Gesamtansicht nach dem Rückschnitt...',
  });
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

  const form = h(
    'form',
    {
      class: 'stack',
      onsubmit: async (e) => {
        e.preventDefault();
        err.textContent = '';
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
      },
    },
    h(
      'div',
      { class: 'row between' },
      h('h2', { style: 'margin:0' }, 'Foto hochladen'),
      h('button', { class: 'btn small ghost', type: 'button', onclick: () => dlg.close() }, '✕')
    ),
    h(
      'div',
      { class: 'field' },
      h('label', {}, 'Bilddatei auswählen (PNG, JPG, WebP, GIF bis 5 MB)'),
      fileInput,
      previewImg
    ),
    h(
      'div',
      { class: 'field' },
      h('label', {}, 'Bildunterschrift / Notiz (optional)'),
      captionInput
    ),
    h(
      'label',
      { class: 'row', style: 'gap:.4rem; cursor:pointer;' },
      primaryChk,
      h('span', {}, 'Als Titelbild des Aquariums festlegen')
    ),
    err,
    h(
      'div',
      { class: 'row' },
      h('button', { class: 'btn', type: 'submit' }, 'Hochladen'),
      h('button', { class: 'btn ghost', type: 'button', onclick: () => dlg.close() }, 'Abbrechen')
    )
  );

  dlg.appendChild(form);
  dlg.addEventListener('close', () => dlg.remove());
  document.body.appendChild(dlg);
  dlg.showModal();
}

export function editImageCaptionDialog(aq, img) {
  const dlg = h('dialog', { class: 'stack', style: 'max-width: 440px;' });
  const err = h('p', { class: 'error', role: 'alert' });
  const captionInput = h('input', {
    maxlength: '200',
    value: img.caption || '',
    placeholder: 'z. B. Beckenansicht von links...',
  });

  const form = h(
    'form',
    {
      class: 'stack',
      onsubmit: async (e) => {
        e.preventDefault();
        err.textContent = '';
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
      },
    },
    h('h2', { style: 'margin:0' }, 'Bildunterschrift bearbeiten'),
    h('div', { class: 'field' }, h('label', {}, 'Bildunterschrift'), captionInput),
    err,
    h(
      'div',
      { class: 'row' },
      h('button', { class: 'btn', type: 'submit' }, 'Speichern'),
      h('button', { class: 'btn ghost', type: 'button', onclick: () => dlg.close() }, 'Abbrechen')
    )
  );

  dlg.appendChild(form);
  dlg.addEventListener('close', () => dlg.remove());
  document.body.appendChild(dlg);
  dlg.showModal();
  captionInput.focus();
}

export function editStockDialog(aq, s) {
  const dlg = h('dialog', { class: 'stack', style: 'max-width: 500px;' });
  const err = h('p', { class: 'error', role: 'alert' });
  let imageBase64 = null;
  let removeExistingImage = false;

  const spInput = h('input', {
    required: true,
    maxlength: '80',
    value: s.species,
    list: 'species',
  });
  const nameInput = h('input', {
    maxlength: '80',
    placeholder: 'z. B. Bubbles, Nemo, Gruppe 1...',
    value: s.name || '',
  });
  const cntInput = h('input', {
    type: 'number',
    min: '1',
    max: '10000',
    inputmode: 'numeric',
    required: true,
    value: s.count || 1,
  });
  const profSelect = h(
    'select',
    {},
    Object.entries(CONFIG?.profiles || {}).map(([k, v]) => h('option', { value: k }, v))
  );
  profSelect.value = s.profile || 'allgemein';

  const fileInput = h('input', {
    type: 'file',
    accept: 'image/png,image/jpeg,image/webp,image/gif',
  });
  const previewImg = h('img', {
    class: 'img-preview',
    style: 'display:none; max-height: 160px; object-fit: cover;',
  });
  const btnRemoveImg = h(
    'button',
    { class: 'btn small ghost', type: 'button', style: 'display:none' },
    'Foto entfernen'
  );

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

  const form = h(
    'form',
    {
      class: 'stack',
      onsubmit: async (e) => {
        e.preventDefault();
        err.textContent = '';
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
      },
    },
    h(
      'div',
      { class: 'row between' },
      h('h2', { style: 'margin:0' }, 'Bewohner bearbeiten'),
      h('button', { class: 'btn small ghost', type: 'button', onclick: () => dlg.close() }, '✕')
    ),
    h('div', { class: 'field' }, h('label', {}, 'Art / Spezies'), spInput),
    h(
      'div',
      { class: 'field' },
      h('label', {}, 'Individueller Name / Bezeichnung (optional)'),
      nameInput
    ),
    h(
      'div',
      { class: 'grid2' },
      h('div', { class: 'field' }, h('label', {}, 'Anzahl'), cntInput),
      h('div', { class: 'field' }, h('label', {}, 'Wasser-Ansprüche'), profSelect)
    ),
    h(
      'div',
      { class: 'field' },
      h('label', {}, 'Foto des Bewohners (PNG, JPG, WebP, GIF bis 5 MB)'),
      fileInput,
      previewImg,
      h('div', { style: 'margin-top:.4rem' }, btnRemoveImg)
    ),
    err,
    h(
      'div',
      { class: 'row' },
      h('button', { class: 'btn', type: 'submit' }, 'Speichern'),
      h('button', { class: 'btn ghost', type: 'button', onclick: () => dlg.close() }, 'Abbrechen')
    )
  );

  dlg.appendChild(form);
  dlg.addEventListener('close', () => dlg.remove());
  document.body.appendChild(dlg);
  dlg.showModal();
}

export async function shareDialog(aq) {
  const dlg = h('dialog', { style: 'max-width:620px' });
  const err = h('p', { class: 'error', role: 'alert' });
  const listWrap = h('div', { class: 'stack', style: 'margin: 1rem 0' });

  const queryInput = h('input', {
    required: true,
    maxlength: '120',
    placeholder: 'Benutzername oder E-Mail-Adresse',
  });
  const roleSelect = h(
    'select',
    {},
    h('option', { value: 'view' }, 'Nur Lesen (view)'),
    h('option', { value: 'write' }, 'Lesen & Schreiben (write)')
  );
  const addBtn = h('button', { class: 'btn', type: 'submit' }, 'Einladen / Freigeben');

  async function loadShares() {
    listWrap.replaceChildren(h('p', { class: 'muted' }, 'Lade Freigaben...'));
    try {
      const shares = await api(`/aquariums/${aq.id}/shares`);
      if (!shares.length) {
        listWrap.replaceChildren(
          h('p', { class: 'muted' }, 'Dieses Aquarium ist aktuell mit niemandem geteilt.')
        );
        return;
      }
      const table = h(
        'table',
        {},
        h(
          'thead',
          {},
          h(
            'tr',
            {},
            h('th', {}, 'Benutzer'),
            h('th', {}, 'Berechtigung'),
            h('th', {}, 'Status'),
            h('th', {}, '')
          )
        ),
        h(
          'tbody',
          {},
          shares.map((s) => {
            const isPending = s.status === 'pending';
            const sel = h(
              'select',
              { style: 'min-height:34px;padding:.2rem .4rem' },
              h('option', { value: 'view', selected: s.role === 'view' }, 'Lesen'),
              h('option', { value: 'write', selected: s.role === 'write' }, 'Schreiben')
            );
            sel.addEventListener('change', async () => {
              try {
                await api(`/aquariums/${aq.id}/shares`, {
                  method: 'POST',
                  body: { username: s.username, role: sel.value },
                });
                toast(`Berechtigung für ${s.username} aktualisiert.`);
                loadShares();
              } catch (ex) {
                err.textContent = ex.message;
              }
            });

            const statusChip = isPending
              ? h(
                  'span',
                  { class: 'chip warn', title: 'Wartet auf Annahme durch den Benutzer' },
                  'Ausstehend'
                )
              : h('span', { class: 'chip ok', title: 'Einladung wurde angenommen' }, 'Angenommen');

            const actionBtns = [
              h(
                'button',
                {
                  class: 'btn small danger',
                  type: 'button',
                  onclick: async () => {
                    if (!confirm(`Freigabe für „${s.username}“ wirklich entfernen?`)) return;
                    try {
                      await api(`/aquariums/${aq.id}/shares/${s.user_id}`, { method: 'DELETE' });
                      toast(`Freigabe für ${s.username} entfernt.`);
                      loadShares();
                    } catch (ex) {
                      err.textContent = ex.message;
                    }
                  },
                },
                'Entfernen'
              ),
            ];

            if (isPending) {
              actionBtns.unshift(
                h(
                  'button',
                  {
                    class: 'btn small ghost',
                    type: 'button',
                    title: 'Einladungs-E-Mail erneut senden',
                    onclick: async (e) => {
                      e.target.disabled = true;
                      try {
                        await api(`/aquariums/${aq.id}/shares/${s.user_id}/resend`, {
                          method: 'POST',
                        });
                        toast(`Einladungs-E-Mail an ${s.username} erneut gesendet.`);
                      } catch (ex) {
                        err.textContent = ex.message;
                      } finally {
                        e.target.disabled = false;
                      }
                    },
                  },
                  '📧 Erneut senden'
                )
              );
            }

            return h(
              'tr',
              {},
              h(
                'td',
                {},
                h('strong', {}, s.username),
                s.email ? h('div', { class: 'muted', style: 'font-size:.8rem' }, s.email) : null
              ),
              h('td', {}, sel),
              h('td', {}, statusChip),
              h('td', {}, h('div', { class: 'row', style: 'gap:.35rem;' }, ...actionBtns))
            );
          })
        )
      );
      listWrap.replaceChildren(h('div', { class: 'table-wrap' }, table));
    } catch (ex) {
      listWrap.replaceChildren(h('p', { class: 'error' }, ex.message));
    }
  }

  const addForm = h(
    'form',
    {
      class: 'stack',
      onsubmit: async (e) => {
        e.preventDefault();
        err.textContent = '';
        try {
          const res = await api(`/aquariums/${aq.id}/shares`, {
            method: 'POST',
            body: { usernameOrEmail: queryInput.value.trim(), role: roleSelect.value },
          });
          toast(res.message || 'Einladungs-E-Mail erfolgreich versendet.');
          queryInput.value = '';
          loadShares();
        } catch (ex) {
          err.textContent = ex.message;
        }
      },
    },
    h('h3', {}, 'Neuen Benutzer einladen'),
    h(
      'div',
      { class: 'grid2' },
      h('div', { class: 'field' }, h('label', {}, 'Benutzername / E-Mail'), queryInput),
      h('div', { class: 'field' }, h('label', {}, 'Berechtigung'), roleSelect)
    ),
    h('div', {}, addBtn)
  );

  dlg.append(
    h(
      'div',
      { class: 'stack' },
      h('h2', {}, `Aquarium teilen: „${aq.name}“`),
      h(
        'p',
        { class: 'muted' },
        'Gib anderen registrierten Benutzern Lese- oder Schreibrechte für dieses Aquarium. Der Benutzer erhält eine Einladungs-E-Mail und muss die Freigabe annehmen.'
      ),
      err,
      h('h3', {}, 'Bestehende Freigaben & Einladungen'),
      listWrap,
      addForm,
      h(
        'div',
        { class: 'row', style: 'margin-top:1rem' },
        h(
          'button',
          {
            class: 'btn ghost',
            type: 'button',
            onclick: () => {
              dlg.close();
              route();
            },
          },
          'Schließen'
        )
      )
    )
  );

  dlg.addEventListener('close', () => dlg.remove());
  document.body.append(dlg);
  dlg.showModal();
  loadShares();
}

export async function viewAquarium(id) {
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
    topActions.push(h('a', { class: 'btn ghost', href: `#/a/${id}/messen` }, '🧪 Werte eintragen'));
    topActions.push(
      h(
        'button',
        {
          class: 'btn ghost',
          type: 'button',
          onclick: () => maintenanceDialog(aq),
        },
        '🛠️ Arbeit eintragen'
      )
    );
    topActions.push(
      h(
        'button',
        {
          class: 'btn ghost',
          type: 'button',
          onclick: () => importMeasurementsDialog(aq),
        },
        '📥 CSV-Import'
      )
    );
    if (isOwner)
      topActions.push(
        h(
          'button',
          {
            class: 'btn ghost',
            type: 'button',
            onclick: () => shareDialog(aq),
          },
          'Teilen'
        )
      );
    topActions.push(
      h(
        'button',
        {
          class: 'btn ghost',
          type: 'button',
          onclick: () => aquariumDialog(aq),
        },
        'Bearbeiten'
      )
    );
  }
  topActions.push(
    h(
      'button',
      {
        class: 'btn ghost',
        type: 'button',
        onclick: () => exportMeasurementsDialog(aq),
      },
      '📤 Exportieren'
    )
  );
  if (!isOwner) {
    topActions.push(
      h(
        'button',
        {
          class: 'btn small ghost danger',
          type: 'button',
          onclick: async () => {
            if (!confirm(`Möchtest du die Freigabe für „${aq.name}“ wirklich verlassen?`)) return;
            try {
              await api(`/aquariums/${id}/shares/${ME.id}`, { method: 'DELETE' });
              toast('Freigabe verlassen.');
              location.hash = '#/';
            } catch (ex) {
              toast(ex.message);
            }
          },
        },
        'Freigabe verlassen'
      )
    );
  }

  nodes.push(
    h(
      'div',
      { class: 'row between' },
      h(
        'div',
        {},
        h('a', { href: '#/', class: 'muted' }, '‹ Alle Aquarien'),
        h('h1', { style: 'margin-bottom:.2rem' }, aq.name),
        aq.motto ? h('div', { class: 'aq-motto' }, aq.motto) : null,
        h(
          'div',
          { class: 'muted' },
          CONFIG?.waterTypes?.[aq.water_type] || aq.water_type,
          aq.volume_l ? ` · ${aq.volume_l} l` : '',
          aq.last_measured_at ? ` · zuletzt gemessen ${fmtDate(aq.last_measured_at)}` : '',
          aq.last_water_change_at
            ? ` · letzter Wasserwechsel ${fmtDate(aq.last_water_change_at)}${
                aq.last_water_change_percent ? ' (' + aq.last_water_change_percent + ' %)' : ''
              }`
            : ''
        ),
        !isOwner
          ? h(
              'div',
              { style: 'margin-top:.35rem' },
              h(
                'span',
                { class: `chip ${isReadOnly ? 'none' : 'ok'}` },
                `Geteilt von ${aq.owner_username || 'Besitzer'} · ${isReadOnly ? 'Nur Lesezugriff' : 'Schreibzugriff'}`
              )
            )
          : null
      ),
      h('div', { class: 'row' }, topActions)
    )
  );

  if (aq.description) {
    nodes.push(
      h(
        'div',
        { class: 'aq-desc-box stack' },
        h('strong', { style: 'font-size:.95rem' }, '📖 Über dieses Aquarium'),
        h('div', {}, aq.description)
      )
    );
  }

  if (aq.notes) nodes.push(h('p', { class: 'muted' }, aq.notes));

  // Fotogalerie & Beckenbilder
  const galleryCards = (images || []).map((img) => {
    return h(
      'div',
      { class: 'gallery-card' },
      h(
        'div',
        {
          class: 'gallery-img-wrap',
          onclick: () =>
            showImageModal({
              src: `api/aquariums/${id}/images/${img.id}`,
              title: aq.name,
              caption: img.caption,
            }),
        },
        h('img', {
          class: 'gallery-img',
          src: `api/aquariums/${id}/images/${img.id}`,
          alt: img.caption || aq.name,
          loading: 'lazy',
        }),
        img.is_primary ? h('span', { class: 'gallery-primary-badge' }, '★ Titelbild') : null
      ),
      h(
        'div',
        { class: 'gallery-card-body' },
        img.caption
          ? h('div', { class: 'gallery-caption' }, img.caption)
          : h('div', { class: 'muted', style: 'font-size:.82rem' }, 'Keine Bildunterschrift'),
        h('div', { class: 'muted', style: 'font-size:.78rem' }, fmtDate(img.created_at)),
        !isReadOnly
          ? h(
              'div',
              { class: 'gallery-actions' },
              !img.is_primary
                ? h(
                    'button',
                    {
                      class: 'btn small ghost',
                      type: 'button',
                      title: 'Als Titelbild festlegen',
                      onclick: async () => {
                        await api(`/aquariums/${id}/images/${img.id}/primary`, { method: 'PUT' });
                        toast('Titelbild festgelegt.');
                        route();
                      },
                    },
                    '★ Titelbild'
                  )
                : null,
              h(
                'button',
                {
                  class: 'btn small ghost',
                  type: 'button',
                  title: 'Bildunterschrift bearbeiten',
                  onclick: () => editImageCaptionDialog(aq, img),
                },
                '✏️ Text'
              ),
              h(
                'button',
                {
                  class: 'btn small ghost danger',
                  type: 'button',
                  title: 'Foto löschen',
                  onclick: async () => {
                    if (!confirm('Dieses Foto wirklich löschen?')) return;
                    await api(`/aquariums/${id}/images/${img.id}`, { method: 'DELETE' });
                    toast('Foto gelöscht.');
                    route();
                  },
                },
                '🗑️ Löschen'
              )
            )
          : null
      )
    );
  });

  const galleryHeader = h(
    'div',
    { class: 'row between', style: 'align-items: center;' },
    h('h2', { style: 'margin:0' }, `📸 Fotogalerie (${images?.length || 0})`),
    !isReadOnly
      ? h(
          'button',
          {
            class: 'btn small',
            type: 'button',
            onclick: () => uploadImageDialog(aq),
          },
          '➕ Foto hochladen'
        )
      : null
  );

  const gallerySection = h(
    'section',
    { class: 'card stack' },
    galleryHeader,
    galleryCards.length
      ? h('div', { class: 'gallery-grid' }, galleryCards)
      : h(
          'div',
          { class: 'muted', style: 'text-align:center; padding: 1.2rem 0;' },
          'Noch keine Fotos in der Galerie vorhanden.',
          !isReadOnly
            ? h(
                'div',
                { style: 'margin-top:.6rem' },
                h(
                  'button',
                  {
                    class: 'btn small ghost',
                    type: 'button',
                    onclick: () => uploadImageDialog(aq),
                  },
                  'Erstes Foto hochladen'
                )
              )
            : null
        )
  );
  nodes.push(gallerySection);

  // Warnungen, Alarme und Besatz-Kompatibilität
  const notices = [];
  if (aq.measure_cycle_status?.configured) {
    if (aq.measure_cycle_status.is_due) {
      notices.push(
        h(
          'div',
          { class: 'alert warn' },
          h(
            'div',
            {},
            h('strong', {}, '🧪 Messung fällig: '),
            `${aq.measure_cycle_status.status_label} (Messzyklus: ${aq.measure_cycle_status.cycle_label})`
          ),
          !isReadOnly
            ? h('a', { class: 'btn small', href: `#/a/${id}/messen` }, 'Jetzt messen')
            : null
        )
      );
    }
  } else if (aq.overdue) {
    notices.push(
      h(
        'div',
        { class: 'alert warn' },
        h(
          'div',
          {},
          h('strong', {}, '🧪 Messung fällig: '),
          `Die letzte Messung ist länger als ${aq.reminder_days} Tage her.`
        ),
        !isReadOnly
          ? h('a', { class: 'btn small', href: `#/a/${id}/messen` }, 'Jetzt messen')
          : null
      )
    );
  }

  if (aq.fertilize_cycle_status?.configured && aq.fertilize_cycle_status.is_due) {
    notices.push(
      h(
        'div',
        { class: 'alert warn' },
        h(
          'div',
          {},
          h('strong', {}, '🌿 Düngung fällig: '),
          `${aq.fertilize_cycle_status.status_label} (Düngzyklus: ${aq.fertilize_cycle_status.cycle_label})`
        ),
        !isReadOnly
          ? h(
              'button',
              {
                class: 'btn small',
                type: 'button',
                onclick: () => maintenanceDialog(aq, 'fertilize'),
              },
              'Düngung eintragen'
            )
          : null
      )
    );
  }

  if (d.stockCompatibility) {
    if (d.stockCompatibility.issues && d.stockCompatibility.issues.length) {
      for (const issue of d.stockCompatibility.issues) {
        notices.push(
          h(
            'div',
            { class: 'alert crit' },
            h('div', {}, h('strong', {}, issue.title || 'Besatzkonflikt'), issue.message)
          )
        );
      }
    }
    if (d.stockCompatibility.warnings && d.stockCompatibility.warnings.length) {
      for (const warn of d.stockCompatibility.warnings) {
        notices.push(
          h(
            'div',
            { class: 'alert warn' },
            h('div', {}, h('strong', {}, warn.title || 'Besatzwarnung'), warn.message)
          )
        );
      }
    }
    if (d.stockCompatibility.infos && d.stockCompatibility.infos.length) {
      for (const info of d.stockCompatibility.infos) {
        notices.push(
          h(
            'div',
            { class: 'alert info' },
            h('div', {}, h('strong', {}, info.title || 'Besatzhinweis'), info.message)
          )
        );
      }
    }
  } else if (d.conflicts && d.conflicts.length) {
    notices.push(
      h(
        'div',
        { class: 'alert info' },
        h('div', {}, h('strong', {}, 'Der Besatz passt bei einigen Werten nicht zusammen')),
        `Für ${d.conflicts.map((k) => param(k).name).join(', ')} haben die Fischarten unterschiedliche Ansprüche. Hier gelten die allgemeinen Grenzwerte.`
      )
    );
  }

  for (const a of d.alerts) {
    notices.push(
      h(
        'div',
        { class: 'alert ' + a.level },
        h(
          'div',
          {},
          h('strong', {}, a.level === 'crit' ? 'Kritisch' : 'Auffällig'),
          a.message,
          h('div', { class: 'muted' }, fmtDate(sqlDate(a.created_at)))
        ),
        !isReadOnly
          ? h(
              'button',
              {
                class: 'btn small ghost',
                type: 'button',
                onclick: async () => {
                  await api(`/aquariums/${id}/alerts/ack`, {
                    method: 'POST',
                    body: { ids: [a.id] },
                  });
                  route();
                },
              },
              'Erledigt'
            )
          : null
      )
    );
  }
  if (!isReadOnly && d.alerts.length > 1) {
    notices.push(
      h(
        'div',
        {},
        h(
          'button',
          {
            class: 'btn small ghost',
            type: 'button',
            onclick: async () => {
              await api(`/aquariums/${id}/alerts/ack`, { method: 'POST', body: {} });
              route();
            },
          },
          'Alle als erledigt markieren'
        )
      )
    );
  }
  if (notices.length) nodes.push(h('section', { class: 'stack', 'aria-label': 'Warnungen' }, notices));

  // Mess- & Düngzyklus Übersicht
  const mStatus = aq.measure_cycle_status || {};
  const fStatus = aq.fertilize_cycle_status || {};

  const mChipClass = !mStatus.configured
    ? 'none'
    : mStatus.is_overdue
    ? 'crit'
    : mStatus.is_due
    ? 'warn'
    : 'ok';
  const fChipClass = !fStatus.configured
    ? 'none'
    : fStatus.is_overdue
    ? 'crit'
    : fStatus.is_due
    ? 'warn'
    : 'ok';

  const cycleSection = h(
    'section',
    { class: 'card stack' },
    h(
      'div',
      { class: 'row between', style: 'align-items: center;' },
      h('h2', { style: 'margin:0' }, '📅 Mess- & Düngzyklen'),
      !isReadOnly
        ? h(
            'button',
            {
              class: 'btn small ghost',
              type: 'button',
              onclick: () => aquariumDialog(aq),
            },
            '⚙️ Zyklen einstellen'
          )
        : null
    ),
    h(
      'div',
      { class: 'grid2', style: 'gap: 1rem;' },
      // Card 1: Messzyklus
      h(
        'div',
        { class: 'cycle-card stack' },
        h(
          'div',
          { class: 'row between', style: 'align-items: center;' },
          h(
            'strong',
            { style: 'font-size: 1.05rem; display:flex; align-items:center; gap:.4rem;' },
            '🧪 Messzyklus'
          ),
          h(
            'span',
            { class: `chip ${mChipClass}` },
            mStatus.configured ? mStatus.status_label : 'Nicht festgelegt'
          )
        ),
        h(
          'div',
          { class: 'muted', style: 'font-size: .9rem;' },
          mStatus.configured
            ? `Intervall: ${mStatus.cycle_label}`
            : 'Kein Messzyklus hinterlegt.'
        ),
        mStatus.configured
          ? h(
              'div',
              { class: 'muted', style: 'font-size: .85rem;' },
              `Nächste Fälligkeit: `,
              h('strong', {}, mStatus.next_due_at ? fmtDate(mStatus.next_due_at) : '–'),
              mStatus.last_action_at ? ` · Zuletzt: ${fmtDate(mStatus.last_action_at)}` : ''
            )
          : null,
        h(
          'div',
          {
            class: 'row between',
            style: 'align-items: center; margin-top: .4rem; font-size: .85rem;',
          },
          h(
            'span',
            { class: 'muted' },
            mStatus.reminder_mail
              ? '📧 E-Mail-Erinnerung aktiv'
              : '🔕 Keine E-Mail-Erinnerung'
          ),
          !isReadOnly
            ? h('a', { class: 'btn small', href: `#/a/${id}/messen` }, '🧪 Jetzt messen')
            : null
        )
      ),
      // Card 2: Düngzyklus
      h(
        'div',
        { class: 'cycle-card stack' },
        h(
          'div',
          { class: 'row between', style: 'align-items: center;' },
          h(
            'strong',
            { style: 'font-size: 1.05rem; display:flex; align-items:center; gap:.4rem;' },
            '🌿 Düngzyklus'
          ),
          h(
            'span',
            { class: `chip ${fChipClass}` },
            fStatus.configured ? fStatus.status_label : 'Nicht festgelegt'
          )
        ),
        h(
          'div',
          { class: 'muted', style: 'font-size: .9rem;' },
          fStatus.configured
            ? `Intervall: ${fStatus.cycle_label}`
            : 'Kein Düngzyklus hinterlegt.'
        ),
        fStatus.configured
          ? h(
              'div',
              { class: 'muted', style: 'font-size: .85rem;' },
              `Nächste Fälligkeit: `,
              h('strong', {}, fStatus.next_due_at ? fmtDate(fStatus.next_due_at) : '–'),
              fStatus.last_action_at ? ` · Zuletzt: ${fmtDate(fStatus.last_action_at)}` : ''
            )
          : null,
        h(
          'div',
          {
            class: 'row between',
            style: 'align-items: center; margin-top: .4rem; font-size: .85rem;',
          },
          h(
            'span',
            { class: 'muted' },
            fStatus.reminder_mail
              ? '📧 E-Mail-Erinnerung aktiv'
              : '🔕 Keine E-Mail-Erinnerung'
          ),
          !isReadOnly
            ? h(
                'button',
                {
                  class: 'btn small',
                  type: 'button',
                  onclick: () => maintenanceDialog(aq, 'fertilize'),
                },
                '🌿 Düngung eintragen'
              )
            : null
        )
      )
    )
  );
  nodes.push(cycleSection);

  // Aktuelle Werte
  const allKnownParams = CONFIG?.allParameters || CONFIG?.parameters || [];
  const keys = allKnownParams.map((p) => p.key).filter((k) => d.latest[k]);
  if (keys.length) {
    nodes.push(
      h(
        'section',
        {},
        h('h2', {}, 'Aktuelle Werte'),
        h(
          'div',
          { class: 'values' },
          keys.map((k) => {
            const p = param(k),
              l = d.latest[k];
            return h(
              'div',
              { class: 'value ' + (l.status || '') },
              h('div', { class: 'muted' }, p.name),
              h(
                'div',
                {},
                h('span', { class: 'num' }, fmtNum(p, l.value)),
                h('span', { class: 'unit' }, p.unit)
              ),
              chip(l.status),
              h(
                'div',
                { class: 'muted', style: 'font-size:.8rem;margin-top:.2rem' },
                fmtDate(l.measured_at)
              )
            );
          })
        )
      )
    );
  } else {
    nodes.push(
      h(
        'div',
        { class: 'card stack' },
        h('h2', {}, 'Noch keine Messwerte'),
        h(
          'p',
          {},
          'Trage deine ersten Wasserwerte ein. Danach erscheinen hier Verlauf und Warnungen.'
        ),
        !isReadOnly
          ? h(
              'div',
              { class: 'row' },
              h('a', { class: 'btn', href: `#/a/${id}/messen` }, '🧪 Werte eintragen'),
              h(
                'button',
                {
                  class: 'btn ghost',
                  type: 'button',
                  onclick: () => maintenanceDialog(aq),
                },
                '🛠️ Arbeit eintragen'
              )
            )
          : null
      )
    );
  }

  // Graphen
  const charts = [];
  const chartCards = [];
  for (const p of allKnownParams) {
    const points = ms
      .filter((m) => m.values[p.key] != null)
      .map((m) => ({ x: new Date(m.measured_at).getTime(), y: m.values[p.key] }));
    if (!points.length) continue;
    const canvas = h('canvas', { role: 'img', 'aria-label': `Verlauf ${p.name}` });
    chartCards.push({
      p,
      points,
      canvas,
      card: h(
        'div',
        { class: 'card chart-card' },
        h('h3', {}, h('span', {}, p.name), h('span', { class: 'muted' }, p.unit)),
        h('div', { class: 'chart-wrap' }, canvas)
      ),
    });
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
      h(
        'button',
        {
          type: 'button',
          'aria-pressed': String(String(RANGE) === String(val)),
          onclick: () => {
            setRange(val);
            localStorage.setItem(GRAPH_RANGE_STORAGE_KEY, val);
            route();
          },
        },
        label
      )
    );

    const tabs = h(
      'div',
      { class: 'range-tabs', role: 'group', 'aria-label': 'Zeitraum' },
      rangeButtons
    );

    let customBar = null;
    if (RANGE === 'custom') {
      const fromInput = h('input', {
        type: 'date',
        value: CUSTOM_FROM,
        'aria-label': 'Startdatum',
      });
      const toInput = h('input', { type: 'date', value: CUSTOM_TO, 'aria-label': 'Enddatum' });
      const btnApply = h(
        'button',
        {
          class: 'btn small',
          type: 'button',
          onclick: () => {
            setCustomFrom(fromInput.value);
            setCustomTo(toInput.value);
            localStorage.setItem(GRAPH_CUSTOM_FROM_KEY, fromInput.value);
            localStorage.setItem(GRAPH_CUSTOM_TO_KEY, toInput.value);
            route();
          },
        },
        'Filter anwenden'
      );

      const btnReset = h(
        'button',
        {
          class: 'btn small ghost',
          type: 'button',
          onclick: () => {
            setRange('90');
            setCustomFrom('');
            setCustomTo('');
            localStorage.setItem(GRAPH_RANGE_STORAGE_KEY, '90');
            localStorage.removeItem(GRAPH_CUSTOM_FROM_KEY);
            localStorage.removeItem(GRAPH_CUSTOM_TO_KEY);
            route();
          },
        },
        'Zurücksetzen (3 Monate)'
      );

      customBar = h(
        'div',
        { class: 'custom-range-bar' },
        h('label', {}, 'Von:', fromInput),
        h('label', {}, 'Bis:', toInput),
        btnApply,
        btnReset
      );
    }

    let rangeDesc = '';
    if (RANGE === 'custom') {
      if (CUSTOM_FROM && CUSTOM_TO)
        rangeDesc = `Benutzerdefinierter Zeitraum: ${CUSTOM_FROM} bis ${CUSTOM_TO}`;
      else if (CUSTOM_FROM) rangeDesc = `Ab ${CUSTOM_FROM}`;
      else if (CUSTOM_TO) rangeDesc = `Bis ${CUSTOM_TO}`;
      else rangeDesc = 'Benutzerdefinierter Zeitraum (Bitte Start- und/oder Enddatum wählen)';
    } else {
      const match = rangePresets.find(([v]) => v === String(RANGE));
      rangeDesc = match ? `Zeitraum: ${match[1]}` : `Zeitraum: ${RANGE} Tage`;
    }

    nodes.push(
      h(
        'section',
        { class: 'stack' },
        h(
          'div',
          {
            class: 'row between',
            style: 'align-items:flex-start; flex-wrap:wrap; gap:.6rem;',
          },
          h(
            'div',
            {},
            h('h2', { style: 'margin:0' }, 'Verlauf'),
            h('div', { class: 'muted', style: 'font-size:.85rem; margin-top:.2rem;' }, rangeDesc)
          ),
          tabs
        ),
        customBar,
        chartCards.length
          ? h(
              'div',
              { class: 'charts' },
              chartCards.map((c) => c.card)
            )
          : h('p', { class: 'muted' }, 'In diesem Zeitraum gibt es keine Messungen.'),
        chartCards.length
          ? h(
              'p',
              { class: 'muted' },
              'Grüner Bereich = Zielbereich, rot gestrichelt = kritische Grenze.'
            )
          : null
      )
    );
  }

  // Besatz & Bewohner
  const sp = h('input', {
    list: 'species',
    maxlength: '80',
    required: true,
    placeholder: 'z. B. Siamesischer Kampffisch, Neonsalmler...',
  });
  const inhabitantName = h('input', {
    maxlength: '80',
    placeholder: 'z. B. Bubbles, Nemo, Rambo, Gruppe 1...',
  });
  const cnt = h('input', {
    type: 'number',
    min: '1',
    max: '10000',
    value: '1',
    inputmode: 'numeric',
  });
  const prof = h(
    'select',
    {},
    Object.entries(CONFIG?.profiles || {}).map(([k, v]) => h('option', { value: k }, v))
  );
  const previewBox = h('div', {
    class: 'species-preview',
    style: 'display:none; margin-top:.4rem',
  });

  let stockImageBase64 = null;
  const stockFileInput = h('input', {
    type: 'file',
    accept: 'image/png,image/jpeg,image/webp,image/gif',
  });
  const stockPreviewImg = h('img', {
    class: 'img-preview',
    style: 'display:none; max-height: 120px; object-fit: cover;',
  });
  const btnRemoveStockImg = h(
    'button',
    { class: 'btn small ghost', type: 'button', style: 'display:none' },
    'Foto entfernen'
  );

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
    const m = (CONFIG?.species || []).find(
      (s) =>
        s.name.toLowerCase() === val ||
        (s.scientificName && s.scientificName.toLowerCase() === val)
    );
    if (m) {
      if (m.profile && CONFIG?.profiles?.[m.profile]) prof.value = m.profile;
      previewBox.style.display = 'block';
      previewBox.replaceChildren(
        h(
          'div',
          { class: 'row between' },
          h(
            'div',
            {},
            h('strong', {}, m.name),
            m.scientificName
              ? h(
                  'span',
                  { class: 'muted', style: 'font-style:italic; margin-left:.3rem' },
                  `(${m.scientificName})`
                )
              : null,
            h(
              'div',
              { class: 'muted' },
              `${m.category || ''} · ${m.waterType === 'salt' ? 'Meerwasser' : 'Süßwasser'} · ab ${m.minVolumeL || 30} L · ${socialLabel(m.socialType, m.minGroupCount)} · ${territorialLabel(m.territorial)}`
            )
          ),
          h(
            'button',
            {
              class: 'btn small ghost',
              type: 'button',
              onclick: () => showSpeciesModal(m),
            },
            'Details anzeigen'
          )
        )
      );
    } else {
      previewBox.style.display = 'none';
    }
  };
  sp.addEventListener('input', updatePreview);

  const stockErr = h('p', { class: 'error', role: 'alert' });

  const stockListItems = d.stock.map((s) => {
    const spMatch = (CONFIG?.species || []).find(
      (spec) =>
        spec.name.toLowerCase() === s.species.toLowerCase() ||
        spec.id === s.species.toLowerCase()
    );
    const chips = [];
    if (s.category || spMatch?.category)
      chips.push(h('span', { class: 'tag ok' }, s.category || spMatch?.category));
    if (s.minVolumeL || spMatch?.minVolumeL)
      chips.push(h('span', { class: 'tag' }, `ab ${s.minVolumeL || spMatch?.minVolumeL} L`));
    if (s.socialType || spMatch?.socialType)
      chips.push(
        h(
          'span',
          { class: 'tag info' },
          socialLabel(
            s.socialType || spMatch?.socialType,
            s.minGroupCount || spMatch?.minGroupCount
          )
        )
      );
    if (s.territorial === 'solitary_aggressive' || spMatch?.territorial === 'solitary_aggressive')
      chips.push(h('span', { class: 'tag danger' }, 'Einzelhaltung'));
    else if (s.territorial === 'strong' || spMatch?.territorial === 'strong')
      chips.push(h('span', { class: 'tag warn' }, 'Stark territorial'));
    else if (s.territorial === 'breeding' || spMatch?.territorial === 'breeding')
      chips.push(h('span', { class: 'tag info' }, 'Revier bei Brut'));

    const avatarNode = s.has_image
      ? h('img', {
          class: 'stock-avatar',
          src: `api/aquariums/${id}/stock/${s.id}/image?t=${Date.now()}`,
          alt: s.name || s.species,
          title: 'Klicken für Großansicht',
          onclick: () =>
            showImageModal({
              src: `api/aquariums/${id}/stock/${s.id}/image`,
              title: s.name ? `${s.name} (${s.species})` : s.species,
              caption: `${s.count} × ${s.species}${s.scientificName ? ' (' + s.scientificName + ')' : ''}`,
            }),
        })
      : h(
          'div',
          { class: 'stock-avatar-placeholder', title: s.species },
          s.category === 'Wirbellose' || spMatch?.category === 'Wirbellose'
            ? '🦐'
            : aq.water_type === 'salt' || spMatch?.waterType === 'salt'
            ? '🐠'
            : '🐟'
        );

    return h(
      'li',
      { class: 'stock-item' },
      h(
        'div',
        { class: 'stock-item-main' },
        avatarNode,
        h(
          'div',
          {},
          s.name
            ? [
                h('div', { class: 'stock-name-title' }, s.name),
                h(
                  'div',
                  { class: 'stock-species-sub' },
                  `${s.count} × ${s.species}`,
                  s.scientificName
                    ? h('span', { style: 'font-style:italic;margin-left:.3rem' }, `(${s.scientificName})`)
                    : null,
                  h(
                    'span',
                    { class: 'muted', style: 'margin-left:.3rem' },
                    `· ${CONFIG?.profiles?.[s.profile] || s.profile}`
                  )
                ),
              ]
            : [
                h('div', { class: 'stock-name-title' }, `${s.count} × ${s.species}`),
                h(
                  'div',
                  { class: 'stock-species-sub' },
                  s.scientificName
                    ? h(
                        'span',
                        { style: 'font-style:italic;margin-right:.3rem' },
                        `(${s.scientificName}) · `
                      )
                    : null,
                  `${CONFIG?.profiles?.[s.profile] || s.profile}`
                ),
              ],
          chips.length ? h('div', { style: 'margin-top:.3rem' }, chips) : null
        )
      ),
      h(
        'div',
        { class: 'row', style: 'gap:.35rem' },
        h(
          'button',
          {
            class: 'btn small ghost',
            type: 'button',
            onclick: () => showSpeciesModal(spMatch || s.species),
          },
          'Arten-Info'
        ),
        !isReadOnly
          ? h(
              'button',
              {
                class: 'btn small ghost',
                type: 'button',
                onclick: () => editStockDialog(aq, s),
              },
              '✏️ Bearbeiten'
            )
          : null,
        !isReadOnly
          ? h(
              'button',
              {
                class: 'btn small ghost danger',
                type: 'button',
                'aria-label': `${s.name || s.species} entfernen`,
                onclick: async () => {
                  if (!confirm(`„${s.name || s.species}“ wirklich entfernen?`)) return;
                  await api(`/aquariums/${id}/stock/${s.id}`, { method: 'DELETE' });
                  route();
                },
              },
              'Entfernen'
            )
          : null
      )
    );
  });

  const stockNodes = [
    h(
      'div',
      { class: 'row between' },
      h('h2', { style: 'margin:0' }, 'Besatz & Tierwohl'),
      h('a', { class: 'btn small ghost', href: '#/species' }, '📖 Artenkatalog')
    ),
    h(
      'p',
      { class: 'muted' },
      'Die Fisch- und Wirbellosenarten bestimmen die optimalen Grenzwerte und werden auf Verträglichkeit, Gruppengröße sowie Territorialverhalten geprüft.'
    ),
    d.stock.length
      ? h('ul', { class: 'stock-list' }, stockListItems)
      : h('p', {}, 'Noch kein Besatz eingetragen. Es gelten die allgemeinen Grenzwerte.'),
  ];

  if (d.stockCompatibility?.decorHints?.length) {
    stockNodes.push(
      h(
        'div',
        { class: 'compat-box info', style: 'margin-top:.8rem' },
        h('strong', {}, 'Haltungs- & Einrichtungsempfehlungen für diesen Besatz:'),
        h(
          'ul',
          { style: 'margin:.4rem 0 0 1.2rem; padding:0' },
          d.stockCompatibility.decorHints.map((hint) => h('li', {}, hint))
        )
      )
    );
  }

  if (!isReadOnly) {
    stockNodes.push(
      h(
        'datalist',
        { id: 'species' },
        (CONFIG?.species || []).map((s) =>
          h(
            'option',
            { value: s.name },
            s.scientificName ? `${s.name} (${s.scientificName})` : s.name
          )
        )
      ),
      h(
        'form',
        {
          class: 'stack',
          style: 'margin-top:1.2rem',
          onsubmit: async (e) => {
            e.preventDefault();
            stockErr.textContent = '';
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
          },
        },
        h('h3', { style: 'margin:0' }, 'Neuen Bewohner hinzufügen'),
        h(
          'div',
          { class: 'grid2' },
          h('div', { class: 'field' }, h('label', {}, 'Art / Spezies'), sp),
          h(
            'div',
            { class: 'field' },
            h('label', {}, 'Individueller Name / Bezeichnung (optional)'),
            inhabitantName
          )
        ),
        h(
          'div',
          { class: 'grid2' },
          h('div', { class: 'field' }, h('label', {}, 'Anzahl'), cnt),
          h('div', { class: 'field' }, h('label', {}, 'Ansprüche an das Wasser'), prof)
        ),
        previewBox,
        h(
          'div',
          { class: 'field' },
          h('label', {}, 'Foto des Bewohners (optional, PNG, JPG, WebP, GIF bis 5 MB)'),
          stockFileInput,
          stockPreviewImg,
          h('div', { style: 'margin-top:.3rem' }, btnRemoveStockImg)
        ),
        stockErr,
        h('div', {}, h('button', { class: 'btn', type: 'submit' }, 'Besatz hinzufügen'))
      )
    );
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
        h(
          'div',
          { class: 'card', style: 'text-align:center; padding: 2rem 1rem' },
          h(
            'p',
            { class: 'muted', style: 'margin-bottom:.8rem' },
            'In diesem Zeitraum sind keine passenden Log-Einträge vorhanden.'
          ),
          !isReadOnly
            ? h(
                'div',
                { class: 'row', style: 'justify-content:center' },
                h(
                  'button',
                  {
                    class: 'btn small',
                    type: 'button',
                    onclick: () => maintenanceDialog(aq),
                  },
                  '🛠️ Erste Aktivität eintragen'
                ),
                h('a', { class: 'btn small ghost', href: `#/a/${id}/messen` }, '🧪 Messung eintragen')
              )
            : null
        )
      );
      return;
    }

    logContainer.replaceChildren(
      ...items.map((it) => {
        const isMeas = it.kind === 'measurement';
        const typeClass = `t-${it.type || 'other'}`;

        const headerNodes = [
          h(
            'div',
            { class: 'log-item-title' },
            h('span', { class: 'log-item-icon' }, it.icon || (isMeas ? '🧪' : '📝')),
            h(
              'span',
              {},
              it.type === 'water_change' && it.percentage
                ? `Wasserwechsel (${it.percentage} %)`
                : it.typeName || (isMeas ? 'Wassermessung' : 'Aktivität')
            )
          ),
          h(
            'div',
            { class: 'log-item-meta' },
            h('span', {}, fmtDate(it.timestamp)),
            it.created_by_username
              ? h('span', { class: 'tag' }, `von ${it.created_by_username}`)
              : null
          ),
        ];

        const bodyNodes = [];
        if (it.type === 'water_change' && it.percentage) {
          bodyNodes.push(
            h('div', {}, h('span', { class: 'chip ok' }, `💧 ${it.percentage} % Teilwasserwechsel`))
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

          bodyNodes.push(h('div', { class: 'log-details-box' }, h('strong', {}, prefix), it.details));
        }

        if (isMeas && it.values) {
          const valEntries = Object.entries(it.values);
          if (valEntries.length) {
            bodyNodes.push(
              h(
                'div',
                { class: 'log-meas-grid' },
                valEntries.map(([k, val]) => {
                  const p = param(k);
                  const st = evaluate(d.thresholds[k], val);
                  return h(
                    'span',
                    { class: `log-meas-pill ${st ? 'v-' + st : ''}` },
                    `${p.name.replace(/ \(.*\)/, '')}: ${fmtNum(p, val)}${p.unit ? ' ' + p.unit : ''}`
                  );
                })
              )
            );
          }
          if (it.alerts && it.alerts.length) {
            bodyNodes.push(
              h(
                'div',
                { style: 'margin-top:.3rem' },
                it.alerts.map((al) =>
                  h(
                    'div',
                    {
                      class: `alert ${al.level}`,
                      style: 'padding:.3rem .6rem; font-size:.85rem; margin-top:.2rem',
                    },
                    h('strong', {}, al.level === 'crit' ? 'Kritisch' : 'Auffällig'),
                    al.message
                  )
                )
              )
            );
          }
        }

        if (it.note) {
          bodyNodes.push(
            h(
              'p',
              {
                class: 'muted',
                style: 'margin:0; font-size:.9rem; font-style:italic',
              },
              it.note
            )
          );
        }

        const actions = [];
        if (!isReadOnly) {
          if (!isMeas) {
            actions.push(
              h(
                'button',
                {
                  class: 'btn small ghost',
                  type: 'button',
                  onclick: () => maintenanceDialog(aq, it),
                },
                'Bearbeiten'
              )
            );
            actions.push(
              h(
                'button',
                {
                  class: 'btn small ghost danger',
                  type: 'button',
                  onclick: async () => {
                    if (!confirm('Diesen Log-Eintrag wirklich löschen?')) return;
                    try {
                      await api(`/aquariums/${id}/maintenance/${it.id}`, {
                        method: 'DELETE',
                      });
                      toast('Eintrag gelöscht.');
                      route();
                    } catch (ex) {
                      toast(ex.message);
                    }
                  },
                },
                'Löschen'
              )
            );
          } else {
            actions.push(
              h(
                'button',
                {
                  class: 'btn small ghost danger',
                  type: 'button',
                  onclick: async () => {
                    if (!confirm('Diese Messung wirklich löschen?')) return;
                    try {
                      await api(`/aquariums/${id}/measurements/${it.id}`, {
                        method: 'DELETE',
                      });
                      toast('Messung gelöscht.');
                      route();
                    } catch (ex) {
                      toast(ex.message);
                    }
                  },
                },
                'Löschen'
              )
            );
          }
        }

        return h(
          'div',
          { class: `log-item ${typeClass}` },
          h('div', { class: 'log-item-header' }, headerNodes),
          bodyNodes.length ? h('div', { class: 'stack', style: 'gap:.35rem' }, bodyNodes) : null,
          actions.length
            ? h('div', { class: 'row', style: 'margin-top:.4rem; justify-content:flex-end' }, actions)
            : null
        );
      })
    );
  };

  const logTabs = h(
    'div',
    { class: 'picker', style: 'margin-top:.4rem' },
    [
      ['all', 'Alle Einträge'],
      ['water_change', '💧 Wasserwechsel'],
      ['maintenance', '🛠️ Pflege & Filter'],
      ['plants', '🌱 Pflanzen'],
      ['measurement', '🧪 Messungen'],
    ].map(([k, label]) =>
      h(
        'button',
        {
          class: `btn small ${k === currentLogFilter ? '' : 'ghost'}`,
          type: 'button',
          onclick: (e) => {
            currentLogFilter = k;
            logTabs
              .querySelectorAll('button')
              .forEach((b) => (b.className = 'btn small ghost'));
            e.target.className = 'btn small';
            renderTimeline();
          },
        },
        label
      )
    )
  );

  renderTimeline();

  nodes.push(
    h(
      'section',
      { class: 'card stack' },
      h(
        'div',
        { class: 'row between' },
        h(
          'div',
          {},
          h('h2', { style: 'margin:0' }, '📖 Aquarium-Logbuch & Aktivitäten'),
          h(
            'div',
            { class: 'muted' },
            'Chronologisches Protokoll über alle Arbeiten, Wasserwechsel, Filterpflegen, Pflanzen und Messungen.'
          )
        ),
        !isReadOnly
          ? h(
              'div',
              { class: 'row' },
              h(
                'button',
                {
                  class: 'btn small',
                  type: 'button',
                  onclick: () => maintenanceDialog(aq),
                },
                '🛠️ Aktivität eintragen'
              ),
              h('a', { class: 'btn small ghost', href: `#/a/${id}/messen` }, '🧪 Messung eintragen')
            )
          : null
      ),
      logTabs,
      logContainer
    )
  );

  // Verlaufstabelle der Messungen
  if (ms.length) {
    const used = (CONFIG?.allParameters || CONFIG?.parameters || []).filter((p) =>
      ms.some((m) => m.values[p.key] != null)
    );
    nodes.push(
      h(
        'section',
        { class: 'card stack' },
        h(
          'div',
          { class: 'row between', style: 'align-items: center;' },
          h('h2', { style: 'margin:0' }, 'Messwerte-Tabelle'),
          h(
            'div',
            { class: 'row' },
            h(
              'button',
              {
                class: 'btn small ghost',
                type: 'button',
                onclick: () => exportMeasurementsDialog(aq),
              },
              '📤 Exportieren (CSV/Excel)'
            ),
            !isReadOnly
              ? h(
                  'button',
                  {
                    class: 'btn small ghost',
                    type: 'button',
                    onclick: () => importMeasurementsDialog(aq),
                  },
                  '📥 Messungen importieren (CSV)'
                )
              : null
          )
        ),
        h(
          'div',
          { class: 'table-wrap' },
          h(
            'table',
            {},
            h(
              'thead',
              {},
              h(
                'tr',
                {},
                h('th', {}, 'Zeitpunkt'),
                used.map((p) =>
                  h(
                    'th',
                    {},
                    p.name.replace(/ \(.*\)/, ''),
                    p.unit ? ` (${p.unit})` : ''
                  )
                ),
                h('th', {}, 'Notiz'),
                !isReadOnly ? h('th', {}, '') : null
              )
            ),
            h(
              'tbody',
              {},
              [...ms]
                .reverse()
                .slice(0, 40)
                .map((m) =>
                  h(
                    'tr',
                    {},
                    h('td', {}, fmtDate(m.measured_at)),
                    used.map((p) => {
                      const v = m.values[p.key];
                      const st = v == null ? null : evaluate(d.thresholds[p.key], v);
                      return h(
                        'td',
                        { class: st === 'crit' ? 'v-crit' : st === 'warn' ? 'v-warn' : '' },
                        v == null ? '–' : fmtNum(p, v)
                      );
                    }),
                    h('td', {}, m.note || ''),
                    !isReadOnly
                      ? h(
                          'td',
                          {},
                          h(
                            'button',
                            {
                              class: 'btn small ghost',
                              type: 'button',
                              onclick: async () => {
                                if (!confirm('Diese Messung löschen?')) return;
                                await api(`/aquariums/${id}/measurements/${m.id}`, {
                                  method: 'DELETE',
                                });
                                route();
                              },
                            },
                            'Löschen'
                          )
                        )
                      : null
                  )
                )
            )
          )
        ),
        ms.length > 40
          ? h('p', { class: 'muted' }, 'Es werden die letzten 40 Messungen des Zeitraums angezeigt.')
          : null
      )
    );
  } else if (!isReadOnly) {
    nodes.push(
      h(
        'section',
        { class: 'card stack' },
        h(
          'div',
          { class: 'row between', style: 'align-items: center;' },
          h(
            'div',
            {},
            h('h2', { style: 'margin:0' }, '🧪 Noch keine Messwerte im gewählten Zeitraum'),
            h(
              'div',
              { class: 'muted' },
              'Trage eine neue Messung ein oder importiere historische Messdaten bequem per CSV / Excel.'
            )
          ),
          h(
            'div',
            { class: 'row' },
            h('a', { class: 'btn small', href: `#/a/${id}/messen` }, '🧪 Messung eintragen'),
            h(
              'button',
              {
                class: 'btn small ghost',
                type: 'button',
                onclick: () => importMeasurementsDialog(aq),
              },
              '📥 CSV-Import'
            )
          )
        )
      )
    );
  }

  if (
    ME?.hasAiKey ||
    ME?.hasAnyAiKey ||
    ME?.hasOpenaiKey ||
    ME?.hasGeminiKey ||
    ME?.hasClaudeKey
  ) {
    nodes.push(
      h(
        'button',
        {
          class: 'chat-fab',
          type: 'button',
          title: `KI-Assistent für „${aq.name}“ öffnen`,
          'aria-label': `KI-Assistent für „${aq.name}“ öffnen`,
          onclick: () => showAquariumChatModal(aq),
        },
        '🤖',
        h('span', { class: 'chat-fab-badge' }, 'KI')
      )
    );
  }

  mount(h('div', { class: 'stack' }, nodes));
  for (const c of chartCards)
    charts.push(makeChart(c.canvas, c.p, c.points, d.thresholds[c.p.key]));
  cleanups.push(() => {
    charts.forEach((c) => {
      if (c && typeof c.destroy === 'function') {
        c.destroy();
      }
      const idx = activeCharts.indexOf(c);
      if (idx !== -1) activeCharts.splice(idx, 1);
    });
  });
}

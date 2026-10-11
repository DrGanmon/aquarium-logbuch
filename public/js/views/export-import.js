'use strict';

import { h, toast } from '../dom.js';
import { api } from '../api.js';
import { CONFIG, RANGE, CUSTOM_FROM, CUSTOM_TO } from '../state.js';
import { route } from '../router.js';
import { parseCsvInWorker } from '../worker-client.js';
import { t } from '../i18n.js';

export function exportMeasurementsDialog(aq) {
  const dlg = h('dialog', { class: 'stack', style: 'max-width: 500px;' });
  const formatSelect = h(
    'select',
    {},
    h('option', { value: 'excel_csv' }, t('exportImport.semicolon')),
    h('option', { value: 'standard_csv' }, t('exportImport.comma'))
  );
  const rangeSelect = h(
    'select',
    {},
    h('option', { value: 'all' }, t('common.rangeAll')),
    h('option', { value: 'current' }, 'Aktuell gefilterter Zeitraum / Current Range')
  );

  const form = h(
    'form',
    {
      class: 'stack',
      onsubmit: (e) => {
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
        toast(t('common.success'));
      },
    },
    h(
      'div',
      { class: 'row between' },
      h('h2', { style: 'margin:0' }, t('exportImport.exportHeading')),
      h('button', { class: 'btn small ghost', type: 'button', onclick: () => dlg.close() }, '✕')
    ),
    h(
      'p',
      { class: 'muted' },
      t('exportImport.exportDesc')
    ),
    h('div', { class: 'field' }, h('label', {}, t('exportImport.delimiterLabel')), formatSelect),
    h('div', { class: 'field' }, h('label', {}, t('common.filter')), rangeSelect),
    h(
      'div',
      { class: 'row', style: 'margin-top:.5rem' },
      h('button', { class: 'btn', type: 'submit' }, t('exportImport.exportBtn')),
      h('button', { class: 'btn ghost', type: 'button', onclick: () => dlg.close() }, t('common.cancel'))
    )
  );

  dlg.appendChild(form);
  dlg.addEventListener('close', () => dlg.remove());
  document.body.appendChild(dlg);
  dlg.showModal();
}

export function importMeasurementsDialog(aq) {
  const dlg = h('dialog', { class: 'wide stack', style: 'max-width: 820px;' });
  const err = h('p', { class: 'error', role: 'alert' });
  const infoMsg = h('div', { class: 'muted' });

  let rawCsvText = '';
  let parsedHeaders = [];
  let parsedSampleRows = [];
  let currentDelimiter = ';';
  let totalDataRowCount = 0;
  const columnSelects = [];

  const fileInput = h('input', {
    type: 'file',
    accept: '.csv,.txt,text/csv,text/plain',
    style: 'display:none;',
  });
  const dropZone = h(
    'div',
    { class: 'csv-drop-zone stack', style: 'gap:.4rem;' },
    h('div', { style: 'font-size: 2rem;' }, '📄'),
    h('strong', {}, 'CSV-Datei hier ablegen oder zum Auswählen klicken'),
    h(
      'span',
      { class: 'muted', style: 'font-size: .85rem;' },
      'Unterstützt .csv und .txt mit Trennzeichen Semikolon, Komma oder Tabulator'
    )
  );

  dropZone.addEventListener('click', () => fileInput.click());
  dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('dragover');
  });
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

  const pasteTextarea = h('textarea', {
    rows: '3',
    placeholder: 'Alternativ CSV-Inhalt direkt hier einfügen...',
    style: 'display:none; width: 100%; font-family: monospace; font-size: .85rem;',
  });
  const togglePasteBtn = h(
    'button',
    { class: 'btn small ghost', type: 'button' },
    '📝 CSV-Text manuell einfügen'
  );
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
  const delimiterSelect = h(
    'select',
    { style: 'width: auto;' },
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

  const submitBtn = h(
    'button',
    { class: 'btn', type: 'button', style: 'display:none;' },
    '🚀 Messungen importieren'
  );

  async function processCsvText(text, explicitDelimiter = null) {
    rawCsvText = text;
    err.textContent = '';
    infoMsg.textContent = 'Lese Spalten ein...';

    try {
      // 1. Zuerst Multithreaded-Web-Worker für verzögerungsfreies Einlesen im Hintergrund
      let res;
      try {
        res = await parseCsvInWorker(text, explicitDelimiter);
      } catch (workerErr) {
        // Fallback über Backend-API
        res = await api(`/aquariums/${aq.id}/measurements/parse-csv-header`, {
          method: 'POST',
          body: { csvText: text, delimiter: explicitDelimiter },
        });
      }

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
    const allParams = CONFIG?.allParameters || CONFIG?.parameters || [];

    const rows = parsedHeaders.map((headerText, colIdx) => {
      const select = h('select', {});
      select.appendChild(h('option', { value: 'ignore' }, '-- Spalte ignorieren --'));
      select.appendChild(h('option', { value: 'measured_at' }, '📅 Datum / Messzeitpunkt (Pflicht)'));
      select.appendChild(h('option', { value: 'time' }, '🕒 Uhrzeit (optional)'));
      select.appendChild(h('option', { value: 'note' }, '��� Notiz / Bemerkung'));

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

      return h(
        'tr',
        {},
        h('td', {}, h('strong', {}, headerText || `Spalte ${colIdx + 1}`)),
        h('td', { class: 'csv-sample-preview', title: sampleText }, sampleText),
        h('td', {}, select)
      );
    });

    const table = h(
      'table',
      { class: 'csv-mapping-table' },
      h(
        'thead',
        {},
        h(
          'tr',
          {},
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

  const content = h(
    'div',
    { class: 'stack' },
    h(
      'div',
      { class: 'row between' },
      h('h2', { style: 'margin:0' }, `📥 Messwerte importieren: „${aq.name}“`),
      h('button', { class: 'btn small ghost', type: 'button', onclick: () => dlg.close() }, '✕')
    ),
    h(
      'p',
      { class: 'muted' },
      'Lade eine CSV-Datei hoch (z. B. aus Excel, Google Sheets, Testkoffern oder anderen Apps). Die Spalten können interaktiv den Wasserparametern zugeordnet werden.'
    ),
    fileInput,
    dropZone,
    h(
      'div',
      { class: 'row between', style: 'align-items: center;' },
      togglePasteBtn,
      h(
        'div',
        { class: 'row', style: 'align-items: center; gap: .5rem;' },
        h('label', { class: 'muted', style: 'font-size:.85rem;' }, 'Trennzeichen:'),
        delimiterSelect
      )
    ),
    pasteTextarea,
    infoMsg,
    err,
    mappingSection,
    h(
      'div',
      { class: 'row between', style: 'margin-top: 1rem; align-items: center;' },
      h(
        'label',
        { class: 'row', style: 'gap:.4rem; cursor:pointer; font-size:.9rem;' },
        hasHeaderCheckbox,
        h('span', {}, 'Erste Zeile enthält Spaltennamen (Kopfzeile)')
      ),
      h(
        'div',
        { class: 'row' },
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

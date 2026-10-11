'use strict';

import { h, mount, toast } from '../dom.js';
import { api } from '../api.js';
import { CONFIG } from '../state.js';
import { socialLabel, territorialLabel } from '../utils.js';
import { searchSpeciesInWorker } from '../worker-client.js';

export async function showSpeciesModal(spOrName) {
  let sp = typeof spOrName === 'object' ? spOrName : null;
  if (!sp || !sp.temp) {
    try {
      const res = await api(
        `/species/${encodeURIComponent(typeof spOrName === 'string' ? spOrName : spOrName?.name || spOrName?.species)}`
      );
      sp = res.species;
    } catch (e) {
      if (!sp) {
        toast('Keine detaillierten Arteninformationen gefunden.');
        return;
      }
    }
  }

  const d = h('dialog', { class: 'wide stack' });
  const close = () => {
    d.close();
    d.remove();
  };

  const tags = Array.isArray(sp.tags) ? sp.tags : [];
  const tagNodes = [];
  if (tags.includes('solitary_betta'))
    tagNodes.push(h('span', { class: 'tag danger' }, 'Kampffisch / Einzelhaltung'));
  if (tags.includes('fin_nipper'))
    tagNodes.push(h('span', { class: 'tag danger' }, 'Flossenbeißer'));
  if (tags.includes('long_fins')) tagNodes.push(h('span', { class: 'tag warn' }, 'Lange Flossen'));
  if (tags.includes('predator_small_prey'))
    tagNodes.push(h('span', { class: 'tag warn' }, 'Räuber / Frisst Zwerggarnelen'));
  if (tags.includes('dwarf_shrimp'))
    tagNodes.push(h('span', { class: 'tag info' }, 'Zwerggarnele'));
  if (tags.includes('requires_sand'))
    tagNodes.push(h('span', { class: 'tag info' }, 'Sandboden Pflicht'));
  if (tags.includes('requires_wood'))
    tagNodes.push(h('span', { class: 'tag info' }, 'Wurzelholz Pflicht'));
  if (tags.includes('requires_caves'))
    tagNodes.push(h('span', { class: 'tag info' }, 'Höhlenbedarf'));
  if (tags.includes('coldwater'))
    tagNodes.push(h('span', { class: 'tag info' }, 'Kaltwasserfisch'));
  if (tags.includes('high_temp') || tags.includes('high_temp_required'))
    tagNodes.push(h('span', { class: 'tag warn' }, 'Wärmebedürftig'));
  if (tags.includes('malawi_cichlid') || tags.includes('tanganjika_cichlid'))
    tagNodes.push(h('span', { class: 'tag warn' }, 'Ostafrika-Felsenbiotop'));

  d.replaceChildren(
    h(
      'div',
      { class: 'row between' },
      h(
        'div',
        {},
        h('h2', { style: 'margin:0' }, sp.name),
        sp.scientificName
          ? h('div', { class: 'muted', style: 'font-style:italic' }, sp.scientificName)
          : null
      ),
      h('button', { class: 'btn small ghost', type: 'button', onclick: close, 'aria-label': 'Schließen' }, '✕')
    ),
    h(
      'div',
      { class: 'row', style: 'margin-top:.4rem' },
      h('span', { class: 'tag ok' }, sp.category || 'Allgemein'),
      h(
        'span',
        { class: `tag ${sp.waterType === 'salt' ? 'info' : 'ok'}` },
        sp.waterType === 'salt' ? 'Meerwasser' : 'Süßwasser'
      ),
      sp.profile ? h('span', { class: 'tag' }, `Profil: ${CONFIG?.profiles?.[sp.profile] || sp.profile}`) : null,
      ...tagNodes
    ),
    sp.description ? h('p', { style: 'margin:.4rem 0 0' }, sp.description) : null,
    h(
      'div',
      { class: 'grid2', style: 'margin-top:.5rem' },
      h(
        'div',
        { class: 'card stack', style: 'gap:.3rem; padding:.8rem' },
        h('h3', { style: 'margin-bottom:.3rem' }, 'Wasserwerte'),
        h(
          'div',
          {},
          h('strong', {}, 'Temperatur: '),
          `${sp.temp?.min ?? '–'}–${sp.temp?.max ?? '–'} °C`,
          sp.temp?.idealMin != null
            ? h('span', { class: 'muted' }, ` (Ideal: ${sp.temp.idealMin}–${sp.temp.idealMax} °C)`)
            : ''
        ),
        h(
          'div',
          {},
          h('strong', {}, 'pH-Wert: '),
          `${sp.ph?.min ?? '–'}–${sp.ph?.max ?? '–'}`,
          sp.ph?.idealMin != null
            ? h('span', { class: 'muted' }, ` (Ideal: ${sp.ph.idealMin}–${sp.ph.idealMax})`)
            : ''
        ),
        sp.gh?.min != null
          ? h('div', {}, h('strong', {}, 'Gesamthärte (GH): '), `${sp.gh.min}–${sp.gh.max} °dH`)
          : null,
        sp.kh?.min != null
          ? h('div', {}, h('strong', {}, 'Karbonathärte (KH): '), `${sp.kh.min}–${sp.kh.max} °dH`)
          : null
      ),
      h(
        'div',
        { class: 'card stack', style: 'gap:.3rem; padding:.8rem' },
        h('h3', { style: 'margin-bottom:.3rem' }, 'Becken & Verhalten'),
        h(
          'div',
          {},
          h('strong', {}, 'Mindestvolumen: '),
          sp.minVolumeL ? `${sp.minVolumeL} Liter (${sp.minTankLengthCm || '–'} cm)` : '–'
        ),
        h('div', {}, h('strong', {}, 'Sozialform: '), socialLabel(sp.socialType, sp.minGroupCount)),
        h('div', {}, h('strong', {}, 'Territorialität: '), territorialLabel(sp.territorial)),
        h(
          'div',
          {},
          h('strong', {}, 'Schwimmzone: '),
          sp.tankRegion === 'top'
            ? 'Oberfläche'
            : sp.tankRegion === 'bottom'
            ? 'Boden'
            : sp.tankRegion === 'top_middle'
            ? 'Oben / Mitte'
            : 'Überall'
        )
      )
    ),
    sp.decorHints
      ? h('div', { class: 'compat-box info' }, h('strong', {}, 'Einrichtung & Pflege: '), sp.decorHints)
      : null,
    sp.behaviorNotes
      ? h(
          'div',
          { class: 'compat-box warn' },
          h('strong', {}, 'Verhalten & Vergesellschaftung: '),
          sp.behaviorNotes
        )
      : null,
    h(
      'div',
      { class: 'row between', style: 'margin-top:.8rem;' },
      h('span', {}, ''),
      h('button', { class: 'btn', type: 'button', onclick: close }, 'Schließen')
    )
  );

  document.body.appendChild(d);
  d.showModal();
}

export async function viewSpeciesCatalog(selectedId = null) {
  const data = await api('/species');
  const all = data.species || [];
  const categories = ['Alle', ...(data.categories || [])];

  let currentCategory = 'Alle';
  let currentWaterType = 'all';
  let searchTerm = '';

  const searchInput = h('input', {
    type: 'search',
    placeholder: 'Art, wissenschaftlicher Name oder Verhalten suchen...',
  });
  const waterSelect = h(
    'select',
    { style: 'width:auto' },
    h('option', { value: 'all' }, 'Alle Wassertypen'),
    h('option', { value: 'fresh' }, 'Nur Süßwasser'),
    h('option', { value: 'salt' }, 'Nur Meerwasser')
  );

  const grid = h('div', { class: 'species-grid' });

  let renderSeq = 0;
  const renderCards = async () => {
    const seq = ++renderSeq;
    const list = await searchSpeciesInWorker(all, searchTerm, currentWaterType, currentCategory);
    if (seq !== renderSeq) return; // Veraltete Suche ignorieren

    if (!list.length) {
      grid.replaceChildren(
        h(
          'p',
          { class: 'muted', style: 'grid-column: 1 / -1' },
          'Keine passenden Aquarienbewohner gefunden.'
        )
      );
      return;
    }

    grid.replaceChildren(
      ...list.map((sp) => {
        const tags = Array.isArray(sp.tags) ? sp.tags : [];
        const chips = [];
        chips.push(h('span', { class: 'tag ok' }, sp.category));
        chips.push(
          h(
            'span',
            { class: `tag ${sp.waterType === 'salt' ? 'info' : 'ok'}` },
            sp.waterType === 'salt' ? 'Meerwasser' : 'Süßwasser'
          )
        );
        if (sp.minVolumeL) chips.push(h('span', { class: 'tag' }, `ab ${sp.minVolumeL} L`));
        chips.push(h('span', { class: 'tag info' }, socialLabel(sp.socialType, sp.minGroupCount)));
        if (sp.territorial === 'solitary_aggressive')
          chips.push(h('span', { class: 'tag danger' }, 'Einzelgänger / Kampffisch'));
        else if (sp.territorial === 'strong') chips.push(h('span', { class: 'tag warn' }, 'Territorial'));
        else if (tags.includes('fin_nipper'))
          chips.push(h('span', { class: 'tag danger' }, 'Flossenbeißer'));

        return h(
          'div',
          { class: `card species-card ${sp.waterType}` },
          h(
            'div',
            { class: 'stack', style: 'gap:.4rem' },
            h(
              'div',
              { class: 'row between' },
              h(
                'div',
                {},
                h('h3', { style: 'margin:0; font-size:1.1rem' }, sp.name),
                sp.scientificName
                  ? h('div', { class: 'muted', style: 'font-style:italic' }, sp.scientificName)
                  : null
              )
            ),
            h('div', { style: 'margin-top:.2rem' }, chips),
            h(
              'div',
              { class: 'muted', style: 'font-size:.85rem; line-height:1.4' },
              `Temp: ${sp.temp?.min ?? '–'}–${sp.temp?.max ?? '–'} °C · pH: ${sp.ph?.min ?? '–'}–${sp.ph?.max ?? '–'} · ${sp.diet === 'herbivore' ? 'Pflanzenfresser' : sp.diet === 'carnivore' ? 'Fleischfresser' : 'Allesfresser'}`
            ),
            sp.description ? h('p', { class: 'muted', style: 'margin:0; font-size:.88rem' }, sp.description) : null
          ),
          h(
            'div',
            { style: 'margin-top:.8rem' },
            h(
              'button',
              {
                class: 'btn small ghost',
                type: 'button',
                onclick: () => showSpeciesModal(sp),
              },
              'Vollständiges Profil & Haltungsansprüche'
            )
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

  const catPills = h(
    'div',
    { class: 'picker', style: 'margin-top:.4rem' },
    categories.map((c) =>
      h(
        'button',
        {
          class: `btn small ${c === currentCategory ? '' : 'ghost'}`,
          type: 'button',
          onclick: (e) => {
            currentCategory = c;
            catPills
              .querySelectorAll('button')
              .forEach((b) => (b.className = 'btn small ghost'));
            e.target.className = 'btn small';
            renderCards();
          },
        },
        c
      )
    )
  );

  renderCards();

  mount(
    h(
      'div',
      { class: 'stack' },
      h(
        'div',
        { class: 'row between' },
        h(
          'div',
          {},
          h('a', { href: '#/', class: 'muted' }, '‹ Zurück zur Übersicht'),
          h('h1', { style: 'margin-top:.3rem' }, 'Artenkatalog & Aquarienbewohner')
        )
      ),
      h(
        'div',
        { class: 'card stack' },
        h(
          'p',
          { class: 'muted', style: 'margin:0' },
          'Recherchiere gängige Fische, Wirbellose und Schnecken samt deren Wasserwerten, Mindestbeckengrößen, Sozialformen und Verhaltensweisen (z. B. Territorialverhalten bei Kampffischen & Buntbarschen).'
        ),
        h(
          'div',
          { class: 'grid2' },
          h('div', { class: 'field' }, h('label', {}, 'Suchbegriff'), searchInput),
          h('div', { class: 'field' }, h('label', {}, 'Wassertyp'), waterSelect)
        ),
        h('div', { class: 'field' }, h('label', {}, 'Kategorie'), catPills)
      ),
      grid
    )
  );

  if (selectedId) {
    const target = all.find(
      (s) => s.id === selectedId || s.name.toLowerCase() === selectedId.toLowerCase()
    );
    if (target) showSpeciesModal(target);
  }
}

'use strict';

import { $app, runCleanups } from './state.js';

export function h(tag, attrs, ...kids) {
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

export function append(el, kids) {
  for (const k of kids.flat(Infinity)) {
    if (k == null || k === false) continue;
    el.append(k instanceof Node ? k : document.createTextNode(String(k)));
  }
}

export function mount(...nodes) {
  runCleanups();
  $app.replaceChildren(...nodes.flat().filter(Boolean));
  window.scrollTo(0, 0);
}

export function toast(msg) {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => t.classList.remove('show'), 3500);
}

export function showImageModal({ src, title = 'Bildvorschau', caption = null }) {
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

export function renderSimpleMarkdown(md) {
  if (!md) return '';
  let html = md
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // Code-Blöcke
  html = html.replace(/```([a-z0-9_-]*)\n([\s\S]*?)```/gi, '<pre><code>$2</code></pre>');
  html = html.replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>');
  // Inline-Code
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
  // Überschriften
  html = html.replace(/^### (.*$)/gim, '<h4>$1</h4>');
  html = html.replace(/^## (.*$)/gim, '<h3>$1</h3>');
  html = html.replace(/^# (.*$)/gim, '<h3>$1</h3>');
  // Fett / Kursiv
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  // Listenpunkte
  html = html.replace(/^\s*[-*]\s+(.*)$/gim, '<li>$1</li>');
  html = html.replace(/(<li>[\s\S]*?<\/li>)/g, '<ul>$1</ul>');
  html = html.replace(/<\/ul>\s*<ul>/g, '');
  html = html.replace(/^\s*\d+\.\s+(.*)$/gim, '<li>$1</li>');
  // Absätze
  html = html.replace(/\n\n+/g, '<br><br>');
  html = html.replace(/\n/g, '<br>');
  return html;
}

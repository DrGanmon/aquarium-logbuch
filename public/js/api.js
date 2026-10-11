'use strict';

import { setMe } from './state.js';

let onUnauthorizedCallback = null;
export function setOnUnauthorized(cb) {
  onUnauthorizedCallback = cb;
}

export async function api(path, { method = 'GET', body } = {}) {
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
    setMe(null);
    if (typeof onUnauthorizedCallback === 'function') {
      onUnauthorizedCallback();
    }
    throw new Error(data.error || 'Bitte neu anmelden.');
  }
  if (!res.ok) throw new Error(data.error || 'Etwas ist schiefgelaufen.');
  return data;
}

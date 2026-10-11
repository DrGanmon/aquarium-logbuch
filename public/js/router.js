'use strict';

import {
  CONFIG,
  ME,
  setMe,
  setConfig,
  $topbar,
  $whoami,
  $topbarAvatar,
  $btnProfile,
  $btnAdmin,
  $btnSpecies,
  $btnLogout,
} from './state.js';
import { api, setOnUnauthorized } from './api.js';
import {
  showAuth,
  viewVerifyEmail,
  viewResetPassword,
  viewDeleteAccount,
  AUTH_ERROR,
} from './views/auth.js';
import { viewLegal } from './views/legal.js';
import { viewSpeciesCatalog } from './views/species.js';
import { viewAdmin } from './views/admin.js';
import { viewProfile } from './views/profile.js';
import { viewList, viewShareInvitation } from './views/aquarium-list.js';
import { viewAquarium } from './views/aquarium-detail.js';
import { viewMeasure } from './views/measure.js';
import { initTheme } from './theme.js';
import { initServiceWorker } from './notifications.js';
import { toast } from './dom.js';

export function updateTopbarUser() {
  if (!ME) {
    $topbar.hidden = true;
    return;
  }
  const display =
    ME.firstName || ME.lastName
      ? [ME.firstName, ME.lastName].filter(Boolean).join(' ')
      : ME.username;
  $whoami.textContent = display;
  if ($topbarAvatar) {
    if (ME.hasAvatar) {
      $topbarAvatar.src = `api/me/avatar?t=${Date.now()}`;
      $topbarAvatar.style.display = 'inline-block';
    } else {
      $topbarAvatar.removeAttribute('src');
      $topbarAvatar.style.display = 'none';
    }
  }
  if ($btnAdmin) $btnAdmin.hidden = !ME.isAdmin;
  $topbar.hidden = false;
}

export async function route() {
  const hash = location.hash || '#/';

  // 1. Rechtliche Seiten (immer öffentlich erreichbar)
  if (hash === '#/impressum' || hash === '#/imprint') return viewLegal('impressum');
  if (hash === '#/datenschutz' || hash === '#/privacy') return viewLegal('datenschutz');
  if (hash === '#/lizenzen' || hash === '#/licenses' || hash === '#/copyright')
    return viewLegal('licenses');
  if (hash === '#/kontakt' || hash === '#/contact') return viewLegal('kontakt');

  // 2. Öffentliche Auth-Token-Routen
  if (hash.startsWith('#/verify-email?token=')) {
    const token = new URLSearchParams(hash.slice(hash.indexOf('?'))).get('token');
    return viewVerifyEmail(token);
  }
  if (hash.startsWith('#/reset-password?token=')) {
    const token = new URLSearchParams(hash.slice(hash.indexOf('?'))).get('token');
    return viewResetPassword(token);
  }
  if (hash.startsWith('#/delete-account?token=')) {
    const token = new URLSearchParams(hash.slice(hash.indexOf('?'))).get('token');
    return viewDeleteAccount(token);
  }
  if (hash.startsWith('#/share/invite?token=')) {
    const token = new URLSearchParams(hash.slice(hash.indexOf('?'))).get('token');
    return viewShareInvitation(token);
  }

  // 3. Wenn nicht eingeloggt
  if (!ME) {
    if (hash === '#/register') return showAuth('register');
    if (hash.startsWith('#/register?invite=')) {
      const p = new URLSearchParams(hash.slice(hash.indexOf('?')));
      return showAuth('register', { inviteCode: p.get('invite'), email: p.get('email') });
    }
    if (hash === '#/forgot-password') return showAuth('forgot');
    return showAuth('login');
  }

  // 4. Eingeloggt: Topbar & Routing
  updateTopbarUser();

  if (hash === '#/') return viewList();
  if (hash === '#/admin') {
    if (!ME.isAdmin) {
      toast('Zugriff verweigert.');
      location.hash = '#/';
      return;
    }
    return viewAdmin();
  }
  if (hash === '#/profile') return viewProfile();
  if (hash === '#/species') return viewSpeciesCatalog();
  if (hash.startsWith('#/species/')) {
    const spId = decodeURIComponent(hash.slice(10));
    return viewSpeciesCatalog(spId);
  }

  const m = hash.match(/^#\/a\/([^/]+)(\/(messen))?$/);
  if (m) {
    const id = m[1],
      sub = m[3];
    if (sub === 'messen') return viewMeasure(id);
    return viewAquarium(id);
  }

  location.hash = '#/';
}

export async function start() {
  setOnUnauthorized(() => {
    updateTopbarUser();
    route();
  });

  try {
    const [cfg, meData] = await Promise.all([
      api('/config'),
      api('/me').catch(() => null),
    ]);
    setConfig(cfg);
    setMe(meData);
  } catch (e) {
    /* Nicht eingeloggt oder Setup */
  }

  updateTopbarUser();
  await route();
}

export function initApp() {
  initTheme();
  initServiceWorker();

  window.addEventListener('hashchange', () => route());

  $btnLogout?.addEventListener('click', async () => {
    try {
      await api('/logout', { method: 'POST' });
    } catch (e) {
      /* ignorieren */
    }
    setMe(null);
    updateTopbarUser();
    location.hash = '#/';
    showAuth('login');
  });

  $btnProfile?.addEventListener('click', () => {
    location.hash = '#/profile';
  });

  $btnAdmin?.addEventListener('click', () => {
    location.hash = '#/admin';
  });

  $btnSpecies?.addEventListener('click', () => {
    location.hash = '#/species';
  });
}

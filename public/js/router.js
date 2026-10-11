'use strict';

import {
  CONFIG,
  ME,
  setMe,
  setConfig,
  $topbar,
  $topbarBrandName,
  $whoami,
  $topbarAvatar,
  $btnProfile,
  $btnAdmin,
  $btnSpecies,
  $btnLangTopbar,
  $topbarLangText,
  $btnThemeTopbar,
  $btnLogout,
} from './state.js';
import { api, setOnUnauthorized } from './api.js';
import { initI18n, setLanguage, getLanguage, t } from './i18n.js';
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

export function updateFooter() {
  const footer = document.getElementById('site-footer');
  if (!footer) return;
  const copyEl = footer.querySelector('.footer-copy');
  if (copyEl) copyEl.textContent = t('footer.copyright');
  const aiBadge = footer.querySelector('.footer-ai-badge');
  if (aiBadge) {
    aiBadge.textContent = t('footer.aiBadge');
    aiBadge.title = t('footer.aiBadgeTitle');
  }
  const links = footer.querySelectorAll('.footer-link');
  if (links.length >= 4) {
    links[0].textContent = t('footer.imprint');
    links[1].textContent = t('footer.privacy');
    links[2].textContent = t('footer.licenses');
    links[3].textContent = t('footer.contact');
  }
}

export function updateTopbarUser() {
  const currentLang = getLanguage();
  if ($topbarBrandName) $topbarBrandName.textContent = t('common.appName');
  if ($btnSpecies) $btnSpecies.textContent = t('nav.species');
  if ($btnAdmin) $btnAdmin.textContent = t('nav.admin');
  if ($btnLogout) $btnLogout.textContent = t('nav.logout');
  if ($btnProfile) $btnProfile.title = t('nav.profile');
  if ($btnThemeTopbar) {
    $btnThemeTopbar.title = t('nav.themeToggle');
    $btnThemeTopbar.setAttribute('aria-label', t('nav.themeToggle'));
  }
  if ($btnLangTopbar) {
    $btnLangTopbar.title = t('nav.langToggle');
    $btnLangTopbar.setAttribute('aria-label', t('nav.langToggle'));
  }
  if ($topbarLangText) {
    $topbarLangText.textContent = currentLang === 'de' ? '🌐 DE' : '🌐 EN';
  }

  updateFooter();

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
      toast(t('common.accessDenied'));
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
    if (meData?.language) {
      initI18n(meData.language);
    }
  } catch (e) {
    /* Nicht eingeloggt oder Setup */
  }

  updateTopbarUser();
  await route();
}

export function initApp() {
  initI18n();
  initTheme();
  initServiceWorker();

  window.addEventListener('hashchange', () => route());
  window.addEventListener('languagechange', () => {
    updateTopbarUser();
    route();
  });

  $btnLangTopbar?.addEventListener('click', async () => {
    const nextLang = getLanguage() === 'de' ? 'en' : 'de';
    setLanguage(nextLang);
    if (ME) {
      try {
        await api('/me', { method: 'PUT', body: { language: nextLang } });
        ME.language = nextLang;
      } catch (e) {
        /* ignore */
      }
    }
  });

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

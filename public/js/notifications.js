'use strict';

import { h, toast } from './dom.js';

let audioCtx = null;
export function beep() {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    [0, 0.25, 0.5].forEach((t) => {
      const o = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      o.frequency.value = 880;
      o.connect(g);
      g.connect(audioCtx.destination);
      g.gain.setValueAtTime(0.0001, audioCtx.currentTime + t);
      g.gain.exponentialRampToValueAtTime(0.25, audioCtx.currentTime + t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + t + 0.18);
      o.start(audioCtx.currentTime + t);
      o.stop(audioCtx.currentTime + t + 0.2);
    });
  } catch (e) {
    /* Kein Web-Audio verfügbar */
  }
}

export let swRegistration = null;

export async function initServiceWorker() {
  if ('serviceWorker' in navigator) {
    try {
      swRegistration = await navigator.serviceWorker.register('sw.js');
    } catch (e) {
      /* Service Worker nicht registrierbar */
    }
  }
}

export const pushNotificationManager = {
  isSupported() {
    return 'Notification' in window;
  },
  getPermission() {
    if (!this.isSupported()) return 'unsupported';
    return Notification.permission;
  },
  async requestPermission() {
    if (!this.isSupported()) return 'unsupported';
    try {
      const p = await Notification.requestPermission();
      return p;
    } catch (e) {
      return Notification.permission;
    }
  },
  scheduleTimer(data) {
    if (navigator.serviceWorker && navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage({
        type: 'SCHEDULE_TIMER',
        ...data,
      });
    }
  },
  cancelTimer(data) {
    if (navigator.serviceWorker && navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage({
        type: 'CANCEL_TIMER',
        ...data,
      });
    }
  },
  clearAllTimers() {
    if (navigator.serviceWorker && navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage({
        type: 'CLEAR_ALL_TIMERS',
      });
    }
  },
  async notify({ title, body, tag, waitSec, url }) {
    beep();
    if (!this.isSupported() || Notification.permission !== 'granted') return;

    const mins = waitSec ? Math.max(1, Math.round(waitSec / 60)) : null;
    const desc =
      body ||
      (mins
        ? `Die Wartezeit (${mins} Min.) ist abgelaufen. Bitte Farbwert ablesen!`
        : 'Wartezeit abgelaufen!');

    try {
      if (swRegistration && swRegistration.showNotification) {
        await swRegistration.showNotification(title, {
          body: desc,
          icon: 'icon-192.png',
          badge: 'favicon-32x32.png',
          tag: tag || 'aquarium-timer',
          renotify: true,
          requireInteraction: true,
          vibrate: [250, 100, 250, 100, 350],
          data: { url: url || location.href },
        });
        return;
      }
    } catch (e) {
      /* Fallback */
    }

    try {
      const n = new Notification(title, {
        body: desc,
        icon: 'icon-192.png',
        badge: 'favicon-32x32.png',
        tag: tag || 'aquarium-timer',
        renotify: true,
        requireInteraction: true,
      });
      n.onclick = () => {
        window.focus();
        n.close();
      };
    } catch (e) {
      /* Benachrichtigung nicht darstellbar */
    }
  },
};

export const scheduleTimer = (data) => pushNotificationManager.scheduleTimer(data);
export const cancelTimer = (data) => pushNotificationManager.cancelTimer(data);

export function notificationBanner(onChanged) {
  const banner = h('div');
  const updateBanner = () => {
    banner.replaceChildren();
    if (!pushNotificationManager.isSupported()) return;
    const perm = pushNotificationManager.getPermission();

    if (perm === 'default') {
      const btn = h(
        'button',
        {
          class: 'btn small',
          type: 'button',
          onclick: async () => {
            const res = await pushNotificationManager.requestPermission();
            updateBanner();
            if (res === 'granted') toast('Push-Benachrichtigungen aktiviert!');
            if (typeof onChanged === 'function') onChanged(res);
          },
        },
        '🔔 Aktivieren'
      );

      banner.className = 'notification-banner info';
      banner.append(
        h(
          'div',
          { class: 'notification-banner-content' },
          h('span', { class: 'notification-banner-icon' }, '🔔'),
          h(
            'div',
            {},
            h('strong', {}, 'Timer-Benachrichtigungen aktivieren'),
            h(
              'p',
              { style: 'margin:0; font-size:.85rem;' },
              'Erhalte automatische Alarme bei abgelaufenen Reaktionszeiten, auch wenn der Tab im Hintergrund liegt.'
            )
          )
        ),
        btn
      );
    } else if (perm === 'granted') {
      banner.className = 'notification-banner active';
      banner.append(
        h(
          'div',
          { class: 'notification-banner-content' },
          h('span', { class: 'notification-banner-icon' }, '🔔'),
          h(
            'div',
            {},
            h('strong', {}, 'Push-Benachrichtigungen aktiv'),
            h(
              'p',
              { style: 'margin:0; font-size:.85rem;' },
              'Du wirst bei Timer-Ablauf per Systembenachrichtigung informiert.'
            )
          )
        )
      );
    } else if (perm === 'denied') {
      banner.className = 'notification-banner warn';
      banner.append(
        h(
          'div',
          { class: 'notification-banner-content' },
          h('span', { class: 'notification-banner-icon' }, '🔕'),
          h(
            'div',
            {},
            h('strong', {}, 'Benachrichtigungen im Browser blockiert'),
            h(
              'p',
              { style: 'margin:0; font-size:.85rem;' },
              'Timer-Alarme können nur im Vordergrund mit Ton abgespielt werden.'
            )
          )
        )
      );
    }
  };
  updateBanner();
  return { banner, updateBanner };
}

export function notificationsCard(onPermissionChanged) {
  const perm = pushNotificationManager.getPermission();
  let permInfo = { icon: '🔔', text: 'Nicht konfiguriert', cls: 'chip' };
  if (perm === 'granted') {
    permInfo = { icon: '🔔', text: 'Aktiviert (Benachrichtigungen erlaubt)', cls: 'chip ok' };
  } else if (perm === 'denied') {
    permInfo = {
      icon: '🔕',
      text: 'Blockiert (im Browser verweigert)',
      cls: 'chip danger',
    };
  } else if (perm === 'default') {
    permInfo = { icon: '🔔', text: 'Nicht eingerichtet (Klick zum Aktivieren)', cls: 'chip warn' };
  } else {
    permInfo = { icon: '⚠️', text: 'Nicht von diesem Browser unterstützt', cls: 'chip' };
  }

  const btnRequestPerm =
    perm === 'default'
      ? h(
          'button',
          {
            class: 'btn small',
            type: 'button',
            onclick: async () => {
              const res = await pushNotificationManager.requestPermission();
              toast(res === 'granted' ? 'Push-Benachrichtigungen aktiviert!' : 'Status: ' + res);
              if (typeof onPermissionChanged === 'function') onPermissionChanged(res);
            },
          },
          '🔔 Benachrichtigungen aktivieren'
        )
      : null;

  const btnTestNotification = h(
    'button',
    {
      class: 'btn small ghost',
      type: 'button',
      onclick: async () => {
        if (pushNotificationManager.getPermission() !== 'granted') {
          const res = await pushNotificationManager.requestPermission();
          if (res !== 'granted') {
            toast('Bitte erlaube Benachrichtigungen im Browser, um den Test durchzuführen.');
            if (typeof onPermissionChanged === 'function') onPermissionChanged(res);
            return;
          }
        }
        toast('Test-Benachrichtigung wird in 3 Sekunden gesendet...');
        setTimeout(() => {
          pushNotificationManager.notify({
            title: '⏱️ Test: Nitrit (NO2) – Wartezeit abgelaufen!',
            body: 'Push-Benachrichtigungen funktionieren einwandfrei! Du verpasst keinen Timer mehr.',
            tag: 'test-notification',
            waitSec: 300,
          });
        }, 3000);
      },
    },
    '🧪 Test-Benachrichtigung senden (3s)'
  );

  return h(
    'div',
    { class: 'card stack' },
    h('h2', {}, 'Push-Benachrichtigungen & Timer'),
    h(
      'p',
      { class: 'muted', style: 'margin:0' },
      'Erhalte Push- und System-Benachrichtigungen bei ablaufenden Reagenz-Timern, damit Farbtests stets zum exakten Zeitpunkt abgelesen werden und keine Messfehler entstehen.'
    ),
    h(
      'div',
      { class: 'row between', style: 'align-items:center; flex-wrap:wrap; gap:.6rem;' },
      h(
        'div',
        { class: 'row', style: 'align-items:center; gap:.5rem;' },
        h('span', { style: 'font-size:1.2rem;' }, permInfo.icon),
        h('span', { class: permInfo.cls }, permInfo.text)
      ),
      h('div', { class: 'row', style: 'gap:.5rem;' }, btnRequestPerm, btnTestNotification)
    )
  );
}

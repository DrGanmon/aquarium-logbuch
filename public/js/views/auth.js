'use strict';

import { h, mount, toast } from '../dom.js';
import { api } from '../api.js';
import { $topbar, setMe } from '../state.js';
import { getThemeSetting, toggleTheme } from '../theme.js';
import { start } from '../router.js';

export let AUTH_ERROR = new URLSearchParams(location.search).get('auth_error') || '';
export let OIDC_LINKED = new URLSearchParams(location.search).get('oidc_linked') === '1';
if (location.search) history.replaceState(null, '', location.pathname + location.hash);

export function setOidcLinked(val) {
  OIDC_LINKED = val;
}

export async function showAuth(mode = 'login', options = {}) {
  $topbar.hidden = true;
  let info = {
    registration: true,
    mode: 'open',
    isInviteOnly: false,
    isClosed: false,
    localLogin: true,
    oidc: false,
    oidcName: '',
  };
  try {
    info = await (await fetch('api/registration')).json();
  } catch (e) {
    /* Standard */
  }
  const registration = info.registration && !info.isClosed;
  const isInviteOnly = Boolean(info.isInviteOnly);
  const isClosed = Boolean(info.isClosed);
  const err = h('p', { class: 'error', role: 'alert' }, AUTH_ERROR);
  AUTH_ERROR = '';
  const oidcBtn = info.oidc
    ? h('a', { class: 'btn', href: 'auth/login' }, `Mit ${info.oidcName} anmelden`)
    : null;

  const currentTheme = getThemeSetting();
  const themeAuthIcon = currentTheme === 'system' ? '🌓' : currentTheme === 'dark' ? '🌙' : '☀️';
  const themeAuthLabel = currentTheme === 'system' ? 'System' : currentTheme === 'dark' ? 'Dunkel' : 'Hell';
  const themeAuthBtn = h(
    'button',
    {
      class: 'btn small ghost',
      type: 'button',
      title: `Farbschema: ${themeAuthLabel} (klicken zum Umschalten)`,
      onclick: () => {
        toggleTheme();
        const nextTheme = getThemeSetting();
        themeAuthBtn.textContent =
          nextTheme === 'system' ? '🌓 System' : nextTheme === 'dark' ? '🌙 Dunkel' : '☀️ Hell';
      },
    },
    `${themeAuthIcon} ${themeAuthLabel}`
  );

  const headerRow = h(
    'div',
    { class: 'row between', style: 'margin-bottom:.5rem; align-items:center;' },
    h(
      'div',
      { style: 'display:flex; align-items:center; gap:.5rem;' },
      h('img', {
        src: 'favicon-32x32.png',
        alt: 'Logo',
        style: 'width:28px; height:28px; border-radius:6px;',
      }),
      h('p', { class: 'muted', style: 'margin:0; font-weight:600;' }, 'Aquarium-Logbuch')
    ),
    themeAuthBtn
  );

  if (!info.localLogin && mode !== 'forgot') {
    mount(
      h(
        'div',
        { class: 'auth' },
        headerRow,
        h('div', { class: 'card stack' }, h('h1', {}, 'Anmelden'), err, oidcBtn)
      )
    );
    oidcBtn?.focus();
    return;
  }

  // Modus: Registrierung geschlossen
  if (mode === 'register' && (isClosed || !info.registration)) {
    mount(
      h(
        'div',
        { class: 'auth' },
        headerRow,
        h(
          'div',
          { class: 'card stack' },
          h('h1', {}, '⛔ Registrierung geschlossen'),
          h(
            'div',
            { class: 'compat-box warn' },
            h(
              'p',
              { style: 'margin:0;' },
              'Die Registrierung neuer Benutzerkonten ist derzeit geschlossen. Neue Einladungen oder Registrierungen sind aktuell nicht möglich.'
            )
          ),
          h(
            'button',
            {
              class: 'btn',
              type: 'button',
              onclick: () => {
                location.hash = '#/';
                showAuth('login');
              },
            },
            'Zurück zur Anmeldung'
          )
        )
      )
    );
    return;
  }

  // Modus: Passwort vergessen
  if (mode === 'forgot') {
    const identInput = h('input', {
      id: 'ident',
      placeholder: 'E-Mail-Adresse oder Benutzername',
      required: true,
    });
    const successMsg = h('div', { class: 'compat-box info', style: 'display:none' });
    const form = h(
      'form',
      {
        class: 'card stack',
        onsubmit: async (e) => {
          e.preventDefault();
          err.textContent = '';
          try {
            const res = await api('/forgot-password', {
              method: 'POST',
              body: { identifier: identInput.value.trim() },
            });
            successMsg.textContent = res.message || 'E-Mail zum Zurücksetzen wurde versendet.';
            successMsg.style.display = 'block';
            identInput.value = '';
          } catch (ex) {
            err.textContent = ex.message;
          }
        },
      },
      h('h1', {}, 'Passwort zurücksetzen'),
      h(
        'p',
        { class: 'muted', style: 'margin:0 0 .5rem;' },
        'Gib deine E-Mail-Adresse oder deinen Benutzernamen ein. Wir senden dir einen Link, mit dem du ein neues Passwort festlegen kannst.'
      ),
      h('div', { class: 'field' }, h('label', { for: 'ident' }, 'E-Mail oder Benutzername'), identInput),
      err,
      successMsg,
      h('button', { class: 'btn', type: 'submit' }, 'Link anfordern'),
      h(
        'button',
        {
          class: 'btn ghost',
          type: 'button',
          onclick: () => {
            location.hash = '#/';
            showAuth('login');
          },
        },
        'Zurück zur Anmeldung'
      )
    );
    mount(h('div', { class: 'auth' }, headerRow, form));
    identInput.focus();
    return;
  }

  // Modus: Login oder Register
  const user = h('input', { id: 'u', autocomplete: 'username', required: true });
  const mail =
    mode === 'register'
      ? h('input', {
          id: 'e',
          type: 'email',
          autocomplete: 'email',
          required: true,
          value: options.email || '',
        })
      : null;
  const pass = h('input', {
    id: 'p',
    type: 'password',
    autocomplete: mode === 'login' ? 'current-password' : 'new-password',
    required: true,
    minlength: mode === 'login' ? null : '8',
  });
  const inviteInput =
    mode === 'register'
      ? h('input', {
          id: 'inv',
          value: options.inviteCode || '',
          placeholder: isInviteOnly ? 'z. B. AQU-9F2A-88CD' : 'Einladungscode (optional)',
          required: isInviteOnly,
        })
      : null;

  const resendBox = h('div', { style: 'display:none; margin-top:.5rem;' });

  const form = h(
    'form',
    {
      class: 'card stack',
      onsubmit: async (e) => {
        e.preventDefault();
        err.textContent = '';
        resendBox.style.display = 'none';
        try {
          const body = { username: user.value, password: pass.value };
          if (mode === 'register') {
            if (mail && mail.value.trim()) body.email = mail.value.trim();
            if (inviteInput && inviteInput.value.trim()) body.inviteCode = inviteInput.value.trim();
          }
          const res = await api(mode === 'login' ? '/login' : '/register', { method: 'POST', body });
          if (mode === 'register' && res.needsVerification) {
            mount(
              h(
                'div',
                { class: 'auth' },
                headerRow,
                h(
                  'div',
                  { class: 'card stack' },
                  h('h1', {}, '🎉 Fast geschafft!'),
                  h(
                    'div',
                    { class: 'compat-box info' },
                    h('p', { style: 'margin:0 0 .5rem;' }, h('strong', {}, 'Bestätigungs-E-Mail versendet!')),
                    h(
                      'p',
                      { style: 'margin:0;' },
                      `Wir haben einen Aktivierungslink an `,
                      h('strong', {}, res.email || mail.value),
                      ` gesendet. Bitte öffne den Link in der E-Mail, um dein Konto zu bestätigen.`
                    )
                  ),
                  h(
                    'p',
                    { class: 'muted' },
                    'Prüfe bitte auch deinen Spam-Ordner, falls die Nachricht nicht innerhalb weniger Minuten ankommt.'
                  ),
                  h(
                    'button',
                    {
                      class: 'btn',
                      type: 'button',
                      onclick: () => {
                        location.hash = '#/';
                        showAuth('login');
                      },
                    },
                    'Zur Anmeldung'
                  )
                )
              )
            );
            return;
          }
          await start();
        } catch (ex) {
          err.textContent = ex.message;
          if (ex.message && ex.message.includes('bestätige zuerst deine E-Mail')) {
            const usernameVal = user.value.trim();
            resendBox.replaceChildren(
              h(
                'button',
                {
                  class: 'btn small ghost',
                  type: 'button',
                  onclick: async () => {
                    try {
                      const r = await api('/resend-verification', {
                        method: 'POST',
                        body: { identifier: usernameVal },
                      });
                      toast(r.message || 'Bestätigungs-E-Mail versendet.');
                    } catch (errResend) {
                      toast(errResend.message);
                    }
                  },
                },
                '📨 Bestätigungs-Link erneut senden'
              )
            );
            resendBox.style.display = 'block';
          }
        }
      },
    },
    h(
      'h1',
      {},
      mode === 'login'
        ? 'Anmelden'
        : isInviteOnly
        ? 'Einladung einlösen & Konto erstellen'
        : 'Konto erstellen'
    ),
    isInviteOnly && mode === 'register'
      ? h(
          'div',
          { class: 'compat-box info', style: 'margin-bottom:.5rem;' },
          h(
            'p',
            { style: 'margin:0; font-size:.9rem;' },
            '🔑 Für die Registrierung ist ein gültiger Einladungscode erforderlich.'
          )
        )
      : null,
    h('div', { class: 'field' }, h('label', { for: 'u' }, 'Benutzername'), user),
    mail
      ? h(
          'div',
          { class: 'field' },
          h('label', { for: 'e' }, 'E-Mail-Adresse (für Verifizierung & Passwort-Reset)'),
          mail
        )
      : null,
    inviteInput
      ? h(
          'div',
          { class: 'field' },
          h(
            'label',
            { for: 'inv' },
            isInviteOnly ? 'Einladungscode / Registrierungscode' : 'Einladungscode (optional)'
          ),
          inviteInput
        )
      : null,
    h(
      'div',
      { class: 'field' },
      h(
        'div',
        { class: 'row between', style: 'align-items:baseline;' },
        h('label', { for: 'p' }, mode === 'login' ? 'Passwort' : 'Passwort (mindestens 8 Zeichen)'),
        mode === 'login'
          ? h(
              'a',
              {
                href: '#/forgot-password',
                style: 'font-size:.85rem; color:var(--primary);',
                onclick: (e) => {
                  e.preventDefault();
                  location.hash = '#/forgot-password';
                  showAuth('forgot');
                },
              },
              'Passwort vergessen?'
            )
          : null
      ),
      pass
    ),
    err,
    resendBox,
    h('button', { class: 'btn', type: 'submit' }, mode === 'login' ? 'Anmelden' : 'Konto erstellen'),
    mode === 'login' && oidcBtn ? [h('p', { class: 'muted' }, 'oder'), oidcBtn] : null,
    registration &&
      h(
        'button',
        {
          class: 'btn ghost',
          type: 'button',
          onclick: () => {
            if (mode === 'login') {
              location.hash = '#/register';
              showAuth('register');
            } else {
              location.hash = '#/';
              showAuth('login');
            }
          },
        },
        mode === 'login'
          ? isInviteOnly
            ? 'Einladung einlösen / Registrieren'
            : 'Neues Konto erstellen'
          : 'Ich habe schon ein Konto'
      )
  );
  mount(h('div', { class: 'auth' }, headerRow, form));
  user.focus();
}

export async function viewVerifyEmail(token) {
  $topbar.hidden = true;
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
          h('h1', {}, '❌ Ungültiger Link'),
          h('p', { class: 'error' }, 'Es wurde kein Bestätigungstoken übergeben.'),
          h('a', { class: 'btn', href: '#/' }, 'Zur Startseite')
        )
      )
    );
    return;
  }

  mount(
    h(
      'div',
      { class: 'auth' },
      headerRow,
      h(
        'div',
        { class: 'card stack' },
        h('h1', {}, 'E-Mail-Adresse bestätigen'),
        h('p', { class: 'muted' }, 'Einen Moment bitte, deine E-Mail-Adresse wird überprüft...')
      )
    )
  );

  try {
    const res = await api('/verify-email', { method: 'POST', body: { token } });
    mount(
      h(
        'div',
        { class: 'auth' },
        headerRow,
        h(
          'div',
          { class: 'card stack' },
          h('h1', {}, '✅ Erfolgreich bestätigt!'),
          h(
            'div',
            { class: 'compat-box ok' },
            h(
              'p',
              { style: 'margin:0;' },
              res.message || 'Deine E-Mail-Adresse wurde erfolgreich bestätigt. Dein Konto ist nun aktiv.'
            )
          ),
          h(
            'button',
            {
              class: 'btn',
              type: 'button',
              onclick: () => {
                location.hash = '#/';
                showAuth('login');
              },
            },
            'Jetzt anmelden'
          )
        )
      )
    );
  } catch (err) {
    const resendIdent = h('input', { placeholder: 'E-Mail oder Benutzername' });
    const resendStatus = h('p', { class: 'muted', style: 'display:none;' });
    mount(
      h(
        'div',
        { class: 'auth' },
        headerRow,
        h(
          'div',
          { class: 'card stack' },
          h('h1', {}, '❌ Bestätigung fehlgeschlagen'),
          h('p', { class: 'error' }, err.message),
          h(
            'div',
            { class: 'stack', style: 'margin-top:1rem; gap:.5rem;' },
            h('strong', {}, 'Neuen Bestätigungslink anfordern:'),
            resendIdent,
            resendStatus,
            h(
              'button',
              {
                class: 'btn small',
                type: 'button',
                onclick: async () => {
                  if (!resendIdent.value.trim()) return;
                  try {
                    const r = await api('/resend-verification', {
                      method: 'POST',
                      body: { identifier: resendIdent.value.trim() },
                    });
                    resendStatus.textContent = r.message || 'E-Mail versendet.';
                    resendStatus.style.display = 'block';
                  } catch (ex) {
                    resendStatus.textContent = ex.message;
                    resendStatus.style.display = 'block';
                  }
                },
              },
              'Link erneut anfordern'
            )
          ),
          h(
            'button',
            {
              class: 'btn ghost',
              type: 'button',
              style: 'margin-top:.5rem;',
              onclick: () => {
                location.hash = '#/';
                showAuth('login');
              },
            },
            'Zurück zur Anmeldung'
          )
        )
      )
    );
  }
}

export async function viewResetPassword(token) {
  $topbar.hidden = true;
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
          h('h1', {}, '❌ Ungültiger Link'),
          h('p', { class: 'error' }, 'Es wurde kein Token zum Zurücksetzen des Passworts übergeben.'),
          h('a', { class: 'btn', href: '#/' }, 'Zur Startseite')
        )
      )
    );
    return;
  }

  const p1 = h('input', {
    type: 'password',
    required: true,
    minlength: '8',
    placeholder: 'Mindestens 8 Zeichen',
  });
  const p2 = h('input', {
    type: 'password',
    required: true,
    minlength: '8',
    placeholder: 'Passwort wiederholen',
  });
  const err = h('p', { class: 'error', role: 'alert' });

  const form = h(
    'form',
    {
      class: 'card stack',
      onsubmit: async (e) => {
        e.preventDefault();
        err.textContent = '';
        if (p1.value !== p2.value) {
          err.textContent = 'Die eingegebenen Passwörter stimmen nicht überein.';
          return;
        }
        try {
          const res = await api('/reset-password', {
            method: 'POST',
            body: { token, password: p1.value },
          });
          mount(
            h(
              'div',
              { class: 'auth' },
              headerRow,
              h(
                'div',
                { class: 'card stack' },
                h('h1', {}, '🎉 Passwort geändert!'),
                h(
                  'div',
                  { class: 'compat-box ok' },
                  h(
                    'p',
                    { style: 'margin:0;' },
                    res.message ||
                      'Dein Passwort wurde erfolgreich aktualisiert. Du kannst dich jetzt damit anmelden.'
                  )
                ),
                h(
                  'button',
                  {
                    class: 'btn',
                    type: 'button',
                    onclick: () => {
                      location.hash = '#/';
                      showAuth('login');
                    },
                  },
                  'Jetzt anmelden'
                )
              )
            )
          );
        } catch (ex) {
          err.textContent = ex.message;
        }
      },
    },
    h('h1', {}, 'Neues Passwort festlegen'),
    h('p', { class: 'muted', style: 'margin:0 0 .5rem;' }, 'Gib bitte dein neues Passwort ein.'),
    h('div', { class: 'field' }, h('label', {}, 'Neues Passwort'), p1),
    h('div', { class: 'field' }, h('label', {}, 'Passwort wiederholen'), p2),
    err,
    h('button', { class: 'btn', type: 'submit' }, 'Passwort speichern'),
    h(
      'button',
      {
        class: 'btn ghost',
        type: 'button',
        onclick: () => {
          location.hash = '#/';
          showAuth('login');
        },
      },
      'Abbrechen'
    )
  );

  mount(h('div', { class: 'auth' }, headerRow, form));
  p1.focus();
}

export async function viewDeleteAccount(token) {
  $topbar.hidden = true;
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
          h('h1', {}, '❌ Ungültiger Link'),
          h(
            'p',
            { class: 'error' },
            'Es wurde kein Bestätigungstoken zum Löschen des Kontos übergeben.'
          ),
          h('a', { class: 'btn', href: '#/' }, 'Zur Startseite')
        )
      )
    );
    return;
  }

  const err = h('p', { class: 'error', role: 'alert' });

  const confirmCard = h(
    'div',
    { class: 'card stack' },
    h('h1', { style: 'color: var(--coral);' }, '🗑️ Konto endgültig löschen'),
    h(
      'div',
      { class: 'compat-box danger' },
      h('p', { style: 'margin:0; font-weight:600;' }, '⚠️ Letzte Warnung:'),
      h(
        'p',
        { style: 'margin:.4rem 0 0;' },
        'Wenn du jetzt auf „Konto jetzt endgültig löschen“ klickst, werden dein Benutzerkonto sowie alle deine Aquarien, Fotos, Messwerte, Alarme, Pflegemaßnahmen und Freigaben unwiderruflich und sofort gelöscht.'
      )
    ),
    err,
    h(
      'div',
      { class: 'row between', style: 'margin-top: .5rem;' },
      h('a', { class: 'btn ghost', href: '#/' }, 'Abbrechen'),
      h(
        'button',
        {
          class: 'btn danger',
          type: 'button',
          onclick: async () => {
            err.textContent = '';
            try {
              const res = await api('/confirm-delete-account', {
                method: 'POST',
                body: { token },
              });
              setMe(null);
              $topbar.hidden = true;
              mount(
                h(
                  'div',
                  { class: 'auth' },
                  headerRow,
                  h(
                    'div',
                    { class: 'card stack' },
                    h('h1', {}, '👋 Konto erfolgreich gelöscht'),
                    h(
                      'div',
                      { class: 'compat-box ok' },
                      h(
                        'p',
                        { style: 'margin:0;' },
                        res.message || 'Dein Benutzerkonto wurde vollständig gelöscht.'
                      )
                    ),
                    h(
                      'button',
                      {
                        class: 'btn',
                        type: 'button',
                        onclick: () => {
                          location.hash = '#/';
                          showAuth('login');
                        },
                      },
                      'Zur Startseite'
                    )
                  )
                )
              );
            } catch (ex) {
              err.textContent = ex.message;
            }
          },
        },
        'Konto jetzt endgültig löschen'
      )
    )
  );

  mount(h('div', { class: 'auth' }, headerRow, confirmCard));
}

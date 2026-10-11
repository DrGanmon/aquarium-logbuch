'use strict';

import { h, mount, toast } from '../dom.js';
import { api } from '../api.js';
import { $topbar, setMe } from '../state.js';
import { getThemeSetting, toggleTheme } from '../theme.js';
import { start } from '../router.js';
import { t, getLanguage, setLanguage } from '../i18n.js';

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
    ? h('a', { class: 'btn', href: 'auth/login' }, t('auth.oidcButton', { provider: info.oidcName || 'Pocket ID' }))
    : null;

  const currentTheme = getThemeSetting();
  const themeAuthIcon = currentTheme === 'system' ? '🌓' : currentTheme === 'dark' ? '🌙' : '☀️';
  const themeAuthLabel =
    currentTheme === 'system'
      ? t('common.themeSystem')
      : currentTheme === 'dark'
      ? t('common.themeDark')
      : t('common.themeLight');

  const themeAuthBtn = h(
    'button',
    {
      class: 'btn small ghost',
      type: 'button',
      title: `${t('common.theme')}: ${themeAuthLabel}`,
      onclick: () => {
        toggleTheme();
        const nextTheme = getThemeSetting();
        const nextLabel =
          nextTheme === 'system'
            ? t('common.themeSystem')
            : nextTheme === 'dark'
            ? t('common.themeDark')
            : t('common.themeLight');
        const nextIcon = nextTheme === 'system' ? '🌓' : nextTheme === 'dark' ? '🌙' : '☀️';
        themeAuthBtn.textContent = `${nextIcon} ${nextLabel}`;
      },
    },
    `${themeAuthIcon} ${themeAuthLabel}`
  );

  const langAuthBtn = h(
    'button',
    {
      class: 'btn small ghost',
      type: 'button',
      title: t('nav.langToggle'),
      onclick: () => {
        const nextLang = getLanguage() === 'de' ? 'en' : 'de';
        setLanguage(nextLang);
        showAuth(mode, options);
      },
    },
    getLanguage() === 'de' ? '🌐 DE' : '🌐 EN'
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
      h('p', { class: 'muted', style: 'margin:0; font-weight:600;' }, t('common.appName'))
    ),
    h('div', { class: 'row', style: 'gap:.3rem;' }, langAuthBtn, themeAuthBtn)
  );

  if (!info.localLogin && mode !== 'forgot') {
    mount(
      h(
        'div',
        { class: 'auth' },
        headerRow,
        h('div', { class: 'card stack' }, h('h1', {}, t('auth.loginTitle')), err, oidcBtn)
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
          h('h1', {}, `⛔ ${t('admin.modeClosed')}`),
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
            t('auth.backToLogin')
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
      placeholder: `${t('auth.email')} / ${t('auth.username')}`,
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
            successMsg.textContent = res.message || t('auth.emailSent');
            successMsg.style.display = 'block';
            identInput.value = '';
          } catch (ex) {
            err.textContent = ex.message;
          }
        },
      },
      h('h1', {}, t('auth.forgotPasswordTitle')),
      h('p', { class: 'muted', style: 'margin:0 0 .5rem;' }, t('auth.forgotPasswordDesc')),
      h('div', { class: 'field' }, h('label', { for: 'ident' }, `${t('auth.email')} / ${t('auth.username')}`), identInput),
      err,
      successMsg,
      h('button', { class: 'btn', type: 'submit' }, t('auth.sendResetLink')),
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
        t('auth.backToLogin')
      )
    );
    mount(h('div', { class: 'auth' }, headerRow, form));
    identInput.focus();
    return;
  }

  // Modus: Login oder Register
  const user = h('input', {
    id: 'u',
    autocomplete: 'username',
    required: true,
    placeholder: t('auth.usernamePlaceholder'),
  });
  const mail =
    mode === 'register'
      ? h('input', {
          id: 'e',
          type: 'email',
          autocomplete: 'email',
          required: true,
          value: options.email || '',
          placeholder: t('auth.emailPlaceholder'),
        })
      : null;
  const pass = h('input', {
    id: 'p',
    type: 'password',
    autocomplete: mode === 'login' ? 'current-password' : 'new-password',
    required: true,
    minlength: mode === 'login' ? null : '8',
    placeholder: mode === 'login' ? '' : t('auth.passwordPlaceholder'),
  });
  const inviteInput =
    mode === 'register'
      ? h('input', {
          id: 'inv',
          value: options.inviteCode || '',
          placeholder: isInviteOnly ? t('auth.inviteCodePlaceholder') : `${t('auth.inviteCode')} (${t('common.notesOptional')})`,
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
                  h('h1', {}, '🎉 ' + t('auth.verifyEmailTitle')),
                  h(
                    'div',
                    { class: 'compat-box info' },
                    h('p', { style: 'margin:0 0 .5rem;' }, h('strong', {}, t('auth.verifyEmailTitle'))),
                    h(
                      'p',
                      { style: 'margin:0;' },
                      `${t('auth.emailSent')} `,
                      h('strong', {}, res.email || mail.value)
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
                    t('auth.backToLogin')
                  )
                )
              )
            );
            return;
          }
          await start();
        } catch (ex) {
          err.textContent = ex.message;
          if (ex.message && (ex.message.includes('bestätige zuerst deine E-Mail') || ex.message.includes('confirm your email'))) {
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
                      toast(r.message || t('auth.emailSent'));
                    } catch (errResend) {
                      toast(errResend.message);
                    }
                  },
                },
                `📨 ${t('auth.resendVerifyEmail')}`
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
        ? t('auth.loginTitle')
        : t('auth.registerTitle')
    ),
    isInviteOnly && mode === 'register'
      ? h(
          'div',
          { class: 'compat-box info', style: 'margin-bottom:.5rem;' },
          h(
            'p',
            { style: 'margin:0; font-size:.9rem;' },
            `🔑 ${t('auth.inviteCodeHint')}`
          )
        )
      : null,
    h('div', { class: 'field' }, h('label', { for: 'u' }, t('auth.username')), user),
    mail
      ? h(
          'div',
          { class: 'field' },
          h('label', { for: 'e' }, t('auth.email')),
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
            isInviteOnly ? t('auth.inviteCode') : `${t('auth.inviteCode')} (${t('common.notesOptional')})`
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
        h('label', { for: 'p' }, mode === 'login' ? t('auth.password') : `${t('auth.password')} (${t('auth.passwordPlaceholder')})`),
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
              t('auth.forgotPasswordLink')
            )
          : null
      ),
      pass
    ),
    err,
    resendBox,
    h('button', { class: 'btn', type: 'submit' }, mode === 'login' ? t('auth.loginBtn') : t('auth.registerBtn')),
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
          ? t('auth.registerTitle')
          : t('auth.alreadyHaveAccount') + ' - ' + t('auth.loginBtn')
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
    h('p', { class: 'muted', style: 'margin:0' }, t('common.appName'))
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
          h('h1', {}, '❌ ' + t('common.error')),
          h('p', { class: 'error' }, 'Ungültiger Token.'),
          h('a', { class: 'btn', href: '#/' }, t('auth.backToLogin'))
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
        h('h1', {}, t('auth.verifyEmailTitle')),
        h('p', { class: 'muted' }, t('common.loading'))
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
          h('h1', {}, '✅ ' + t('auth.verifyEmailSuccess')),
          h(
            'div',
            { class: 'compat-box ok' },
            h(
              'p',
              { style: 'margin:0;' },
              res.message || t('auth.verifyEmailSuccess')
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
            t('auth.loginBtn')
          )
        )
      )
    );
  } catch (err) {
    const resendIdent = h('input', { placeholder: `${t('auth.email')} / ${t('auth.username')}` });
    const resendStatus = h('p', { class: 'muted', style: 'display:none;' });
    mount(
      h(
        'div',
        { class: 'auth' },
        headerRow,
        h(
          'div',
          { class: 'card stack' },
          h('h1', {}, '❌ ' + t('common.error')),
          h('p', { class: 'error' }, err.message),
          h(
            'div',
            { class: 'stack', style: 'margin-top:1rem; gap:.5rem;' },
            h('strong', {}, t('auth.resendVerifyEmail')),
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
                    resendStatus.textContent = r.message || t('auth.emailSent');
                    resendStatus.style.display = 'block';
                  } catch (ex) {
                    resendStatus.textContent = ex.message;
                    resendStatus.style.display = 'block';
                  }
                },
              },
              t('auth.sendResetLink')
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
            t('auth.backToLogin')
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
    h('p', { class: 'muted', style: 'margin:0' }, t('common.appName'))
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
          h('h1', {}, '❌ ' + t('common.error')),
          h('p', { class: 'error' }, 'Ungültiger Reset-Token.'),
          h('a', { class: 'btn', href: '#/' }, t('auth.backToLogin'))
        )
      )
    );
    return;
  }

  const p1 = h('input', {
    type: 'password',
    required: true,
    minlength: '8',
    placeholder: t('auth.passwordPlaceholder'),
  });
  const p2 = h('input', {
    type: 'password',
    required: true,
    minlength: '8',
    placeholder: t('auth.passwordRepeat'),
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
          err.textContent = 'Die Passwörter stimmen nicht überein.';
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
                h('h1', {}, '🎉 ' + t('auth.passwordChanged')),
                h(
                  'div',
                  { class: 'compat-box ok' },
                  h(
                    'p',
                    { style: 'margin:0;' },
                    res.message || t('auth.passwordChanged')
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
                  t('auth.loginBtn')
                )
              )
            )
          );
        } catch (ex) {
          err.textContent = ex.message;
        }
      },
    },
    h('h1', {}, t('auth.resetPasswordTitle')),
    h('p', { class: 'muted', style: 'margin:0 0 .5rem;' }, t('auth.resetPasswordDesc')),
    h('div', { class: 'field' }, h('label', {}, t('auth.newPassword')), p1),
    h('div', { class: 'field' }, h('label', {}, t('auth.passwordRepeat')), p2),
    err,
    h('button', { class: 'btn', type: 'submit' }, t('auth.resetPasswordBtn')),
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
      t('common.cancel')
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
    h('p', { class: 'muted', style: 'margin:0' }, t('common.appName'))
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
          h('h1', {}, '❌ ' + t('common.error')),
          h('p', { class: 'error' }, 'Ungültiger Löschtoken.'),
          h('a', { class: 'btn', href: '#/' }, t('auth.backToLogin'))
        )
      )
    );
    return;
  }

  const err = h('p', { class: 'error', role: 'alert' });

  const confirmCard = h(
    'div',
    { class: 'card stack' },
    h('h1', { style: 'color: var(--coral);' }, `🗑️ ${t('auth.deleteAccountTitle')}`),
    h(
      'div',
      { class: 'compat-box danger' },
      h('p', { style: 'margin:0; font-weight:600;' }, '⚠️ Letzte Warnung / Final Warning:'),
      h(
        'p',
        { style: 'margin:.4rem 0 0;' },
        t('auth.deleteAccountConfirm')
      )
    ),
    err,
    h(
      'div',
      { class: 'row between', style: 'margin-top: .5rem;' },
      h('a', { class: 'btn ghost', href: '#/' }, t('common.cancel')),
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
                    h('h1', {}, `👋 ${t('auth.accountDeleted')}`),
                    h(
                      'div',
                      { class: 'compat-box ok' },
                      h(
                        'p',
                        { style: 'margin:0;' },
                        res.message || t('auth.accountDeleted')
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
                      t('auth.backToLogin')
                    )
                  )
                )
              );
            } catch (ex) {
              err.textContent = ex.message;
            }
          },
        },
        t('auth.deleteAccountBtn')
      )
    )
  );

  mount(h('div', { class: 'auth' }, headerRow, confirmCard));
}

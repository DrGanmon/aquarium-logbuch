'use strict';

import { h, mount, toast } from '../dom.js';
import { api } from '../api.js';
import { ME } from '../state.js';
import { fmtDate } from '../utils.js';

export async function viewAdmin() {
  const [users, logData, backupData, mailData, regData, legalData] = await Promise.all([
    api('/admin/users'),
    api('/admin/logs').catch(() => ({ logs: [], logPath: 'data/aquarium.log' })),
    api('/admin/backups').catch(() => ({
      backups: [],
      config: { enabled: false, intervalHours: 24, retentionCount: 10, includeFiles: true },
    })),
    api('/admin/mail').catch(() => ({
      config: {
        enabled: false,
        host: '',
        port: 587,
        secure: false,
        requireTls: false,
        from: '',
        user: '',
        rateLimitMs: 500,
        hasPassword: false,
      },
      queue: { queueLength: 0, sentCount: 0, failedCount: 0 },
    })),
    api('/admin/registration').catch(() => ({
      config: { mode: 'open', userCodeMaxDays: 7, mailInviteMaxDays: 14 },
      invitations: [],
    })),
    api('/admin/legal-config').catch(() => ({
      config: { contactEmail: '', imprintEmail: '' },
    })),
  ]);

  const backups = backupData.backups || [];
  const backupConfig = backupData.config || {
    enabled: false,
    intervalHours: 24,
    retentionCount: 10,
    includeFiles: true,
  };
  const mailConfig = mailData.config || {
    enabled: false,
    host: '',
    port: 587,
    secure: false,
    requireTls: false,
    from: '',
    user: '',
    rateLimitMs: 500,
    hasPassword: false,
  };
  const mailQueue = mailData.queue || {
    queueLength: 0,
    sentCount: 0,
    failedCount: 0,
    lastSentAt: null,
    lastError: null,
  };
  const regConfig = regData.config || { mode: 'open', userCodeMaxDays: 7, mailInviteMaxDays: 14 };
  const adminInvitations = regData.invitations || [];

  const rows = users.map((u) => {
    const isSelf = u.id === ME?.id;
    const authTypes = [];
    if (u.hasPassword) authTypes.push('Passwort');
    if (u.hasOidc) authTypes.push(`Pocket ID${u.oidcSub ? ` (${u.oidcSub})` : ''}`);
    if (!authTypes.length) authTypes.push('–');

    return h(
      'tr',
      {},
      h('td', {}, h('strong', {}, u.username), isSelf ? h('span', { class: 'muted' }, ' (Du)') : null),
      h('td', {}, u.email || h('span', { class: 'muted' }, '–')),
      h(
        'td',
        {},
        u.emailVerified
          ? h('span', { class: 'chip ok' }, '✓ Verifiziert')
          : h('span', { class: 'chip warn' }, 'Unbestätigt')
      ),
      h('td', {}, authTypes.join(' / ')),
      h('td', {}, String(u.aquariumCount)),
      h(
        'td',
        {},
        u.isAdmin ? h('span', { class: 'chip ok' }, 'Admin') : h('span', { class: 'chip none' }, 'Benutzer')
      ),
      h('td', {}, fmtDate(u.createdAt)),
      h(
        'td',
        {},
        h(
          'div',
          { class: 'row', style: 'gap:.35rem' },
          h(
            'button',
            { class: 'btn small ghost', type: 'button', onclick: () => adminUserDialog(u) },
            'Bearbeiten'
          ),
          !isSelf
            ? h(
                'button',
                {
                  class: 'btn small danger',
                  type: 'button',
                  onclick: async () => {
                    if (
                      !confirm(
                        `Benutzer „${u.username}“ mit allen zugehörigen Aquarien und Messwerten endgültig löschen?`
                      )
                    )
                      return;
                    try {
                      await api(`/admin/users/${u.id}`, { method: 'DELETE' });
                      toast(`Benutzer „${u.username}“ gelöscht.`);
                      await viewAdmin();
                    } catch (ex) {
                      toast(ex.message);
                    }
                  },
                },
                'Löschen'
              )
            : null
        )
      )
    );
  });

  /* ---------- Registrierungs- & Einladungs-Verwaltung (Admin) ---------- */
  const regErr = h('p', { class: 'error', role: 'alert' });

  const selMode = h(
    'select',
    { style: 'max-width:340px;' },
    h(
      'option',
      { value: 'open', selected: regConfig.mode === 'open' },
      '🟢 Offen (Jeder kann sich einfach registrieren)'
    ),
    h(
      'option',
      { value: 'invite_admin', selected: regConfig.mode === 'invite_admin' },
      '🔒 Einladung (Admin) (Nur Admins können einladen)'
    ),
    h(
      'option',
      { value: 'invite_open', selected: regConfig.mode === 'invite_open' },
      '👥 Einladung (Offen) (Jeder registrierte Nutzer kann einladen)'
    ),
    h(
      'option',
      { value: 'closed', selected: regConfig.mode === 'closed' },
      '⛔ Geschlossen (Keine neuen Einladungen/Registrierungen)'
    )
  );

  const inpUserCodeMaxDays = h('input', {
    type: 'number',
    min: '1',
    max: '365',
    value: String(regConfig.userCodeMaxDays || 7),
    style: 'max-width:110px;',
  });

  const btnSaveRegConfig = h(
    'button',
    {
      class: 'btn small',
      type: 'button',
      onclick: async () => {
        regErr.textContent = '';
        try {
          const body = {
            mode: selMode.value,
            userCodeMaxDays: Number(inpUserCodeMaxDays.value) || 7,
            mailInviteMaxDays: 14,
          };
          await api('/admin/registration/config', { method: 'PUT', body });
          toast('Registrierungs-Einstellungen erfolgreich gespeichert.');
          await viewAdmin();
        } catch (ex) {
          regErr.textContent = ex.message;
        }
      },
    },
    'Registrierungs-Einstellungen speichern'
  );

  // Admin-Einladung erstellen
  const selAdminInvType = h(
    'select',
    { style: 'max-width:140px;' },
    h('option', { value: 'code', selected: true }, 'Code erstellen'),
    h('option', { value: 'mail' }, 'Per E-Mail versenden')
  );
  const inpAdminCustomCode = h('input', {
    placeholder: 'Code (leer für Zufall)',
    maxlength: '40',
    style: 'max-width:200px;',
  });
  const inpAdminMailTo = h('input', {
    type: 'email',
    placeholder: 'empfaenger@example.com',
    maxlength: '120',
    style: 'max-width:240px; display:none;',
  });
  const inpAdminMaxUses = h('input', {
    type: 'number',
    min: '0',
    max: '10000',
    value: '1',
    placeholder: '0 = unbegrenzt',
    style: 'max-width:110px;',
  });
  const inpAdminDays = h('input', {
    type: 'number',
    min: '1',
    max: '365',
    value: '14',
    style: 'max-width:90px;',
  });
  const inpAdminNote = h('input', {
    placeholder: 'Optionale Notiz',
    maxlength: '200',
    style: 'max-width:220px;',
  });

  selAdminInvType.addEventListener('change', () => {
    const isMail = selAdminInvType.value === 'mail';
    inpAdminMailTo.style.display = isMail ? '' : 'none';
    inpAdminCustomCode.style.display = isMail ? 'none' : '';
    inpAdminMaxUses.style.display = isMail ? 'none' : '';
    if (isMail) {
      inpAdminDays.value = '14';
      inpAdminDays.max = '14';
    } else {
      inpAdminDays.max = '365';
    }
  });

  const btnAdminCreateInv = h(
    'button',
    {
      class: 'btn small',
      type: 'button',
      onclick: async () => {
        regErr.textContent = '';
        try {
          const isMail = selAdminInvType.value === 'mail';
          const body = {
            type: selAdminInvType.value,
            code:
              !isMail && inpAdminCustomCode.value.trim()
                ? inpAdminCustomCode.value.trim()
                : undefined,
            email: isMail ? inpAdminMailTo.value.trim() : undefined,
            maxUses: isMail ? 1 : Number(inpAdminMaxUses.value) || 0,
            days: Number(inpAdminDays.value) || 14,
            note: inpAdminNote.value.trim() || undefined,
          };
          const res = await api('/admin/invitations', { method: 'POST', body });
          toast(res.message || 'Einladung erfolgreich erstellt.');
          inpAdminCustomCode.value = '';
          inpAdminMailTo.value = '';
          inpAdminNote.value = '';
          await viewAdmin();
        } catch (ex) {
          regErr.textContent = ex.message;
        }
      },
    },
    '➕ Einladung erstellen'
  );

  const baseUrl = location.origin + location.pathname;
  const adminInvRows = adminInvitations.map((inv) => {
    let statusBadge = h('span', { class: 'chip ok' }, '✓ Aktiv');
    if (inv.status === 'exhausted') statusBadge = h('span', { class: 'chip none' }, 'Eingelöst');
    else if (inv.status === 'expired') statusBadge = h('span', { class: 'chip warn' }, 'Abgelaufen');

    const usesText =
      inv.maxUses === 0 || inv.maxUses == null
        ? `${inv.usedCount} / ∞`
        : `${inv.usedCount} / ${inv.maxUses}`;
    const inviteLink = `${baseUrl}#/register?invite=${encodeURIComponent(inv.code)}${
      inv.email ? `&email=${encodeURIComponent(inv.email)}` : ''
    }`;

    const btnCopy = h(
      'button',
      {
        class: 'btn small ghost',
        type: 'button',
        title: 'Einladungslink kopieren',
        onclick: async () => {
          try {
            await navigator.clipboard.writeText(inviteLink);
            toast('Einladungslink kopiert!');
          } catch (e) {
            prompt('Einladungslink kopieren:', inviteLink);
          }
        },
      },
      '📋 Kopieren'
    );

    const btnDel = h(
      'button',
      {
        class: 'btn small danger',
        type: 'button',
        onclick: async () => {
          if (!confirm(`Einladung „${inv.code}“ wirklich löschen?`)) return;
          try {
            await api(`/admin/invitations/${inv.id}`, { method: 'DELETE' });
            toast('Einladung gelöscht.');
            await viewAdmin();
          } catch (ex) {
            toast(ex.message);
          }
        },
      },
      'Löschen'
    );

    return h(
      'tr',
      {},
      h(
        'td',
        {},
        h('strong', { style: 'font-family:monospace; font-size:1.05rem;' }, inv.code),
        inv.email
          ? h('div', { class: 'muted', style: 'font-size:.82rem;' }, `E-Mail: ${inv.email}`)
          : null
      ),
      h('td', {}, inv.type === 'mail' ? 'E-Mail' : 'Code'),
      h('td', {}, inv.createdByUsername || 'System'),
      h('td', {}, usesText),
      h('td', {}, fmtDate(inv.expiresAt)),
      h('td', {}, statusBadge),
      h('td', {}, inv.note || h('span', { class: 'muted' }, '–')),
      h('td', {}, h('div', { class: 'row', style: 'gap:.35rem;' }, btnCopy, btnDel))
    );
  });

  const registrationCard = h(
    'div',
    { class: 'card stack' },
    h(
      'div',
      { class: 'row between', style: 'align-items:center;' },
      h(
        'div',
        {},
        h('h2', { style: 'margin:0' }, '🔑 Registrierungs-Modus & Einladungen'),
        h(
          'span',
          { class: 'muted' },
          'Steuere, wer neue Konten erstellen oder Einladungen verschicken darf.'
        )
      ),
      regConfig.mode === 'open'
        ? h('span', { class: 'chip ok' }, '🟢 Offen')
        : regConfig.mode === 'invite_admin'
        ? h('span', { class: 'chip info' }, '🔒 Einladung (Admin)')
        : regConfig.mode === 'invite_open'
        ? h('span', { class: 'chip ok' }, '👥 Einladung (Offen)')
        : h('span', { class: 'chip warn' }, '⛔ Geschlossen')
    ),
    regErr,
    h(
      'div',
      {
        class: 'card stack',
        style:
          'background: var(--paper); border: 1px solid var(--line); padding: 1rem; gap: .75rem;',
      },
      h('h3', { style: 'margin:0;' }, 'Modus-Auswahl & Code-Gültigkeit'),
      h(
        'div',
        { class: 'row', style: 'gap: 1rem; flex-wrap: wrap; align-items: center;' },
        h(
          'label',
          { class: 'row', style: 'gap:.4rem;' },
          h('span', { class: 'muted' }, 'Registrierungs-Modus:'),
          selMode
        ),
        h(
          'label',
          { class: 'row', style: 'gap:.4rem;' },
          h('span', { class: 'muted' }, 'Nutzer-Code Gültigkeit max. (Tage):'),
          inpUserCodeMaxDays
        ),
        btnSaveRegConfig
      ),
      h(
        'div',
        { class: 'muted', style: 'font-size:.82rem; line-height:1.4;' },
        '• 🟢 Offen: Jeder Besucher kann sich direkt registrieren. ',
        '• 🔒 Einladung (Admin): Registrierung nur mit Code/Mail-Einladung von Administratoren. ',
        '• 👥 Einladung (Offen): Jeder registrierte Nutzer kann im Profil Einladungen erstellen. ',
        '• ⛔ Geschlossen: Registrierung und Einladungen komplett deaktiviert.'
      )
    ),
    h(
      'div',
      {
        class: 'card stack',
        style:
          'background: var(--paper); border: 1px solid var(--line); padding: 1rem; gap: .75rem;',
      },
      h('h3', { style: 'margin:0;' }, '➕ Neue Einladung erstellen / versenden'),
      h(
        'div',
        { class: 'row', style: 'gap: .8rem; flex-wrap: wrap; align-items: center;' },
        selAdminInvType,
        inpAdminCustomCode,
        inpAdminMailTo,
        inpAdminMaxUses,
        h('label', { class: 'row', style: 'gap:.3rem;' }, h('span', { class: 'muted' }, 'Tage:'), inpAdminDays),
        inpAdminNote,
        btnAdminCreateInv
      )
    ),
    h('h3', { style: 'margin:.5rem 0 0 0;' }, `Alle erstellten Einladungen (${adminInvitations.length})`),
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
            h('th', {}, 'Code / Empfänger'),
            h('th', {}, 'Typ'),
            h('th', {}, 'Erstellt von'),
            h('th', {}, 'Verwendung'),
            h('th', {}, 'Gültig bis'),
            h('th', {}, 'Status'),
            h('th', {}, 'Notiz'),
            h('th', {}, 'Aktionen')
          )
        ),
        h(
          'tbody',
          {},
          adminInvRows.length
            ? adminInvRows
            : h(
                'tr',
                {},
                h(
                  'td',
                  { colspan: '8', class: 'muted', style: 'text-align:center; padding:1.2rem;' },
                  'Keine Einladungen vorhanden.'
                )
              )
        )
      )
    )
  );

  /* ---------- Mail / SMTP UI Komponenten ---------- */
  const chkMailEnabled = h('input', {
    type: 'checkbox',
    checked: !!mailConfig.enabled,
    id: 'chk-mail-enabled',
  });
  const inpMailHost = h('input', {
    value: mailConfig.host || '',
    placeholder: 'z. B. smtp.example.com',
    style: 'max-width:240px;',
  });
  const inpMailPort = h('input', {
    type: 'number',
    value: String(mailConfig.port || 587),
    style: 'max-width:90px;',
  });

  const encInitial = mailConfig.secure ? 'ssl' : mailConfig.ignoreTls ? 'none' : 'starttls';
  const selMailEnc = h(
    'select',
    { style: 'max-width:180px;' },
    h('option', { value: 'starttls', selected: encInitial === 'starttls' }, 'STARTTLS (Standard / 587)'),
    h('option', { value: 'ssl', selected: encInitial === 'ssl' }, 'SSL / TLS direkt (465)'),
    h('option', { value: 'none', selected: encInitial === 'none' }, 'Keine / Unverschlüsselt (25/1025)')
  );

  const inpMailUser = h('input', {
    value: mailConfig.user || '',
    placeholder: 'SMTP-Benutzername',
    style: 'max-width:200px;',
  });
  const inpMailPass = h('input', {
    type: 'password',
    autocomplete: 'new-password',
    placeholder: mailConfig.hasPassword ? '•••••••• (unverändert)' : 'SMTP-Passwort',
    style: 'max-width:200px;',
  });
  const inpMailFrom = h('input', {
    value: mailConfig.from || 'Aquarium-Logbuch <noreply@aquarium.local>',
    placeholder: 'Absenderadresse',
    style: 'max-width:280px;',
  });
  const inpMailRateLimit = h('input', {
    type: 'number',
    min: '100',
    max: '60000',
    step: '100',
    value: String(mailConfig.rateLimitMs || 500),
    style: 'max-width:100px;',
  });

  const mailErr = h('p', { class: 'error', role: 'alert' });

  const btnSaveMailConfig = h(
    'button',
    {
      class: 'btn small',
      type: 'button',
      onclick: async () => {
        mailErr.textContent = '';
        try {
          const encVal = selMailEnc.value;
          const body = {
            enabled: chkMailEnabled.checked,
            host: inpMailHost.value.trim(),
            port: Number(inpMailPort.value) || 587,
            secure: encVal === 'ssl',
            requireTls: encVal === 'starttls',
            ignoreTls: encVal === 'none',
            user: inpMailUser.value.trim(),
            from: inpMailFrom.value.trim(),
            rateLimitMs: Number(inpMailRateLimit.value) || 500,
          };
          if (inpMailPass.value) {
            body.pass = inpMailPass.value;
          }
          await api('/admin/mail', { method: 'PUT', body });
          toast('SMTP-Einstellungen erfolgreich gespeichert.');
          await viewAdmin();
        } catch (err) {
          mailErr.textContent = err.message;
        }
      },
    },
    'SMTP-Einstellungen speichern'
  );

  const inpTestMailTo = h('input', {
    type: 'email',
    placeholder: 'Empfänger-E-Mail',
    value: ME?.email || '',
    style: 'max-width: 240px;',
  });
  const testMailStatus = h('span', { class: 'muted', style: 'font-size:.85rem;' });

  const btnSendTestMail = h(
    'button',
    {
      class: 'btn small ghost',
      type: 'button',
      onclick: async () => {
        const target = inpTestMailTo.value.trim();
        if (!target) {
          toast('Bitte gib eine gültige Empfänger-E-Mail ein.');
          return;
        }
        testMailStatus.textContent = 'Sende Test-E-Mail...';
        try {
          const res = await api('/admin/mail/test', { method: 'POST', body: { to: target } });
          testMailStatus.textContent = '✅ ' + (res.message || 'Test-E-Mail erfolgreich versendet.');
          toast('Test-E-Mail versendet!');
        } catch (err) {
          testMailStatus.textContent = '❌ ' + err.message;
          toast(`Fehler beim Senden: ${err.message}`);
        }
      },
    },
    '✉️ Test-E-Mail senden'
  );

  /* Backup & Restore UI Komponenten */
  const fileInput = h('input', {
    type: 'file',
    accept: '.json,.gz,.json.gz',
    style: 'display:none',
    onchange: async (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      if (
        !confirm(
          `⚠️ WARNUNG: Beim Wiederherstellen von „${file.name}“ werden alle vorhandenen Benutzer, Aquarien, Messwerte und Fotos überschrieben.\n\nMöchtest du fortfahren?`
        )
      ) {
        fileInput.value = '';
        return;
      }
      try {
        toast('Lese und spiele Backup ein...');
        const reader = new FileReader();
        reader.onload = async () => {
          try {
            const arrayBuffer = reader.result;
            const bytes = new Uint8Array(arrayBuffer);
            let binary = '';
            for (let i = 0; i < bytes.byteLength; i++) {
              binary += String.fromCharCode(bytes[i]);
            }
            const base64 = btoa(binary);
            const res = await api('/admin/backups/restore-upload', {
              method: 'POST',
              body: { backupBase64: base64 },
            });
            toast(
              `Backup erfolgreich wiederhergestellt! (${res.stats?.users || 0} Benutzer, ${res.stats?.aquariums || 0} Aquarien, ${res.stats?.measurements || 0} Messungen)`
            );
            fileInput.value = '';
            await viewAdmin();
          } catch (err) {
            toast(`Fehler beim Wiederherstellen: ${err.message}`);
            fileInput.value = '';
          }
        };
        reader.readAsArrayBuffer(file);
      } catch (err) {
        toast(`Fehler beim Lesen der Datei: ${err.message}`);
        fileInput.value = '';
      }
    },
  });

  const btnDownloadNow = h(
    'button',
    {
      class: 'btn small',
      type: 'button',
      onclick: () => {
        window.location.href = 'api/admin/backups/create?download=1';
        toast('Backup-Download gestartet.');
      },
    },
    '📥 Jetzt herunterladen'
  );

  const btnCreateLocal = h(
    'button',
    {
      class: 'btn small ghost',
      type: 'button',
      onclick: async () => {
        try {
          toast('Erstelle lokales Backup...');
          const res = await api('/admin/backups/create', {
            method: 'POST',
            body: { includeFiles: backupConfig.includeFiles },
          });
          toast(`Lokales Backup „${res.filename}“ gespeichert.`);
          await viewAdmin();
        } catch (e) {
          toast(e.message);
        }
      },
    },
    '💾 Lokal sichern'
  );

  const btnUploadRestore = h(
    'button',
    {
      class: 'btn small ghost danger',
      type: 'button',
      onclick: () => fileInput.click(),
    },
    '📤 Datei einspielen'
  );

  // Konfiguration automatische Backups
  const chkAutoEnabled = h('input', {
    type: 'checkbox',
    checked: !!backupConfig.enabled,
    id: 'chk-auto-backup',
  });
  const selAutoInterval = h(
    'select',
    { style: 'max-width: 180px;' },
    h('option', { value: '1', selected: backupConfig.intervalHours === 1 }, 'Jede Stunde (1h)'),
    h('option', { value: '6', selected: backupConfig.intervalHours === 6 }, 'Alle 6 Stunden'),
    h('option', { value: '12', selected: backupConfig.intervalHours === 12 }, 'Alle 12 Stunden'),
    h('option', { value: '24', selected: backupConfig.intervalHours === 24 }, 'Täglich (24h)'),
    h('option', { value: '48', selected: backupConfig.intervalHours === 48 }, 'Alle 2 Tage (48h)'),
    h('option', { value: '168', selected: backupConfig.intervalHours === 168 }, 'Wöchentlich (7 Tage)')
  );
  const inpAutoRetention = h('input', {
    type: 'number',
    min: '1',
    max: '100',
    value: String(backupConfig.retentionCount || 10),
    style: 'max-width: 90px;',
  });
  const chkIncludeFiles = h('input', {
    type: 'checkbox',
    checked: backupConfig.includeFiles !== false,
    id: 'chk-include-files',
  });

  const btnSaveConfig = h(
    'button',
    {
      class: 'btn small',
      type: 'button',
      onclick: async () => {
        try {
          const body = {
            enabled: chkAutoEnabled.checked,
            intervalHours: Number(selAutoInterval.value) || 24,
            retentionCount: Number(inpAutoRetention.value) || 10,
            includeFiles: chkIncludeFiles.checked,
          };
          await api('/admin/backups/config', { method: 'PUT', body });
          toast('Backup-Einstellungen gespeichert.');
          await viewAdmin();
        } catch (e) {
          toast(e.message);
        }
      },
    },
    'Einstellungen speichern'
  );

  const backupRows =
    backups.length > 0
      ? backups.map((b) => {
          return h(
            'tr',
            {},
            h(
              'td',
              {},
              h('strong', {}, b.filename),
              b.isAuto
                ? h('span', { class: 'chip ok', style: 'margin-left:.5rem; font-size:.7rem;' }, 'Auto')
                : h('span', { class: 'chip none', style: 'margin-left:.5rem; font-size:.7rem;' }, 'Manuell')
            ),
            h('td', {}, b.sizeFormatted || '–'),
            h('td', {}, fmtDate(b.createdAt)),
            h(
              'td',
              {},
              h(
                'div',
                { class: 'row', style: 'gap:.35rem' },
                h(
                  'button',
                  {
                    class: 'btn small ghost',
                    type: 'button',
                    onclick: () => {
                      window.location.href = `api/admin/backups/${encodeURIComponent(b.filename)}/download`;
                    },
                  },
                  'Download'
                ),
                h(
                  'button',
                  {
                    class: 'btn small ghost danger',
                    type: 'button',
                    onclick: async () => {
                      if (
                        !confirm(
                          `Sicherung „${b.filename}“ wirklich wiederherstellen? Alle aktuellen Daten werden überschrieben.`
                        )
                      )
                        return;
                      try {
                        toast('Stelle Backup wieder her...');
                        const res = await api(
                          `/admin/backups/${encodeURIComponent(b.filename)}/restore`,
                          { method: 'POST' }
                        );
                        toast(
                          `Backup erfolgreich wiederhergestellt! (${res.stats?.users || 0} Benutzer, ${res.stats?.aquariums || 0} Becken)`
                        );
                        await viewAdmin();
                      } catch (e) {
                        toast(e.message);
                      }
                    },
                  },
                  'Wiederherstellen'
                ),
                h(
                  'button',
                  {
                    class: 'btn small danger',
                    type: 'button',
                    onclick: async () => {
                      if (!confirm(`Backup-Datei „${b.filename}“ wirklich löschen?`)) return;
                      try {
                        await api(`/admin/backups/${encodeURIComponent(b.filename)}`, {
                          method: 'DELETE',
                        });
                        toast(`Backup „${b.filename}“ gelöscht.`);
                        await viewAdmin();
                      } catch (e) {
                        toast(e.message);
                      }
                    },
                  },
                  'Löschen'
                )
              )
            )
          );
        })
      : [
          h(
            'tr',
            {},
            h(
              'td',
              { colspan: '4', class: 'muted', style: 'text-align:center; padding:1.2rem;' },
              '(Noch keine lokalen Sicherungen vorhanden)'
            )
          ),
        ];

  /* ---------- Rechtliches & Kontakt-E-Mails (Admin) ---------- */
  const legalConfig = (legalData && legalData.config) || { contactEmail: '', imprintEmail: '' };
  const legalErr = h('p', { class: 'error', role: 'alert' });

  const inpContactEmail = h('input', {
    type: 'email',
    placeholder: 'z. B. kontakt@example.com (Standard: Admin-E-Mail)',
    value: legalConfig.contactEmail || '',
    style: 'max-width:320px;',
  });

  const inpImprintEmail = h('input', {
    type: 'email',
    placeholder: 'z. B. impressum@example.com (Standard: Kontakt-E-Mail)',
    value: legalConfig.imprintEmail || '',
    style: 'max-width:320px;',
  });

  const btnSaveLegalConfig = h(
    'button',
    {
      class: 'btn small',
      type: 'button',
      onclick: async () => {
        legalErr.textContent = '';
        try {
          const body = {
            contactEmail: inpContactEmail.value.trim() || null,
            imprintEmail: inpImprintEmail.value.trim() || null,
          };
          await api('/admin/legal-config', { method: 'PUT', body });
          toast('Rechtliche E-Mail-Einstellungen erfolgreich gespeichert.');
          await viewAdmin();
        } catch (ex) {
          legalErr.textContent = ex.message;
        }
      },
    },
    'Rechtliche Einstellungen speichern'
  );

  const legalCard = h(
    'div',
    { class: 'card stack' },
    h(
      'div',
      { class: 'row between', style: 'align-items:center;' },
      h(
        'div',
        {},
        h('h2', { style: 'margin:0' }, '⚖️ Rechtliches, Kontakt & Lizenz'),
        h(
          'span',
          { class: 'muted' },
          'Konfiguriere Kontakt- und Impressums-E-Mail-Adressen für öffentliche Seiten (#/impressum, #/kontakt, #/datenschutz).'
        )
      ),
      h('span', { class: 'chip ok' }, 'CC BY-NC-SA 4.0')
    ),
    legalErr,
    h(
      'div',
      {
        class: 'card stack',
        style:
          'background: var(--paper); border: 1px solid var(--line); padding: 1rem; gap: .75rem;',
      },
      h(
        'div',
        { class: 'row', style: 'gap: 1.25rem; flex-wrap: wrap; align-items: center;' },
        h(
          'label',
          { class: 'stack', style: 'gap:.25rem;' },
          h('span', { class: 'muted', style: 'font-weight:600;' }, 'Kontakt-E-Mail (Support & Datenschutz):'),
          inpContactEmail
        ),
        h(
          'label',
          { class: 'stack', style: 'gap:.25rem;' },
          h('span', { class: 'muted', style: 'font-weight:600;' }, 'Impressums-E-Mail (§ 5 DDG):'),
          inpImprintEmail
        )
      ),
      h(
        'div',
        { class: 'muted', style: 'font-size:.84rem;' },
        'Bleiben die Felder leer oder werden sie zurückgesetzt, greift automatisch die globale Admin-E-Mail-Adresse.'
      ),
      h('div', { class: 'row', style: 'margin-top:.4rem;' }, btnSaveLegalConfig)
    )
  );

  const logBox = h(
    'pre',
    {
      class: 'log-viewer-box',
      style:
        'max-height: 320px; overflow-y: auto; background: var(--tube-bg); padding: .75rem; border: 1px solid var(--line); border-radius: 6px; font-family: monospace; font-size: .82rem; white-space: pre-wrap; word-break: break-all; line-height: 1.4;',
    },
    logData.logs && logData.logs.length
      ? logData.logs.join('\n')
      : '(Keine Log-Einträge vorhanden)'
  );

  // Automatischer Scroll nach unten
  setTimeout(() => {
    logBox.scrollTop = logBox.scrollHeight;
  }, 50);

  const btnRefreshLogs = h(
    'button',
    {
      class: 'btn small ghost',
      type: 'button',
      onclick: async () => {
        try {
          const refreshed = await api('/admin/logs');
          logBox.textContent =
            refreshed.logs && refreshed.logs.length
              ? refreshed.logs.join('\n')
              : '(Keine Log-Einträge vorhanden)';
          logBox.scrollTop = logBox.scrollHeight;
          toast('Logs aktualisiert.');
        } catch (e) {
          toast(e.message);
        }
      },
    },
    '🔄 Aktualisieren'
  );

  const btnClearLogs = h(
    'button',
    {
      class: 'btn small ghost danger',
      type: 'button',
      onclick: async () => {
        if (!confirm('Möchtest du die Log-Datei wirklich leeren?')) return;
        try {
          await api('/admin/logs', { method: 'DELETE' });
          logBox.textContent = '(Keine Log-Einträge vorhanden)';
          toast('Log-Datei geleert.');
        } catch (e) {
          toast(e.message);
        }
      },
    },
    '🗑️ Log leeren'
  );

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
          h('h1', { style: 'margin-top:.3rem' }, 'Benutzerverwaltung & Administration')
        ),
        h('button', { class: 'btn', type: 'button', onclick: () => adminUserDialog() }, 'Benutzer anlegen')
      ),
      h(
        'div',
        { class: 'card stack' },
        h(
          'div',
          { class: 'row between' },
          h('h2', { style: 'margin:0' }, `Registrierte Benutzer (${users.length})`),
          h('span', { class: 'muted' }, 'Admin-Rechte richten sich nach der konfigurierten E-Mail-Adresse.')
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
                h('th', {}, 'Benutzername'),
                h('th', {}, 'E-Mail'),
                h('th', {}, 'Status'),
                h('th', {}, 'Anmeldung'),
                h('th', {}, 'Aquarien'),
                h('th', {}, 'Rolle'),
                h('th', {}, 'Erstellt am'),
                h('th', {}, 'Aktionen')
              )
            ),
            h('tbody', {}, rows)
          )
        )
      ),
      registrationCard,
      legalCard,
      h(
        'div',
        { class: 'card stack' },
        h(
          'div',
          { class: 'row between', style: 'align-items:center;' },
          h(
            'div',
            {},
            h('h2', { style: 'margin:0' }, '📧 E-Mail- & SMTP-Server-Konfiguration'),
            h(
              'span',
              { class: 'muted' },
              'Konfiguriere den SMTP-Ausgangsserver für E-Mail-Verifizierungen und Passwort-Reset.'
            )
          ),
          mailConfig.enabled
            ? h('span', { class: 'chip ok' }, 'Aktiviert')
            : h('span', { class: 'chip none' }, 'Deaktiviert')
        ),
        mailErr,
        h(
          'div',
          {
            class: 'card stack',
            style:
              'background: var(--paper); border: 1px solid var(--line); padding: 1rem; gap: .75rem;',
          },
          h(
            'div',
            { class: 'row', style: 'gap: 1rem; flex-wrap: wrap; align-items: center;' },
            h(
              'label',
              { class: 'row', style: 'gap:.4rem; cursor:pointer;' },
              chkMailEnabled,
              h('strong', {}, 'E-Mail-Versand via SMTP aktivieren')
            ),
            h('label', { class: 'row', style: 'gap:.4rem;' }, h('span', { class: 'muted' }, 'SMTP-Host:'), inpMailHost),
            h('label', { class: 'row', style: 'gap:.4rem;' }, h('span', { class: 'muted' }, 'Port:'), inpMailPort),
            h(
              'label',
              { class: 'row', style: 'gap:.4rem;' },
              h('span', { class: 'muted' }, 'Verschlüsselung:'),
              selMailEnc
            )
          ),
          h(
            'div',
            { class: 'row', style: 'gap: 1rem; flex-wrap: wrap; align-items: center;' },
            h('label', { class: 'row', style: 'gap:.4rem;' }, h('span', { class: 'muted' }, 'Benutzer:'), inpMailUser),
            h('label', { class: 'row', style: 'gap:.4rem;' }, h('span', { class: 'muted' }, 'Passwort:'), inpMailPass),
            h(
              'label',
              { class: 'row', style: 'gap:.4rem;' },
              h('span', { class: 'muted' }, 'Absender (From):'),
              inpMailFrom
            ),
            h(
              'label',
              { class: 'row', style: 'gap:.4rem;' },
              h('span', { class: 'muted' }, 'Warteschlangen-Pause (ms):'),
              inpMailRateLimit
            )
          ),
          h('div', { class: 'row', style: 'margin-top:.4rem;' }, btnSaveMailConfig)
        ),
        h(
          'div',
          {
            class: 'row between',
            style:
              'align-items: center; flex-wrap: wrap; gap: .75rem; background: var(--paper); border: 1px solid var(--line); border-radius: 8px; padding: .75rem 1rem;',
          },
          h(
            'div',
            { class: 'row', style: 'align-items: center; gap: .5rem; flex-wrap: wrap;' },
            h('strong', {}, '🧪 Test-E-Mail:'),
            inpTestMailTo,
            btnSendTestMail,
            testMailStatus
          ),
          h(
            'div',
            { class: 'row', style: 'gap: .5rem; font-size: .85rem;' },
            h('span', { class: 'chip none' }, `Queue: ${mailQueue.queueLength || 0}`),
            h('span', { class: 'chip ok' }, `Gesendet: ${mailQueue.sentCount || 0}`),
            mailQueue.failedCount > 0
              ? h('span', { class: 'chip crit' }, `Fehler: ${mailQueue.failedCount}`)
              : null,
            mailQueue.lastSentAt ? h('span', { class: 'muted' }, `Letzte: ${fmtDate(mailQueue.lastSentAt)}`) : null
          )
        )
      ),
      h(
        'div',
        { class: 'card stack' },
        fileInput,
        h(
          'div',
          { class: 'row between' },
          h(
            'div',
            {},
            h('h2', { style: 'margin:0' }, '📦 Datensicherung & Wiederherstellung (Backup & Restore)'),
            h(
              'span',
              { class: 'muted' },
              'Sichere die gesamte Datenbank samt Fotos oder spiele Backups ein (auch aus älteren Versionen).'
            )
          ),
          h('div', { class: 'row', style: 'gap:.5rem' }, btnDownloadNow, btnCreateLocal, btnUploadRestore)
        ),
        h(
          'div',
          {
            class: 'card stack',
            style:
              'background: var(--paper); border: 1px solid var(--line); padding: 1rem; gap: .75rem;',
          },
          h('h3', { style: 'margin:0' }, '⚙️ Automatische lokale Sicherungen & Backup-Limit'),
          h(
            'div',
            { class: 'row', style: 'gap: 1.25rem; flex-wrap: wrap; align-items: center;' },
            h(
              'label',
              { class: 'row', style: 'gap:.4rem; cursor:pointer;' },
              chkAutoEnabled,
              h('span', {}, 'Automatisch aktivieren')
            ),
            h(
              'label',
              { class: 'row', style: 'gap:.4rem;' },
              h('span', { class: 'muted' }, 'Intervall:'),
              selAutoInterval
            ),
            h(
              'label',
              { class: 'row', style: 'gap:.4rem;' },
              h('span', { class: 'muted' }, 'Max. Backups (Limit):'),
              inpAutoRetention
            ),
            h(
              'label',
              { class: 'row', style: 'gap:.4rem; cursor:pointer;' },
              chkIncludeFiles,
              h('span', {}, 'Upload-Fotos einschließen')
            ),
            btnSaveConfig
          ),
          h(
            'div',
            { class: 'muted', style: 'font-size:.82rem;' },
            'Sobald das Limit erreicht ist, wird beim Erstellen neuer Sicherungen automatisch das jeweils älteste Backup gelöscht.',
            backupConfig.lastBackupAt
              ? ` Letzte automatische Sicherung: ${fmtDate(backupConfig.lastBackupAt)} (${backupConfig.lastBackupFile || '–'})`
              : ''
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
                h('th', {}, 'Gespeicherte Sicherung'),
                h('th', {}, 'Größe'),
                h('th', {}, 'Erstellt am'),
                h('th', {}, 'Aktionen')
              )
            ),
            h('tbody', {}, backupRows)
          )
        )
      ),
      h(
        'div',
        { class: 'card stack' },
        h(
          'div',
          { class: 'row between' },
          h(
            'div',
            {},
            h('h2', { style: 'margin:0' }, 'System-Logbuch & Fehlerprotokoll'),
            h('span', { class: 'muted' }, `Logdatei: ${logData.logPath || 'data/aquarium.log'}`)
          ),
          h('div', { class: 'row', style: 'gap:.5rem' }, btnRefreshLogs, btnClearLogs)
        ),
        h(
          'p',
          { class: 'muted', style: 'margin:0; font-size:.85rem;' },
          'Protokolliert Systemmeldungen, Express-Fehler sowie Ereignisse des Überwachungsprozesses (Neustarts, Abstürze).'
        )
      ),
      logBox
    )
  );
}

export function adminUserDialog(user) {
  const editing = !!user;
  const err = h('p', { class: 'error', role: 'alert' });
  const f = {
    username: h('input', { required: true, maxlength: '40', value: user?.username || '' }),
    email: h('input', {
      type: 'email',
      maxlength: '120',
      value: user?.email || '',
      placeholder: 'z. B. max@example.com',
    }),
    emailVerified: h('input', {
      type: 'checkbox',
      checked: user ? Boolean(user.emailVerified) : true,
    }),
    oidcSub: h('input', {
      maxlength: '255',
      value: user?.oidcSub || '',
      placeholder: 'z. B. Sub-ID aus Pocket ID (optional)',
    }),
    password: h('input', {
      type: 'password',
      autocomplete: 'new-password',
      minlength: '8',
      placeholder: editing ? 'Leer lassen für keine Änderung' : 'Mindestens 8 Zeichen',
    }),
  };

  const dlg = h(
    'dialog',
    {},
    h(
      'form',
      {
        class: 'stack',
        method: 'dialog',
        onsubmit: async (e) => {
          e.preventDefault();
          err.textContent = '';
          const body = {
            username: f.username.value.trim(),
            email: f.email.value.trim() || undefined,
            emailVerified: f.emailVerified.checked,
            oidcSub: f.oidcSub.value.trim() || (editing ? null : undefined),
            password: f.password.value || undefined,
          };
          try {
            if (editing) {
              await api(`/admin/users/${user.id}`, { method: 'PUT', body });
              dlg.close();
              toast(`Benutzer „${body.username}“ aktualisiert.`);
              await viewAdmin();
            } else {
              await api('/admin/users', { method: 'POST', body });
              dlg.close();
              toast(`Benutzer „${body.username}“ angelegt.`);
              await viewAdmin();
            }
          } catch (ex) {
            err.textContent = ex.message;
          }
        },
      },
      h('h2', {}, editing ? `Benutzer „${user.username}“ bearbeiten` : 'Neuen Benutzer anlegen'),
      h('div', { class: 'field' }, h('label', {}, 'Benutzername'), f.username),
      h('div', { class: 'field' }, h('label', {}, 'E-Mail-Adresse'), f.email),
      h(
        'div',
        { class: 'field' },
        h(
          'label',
          { class: 'row', style: 'gap:.4rem; cursor:pointer;' },
          f.emailVerified,
          'E-Mail-Adresse als verifiziert markieren'
        )
      ),
      h('div', { class: 'field' }, h('label', {}, 'OIDC-Benutzer-ID (sub / Pocket ID)'), f.oidcSub),
      h(
        'div',
        { class: 'field' },
        h(
          'label',
          {},
          editing
            ? 'Neues Passwort (optional)'
            : 'Passwort (optional für OIDC, mindestens 8 Zeichen für lokale Anmeldung)'
        ),
        f.password
      ),
      err,
      h(
        'div',
        { class: 'row' },
        h('button', { class: 'btn', type: 'submit' }, editing ? 'Speichern' : 'Anlegen'),
        h('button', { class: 'btn ghost', type: 'button', onclick: () => dlg.close() }, 'Abbrechen')
      )
    )
  );

  dlg.addEventListener('close', () => dlg.remove());
  document.body.append(dlg);
  dlg.showModal();
  f.username.focus();
}

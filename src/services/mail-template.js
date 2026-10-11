'use strict';
const fs = require('fs');
const path = require('path');
const { DATA_DIR } = require('../config/env');

const TEMPLATE_DIR = path.join(__dirname, '../templates/mail');
const USER_TEMPLATE_DIR = path.join(DATA_DIR, 'mail-templates');

function escapeHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Ermittelt den Pfad zur .tpl Datei.
 * Sucht zuerst im Benutzerverzeichnis (data/mail-templates/), dann im Standardverzeichnis (src/templates/mail/).
 */
function getTemplatePath(templateName) {
  const cleanName = templateName.endsWith('.tpl') ? templateName : `${templateName}.tpl`;
  const userPath = path.join(USER_TEMPLATE_DIR, cleanName);
  if (fs.existsSync(userPath)) {
    return userPath;
  }
  const defaultPath = path.join(TEMPLATE_DIR, cleanName);
  if (fs.existsSync(defaultPath)) {
    return defaultPath;
  }
  return defaultPath;
}

/**
 * Lädt den Inhalt einer .tpl Datei.
 */
function loadTemplate(templateName) {
  const filePath = getTemplatePath(templateName);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Mail-Template '${templateName}' (.tpl) wurde nicht gefunden: ${filePath}`);
  }
  return fs.readFileSync(filePath, 'utf8');
}

/**
 * Ersetzt Tokens der Form {{tokenName}} oder {{ tokenName }} im Template-String.
 */
function replaceTokens(templateContent, tokens = {}, options = { escape: true }) {
  if (typeof templateContent !== 'string') return '';

  return templateContent.replace(/\{\{\s*([a-zA-Z0-9_:]+)\s*\}\}/g, (match, rawKey) => {
    let key = rawKey;
    let shouldEscape = options.escape !== false;

    if (key.startsWith('raw:')) {
      key = key.slice(4);
      shouldEscape = false;
    }

    let val = undefined;
    if (Object.prototype.hasOwnProperty.call(tokens, key)) {
      val = tokens[key];
    } else {
      // Case-Insensitive und Camel/Snake Match
      const normalizedKey = key.toLowerCase().replace(/_/g, '');
      for (const [k, v] of Object.entries(tokens)) {
        if (k.toLowerCase().replace(/_/g, '') === normalizedKey) {
          val = v;
          break;
        }
      }
    }

    if (val === undefined) {
      return match;
    }

    const strVal = val != null ? String(val) : '';
    return shouldEscape ? escapeHtml(strVal) : strVal;
  });
}

/**
 * Rendert ein benanntes .tpl Template mit übergebenen Tokens.
 */
function renderTemplate(templateName, tokens = {}) {
  const tpl = loadTemplate(templateName);
  const brandTitle = tokens.brandTitle || '🐠 Aquarium-Logbuch';
  const currentYear = tokens.currentYear || new Date().getFullYear();
  const footerNote = tokens.footerNote || 'Aquarium-Logbuch – Deine Wasserwerte und Aquarien stets im Blick.';

  const fullTokens = {
    brandTitle,
    currentYear,
    footerNote,
    ...tokens,
  };

  return replaceTokens(tpl, fullTokens);
}

/**
 * Erzeugt das einheitliche, ansprechende HTML- und Text-Layout für alle Aquarium-Logbuch-E-Mails (Fallback/Hilfsfunktion).
 */
function renderBaseTemplate({ title, preheader, headline, contentHtml, ctaText, ctaUrl, hintHtml, footerNote }) {
  const brandTitle = '🐠 Aquarium-Logbuch';
  const currentYear = new Date().getFullYear();

  const html = `<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>${escapeHtml(title || brandTitle)}</title>
  <style>
    /* Reset & Base */
    body, table, td, p, a, li, blockquote {
      -webkit-text-size-adjust: 100%;
      -ms-text-size-adjust: 100%;
    }
    body {
      margin: 0;
      padding: 0;
      width: 100% !important;
      background-color: #f0fdfa;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      color: #1e293b;
      line-height: 1.6;
    }
    table {
      border-collapse: collapse;
      mso-table-lspace: 0pt;
      mso-table-rspace: 0pt;
    }
    img {
      border: 0;
      height: auto;
      line-height: 100%;
      outline: none;
      text-decoration: none;
    }
    .wrapper {
      width: 100%;
      table-layout: fixed;
      background-color: #f0fdfa;
      padding: 32px 12px;
    }
    .main-card {
      background-color: #ffffff;
      margin: 0 auto;
      width: 100%;
      max-width: 580px;
      border-radius: 16px;
      border: 1px solid #ccfbf1;
      box-shadow: 0 10px 25px -5px rgba(15, 118, 110, 0.08), 0 8px 10px -6px rgba(15, 118, 110, 0.04);
      overflow: hidden;
    }
    .header-bar {
      background: linear-gradient(135deg, #0f766e 0%, #0369a1 100%);
      padding: 28px 32px;
      text-align: center;
    }
    .header-title {
      margin: 0;
      color: #ffffff;
      font-size: 24px;
      font-weight: 700;
      letter-spacing: -0.025em;
    }
    .header-subtitle {
      margin: 6px 0 0;
      color: #ccfbf1;
      font-size: 13px;
      font-weight: 500;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    .content-body {
      padding: 32px;
    }
    .headline {
      margin: 0 0 16px;
      color: #0f172a;
      font-size: 20px;
      font-weight: 600;
      line-height: 1.35;
    }
    .paragraph {
      margin: 0 0 16px;
      color: #334155;
      font-size: 15px;
      line-height: 1.6;
    }
    .btn-container {
      margin: 28px 0;
      text-align: center;
    }
    .btn {
      display: inline-block;
      background: linear-gradient(135deg, #0d9488 0%, #0284c7 100%);
      color: #ffffff !important;
      text-decoration: none;
      font-weight: 600;
      font-size: 15px;
      padding: 14px 32px;
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(13, 148, 136, 0.25);
    }
    .alt-link-box {
      background-color: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 14px 16px;
      margin: 24px 0 12px;
      font-size: 13px;
      color: #64748b;
      word-break: break-all;
    }
    .alt-link {
      color: #0d9488;
      text-decoration: underline;
    }
    .hint-box {
      border-top: 1px solid #f1f5f9;
      margin-top: 24px;
      padding-top: 16px;
      font-size: 13px;
      color: #94a3b8;
      line-height: 1.5;
    }
    .footer {
      text-align: center;
      padding: 24px 12px 8px;
      font-size: 12px;
      color: #64748b;
    }
    .preheader {
      display: none !important;
      visibility: hidden;
      mso-hide: all;
      font-size: 1px;
      line-height: 1px;
      max-height: 0;
      max-width: 0;
      opacity: 0;
      overflow: hidden;
    }
  </style>
</head>
<body>
  ${preheader ? `<div class="preheader">${escapeHtml(preheader)}</div>` : ''}
  <div class="wrapper">
    <div class="main-card">
      <div class="header-bar">
        <h1 class="header-title">${brandTitle}</h1>
        <p class="header-subtitle">Wasserwerte · Aquarien · Pflege</p>
      </div>
      <div class="content-body">
        ${headline ? `<h2 class="headline">${escapeHtml(headline)}</h2>` : ''}
        ${contentHtml}
        ${ctaText && ctaUrl ? `
          <div class="btn-container">
            <!--[if mso]>
            <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${escapeHtml(ctaUrl)}" style="height:48px;v-text-anchor:middle;width:240px;" arcsize="18%" stroke="f" fillcolor="#0d9488">
              <w:anchorlock/>
              <center style="color:#ffffff;font-family:sans-serif;font-size:15px;font-weight:bold;">${escapeHtml(ctaText)}</center>
            </v:roundrect>
            <![endif]-->
            <a class="btn" href="${escapeHtml(ctaUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(ctaText)}</a>
          </div>
          <div class="alt-link-box">
            Falls der Button nicht reagiert, öffne diesen Link direkt im Browser:<br>
            <a class="alt-link" href="${escapeHtml(ctaUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(ctaUrl)}</a>
          </div>
        ` : ''}
        ${hintHtml ? `<div class="hint-box">${hintHtml}</div>` : ''}
      </div>
    </div>
    <div class="footer">
      <p style="margin: 0 0 6px;">${footerNote || 'Aquarium-Logbuch – Deine Wasserwerte und Aquarien stets im Blick.'}</p>
      <p style="margin: 0;">© ${currentYear} Aquarium-Logbuch</p>
    </div>
  </div>
</body>
</html>`;

  return html;
}

/**
 * Template für die E-Mail-Adressen-Bestätigung (Verifizierung).
 * Nutzt 'verify-email.tpl'.
 */
function createEmailVerificationMail({ username, verifyUrl, expiresHours = 24 }) {
  const subject = '🐠 Bitte bestätige deine E-Mail-Adresse für Aquarium-Logbuch';
  const preheader = `Hallo ${username}, bitte bestätige deine E-Mail-Adresse, um dein Konto zu aktivieren.`;
  const headline = 'E-Mail-Adresse bestätigen';
  const ctaText = 'E-Mail-Adresse jetzt bestätigen';

  const html = renderTemplate('verify-email', {
    title: subject,
    subject,
    preheader,
    headline,
    username,
    verifyUrl,
    expiresHours,
    ctaText,
    ctaUrl: verifyUrl,
  });

  const text = `Hallo ${username},

vielen Dank für deine Registrierung beim Aquarium-Logbuch!

Bitte öffne den folgenden Link in deinem Browser, um deine E-Mail-Adresse zu bestätigen und dein Konto zu aktivieren:
${verifyUrl}

Dieser Link ist ${expiresHours} Stunden gültig.

Falls du dich nicht registriert hast, kannst du diese E-Mail einfach ignorieren.

Dein Aquarium-Logbuch Team`;

  return { subject, html, text };
}

/**
 * Template für das Zurücksetzen des Passworts.
 * Nutzt 'password-reset.tpl'.
 */
function createPasswordResetMail({ username, resetUrl, expiresMinutes = 60 }) {
  const subject = '🔐 Passwort zurücksetzen für Aquarium-Logbuch';
  const preheader = `Hallo ${username}, du hast eine Anfrage zum Zurücksetzen deines Passworts gestellt.`;
  const headline = 'Passwort zurücksetzen';
  const ctaText = 'Neues Passwort festlegen';

  const html = renderTemplate('password-reset', {
    title: subject,
    subject,
    preheader,
    headline,
    username,
    resetUrl,
    expiresMinutes,
    ctaText,
    ctaUrl: resetUrl,
  });

  const text = `Hallo ${username},

wir haben eine Anfrage erhalten, das Passwort für dein Konto (${username}) beim Aquarium-Logbuch zurückzusetzen.

Um ein neues Passwort zu vergeben, öffne bitte folgenden Link in deinem Browser:
${resetUrl}

Dieser Link ist ${expiresMinutes} Minuten gültig.

Falls du diese Anfrage nicht gestellt hast, kannst du diese Nachricht einfach ignorieren. Dein Passwort bleibt unverändert.

Dein Aquarium-Logbuch Team`;

  return { subject, html, text };
}

/**
 * Template für Test-E-Mails aus dem Admin-Bereich.
 * Nutzt 'test-email.tpl'.
 */
function createTestEmailMail({ adminUsername, serverInfo }) {
  const subject = '✅ Test-E-Mail von Aquarium-Logbuch';
  const preheader = 'Deine SMTP-Mail-Konfiguration funktioniert einwandfrei.';
  const headline = 'SMTP-Konfiguration erfolgreich!';
  const dateStr = new Date().toLocaleString('de-DE');

  const html = renderTemplate('test-email', {
    title: subject,
    subject,
    preheader,
    headline,
    adminUsername: adminUsername || 'Administrator',
    serverInfo: serverInfo || 'Lokal konfiguriert',
    dateStr,
  });

  const text = `Hallo ${adminUsername || 'Administrator'},

die SMTP-Konfiguration für das Aquarium-Logbuch funktioniert erfolgreich!

Zeitpunkt: ${dateStr}
Server: ${serverInfo || 'Lokal konfiguriert'}

Dein Aquarium-Logbuch System`;

  return { subject, html, text };
}

/**
 * Template für die Bestätigung der Konto-Löschung.
 * Nutzt 'delete-account.tpl'.
 */
function createAccountDeletionMail({ username, deleteUrl, expiresMinutes = 60 }) {
  const subject = '⚠️ Bestätigung zur Löschung deines Benutzerkontos';
  const preheader = `Hallo ${username}, bitte bestätige die endgültige Löschung deines Kontos beim Aquarium-Logbuch.`;
  const headline = 'Konto unwiderruflich löschen';
  const ctaText = 'Konto jetzt endgültig löschen';

  const html = renderTemplate('delete-account', {
    title: subject,
    subject,
    preheader,
    headline,
    username,
    deleteUrl,
    expiresMinutes,
    ctaText,
    ctaUrl: deleteUrl,
  });

  const text = `Hallo ${username},

du hast in den Profileinstellungen die endgültige Löschung deines Benutzerkontos beim Aquarium-Logbuch angefordert.

WICHTIGER HINWEIS:
Wenn du die Löschung bestätigst, werden dein Benutzerkonto sowie alle deine Aquarien, Messwerte, Alarme, Pflegemaßnahmen, hochgeladenen Fotos und Freigaben unwiderruflich und dauerhaft gelöscht!

Um die Löschung deines Kontos endgültig zu bestätigen, öffne bitte folgenden Link in deinem Browser:
${deleteUrl}

Dieser Link ist ${expiresMinutes} Minuten gültig.

Falls du dein Konto NICHT löschen möchtest, ignoriere diese E-Mail einfach. Dein Konto bleibt unverändert erhalten.

Dein Aquarium-Logbuch Team`;

  return { subject, html, text };
}

module.exports = {
  getTemplatePath,
  loadTemplate,
  replaceTokens,
  renderTemplate,
  renderBaseTemplate,
  createEmailVerificationMail,
  createPasswordResetMail,
  createTestEmailMail,
  createAccountDeletionMail,
  createInvitationMail,
};

/**
 * Template für Einladungen neuer Benutzer.
 * Nutzt 'invitation.tpl'.
 */
function createInvitationMail({ inviterName, inviteUrl, inviteCode, expiresDays = 14, expiresDate = null }) {
  const inviter = inviterName || 'Ein Mitglied';
  const subject = `💌 Einladung zu Aquarium-Logbuch von ${inviter}`;
  const preheader = `${inviter} hat dich eingeladen, dem Aquarium-Logbuch beizutreten.`;
  const headline = 'Du wurdest eingeladen!';
  const ctaText = 'Einladung annehmen & registrieren';
  const expiresDateHint = expiresDate ? ` (bis zum ${expiresDate})` : '';

  const html = renderTemplate('invitation', {
    title: subject,
    subject,
    preheader,
    headline,
    inviterName: inviter,
    inviteUrl,
    inviteCode,
    expiresDays,
    expiresDateHint,
    ctaText,
    ctaUrl: inviteUrl,
  });

  const text = `Hallo,

${inviter} hat dich herzlich eingeladen, dem Aquarium-Logbuch beizutreten!

Mit dem Aquarium-Logbuch behältst du Wasserwerte, Pflegemaßnahmen, Beckenfotos und Bewohner deiner Aquarien spielend leicht im Blick.

Dein Einladungscode: ${inviteCode}

Öffne folgenden Link in deinem Browser, um deine Einladung anzunehmen und dein Konto zu erstellen:
${inviteUrl}

Diese Einladung ist ${expiresDays} Tage gültig${expiresDateHint}.

Falls du diese Einladung nicht erwartet hast, kannst du diese Nachricht einfach ignorieren.

Dein Aquarium-Logbuch Team`;

  return { subject, html, text };
}

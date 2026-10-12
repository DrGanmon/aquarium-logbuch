import { APP_ROOT } from '../utils/paths';
'use strict';
import fs = require('fs');
import path = require('path');
import envModule = require('../config/env');
const { DATA_DIR, APP_URL } = envModule;

const TEMPLATE_DIR = path.join(__dirname, '../templates/mail');
const USER_TEMPLATE_DIR = path.join(DATA_DIR, 'mail-templates');
const LOGO_PNG_PATH = path.join(APP_ROOT, 'public/icon-192.png');

let DEFAULT_LOGO_DATA_URI = '';
try {
  if (fs.existsSync(LOGO_PNG_PATH)) {
    const logoBuf = fs.readFileSync(LOGO_PNG_PATH);
    DEFAULT_LOGO_DATA_URI = `data:image/png;base64,${logoBuf.toString('base64')}`;
  }
} catch (e) {
  // ignore
}

function getLogoUrl() {
  if (APP_URL) {
    return `${APP_URL}/icon-192.png`;
  }
  return DEFAULT_LOGO_DATA_URI || 'icon-192.png';
}

function escapeHtml(str?: any) {
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
 * Unterstützt sprachspezifische Templates (z. B. verify-email.en.tpl oder en/verify-email.tpl).
 */
function getTemplatePath(templateName?: any, lang: any = 'de') {
  const baseName = templateName.replace(/\.tpl$/, '').replace(/\.(de|en)$/, '');
  const isEn = String(lang).toLowerCase().startsWith('en');

  if (isEn) {
    const userPathEn = path.join(USER_TEMPLATE_DIR, `${baseName}.en.tpl`);
    if (fs.existsSync(userPathEn)) return userPathEn;
    const userPathSubEn = path.join(USER_TEMPLATE_DIR, 'en', `${baseName}.tpl`);
    if (fs.existsSync(userPathSubEn)) return userPathSubEn;

    const defaultPathEn = path.join(TEMPLATE_DIR, `${baseName}.en.tpl`);
    if (fs.existsSync(defaultPathEn)) return defaultPathEn;
    const defaultPathSubEn = path.join(TEMPLATE_DIR, 'en', `${baseName}.tpl`);
    if (fs.existsSync(defaultPathSubEn)) return defaultPathSubEn;
  }

  const userPath = path.join(USER_TEMPLATE_DIR, `${baseName}.tpl`);
  if (fs.existsSync(userPath)) {
    return userPath;
  }
  const defaultPath = path.join(TEMPLATE_DIR, `${baseName}.tpl`);
  if (fs.existsSync(defaultPath)) {
    return defaultPath;
  }
  return defaultPath;
}

/**
 * Lädt den Inhalt einer .tpl Datei.
 */
function loadTemplate(templateName?: any, lang: any = 'de') {
  const filePath = getTemplatePath(templateName, lang);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Mail-Template '${templateName}' (.tpl) wurde nicht gefunden: ${filePath}`);
  }
  return fs.readFileSync(filePath, 'utf8');
}

/**
 * Ersetzt Tokens der Form {{tokenName}} oder {{ tokenName }} im Template-String.
 */
function replaceTokens(templateContent?: any, tokens: any = {}, options: any = { escape: true }) {
  if (typeof templateContent !== 'string') return '';

  return templateContent.replace(/\{\{\s*([a-zA-Z0-9_:]+)\s*\}\}/g, (match?: any, rawKey?: any) => {
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
function renderTemplate(templateName?: any, tokens: any = {}, lang: any = 'de') {
  const isEn = String(lang).toLowerCase().startsWith('en');
  const tpl = loadTemplate(templateName, lang);
  const brandTitle = tokens.brandTitle || (isEn ? '🐠 Aquarium Logbook' : '🐠 Aquarium-Logbuch');
  const currentYear = tokens.currentYear || new Date().getFullYear();
  const footerNote = tokens.footerNote || (isEn
    ? 'Aquarium Logbook – Keep your water parameters and aquariums in view.'
    : 'Aquarium-Logbuch – Deine Wasserwerte und Aquarien stets im Blick.');
  const logoUrl = tokens.logoUrl || getLogoUrl();

  const fullTokens: Record<string, any> = {
    brandTitle,
    logoUrl,
    currentYear,
    footerNote,
    ...tokens,
  };

  return replaceTokens(tpl, fullTokens);
}

/**
 * Erzeugt das einheitliche, ansprechende HTML- und Text-Layout für alle Aquarium-Logbuch-E-Mails (Fallback/Hilfsfunktion).
 */
function renderBaseTemplate({ title, preheader, headline, contentHtml, ctaText, ctaUrl, hintHtml, footerNote, logoUrl }: any) {
  const brandTitle = '🐠 Aquarium-Logbuch';
  const currentYear = new Date().getFullYear();
  const actualLogoUrl = logoUrl || getLogoUrl();

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
        <div style="margin-bottom: 12px; text-align: center;">
          <img src="${escapeHtml(actualLogoUrl)}" alt="Logo" width="48" height="48" style="width: 48px; height: 48px; border-radius: 10px; display: inline-block; vertical-align: middle; border: 0; outline: none; text-decoration: none; box-shadow: 0 4px 10px rgba(0, 0, 0, 0.2);">
        </div>
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
function createEmailVerificationMail({ username, verifyUrl, expiresHours = 24, lang = 'de' }: any) {
  const isEn = String(lang).toLowerCase().startsWith('en');
  const subject = isEn
    ? '🐠 Please verify your email address for Aquarium Logbook'
    : '🐠 Bitte bestätige deine E-Mail-Adresse für Aquarium-Logbuch';
  const preheader = isEn
    ? `Hello ${username}, please verify your email address to activate your account.`
    : `Hallo ${username}, bitte bestätige deine E-Mail-Adresse, um dein Konto zu aktivieren.`;
  const headline = isEn ? 'Verify Email Address' : 'E-Mail-Adresse bestätigen';
  const ctaText = isEn ? 'Verify Email Address Now' : 'E-Mail-Adresse jetzt bestätigen';

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
  }, lang);

  const text = isEn
    ? `Hello ${username},

Thank you for signing up for Aquarium Logbook!

Please open the following link in your browser to verify your email address and activate your account:
${verifyUrl}

This link is valid for ${expiresHours} hours.

If you did not create an account, you can safely ignore this email.

Your Aquarium Logbook Team`
    : `Hallo ${username},

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
function createPasswordResetMail({ username, resetUrl, expiresMinutes = 60, lang = 'de' }: any) {
  const isEn = String(lang).toLowerCase().startsWith('en');
  const subject = isEn
    ? '🔐 Reset your password for Aquarium Logbook'
    : '🔐 Passwort zurücksetzen für Aquarium-Logbuch';
  const preheader = isEn
    ? `Hello ${username}, you requested a password reset for your account.`
    : `Hallo ${username}, du hast eine Anfrage zum Zurücksetzen deines Passworts gestellt.`;
  const headline = isEn ? 'Reset Password' : 'Passwort zurücksetzen';
  const ctaText = isEn ? 'Set New Password' : 'Neues Passwort festlegen';

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
  }, lang);

  const text = isEn
    ? `Hello ${username},

We received a request to reset the password for your account (${username}) at Aquarium Logbook.

To set a new password, please open the following link in your browser:
${resetUrl}

This link is valid for ${expiresMinutes} minutes.

If you did not make this request, you can simply ignore this message. Your password remains unchanged.

Your Aquarium Logbook Team`
    : `Hallo ${username},

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
function createTestEmailMail({ adminUsername, serverInfo, lang = 'de' }: any) {
  const isEn = String(lang).toLowerCase().startsWith('en');
  const subject = isEn ? '✅ Test Email from Aquarium Logbook' : '✅ Test-E-Mail von Aquarium-Logbuch';
  const preheader = isEn
    ? 'Your SMTP email configuration is working properly.'
    : 'Deine SMTP-Mail-Konfiguration funktioniert einwandfrei.';
  const headline = isEn ? 'SMTP Configuration Successful!' : 'SMTP-Konfiguration erfolgreich!';
  const dateStr = isEn
    ? new Date().toLocaleString('en-US')
    : new Date().toLocaleString('de-DE');

  const html = renderTemplate('test-email', {
    title: subject,
    subject,
    preheader,
    headline,
    adminUsername: adminUsername || (isEn ? 'Administrator' : 'Administrator'),
    serverInfo: serverInfo || (isEn ? 'Configured locally' : 'Lokal konfiguriert'),
    dateStr,
  }, lang);

  const text = isEn
    ? `Hello ${adminUsername || 'Administrator'},

The SMTP email configuration for Aquarium Logbook was tested successfully!

Timestamp: ${dateStr}
Server: ${serverInfo || 'Configured locally'}

Your Aquarium Logbook System`
    : `Hallo ${adminUsername || 'Administrator'},

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
function createAccountDeletionMail({ username, deleteUrl, expiresMinutes = 60, lang = 'de' }: any) {
  const isEn = String(lang).toLowerCase().startsWith('en');
  const subject = isEn
    ? '⚠️ Confirmation to permanently delete your user account'
    : '⚠️ Bestätigung zur Löschung deines Benutzerkontos';
  const preheader = isEn
    ? `Hello ${username}, please confirm the permanent deletion of your Aquarium Logbook account.`
    : `Hallo ${username}, bitte bestätige die endgültige Löschung deines Kontos beim Aquarium-Logbuch.`;
  const headline = isEn ? 'Permanently Delete Account' : 'Konto unwiderruflich löschen';
  const ctaText = isEn ? 'Permanently Delete My Account Now' : 'Konto jetzt endgültig löschen';

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
  }, lang);

  const text = isEn
    ? `Hello ${username},

You requested the permanent deletion of your user account at Aquarium Logbook in your profile settings.

IMPORTANT NOTICE:
If you confirm the deletion, your user account and all your aquariums, measurements, alerts, maintenance tasks, uploaded photos, and shares will be permanently deleted!

To confirm the permanent deletion of your account, please open the following link in your browser:
${deleteUrl}

This link is valid for ${expiresMinutes} minutes.

If you do NOT want to delete your account, simply ignore this email. Your account remains unchanged.

Your Aquarium Logbook Team`
    : `Hallo ${username},

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

/**
 * Template für die Freigabe/Einladung zu einem Aquarium.
 * Nutzt 'share-aquarium.tpl'.
 */
function createShareAquariumMail({ username, ownerUsername, aquariumName, role, acceptUrl, expiresDays = 14, lang = 'de' }: any) {
  const isEn = String(lang).toLowerCase().startsWith('en');
  const inviter = ownerUsername || (isEn ? 'A user' : 'Ein Benutzer');
  const roleLabel = role === 'write'
    ? (isEn ? 'Write permissions (record & edit values, stock & logs)' : 'Schreibrechte (Werte erfassen & bearbeiten)')
    : (isEn ? 'Read-only permissions (view values & history)' : 'Leserechte (Werte & Verlauf ansehen)');
  const subject = isEn
    ? `🐠 ${inviter} shared the aquarium "${aquariumName}" with you`
    : `🐠 ${inviter} hat das Aquarium „${aquariumName}“ mit dir geteilt`;
  const preheader = isEn
    ? `${inviter} invited you to manage the aquarium "${aquariumName}" with ${role === 'write' ? 'write permissions' : 'view permissions'}.`
    : `${inviter} hat dich eingeladen, das Aquarium „${aquariumName}“ mit ${role === 'write' ? 'Schreibrechten' : 'Leserechten'} zu verwalten.`;
  const headline = isEn ? 'Aquarium Access Invitation' : 'Aquarium-Freigabe erhalten';
  const ctaText = isEn ? 'Accept Invitation' : 'Freigabe annehmen';

  const html = renderTemplate('share-aquarium', {
    title: subject,
    subject,
    preheader,
    headline,
    username: username || (isEn ? 'Aquarist' : 'Aquarianer'),
    ownerUsername: inviter,
    aquariumName: aquariumName || (isEn ? 'Aquarium' : 'Aquarium'),
    role,
    roleLabel,
    acceptUrl,
    ctaText,
    ctaUrl: acceptUrl,
    expiresDays,
  }, lang);

  const text = isEn
    ? `Hello ${username || 'Aquarist'},

${inviter} would like to share the aquarium "${aquariumName}" with you on Aquarium Logbook!

Sharing details:
- Aquarium: ${aquariumName}
- Shared by: ${inviter}
- Permission: ${roleLabel}

To accept the invitation and add the aquarium to your overview, open the following link:
${acceptUrl}

This link is valid for ${expiresDays} days.

Your Aquarium Logbook Team`
    : `Hallo ${username || 'Aquarianer'},

${inviter} möchte das Aquarium „${aquariumName}“ im Aquarium-Logbuch mit dir teilen!

Details zur Freigabe:
- Aquarium: ${aquariumName}
- Geteilt von: ${inviter}
- Berechtigung: ${roleLabel}

Um die Einladung anzunehmen und das Aquarium in deiner Übersicht zu sehen, öffne bitte folgenden Link im Browser:
${acceptUrl}

Dieser Link ist ${expiresDays} Tage gültig. Nach der Annahme findest du das Becken unter „Mit mir geteilte Aquarien“.

Dein Aquarium-Logbuch Team`;

  return { subject, html, text };
}

/**
 * Template für Einladungen neuer Benutzer.
 * Nutzt 'invitation.tpl'.
 */
function createInvitationMail({ inviterName, inviteUrl, inviteCode, expiresDays = 14, expiresDate = null, lang = 'de' }: any) {
  const isEn = String(lang).toLowerCase().startsWith('en');
  const inviter = inviterName || (isEn ? 'A member' : 'Ein Mitglied');
  const subject = isEn ? `💌 Invitation to Aquarium Logbook from ${inviter}` : `💌 Einladung zu Aquarium-Logbuch von ${inviter}`;
  const preheader = isEn
    ? `${inviter} invited you to join Aquarium Logbook.`
    : `${inviter} hat dich eingeladen, dem Aquarium-Logbuch beizutreten.`;
  const headline = isEn ? 'You are invited!' : 'Du wurdest eingeladen!';
  const ctaText = isEn ? 'Accept Invitation & Register' : 'Einladung annehmen & registrieren';
  const expiresDateHint = expiresDate
    ? (isEn ? ` (until ${expiresDate})` : ` (bis zum ${expiresDate})`)
    : '';

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
  }, lang);

  const text = isEn
    ? `Hello,

${inviter} warmly invited you to join Aquarium Logbook!

With Aquarium Logbook, you can easily track water parameters, maintenance tasks, photos, and fish livestock.

Your Invite Code: ${inviteCode}

Open the following link in your browser to accept your invitation and create your account:
${inviteUrl}

This invitation is valid for ${expiresDays} days${expiresDateHint}.

If you did not expect this invitation, you can safely ignore this email.

Your Aquarium Logbook Team`
    : `Hallo,

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

/**
 * Template für Erinnerungen an fällige Messzyklen.
 * Nutzt 'measure-reminder.tpl'.
 */
function createMeasureReminderMail({ username, aquariumName, cycleLabel, lastDateStr, statusLabel, measureUrl, lang = 'de' }: any) {
  const isEn = String(lang).toLowerCase().startsWith('en');
  const aqName = aquariumName || (isEn ? 'Aquarium' : 'Aquarium');
  const subject = isEn ? `🧪 Reminder: Test measurement due for "${aqName}"` : `🧪 Erinnerung: Messung fällig für „${aqName}“`;
  const preheader = isEn
    ? `A new water test measurement is due for "${aqName}" according to your scheduled test cycle (${cycleLabel}).`
    : `Für dein Aquarium „${aqName}“ ist gemäß deinem Messzyklus (${cycleLabel}) eine neue Messung fällig.`;
  const headline = isEn ? 'Water Measurement Due' : 'Wasserwert-Messung fällig';
  const ctaText = isEn ? 'Record Measurement Now' : 'Messung jetzt eintragen';

  const html = renderTemplate('measure-reminder', {
    title: subject,
    subject,
    preheader,
    headline,
    username: username || (isEn ? 'Aquarist' : 'Aquarianer'),
    aquariumName: aqName,
    cycleLabel: cycleLabel || (isEn ? 'Regular' : 'Regelmäßig'),
    lastDateStr: lastDateStr || (isEn ? 'No previous measurement' : 'Keine bisherige Messung'),
    statusLabel: statusLabel || (isEn ? 'Due' : 'Fällig'),
    measureUrl,
    ctaText,
    ctaUrl: measureUrl,
  }, lang);

  const text = isEn
    ? `Hello ${username || 'Aquarist'},

A new water test measurement is due for your aquarium "${aqName}" according to your scheduled cycle (${cycleLabel})!

Status: ${statusLabel}
Last measurement: ${lastDateStr || 'No previous measurement'}

Record your new water parameters in Aquarium Logbook:
${measureUrl}

Your Aquarium Logbook Team`
    : `Hallo ${username || 'Aquarianer'},

für dein Aquarium „${aqName}“ ist gemäß deinem hinterlegten Messzyklus (${cycleLabel}) eine neue Wasserwert-Messung fällig!

Status: ${statusLabel}
Letzte Messung: ${lastDateStr || 'Keine bisherige Messung'}

Trage deine neuen Wasserwerte direkt im Aquarium-Logbuch ein:
${measureUrl}

Dein Aquarium-Logbuch Team`;

  return { subject, html, text };
}

/**
 * Template für Erinnerungen an fällige Düngzyklen.
 * Nutzt 'fertilize-reminder.tpl'.
 */
function createFertilizeReminderMail({ username, aquariumName, cycleLabel, lastDateStr, statusLabel, fertilizeUrl, lang = 'de' }: any) {
  const isEn = String(lang).toLowerCase().startsWith('en');
  const aqName = aquariumName || (isEn ? 'Aquarium' : 'Aquarium');
  const subject = isEn ? `🌿 Reminder: Fertilization due for "${aqName}"` : `🌿 Erinnerung: Düngung fällig für „${aqName}“`;
  const preheader = isEn
    ? `Plant fertilization is due for "${aqName}" according to your scheduled cycle (${cycleLabel}).`
    : `Für dein Aquarium „${aqName}“ ist gemäß deinem Düngzyklus (${cycleLabel}) eine Düngung fällig.`;
  const headline = isEn ? 'Plant Fertilization Due' : 'Pflanzendüngung fällig';
  const ctaText = isEn ? 'Log Fertilization Now' : 'Düngung im Logbuch eintragen';

  const html = renderTemplate('fertilize-reminder', {
    title: subject,
    subject,
    preheader,
    headline,
    username: username || (isEn ? 'Aquarist' : 'Aquarianer'),
    aquariumName: aqName,
    cycleLabel: cycleLabel || (isEn ? 'Regular' : 'Regelmäßig'),
    lastDateStr: lastDateStr || (isEn ? 'No previous fertilization' : 'Keine bisherige Düngung'),
    statusLabel: statusLabel || (isEn ? 'Due' : 'Fällig'),
    fertilizeUrl,
    ctaText,
    ctaUrl: fertilizeUrl,
  }, lang);

  const text = isEn
    ? `Hello ${username || 'Aquarist'},

Plant fertilization is due for your aquarium "${aqName}" according to your scheduled cycle (${cycleLabel})!

Status: ${statusLabel}
Last fertilization: ${lastDateStr || 'No previous fertilization'}

Log your fertilization in Aquarium Logbook:
${fertilizeUrl}

Your Aquarium Logbook Team`
    : `Hallo ${username || 'Aquarianer'},

für dein Aquarium „${aqName}“ steht gemäß deinem hinterlegten Düngzyklus (${cycleLabel}) eine neue Pflanzendüngung an!

Status: ${statusLabel}
Letzte Düngung: ${lastDateStr || 'Keine bisherige Düngung'}

Dokumentiere deine Düngung im Aquarium-Logbuch:
${fertilizeUrl}

Dein Aquarium-Logbuch Team`;

  return { subject, html, text };
}

function createTestRefillReminderMail({ username, testName, used, capacity, profileUrl, lang = 'de' }: any) {
  const isEn = String(lang).toLowerCase().startsWith('en');
  const remaining = Math.max(0, capacity - used);
  const subject = isEn ? `🧪 Refill needed: ${testName}` : `🧪 Wassertest nachkaufen: ${testName}`;
  const intro = isEn ? `Hello ${username},` : `Hallo ${username},`;
  const numbersText = isEn
    ? `You have used ${used} of approximately ${capacity} tests for ${testName}. Approximately ${remaining} tests remain.`
    : `Du hast für ${testName} bereits ${used} von ungefähr ${capacity} Tests verwendet. Es bleiben ungefähr ${remaining} Tests.`;
  const refillText = isEn
    ? `At least 75% of this test has been used. Please buy a refill for ${testName}.`
    : `Mindestens 75 % dieses Tests sind verbraucht. Bitte kaufe den Test bzw. die Nachfüllreagenzien für ${testName} nach.`;
  const hint = isEn
    ? 'After refilling, reset this test’s usage counter in your profile. Capacity is approximate and depends on your test kit.'
    : 'Setze nach dem Nachfüllen den Verbrauchszähler dieses Tests im Profil zurück. Die Reichweite ist ein Richtwert und hängt von deinem Test-Set ab.';
  const html = renderTemplate('test-refill-reminder', {
    title: subject, headline: subject, intro, numbersText, refillText, hint,
    ctaText: isEn ? 'Manage water tests' : 'Wassertests verwalten', ctaUrl: profileUrl,
  }, lang);
  return { subject, html, text: `${intro}\n\n${numbersText}\n\n${refillText}\n\n${hint}\n\n${profileUrl}` };
}

export = {
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
  createShareAquariumMail,
  createMeasureReminderMail,
  createFertilizeReminderMail,
  createTestRefillReminderMail,
};

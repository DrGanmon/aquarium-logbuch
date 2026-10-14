import { writeJsonFile } from './json-config-store';
import type { MailConfig, MailMessage, QueuedMail, MailStats } from '../types/mail';
import { asRecord } from '../utils/validation';
import { asError } from '../utils/app-error';
'use strict';
import path = require('path');
import fs = require('fs');
import envModule = require('../config/env');
const { DATA_DIR, APP_URL } = envModule;
import smtpModule = require('../utils/smtp');
const { sendSmtpMail } = smtpModule;
const {
  createEmailVerificationMail,
  createPasswordResetMail,
  createTestEmailMail,
  createAccountDeletionMail,
  createInvitationMail,
  createShareAquariumMail,
  createMeasureReminderMail,
  createFertilizeReminderMail,
} = require('./mail-template');
import logger = require('../utils/logger');
import mail_templateModule = require('./mail-template');
const { createTestRefillReminderMail } = mail_templateModule;

const CONFIG_FILE = path.join(DATA_DIR, 'mail-config.json');

const DEFAULT_CONFIG: MailConfig = {
  enabled: false,
  host: process.env.SMTP_HOST || '',
  port: Number(process.env.SMTP_PORT) || 587,
  secure: process.env.SMTP_SECURE === 'true' || Number(process.env.SMTP_PORT) === 465,
  requireTls: false,
  ignoreTls: false,
  rejectUnauthorized: process.env.SMTP_REJECT_UNAUTHORIZED !== 'false',
  user: process.env.SMTP_USER || '',
  pass: process.env.SMTP_PASS || '',
  from: process.env.SMTP_FROM || 'Aquarium-Logbuch <noreply@aquarium.local>',
  rateLimitMs: Number(process.env.SMTP_RATE_LIMIT_MS) || 500, // Verzögerung zwischen E-Mails in ms
};

class MailService {
  readonly configFile: string;
  private queue: QueuedMail[];
  private isProcessing: boolean;
  private stats: MailStats;

  constructor(configFile = CONFIG_FILE, private readonly maxQueueLength = 1000) {
    this.configFile = configFile;
    this.queue = [];
    this.isProcessing = false;
    this.stats = {
      sentCount: 0,
      failedCount: 0,
      lastSentAt: null,
      lastError: null,
    };
    this._ensureDirs();
  }

  _ensureDirs() {
    try {
      fs.mkdirSync(path.dirname(this.configFile), { recursive: true });
    } catch (e) {
      // ignore
    }
  }

  /**
   * Lädt die interne SMTP-Konfiguration (inklusive Passwort).
   */
  getRawConfig(): MailConfig {
    this._ensureDirs();
    let fileConfig: Record<string, unknown> = {};
    if (fs.existsSync(this.configFile)) {
      try {
        fileConfig = asRecord(JSON.parse(fs.readFileSync(this.configFile, 'utf8')) as unknown);
      } catch (caught: unknown) {
        const err = asError(caught);
        logger.error(`Fehler beim Lesen der Mail-Konfiguration: ${err.message}`, 'mail');
      }
    }

    const raw = { ...DEFAULT_CONFIG, ...fileConfig };
    return {
      enabled: fileConfig.enabled === undefined && Boolean(process.env.SMTP_HOST) || Boolean(raw.enabled),
      host: String(raw.host || ''), port: Number(raw.port) || 587, secure: Boolean(raw.secure),
      requireTls: Boolean(raw.requireTls), ignoreTls: Boolean(raw.ignoreTls), rejectUnauthorized: raw.rejectUnauthorized !== false,
      user: String(raw.user || ''), pass: String(raw.pass || ''), from: String(raw.from || ''),
      rateLimitMs: Math.max(100, Math.min(60000, Number(raw.rateLimitMs) || 500)),
    };
  }

  /**
   * Liefert die Konfiguration für die Admin-Oberfläche (Passwort maskiert).
   */
  getConfig() {
    const raw = this.getRawConfig();
    return {
      enabled: Boolean(raw.enabled),
      host: raw.host || '',
      port: Number(raw.port) || 587,
      secure: Boolean(raw.secure),
      requireTls: Boolean(raw.requireTls),
      ignoreTls: Boolean(raw.ignoreTls),
      rejectUnauthorized: raw.rejectUnauthorized !== false,
      user: raw.user || '',
      hasPassword: Boolean(raw.pass),
      from: raw.from || '',
      rateLimitMs: Math.max(100, Math.min(60000, Number(raw.rateLimitMs) || 500)),
    };
  }

  /**
   * Speichert neue SMTP-Einstellungen.
   */
  saveConfig(input: unknown = {}) {
    const newConfig = asRecord(input);
    this._ensureDirs();
    const current = this.getRawConfig();
    const updated: MailConfig = {
      ...current,
      enabled: newConfig.enabled !== undefined ? Boolean(newConfig.enabled) : current.enabled,
      host: newConfig.host !== undefined ? String(newConfig.host).trim() : current.host,
      port: newConfig.port !== undefined ? Number(newConfig.port) || 587 : current.port,
      secure: newConfig.secure !== undefined ? Boolean(newConfig.secure) : current.secure,
      requireTls: newConfig.requireTls !== undefined ? Boolean(newConfig.requireTls) : current.requireTls,
      ignoreTls: newConfig.ignoreTls !== undefined ? Boolean(newConfig.ignoreTls) : current.ignoreTls,
      rejectUnauthorized: newConfig.rejectUnauthorized !== undefined ? Boolean(newConfig.rejectUnauthorized) : current.rejectUnauthorized,
      user: newConfig.user !== undefined ? String(newConfig.user).trim() : current.user,
      from: newConfig.from !== undefined ? String(newConfig.from).trim() : current.from,
      rateLimitMs: newConfig.rateLimitMs !== undefined
        ? Math.max(100, Math.min(60000, Number(newConfig.rateLimitMs) || 500))
        : current.rateLimitMs,
    };

    // Passwort nur aktualisieren, wenn ein neues angegeben wurde
    if (newConfig.pass !== undefined && newConfig.pass !== '') {
      updated.pass = String(newConfig.pass);
    }

    writeJsonFile(this.configFile, updated);
    logger.info(`SMTP-Konfiguration aktualisiert: Server=${updated.host}:${updated.port}, Aktiviert=${updated.enabled}`, 'mail');
    return this.getConfig();
  }

  /**
   * Status der E-Mail-Warteschlange (Queue Status).
   */
  getQueueStatus() {
    return {
      queueLength: this.queue.length,
      isProcessing: this.isProcessing,
      sentCount: this.stats.sentCount,
      failedCount: this.stats.failedCount,
      lastSentAt: this.stats.lastSentAt,
      lastError: this.stats.lastError,
    };
  }

  /**
   * Reiht eine E-Mail in die Warteschlange ein.
   */
  enqueueMail({ to, subject, html, text }: MailMessage) {
    if (this.queue.length >= this.maxQueueLength) return { ok: false, error: 'E-Mail-Warteschlange ist voll.' };
    const item: QueuedMail = {
      id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      to,
      subject,
      html,
      text,
      attempts: 0,
      createdAt: new Date().toISOString(),
    };

    this.queue.push(item);
    logger.info(`E-Mail in Warteschlange eingereiht (ID: ${item.id}) an: ${to}`, 'mail');

    // Queue-Abarbeitung starten, falls nicht aktiv
    void this._processQueue().catch(error => { logger.error(`Fehler bei der Mail-Warteschlange: ${asError(error).message}`, 'mail'); });

    return { ok: true, queueId: item.id, queued: true };
  }

  /**
   * Verarbeitet die E-Mail-Warteschlange sequenziell mit Rate-Limiting.
   */
  async _processQueue() {
    if (this.isProcessing) return;
    this.isProcessing = true;

    try {
      while (this.queue.length > 0) {
        const config = this.getRawConfig();
        if (!config.enabled || !config.host) {
          logger.warn('Mail-Service ist nicht konfiguriert/aktiviert. E-Mails verbleiben in der Queue oder werden ignoriert.', 'mail');
          // Wenn Mail nicht aktiv ist, brechen wir die Queue ab, damit nichts blockiert
          return;
        }

        const item = this.queue.shift();
        if (!item) break;

        item.attempts += 1;
        try {
          await sendSmtpMail(config, {
            from: config.from,
            to: item.to,
            subject: item.subject,
            html: item.html,
            text: item.text,
          });

          this.stats.sentCount += 1;
          this.stats.lastSentAt = new Date().toISOString();
          this.stats.lastError = null;
          logger.info(`E-Mail erfolgreich versendet an: ${item.to} (Betreff: ${item.subject})`, 'mail');
        } catch (caught: unknown) {
          const err = asError(caught);
          this.stats.failedCount += 1;
          this.stats.lastError = err.message;
          logger.error(`Fehler beim Versenden der E-Mail an ${item.to}: ${err.message}`, 'mail');

          // Bis zu 2 Wiederholungsversuche bei temporären Fehlern
          if (item.attempts < 3) {
            this.queue.push(item);
          }
        }

        // Rate-Limiting: Pause zwischen E-Mails einlegen, um Überlastung zu verhindern
        const delayMs = Math.max(100, Number(config.rateLimitMs) || 500);
        await new Promise<void>(resolve => setTimeout(resolve, delayMs));
      }

    } finally { this.isProcessing = false; }
  }

  /**
   * Sendet eine E-Mail direkt ohne Queue (z. B. für den Admin-Testbutton).
   */
  async sendDirect({ to, subject, html, text }: MailMessage) {
    const config = this.getRawConfig();
    if (!config.host) {
      throw new Error('Kein SMTP-Host konfiguriert.');
    }
    const res = await sendSmtpMail(config, {
      from: config.from,
      to,
      subject,
      html,
      text,
    });
    this.stats.sentCount += 1;
    this.stats.lastSentAt = new Date().toISOString();
    return res;
  }

  /**
   * Sendet eine E-Mail-Bestätigung (Verifizierung) an einen Benutzer.
   */
  sendVerificationEmail(user?: any, token?: any, lang: any = null) {
    const userLang = lang || user?.language || 'de';
    const baseUrl = APP_URL || 'http://localhost:3000';
    const verifyUrl = `${baseUrl}/#/verify-email?token=${encodeURIComponent(token)}`;
    const { subject, html, text } = createEmailVerificationMail({
      username: user.username,
      verifyUrl,
      expiresHours: 24,
      lang: userLang,
    });

    return this.enqueueMail({
      to: user.email,
      subject,
      html,
      text,
    });
  }

  /**
   * Sendet eine E-Mail zum Zurücksetzen des Passworts.
   */
  sendPasswordResetEmail(user?: any, token?: any, lang: any = null) {
    const userLang = lang || user?.language || 'de';
    const baseUrl = APP_URL || 'http://localhost:3000';
    const resetUrl = `${baseUrl}/#/reset-password?token=${encodeURIComponent(token)}`;
    const { subject, html, text } = createPasswordResetMail({
      username: user.username,
      resetUrl,
      expiresMinutes: 60,
      lang: userLang,
    });

    return this.enqueueMail({
      to: user.email,
      subject,
      html,
      text,
    });
  }

  /**
   * Sendet eine E-Mail zur Bestätigung der Konto-Löschung.
   */
  sendAccountDeletionEmail(user?: any, token?: any, lang: any = null) {
    const userLang = lang || user?.language || 'de';
    const baseUrl = APP_URL || 'http://localhost:3000';
    const deleteUrl = `${baseUrl}/#/delete-account?token=${encodeURIComponent(token)}`;
    const { subject, html, text } = createAccountDeletionMail({
      username: user.username,
      deleteUrl,
      expiresMinutes: 60,
      lang: userLang,
    });

    return this.enqueueMail({
      to: user.email,
      subject,
      html,
      text,
    });
  }

  /**
   * Sendet eine Einladungs-E-Mail an einen neuen Benutzer.
   */
  sendInvitationEmail({ to, inviterName, inviteCode, expiresDays = 14, expiresDate = null, lang = 'de' }: any) {
    const baseUrl = APP_URL || 'http://localhost:3000';
    const inviteUrl = `${baseUrl}/#/register?invite=${encodeURIComponent(inviteCode)}&email=${encodeURIComponent(to)}`;
    const { subject, html, text } = createInvitationMail({
      inviterName,
      inviteUrl,
      inviteCode,
      expiresDays,
      expiresDate,
      lang,
    });

    return this.enqueueMail({
      to,
      subject,
      html,
      text,
    });
  }

  /**
   * Sendet eine Einladungs-E-Mail zur Aquarium-Freigabe an einen Benutzer.
   */
  sendShareInvitationEmail({ user, ownerUsername, aquariumName, role, token, expiresDays = 14, lang = null }: any) {
    const userLang = lang || user?.language || 'de';
    const baseUrl = APP_URL || 'http://localhost:3000';
    const acceptUrl = `${baseUrl}/#/share-invitation?token=${encodeURIComponent(token)}`;
    const { subject, html, text } = createShareAquariumMail({
      username: user.username,
      ownerUsername,
      aquariumName,
      role,
      acceptUrl,
      expiresDays,
      lang: userLang,
    });

    return this.enqueueMail({
      to: user.email,
      subject,
      html,
      text,
    });
  }

  /**
   * Sendet eine Erinnerungs-E-Mail für einen fälligen Messzyklus.
   */
  sendTestRefillReminderEmail({ user, test }: any) {
    const mail = createTestRefillReminderMail({
      username: user.username,
      testName: test.variantName ? `${test.name} (${test.variantName})` : test.name,
      used: test.used,
      capacity: test.capacity,
      profileUrl: `${APP_URL || 'http://localhost:3000'}/#/profile`,
      lang: user.language || 'de',
    });
    return this.enqueueMail({ to: user.email, ...mail });
  }

  sendMeasureReminderEmail({ user, aquarium, cycleStatus, lang = null }: any) {
    const userLang = lang || user?.language || 'de';
    const isEn = String(userLang).toLowerCase().startsWith('en');
    const baseUrl = APP_URL || 'http://localhost:3000';
    const measureUrl = `${baseUrl}/#/a/${aquarium.id}/messen`;
    const lastDateStr = cycleStatus?.last_action_at
      ? new Date(cycleStatus.last_action_at).toLocaleDateString(isEn ? 'en-US' : 'de-DE')
      : (isEn ? 'No previous measurement' : 'Keine bisherige Messung');

    const { subject, html, text } = createMeasureReminderMail({
      username: user.username,
      aquariumName: aquarium.name,
      cycleLabel: cycleStatus?.cycle_label || (isEn ? 'Regular' : 'Regelmäßig'),
      lastDateStr,
      statusLabel: cycleStatus?.status_label || (isEn ? 'Due' : 'Fällig'),
      measureUrl,
      lang: userLang,
    });

    return this.enqueueMail({
      to: user.email,
      subject,
      html,
      text,
    });
  }

  /**
   * Sendet eine Erinnerungs-E-Mail für einen fälligen Düngzyklus.
   */
  sendFertilizeReminderEmail({ user, aquarium, fertilizer = null, cycleStatus, lang = null }: any) {
    const userLang = lang || user?.language || 'de';
    const isEn = String(userLang).toLowerCase().startsWith('en');
    const baseUrl = APP_URL || 'http://localhost:3000';
    const fertilizeUrl = `${baseUrl}/#/a/${aquarium.id}`;
    const lastDateStr = cycleStatus?.last_action_at
      ? new Date(cycleStatus.last_action_at).toLocaleDateString(isEn ? 'en-US' : 'de-DE')
      : (isEn ? 'No previous fertilization' : 'Keine bisherige Düngung');

    const { subject, html, text } = createFertilizeReminderMail({
      username: user.username,
      aquariumName: aquarium.name,
      fertilizerText: fertilizer ? `${fertilizer.amount_ml} ml ${fertilizer.fertilizer_name} (${fertilizer.name})` : '',
      cycleLabel: cycleStatus?.cycle_label || (isEn ? 'Regular' : 'Regelmäßig'),
      lastDateStr,
      statusLabel: cycleStatus?.status_label || (isEn ? 'Due' : 'Fällig'),
      fertilizeUrl,
      lang: userLang,
    });

    return this.enqueueMail({
      to: user.email,
      subject,
      html,
      text,
    });
  }

  /**
   * Sendet eine Test-E-Mail über die konfigurierten SMTP-Einstellungen.
   */
  async sendTestEmail(toEmail?: any, adminUsername: any = 'Admin', lang: any = 'de') {
    const config = this.getRawConfig();
    const serverInfo = `${config.host}:${config.port} (${config.secure ? 'SSL/TLS' : 'STARTTLS/Standard'})`;
    const { subject, html, text } = createTestEmailMail({
      adminUsername,
      serverInfo,
      lang,
    });

    return this.sendDirect({
      to: toEmail,
      subject,
      html,
      text,
    });
  }
}

const mailService = new MailService();

export = {
  MailService,
  mailService,
};

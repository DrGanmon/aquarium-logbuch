interface CycleConfig { interval?: number | string | null; unit?: string | null; day_of_week?: number | string | null; reminder_mail?: number | boolean | string | null }
import { asError } from '../utils/app-error';
import { acquireRequestLease } from './maintenance-coordinator';

import mail_serviceModule = require('./mail-service');
const { mailService } = mail_serviceModule;
import logger = require('../utils/logger');

const WEEKDAY_NAMES_DE: Record<number, string> = {
  1: 'Montag',
  2: 'Dienstag',
  3: 'Mittwoch',
  4: 'Donnerstag',
  5: 'Freitag',
  6: 'Samstag',
  7: 'Sonntag',
};

const WEEKDAY_SHORT_DE: Record<number, string> = {
  1: 'Mo.',
  2: 'Di.',
  3: 'Mi.',
  4: 'Do.',
  5: 'Fr.',
  6: 'Sa.',
  7: 'So.',
};

const WEEKDAY_NAMES_EN: Record<number, string> = {
  1: 'Monday',
  2: 'Tuesday',
  3: 'Wednesday',
  4: 'Thursday',
  5: 'Friday',
  6: 'Saturday',
  7: 'Sunday',
};

const WEEKDAY_SHORT_EN: Record<number, string> = {
  1: 'Mon',
  2: 'Tue',
  3: 'Wed',
  4: 'Thu',
  5: 'Fri',
  6: 'Sat',
  7: 'Sun',
};

const WEEKDAY_NAMES = WEEKDAY_NAMES_DE;
const WEEKDAY_SHORT = WEEKDAY_SHORT_DE;

/**
 * Wandelt ein Javascript Date in den ISO-Wochentag (1 = Montag, ..., 7 = Sonntag) um.
 */
function getIsoDay(date: Date) {
  const d = date.getDay();
  return d === 0 ? 7 : d;
}

/**
 * Berechnet den Status und das nächste Fälligkeitsdatum für einen Pflege- oder Messzyklus.
 *
 * @param {Object} cycleConfig - { interval, unit, day_of_week, reminder_mail }
 * @param {string|Date|null} lastActionDate - Datum der letzten Durchführung
 * @param {string|Date|null} fallbackDate - Fallback-Datum (z. B. Erstellungsdatum des Aquariums)
 * @param {Date} [nowDate] - Aktueller Zeitpunkt (für Tests injizierbar)
 * @param {string} [lang] - Sprache ('de' oder 'en')
 */
function calculateCycleStatus(cycleConfig: CycleConfig = {}, lastActionDate: string | Date | null = null, fallbackDate: string | Date | null = null, nowDate: Date = new Date(), lang: string = 'de') {
  const isEn = String(lang).toLowerCase().startsWith('en');
  const weekdayNames = isEn ? WEEKDAY_NAMES_EN : WEEKDAY_NAMES_DE;
  const weekdayShort = isEn ? WEEKDAY_SHORT_EN : WEEKDAY_SHORT_DE;

  const interval = cycleConfig.interval != null && cycleConfig.interval !== '' ? Number(cycleConfig.interval) : null;
  const unit = cycleConfig.unit === 'weeks' ? 'weeks' : 'days';
  let dayOfWeek = cycleConfig.day_of_week != null && cycleConfig.day_of_week !== '' ? Number(cycleConfig.day_of_week) : null;
  if (dayOfWeek != null && (dayOfWeek < 1 || dayOfWeek > 7 || !Number.isInteger(dayOfWeek))) {
    dayOfWeek = null;
  }
  const reminderMail = Boolean(cycleConfig.reminder_mail);

  if (!interval || interval <= 0 || !Number.isFinite(interval)) {
    return {
      configured: false,
      interval: null,
      unit,
      day_of_week: dayOfWeek,
      day_of_week_label: dayOfWeek ? weekdayNames[dayOfWeek] : null,
      day_of_week_short: dayOfWeek ? weekdayShort[dayOfWeek] : null,
      reminder_mail: reminderMail,
      last_action_at: lastActionDate ? new Date(lastActionDate).toISOString() : null,
      next_due_at: null,
      is_due: false,
      is_overdue: false,
      days_remaining: null,
      days_overdue: 0,
      cycle_label: isEn ? 'No cycle configured' : 'Kein Zyklus festgelegt',
      status_label: isEn ? 'Not configured' : 'Nicht konfiguriert',
    };
  }

  // Bestimme Referenzdatum (nur Datumsteil ohne Uhrzeit für faire Tagesvergleiche)
  const now = new Date(nowDate);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  let baseDate;
  if (lastActionDate) {
    const d = new Date(lastActionDate);
    baseDate = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  } else if (fallbackDate) {
    const d = new Date(fallbackDate);
    baseDate = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  } else {
    baseDate = new Date(today);
  }

  let nextDue;

  if (unit === 'days') {
    nextDue = new Date(baseDate);
    nextDue.setDate(nextDue.getDate() + interval);
    if (dayOfWeek != null) {
      while (getIsoDay(nextDue) !== dayOfWeek) {
        nextDue.setDate(nextDue.getDate() + 1);
      }
    }
  } else {
    // unit === 'weeks'
    if (dayOfWeek != null) {
      const baseIso = getIsoDay(baseDate);
      const dayDiff = dayOfWeek - baseIso;
      const targetInBaseWeek = new Date(baseDate);
      targetInBaseWeek.setDate(targetInBaseWeek.getDate() + dayDiff);

      nextDue = new Date(targetInBaseWeek);
      nextDue.setDate(nextDue.getDate() + interval * 7);

      // Falls das Ziel vor oder auf dem baseDate liegt, mindestens um das Intervall vorschieben
      while (nextDue <= baseDate) {
        nextDue.setDate(nextDue.getDate() + interval * 7);
      }
    } else {
      nextDue = new Date(baseDate);
      nextDue.setDate(nextDue.getDate() + interval * 7);
    }
  }

  const diffMs = nextDue.getTime() - today.getTime();
  const diffDays = Math.round(diffMs / (24 * 3600 * 1000));

  const isDue = diffDays <= 0;
  const isOverdue = diffDays < 0;
  const daysOverdue = isOverdue ? Math.abs(diffDays) : (diffDays === 0 ? 0 : 0);
  const daysRemaining = diffDays > 0 ? diffDays : 0;

  let statusLabel;
  if (isEn) {
    if (diffDays === 0) {
      statusLabel = 'Due today';
    } else if (diffDays === 1) {
      statusLabel = 'Due tomorrow';
    } else if (diffDays > 1) {
      statusLabel = `Due in ${diffDays} days`;
    } else if (diffDays === -1) {
      statusLabel = 'Overdue since yesterday (1 day)';
    } else {
      statusLabel = `Overdue since ${Math.abs(diffDays)} days`;
    }
  } else {
    if (diffDays === 0) {
      statusLabel = 'Fällig heute';
    } else if (diffDays === 1) {
      statusLabel = 'Fällig morgen';
    } else if (diffDays > 1) {
      statusLabel = `Fällig in ${diffDays} Tagen`;
    } else if (diffDays === -1) {
      statusLabel = 'Überfällig seit gestern (1 Tag)';
    } else {
      statusLabel = `Überfällig seit ${Math.abs(diffDays)} Tagen`;
    }
  }

  const dayLabel = dayOfWeek ? ` (${weekdayNames[dayOfWeek]})` : '';
  let cycleLabel;
  if (isEn) {
    if (unit === 'days') {
      cycleLabel = interval === 1 ? `Daily${dayLabel}` : `Every ${interval} days${dayLabel}`;
    } else {
      cycleLabel = interval === 1 ? `Weekly${dayLabel}` : `Every ${interval} weeks${dayLabel}`;
    }
  } else {
    if (unit === 'days') {
      cycleLabel = interval === 1 ? `Täglich${dayLabel}` : `Alle ${interval} Tage${dayLabel}`;
    } else {
      cycleLabel = interval === 1 ? `Wöchentlich${dayLabel}` : `Alle ${interval} Wochen${dayLabel}`;
    }
  }

  return {
    configured: true,
    interval,
    unit,
    day_of_week: dayOfWeek,
    day_of_week_label: dayOfWeek ? weekdayNames[dayOfWeek] : null,
    day_of_week_short: dayOfWeek ? weekdayShort[dayOfWeek] : null,
    reminder_mail: reminderMail,
    last_action_at: lastActionDate ? new Date(lastActionDate).toISOString() : null,
    next_due_at: nextDue.toISOString(),
    is_due: isDue,
    is_overdue: isOverdue,
    days_remaining: daysRemaining,
    days_overdue: daysOverdue,
    cycle_label: cycleLabel,
    status_label: statusLabel,
  };
}

class ReminderService {
  schedulerTimer: ReturnType<typeof setInterval> | null;
  private initialTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingCheck: Promise<{ sent: number; checked: number }> | null = null;

  constructor() {
    this.schedulerTimer = null;
  }

  startScheduler(intervalMinutes: number = 1) {
    if (this.schedulerTimer) return;
    logger.info(`Starte Zyklus-Erinnerungs-Scheduler (Prüfung alle ${intervalMinutes} Minuten)`, 'reminder');

    // Initiale Prüfung nach kurzem Anlauf
    this.initialTimer = setTimeout(() => {
      this.initialTimer = null;
      this.runScheduledCheck().catch((err: any) => {
        logger.error(`Fehler bei initialer Erinnerungsprüfung: ${err.message}`, 'reminder');
      });
    }, 5000);

    const intervalMs = Math.max(1, intervalMinutes) * 60 * 1000;
    this.schedulerTimer = setInterval(async () => {
      try {
        await this.runScheduledCheck();
      } catch (caught: unknown) {
        const err = asError(caught);
        logger.error(`Fehler beim Zyklus-Erinnerungsdurchlauf: ${err.message}`, 'reminder');
      }
    }, intervalMs);
    this.schedulerTimer.unref();
  }

  private async runScheduledCheck() {
    const lease = await acquireRequestLease();
    if (!lease) return { sent: 0, checked: 0 };
    try { return await this.checkAndSendReminders(); }
    finally { await lease.release(); }
  }

  stopScheduler() {
    if (this.initialTimer) clearTimeout(this.initialTimer);
    this.initialTimer = null;
    if (this.schedulerTimer) {
      clearInterval(this.schedulerTimer);
      this.schedulerTimer = null;
    }
  }

  /**
   * Prüft alle Aquarien auf fällige Mess- und Düngzyklen und versendet bei Bedarf Erinnerungs-Mails.
   */
  checkAndSendReminders(dbInstance: any = null): Promise<{ sent: number; checked: number }> {
    if (this.pendingCheck) return this.pendingCheck;
    this.pendingCheck = this.runCheck(dbInstance).finally(() => { this.pendingCheck = null; });
    return this.pendingCheck;
  }

  private async runCheck(dbInstance: any = null) {
    const db = dbInstance || require('../db');
    if (db?.users?.mutateTestInventory) {
      await require('./test-inventory-service').checkAllReminders(db);
    }
    if (!db || !db.aquariums) return { sent: 0, checked: 0 };

    const aquariums = await db.aquariums.listAllRaw();
    if (!aquariums || !aquariums.length) return { sent: 0, checked: 0 };

    const now = new Date();
    const { processDosingPlans } = require('./dosing-service');
    let sentCount = (await processDosingPlans(db, aquariums, now)).sent;
    const todayStr = now.toISOString().slice(0, 10);

    for (const aq of aquariums) {
      // Nur Aquarien mit mindestens einer aktiven Erinnerungs-Mail
      const hasMeasureMail = Boolean(aq.measure_reminder_mail && aq.measure_cycle_interval);
      if (!hasMeasureMail) continue;

      const user = await db.users.findById(aq.user_id);
      if (!user || !user.email || !user.email_verified) continue;
      const userLang = user.language || 'de';

      // 1. Messzyklus prüfen
      if (hasMeasureMail) {
        const lastMeas = await db.measurements.findLastForAquarium(aq.id);
        const lastMeasDate = lastMeas ? lastMeas.measured_at : null;
        const measureStatus = calculateCycleStatus(
          {
            interval: aq.measure_cycle_interval,
            unit: aq.measure_cycle_unit,
            day_of_week: aq.measure_cycle_day_of_week,
            reminder_mail: aq.measure_reminder_mail,
          },
          lastMeasDate,
          aq.created_at,
          now,
          userLang
        );

        if (measureStatus.is_due) {
          let shouldSend = true;
          if (aq.last_measure_reminder_sent_at) {
            const lastSent = new Date(aq.last_measure_reminder_sent_at);
            const lastSentDay = lastSent.toISOString().slice(0, 10);
            // Bereits heute gesendet?
            if (lastSentDay === todayStr) {
              shouldSend = false;
            }
            // Oder gesendet nach der letzten Messung und weniger als 24h her?
            if (lastMeasDate && lastSent > new Date(lastMeasDate) && (now.getTime() - lastSent.getTime()) < 24 * 3600 * 1000) {
              shouldSend = false;
            }
          }

          const previous = aq.last_measure_reminder_sent_at || null;
          const claimedAt = now.toISOString();
          if (shouldSend && await db.aquariums.updateReminderSent(aq.id, 'measure', claimedAt, previous)) {
            try {
              const queued = mailService.sendMeasureReminderEmail({
                user,
                aquarium: aq,
                cycleStatus: measureStatus,
                lang: userLang,
              });
              if (!queued.ok) throw new Error(queued.error || 'E-Mail konnte nicht eingereiht werden.');
              aq.last_measure_reminder_sent_at = now.toISOString();
              sentCount++;
              logger.info(`Messzyklus-Erinnerung versendet für Aquarium „${aq.name}“ an ${user.email} (Lang: ${userLang})`, 'reminder');
            } catch (caught: unknown) {
              const err = asError(caught);
              await db.aquariums.updateReminderSent(aq.id, 'measure', previous, claimedAt);
              logger.error(`Fehler beim Senden der Messzyklus-Erinnerung für Aq #${aq.id}: ${err.message}`, 'reminder');
            }
          }
        }
      }

    }

    return { sent: sentCount, checked: aquariums.length };
  }
}

const reminderService = new ReminderService();

export = {
  WEEKDAY_NAMES,
  WEEKDAY_SHORT,
  getIsoDay,
  calculateCycleStatus,
  ReminderService,
  reminderService,
};

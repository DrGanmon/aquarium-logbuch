'use strict';

const { mailService } = require('./mail-service');
const logger = require('../utils/logger');

const WEEKDAY_NAMES_DE = {
  1: 'Montag',
  2: 'Dienstag',
  3: 'Mittwoch',
  4: 'Donnerstag',
  5: 'Freitag',
  6: 'Samstag',
  7: 'Sonntag',
};

const WEEKDAY_SHORT_DE = {
  1: 'Mo.',
  2: 'Di.',
  3: 'Mi.',
  4: 'Do.',
  5: 'Fr.',
  6: 'Sa.',
  7: 'So.',
};

const WEEKDAY_NAMES_EN = {
  1: 'Monday',
  2: 'Tuesday',
  3: 'Wednesday',
  4: 'Thursday',
  5: 'Friday',
  6: 'Saturday',
  7: 'Sunday',
};

const WEEKDAY_SHORT_EN = {
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
function getIsoDay(date) {
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
function calculateCycleStatus(cycleConfig = {}, lastActionDate = null, fallbackDate = null, nowDate = new Date(), lang = 'de') {
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
  constructor() {
    this.schedulerTimer = null;
  }

  startScheduler(intervalMinutes = 30) {
    if (this.schedulerTimer) return;
    logger.info(`Starte Zyklus-Erinnerungs-Scheduler (Prüfung alle ${intervalMinutes} Minuten)`, 'reminder');

    // Initiale Prüfung nach kurzem Anlauf
    setTimeout(() => {
      this.checkAndSendReminders().catch((err) => {
        logger.error(`Fehler bei initialer Erinnerungsprüfung: ${err.message}`, 'reminder');
      });
    }, 5000);

    const intervalMs = Math.max(1, intervalMinutes) * 60 * 1000;
    this.schedulerTimer = setInterval(async () => {
      try {
        await this.checkAndSendReminders();
      } catch (err) {
        logger.error(`Fehler beim Zyklus-Erinnerungsdurchlauf: ${err.message}`, 'reminder');
      }
    }, intervalMs);
    this.schedulerTimer.unref();
  }

  stopScheduler() {
    if (this.schedulerTimer) {
      clearInterval(this.schedulerTimer);
      this.schedulerTimer = null;
    }
  }

  /**
   * Prüft alle Aquarien auf fällige Mess- und Düngzyklen und versendet bei Bedarf Erinnerungs-Mails.
   */
  async checkAndSendReminders(dbInstance = null) {
    const db = dbInstance || require('../db');
    if (db?.users?.mutateTestInventory) {
      await require('./test-inventory-service').checkAllReminders(db);
    }
    if (!db || !db.aquariums) return { sent: 0, checked: 0 };

    const aquariums = await db.aquariums.listAllRaw();
    if (!aquariums || !aquariums.length) return { sent: 0, checked: 0 };

    let sentCount = 0;
    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);

    for (const aq of aquariums) {
      // Nur Aquarien mit mindestens einer aktiven Erinnerungs-Mail
      const hasMeasureMail = Boolean(aq.measure_reminder_mail && aq.measure_cycle_interval);
      const hasFertilizeMail = Boolean(aq.fertilize_reminder_mail && aq.fertilize_cycle_interval);
      if (!hasMeasureMail && !hasFertilizeMail) continue;

      const user = await db.users.findById(aq.user_id);
      if (!user || !user.email) continue;
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

          if (shouldSend) {
            try {
              mailService.sendMeasureReminderEmail({
                user,
                aquarium: aq,
                cycleStatus: measureStatus,
                lang: userLang,
              });
              await db.aquariums.updateReminderSent(aq.id, 'measure', now.toISOString());
              aq.last_measure_reminder_sent_at = now.toISOString();
              sentCount++;
              logger.info(`Messzyklus-Erinnerung versendet für Aquarium „${aq.name}“ an ${user.email} (Lang: ${userLang})`, 'reminder');
            } catch (err) {
              logger.error(`Fehler beim Senden der Messzyklus-Erinnerung für Aq #${aq.id}: ${err.message}`, 'reminder');
            }
          }
        }
      }

      // 2. Düngzyklus prüfen
      if (hasFertilizeMail) {
        const lastFertilize = await db.maintenance.findLastByType(aq.id, 'fertilize');
        const lastFertilizeDate = lastFertilize ? lastFertilize.logged_at : null;
        const fertilizeStatus = calculateCycleStatus(
          {
            interval: aq.fertilize_cycle_interval,
            unit: aq.fertilize_cycle_unit,
            day_of_week: aq.fertilize_cycle_day_of_week,
            reminder_mail: aq.fertilize_reminder_mail,
          },
          lastFertilizeDate,
          aq.created_at,
          now,
          userLang
        );

        if (fertilizeStatus.is_due) {
          let shouldSend = true;
          if (aq.last_fertilize_reminder_sent_at) {
            const lastSent = new Date(aq.last_fertilize_reminder_sent_at);
            const lastSentDay = lastSent.toISOString().slice(0, 10);
            if (lastSentDay === todayStr) {
              shouldSend = false;
            }
            if (lastFertilizeDate && lastSent > new Date(lastFertilizeDate) && (now.getTime() - lastSent.getTime()) < 24 * 3600 * 1000) {
              shouldSend = false;
            }
          }

          if (shouldSend) {
            try {
              mailService.sendFertilizeReminderEmail({
                user,
                aquarium: aq,
                cycleStatus: fertilizeStatus,
                lang: userLang,
              });
              await db.aquariums.updateReminderSent(aq.id, 'fertilize', now.toISOString());
              aq.last_fertilize_reminder_sent_at = now.toISOString();
              sentCount++;
              logger.info(`Düngzyklus-Erinnerung versendet für Aquarium „${aq.name}“ an ${user.email} (Lang: ${userLang})`, 'reminder');
            } catch (err) {
              logger.error(`Fehler beim Senden der Düngzyklus-Erinnerung für Aq #${aq.id}: ${err.message}`, 'reminder');
            }
          }
        }
      }
    }

    return { sent: sentCount, checked: aquariums.length };
  }
}

const reminderService = new ReminderService();

module.exports = {
  WEEKDAY_NAMES,
  WEEKDAY_SHORT,
  getIsoDay,
  calculateCycleStatus,
  ReminderService,
  reminderService,
};

import { calculateCycleStatus, WEEKDAY_NAMES, WEEKDAY_SHORT, getIsoDay } from '../shared/cycles';
import { asError } from '../utils/app-error';
import { acquireRequestLease } from './maintenance-coordinator';

import mail_serviceModule = require('./mail-service');
const { mailService } = mail_serviceModule;
import logger = require('../utils/logger');

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

import { validateDosingPumpInput, nextAutomaticDosingAt, manualDosingStatus } from '../shared/dosing';
import type { DosingPump } from '../types/domain';

async function processDosingPlans(db: any, aquariums: any[], now = new Date()): Promise<{ sent: number; logged: number }> {
  if (!db.dosingPumps) return { sent: 0, logged: 0 };
  const { mailService } = require('./mail-service');
  const logger = require('../utils/logger');
  let sent = 0, logged = 0;
  for (const aq of aquariums) {
    const plans: DosingPump[] = await db.dosingPumps.listForAquarium(aq.id);
    for (const plan of plans) {
      if (!plan.is_active) continue;
      try {
        if (plan.mode !== 'manual') {
          // Bound catch-up work; subsequent passes continue any remaining backlog.
          for (let count = 0; count < 31; count++) {
            const due = nextAutomaticDosingAt(plan);
            if (!Number.isFinite(due.getTime()) || due > now) break;
            const result = await db.dosingPumps.logDosing(plan.id, aq.id, null, due.toISOString(), true);
            if (!result) break;
            plan.last_dosed_at = due.toISOString();
            if (result.created) logged++;
          }
          continue;
        }
        if (!plan.reminder_mail) continue;
        const user = await db.users.findById(aq.user_id);
        if (!user?.email || !user.email_verified) continue;
        const status = manualDosingStatus(plan, now, user.language || 'de');
        if (!status.is_due) continue;
        const previous = plan.last_reminder_sent_at || null;
        if (previous && now.getTime() - new Date(previous).getTime() < 24 * 3600 * 1000) continue;
        const claimed = now.toISOString();
        if (!await db.dosingPumps.updateReminderSent(plan.id, aq.id, claimed, previous)) continue;
        try {
          const queued = mailService.sendFertilizeReminderEmail({ user, aquarium: aq, fertilizer: plan, cycleStatus: status, lang: user.language || 'de' });
          if (!queued.ok) throw new Error(queued.error || 'E-Mail konnte nicht eingereiht werden.');
          sent++;
        } catch (error) {
          await db.dosingPumps.updateReminderSent(plan.id, aq.id, previous, claimed);
          throw error;
        }
      } catch (error) { logger.error(`Düngerplan #${plan.id}: ${error instanceof Error ? error.message : String(error)}`, 'dosing'); }
    }
  }
  return { sent, logged };
}

export = {
  validateDosingPumpInput,
  nextAutomaticDosingAt,
  manualDosingStatus,
  processDosingPlans,
};

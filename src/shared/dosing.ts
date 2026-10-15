import type { DosingPump, DosingPumpInput, ValidationResult } from '../types/domain';
import { str } from './input';
import { calculateCycleStatus } from './cycles';
export function validateDosingPumpInput(body: Record<string, unknown>): ValidationResult<DosingPumpInput> {
  const mode = body.mode === undefined ? 'automatic' : body.mode;
  if (!['manual', 'automatic'].includes(String(mode))) return { error: 'Ungültige Düngerart.' };
  const reminderMail = [true, 1, '1'].includes(body.reminder_mail as boolean | number | string) ? 1 : 0;
  if (mode === 'automatic' && reminderMail) return { error: 'Mail-Erinnerungen sind nur für manuelle Dünger möglich.' };
  const name = str(body.name, 100);
  if (!name) {
    return { error: 'Bitte einen Namen für den Dünger oder Pumpenkanal angeben.' };
  }

  const fertilizerName = str(body.fertilizer_name || body.fertilizerName || body.fertilizer, 100);
  if (!fertilizerName) {
    return { error: 'Bitte den Namen des Düngers oder der dosierten Flüssigkeit angeben.' };
  }

  let amountMl = Number(typeof body.amount_ml === 'string' ? body.amount_ml.replace(',', '.') : body.amount_ml);
  if (!Number.isFinite(amountMl) || amountMl <= 0 || amountMl > 1000) {
    return { error: 'Bitte eine gültige Dosiermenge in Millilitern angeben (z. B. 2.5 ml).' };
  }
  amountMl = Math.round(amountMl * 100) / 100;
  if (amountMl < 0.01) return { error: 'Die kleinste Dosiermenge beträgt 0.01 ml.' };

  const intervalDays = Number(body.interval_days != null ? body.interval_days : 1);
  if (!Number.isInteger(intervalDays) || intervalDays < 1 || intervalDays > 365) {
    return { error: 'Bitte ein gültiges Dosierintervall in Tagen angeben (z. B. 1 für täglich).' };
  }

  const timeOfDay = str(body.time_of_day, 10);
  if (timeOfDay && !/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(timeOfDay)) {
    return { error: 'Bitte eine gültige Uhrzeit angeben (HH:MM).' };
  }

  const isActive = ([false, 0, '0', 'false'] as unknown[]).includes(body.is_active) ? 0 : 1;
  const note = str(body.note, 500);

  return {
    value: {
      mode: mode as 'manual' | 'automatic',
      reminder_mail: reminderMail,
      name,
      fertilizer_name: fertilizerName,
      amount_ml: amountMl,
      interval_days: intervalDays,
      time_of_day: timeOfDay || null,
      is_active: isActive,
      note: note || null,
    },
  };
}

export function nextAutomaticDosingAt(pump: DosingPump): Date {
  const start = new Date(pump.schedule_started_at || pump.created_at);
  const last = pump.last_dosed_at ? new Date(pump.last_dosed_at) : null;
  const continuing = last && last >= start;
  const next = new Date(continuing ? last : start);
  const [hours, minutes] = (pump.time_of_day || '00:00').split(':').map(Number);
  if (continuing) next.setDate(next.getDate() + pump.interval_days);
  next.setHours(hours, minutes, 0, 0);
  if (!continuing && next < start) next.setDate(next.getDate() + 1);
  return next;
}

export function manualDosingStatus(plan: DosingPump, now = new Date(), language = 'de') {
  const status = calculateCycleStatus({ interval: plan.interval_days, unit: 'days', reminder_mail: plan.reminder_mail }, plan.last_dosed_at, plan.schedule_started_at || plan.created_at, now, language);
  if (status.next_due_at && plan.time_of_day) {
    const due = new Date(status.next_due_at);
    const [hours, minutes] = plan.time_of_day.split(':').map(Number);
    due.setHours(hours, minutes, 0, 0);
    status.next_due_at = due.toISOString();status.is_due = due <= now;
  }
  return status;
}


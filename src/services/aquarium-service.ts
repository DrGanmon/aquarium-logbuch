import type { Aquarium, AquariumInput, AccessRole, CycleUnit, ValidationResult } from '../types/domain';
import { asRecord } from '../utils/validation';
interface CycleSettings { interval: number | null; unit: CycleUnit; day_of_week: number | null; reminder_mail: 0 | 1 }
'use strict';
import helpersModule = require('../utils/helpers');
const { str } = helpersModule;
import reminder_serviceModule = require('./reminder-service');
const { calculateCycleStatus } = reminder_serviceModule;

function parseCycleParams(body: Record<string, unknown>, prefix: 'measure' | 'fertilize'): ValidationResult<CycleSettings> {
  const rawInterval = body[`${prefix}_cycle_interval`];
  let interval: number | null = Number(rawInterval);
  if (rawInterval === '' || rawInterval === null || rawInterval === undefined) {
    interval = null;
  } else {
    interval = Math.round(Number(interval));
    if (!Number.isFinite(interval) || interval < 0 || interval > 365) {
      return { error: `${prefix === 'measure' ? 'Messzyklus' : 'Düngzyklus'}: Intervall muss zwischen 0 und 365 liegen.` };
    }
    if (interval === 0) interval = null;
  }

  const unit: CycleUnit = body[`${prefix}_cycle_unit`] === 'weeks' ? 'weeks' : 'days';

  const rawDay = body[`${prefix}_cycle_day_of_week`];
  let dayOfWeek: number | null = Number(rawDay);
  if (rawDay === '' || rawDay === null || rawDay === undefined || rawDay === '0' || rawDay === 0) {
    dayOfWeek = null;
  } else {
    dayOfWeek = Math.round(Number(dayOfWeek));
    if (!Number.isFinite(dayOfWeek) || dayOfWeek < 1 || dayOfWeek > 7) {
      return { error: 'Wochentag: bitte einen Wert zwischen 1 (Montag) und 7 (Sonntag) auswählen.' };
    }
  }

  const reminderMail = body[`${prefix}_reminder_mail`] === true || body[`${prefix}_reminder_mail`] === '1' || body[`${prefix}_reminder_mail`] === 1 ? 1 : 0;

  return {
    value: {
      interval,
      unit,
      day_of_week: dayOfWeek,
      reminder_mail: reminderMail,
    },
  };
}

function aquariumInput(input: unknown): ValidationResult<AquariumInput> {
  const body = asRecord(input);
  const name = str(body.name, 80);
  if (!name) return { error: 'Bitte einen Namen eingeben.' };
  const water_type = body.water_type === 'salt' ? 'salt' : 'fresh';
  let volume_l = body.volume_l === '' || body.volume_l == null ? null : Math.round(Number(body.volume_l));
  if (volume_l != null && (!Number.isFinite(volume_l) || volume_l < 1 || volume_l > 100000)) {
    return { error: 'Volumen: bitte eine Zahl zwischen 1 und 100000 Litern angeben.' };
  }

  const measureCycleRes = parseCycleParams(body, 'measure');
  if (measureCycleRes.error !== undefined) return { error: measureCycleRes.error };

  const fertilizeCycleRes = parseCycleParams(body, 'fertilize');
  if (fertilizeCycleRes.error !== undefined) return { error: fertilizeCycleRes.error };

  let reminder_days = Math.round(Number(body.reminder_days ?? 7));
  if (!Number.isFinite(reminder_days) || reminder_days < 0 || reminder_days > 365) {
    return { error: 'Erinnerung: 0–365 Tage (0 = aus).' };
  }

  // Synchronisiere reminder_days und Messzyklus
  if (measureCycleRes.value.interval != null) {
    reminder_days = measureCycleRes.value.unit === 'weeks' ? measureCycleRes.value.interval * 7 : measureCycleRes.value.interval;
  } else if (reminder_days > 0 && body.measure_cycle_interval === undefined) {
    measureCycleRes.value.interval = reminder_days;
    measureCycleRes.value.unit = 'days';
  }

  const motto = str(body.motto, 160) || null;
  const description = str(body.description, 4000) || null;
  const notes = str(body.notes, 1000) || null;

  return {
    value: {
      name,
      water_type,
      volume_l,
      reminder_days,
      notes,
      motto,
      description,
      measure_cycle_interval: measureCycleRes.value.interval,
      measure_cycle_unit: measureCycleRes.value.unit,
      measure_cycle_day_of_week: measureCycleRes.value.day_of_week,
      measure_reminder_mail: measureCycleRes.value.reminder_mail,
      fertilize_cycle_interval: fertilizeCycleRes.value.interval,
      fertilize_cycle_unit: fertilizeCycleRes.value.unit,
      fertilize_cycle_day_of_week: fertilizeCycleRes.value.day_of_week,
      fertilize_reminder_mail: fertilizeCycleRes.value.reminder_mail,
    },
  };
}

function isOverdue(aq: Aquarium, last?: { measured_at: string } | null) {
  if (aq.measure_cycle_interval) {
    const status = calculateCycleStatus(
      {
        interval: aq.measure_cycle_interval,
        unit: aq.measure_cycle_unit,
        day_of_week: aq.measure_cycle_day_of_week,
      },
      last?.measured_at || null,
      aq.created_at || null
    );
    return status.is_due;
  }
  if (!aq.reminder_days) return false;
  if (!last) return false;
  return Date.now() - new Date(last.measured_at).getTime() > aq.reminder_days * 86400000;
}

async function aquariumSummary(aq: Aquarium, db?: { aquariums?: { getSummary(aquarium: Aquarium, role: AccessRole | null): Promise<unknown> } }, role: AccessRole | null = null) {
  if (db && db.aquariums && typeof db.aquariums.getSummary === 'function') {
    return await db.aquariums.getSummary(aq, role);
  }
  return {
    ...aq,
    role: role || aq.role || 'owner',
    owner_username: aq.owner_username || null,
    has_image: !!aq.image_file,
    image_url: aq.image_file ? `api/aquariums/${aq.id}/image` : null,
    shares_count: 0,
    last_measured_at: null,
    last_water_change_at: null,
    last_water_change_percent: null,
    last_maintenance_at: null,
    last_maintenance_type: null,
    open_crit: 0,
    open_warn: 0,
    overdue: false,
  };
}

export = {
  aquariumInput,
  isOverdue,
  aquariumSummary,
};

import { aquariumInput } from '../shared/aquarium-input';
import type { Aquarium, AccessRole } from '../types/domain';
import reminder_serviceModule = require('./reminder-service');
const { calculateCycleStatus } = reminder_serviceModule;

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

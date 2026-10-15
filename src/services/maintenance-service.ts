import { MAINTENANCE_TYPES, validateMaintenanceInput } from '../shared/maintenance';
async function getAquariumTimeline(db?: any, aquariumId?: any, options: any = {}) {
  if (db && db.maintenance && typeof db.maintenance.getTimeline === 'function') {
    return await db.maintenance.getTimeline(aquariumId, options);
  }
  return [];
}

export = {
  MAINTENANCE_TYPES,
  validateMaintenanceInput,
  getAquariumTimeline,
};

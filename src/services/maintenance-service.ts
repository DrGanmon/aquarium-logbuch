'use strict';
import helpersModule = require('../utils/helpers');
const { str } = helpersModule;

const MAINTENANCE_TYPES: Record<string, any> = {
  water_change: { key: 'water_change', label: 'Wasserwechsel', icon: '💧', hasPercentage: true },
  filter_change: { key: 'filter_change', label: 'Filter wechseln', icon: '🔄', hasPercentage: false },
  filter_clean: { key: 'filter_clean', label: 'Filter reinigen', icon: '🧹', hasPercentage: false },
  plants_cut: { key: 'plants_cut', label: 'Pflanzen schneiden', icon: '✂️', hasPercentage: false },
  plants_new: { key: 'plants_new', label: 'Neue Pflanzen', icon: '🌱', hasPercentage: false },
  care: { key: 'care', label: 'Pflege & Reinigung', icon: '🧽', hasPercentage: false },
  fertilize: { key: 'fertilize', label: 'Düngung', icon: '🌿', hasPercentage: false },
  dosing_pump: { key: 'dosing_pump', label: 'Dosierpumpe & Düngung', icon: '⚙️', hasPercentage: false },
  feeding: { key: 'feeding', label: 'Spezialfütterung', icon: '🦐', hasPercentage: false },
  other: { key: 'other', label: 'Sonstige Arbeit', icon: '📝', hasPercentage: false },
};

function validateMaintenanceInput(body?: any) {
  const typeKey = str(body.type, 40);
  if (!typeKey || !MAINTENANCE_TYPES[typeKey]) {
    return { error: 'Ungültige oder fehlende Kategorie für die Arbeit.' };
  }

  let loggedAt = new Date();
  if (body.logged_at) {
    loggedAt = new Date(body.logged_at);
    if (Number.isNaN(loggedAt.getTime()) || loggedAt.getTime() > Date.now() + 5 * 60000) {
      return { error: 'Das Datum ist ungültig oder liegt in der Zukunft.' };
    }
  }

  let percentage = null;
  if (body.percentage !== '' && body.percentage != null) {
    percentage = Number(typeof body.percentage === 'string' ? body.percentage.replace(',', '.') : body.percentage);
    if (!Number.isFinite(percentage) || percentage < 1 || percentage > 100) {
      return { error: 'Wasserwechsel-Anteil: bitte einen Prozentwert zwischen 1 und 100 eingeben.' };
    }
    percentage = Math.round(percentage * 10) / 10;
  }

  const details = str(body.details, 500);
  const note = str(body.note, 1000);

  return {
    value: {
      type: typeKey,
      logged_at: loggedAt.toISOString(),
      percentage,
      details: details || null,
      note: note || null,
    },
  };
}

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

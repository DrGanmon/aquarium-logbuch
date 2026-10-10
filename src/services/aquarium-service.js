'use strict';
const { str } = require('../utils/helpers');

function aquariumInput(body) {
  const name = str(body.name, 80);
  if (!name) return { error: 'Bitte einen Namen eingeben.' };
  const water_type = body.water_type === 'salt' ? 'salt' : 'fresh';
  let volume_l = body.volume_l === '' || body.volume_l == null ? null : Math.round(Number(body.volume_l));
  if (volume_l != null && (!Number.isFinite(volume_l) || volume_l < 1 || volume_l > 100000)) {
    return { error: 'Volumen: bitte eine Zahl zwischen 1 und 100000 Litern angeben.' };
  }
  let reminder_days = Math.round(Number(body.reminder_days ?? 7));
  if (!Number.isFinite(reminder_days) || reminder_days < 0 || reminder_days > 365) {
    return { error: 'Erinnerung: 0–365 Tage (0 = aus).' };
  }
  const motto = str(body.motto, 160) || null;
  const description = str(body.description, 4000) || null;
  const notes = str(body.notes, 1000) || null;

  return { value: { name, water_type, volume_l, reminder_days, notes, motto, description } };
}

function isOverdue(aq, last) {
  if (!aq.reminder_days) return false;
  if (!last) return false;
  return Date.now() - new Date(last.measured_at).getTime() > aq.reminder_days * 86400000;
}

async function aquariumSummary(aq, db, role = null) {
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

module.exports = {
  aquariumInput,
  isOverdue,
  aquariumSummary,
};

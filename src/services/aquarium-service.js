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
  return { value: { name, water_type, volume_l, reminder_days, notes: str(body.notes, 1000) } };
}

function isOverdue(aq, last) {
  if (!aq.reminder_days) return false;
  if (!last) return false;
  return Date.now() - new Date(last.measured_at).getTime() > aq.reminder_days * 86400000;
}

function aquariumSummary(aq, db) {
  const last = db.prepare('SELECT measured_at FROM measurements WHERE aquarium_id = ? ORDER BY measured_at DESC LIMIT 1').get(aq.id);
  const alerts = db.prepare(`SELECT level, COUNT(*) n FROM alerts WHERE aquarium_id = ? AND acked_at IS NULL GROUP BY level`).all(aq.id);
  const crit = alerts.find((a) => a.level === 'crit')?.n || 0;
  const warn = alerts.find((a) => a.level === 'warn')?.n || 0;
  return {
    ...aq,
    last_measured_at: last ? last.measured_at : null,
    open_crit: crit,
    open_warn: warn,
    overdue: isOverdue(aq, last),
  };
}

module.exports = {
  aquariumInput,
  isOverdue,
  aquariumSummary,
};

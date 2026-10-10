'use strict';
const { str } = require('../utils/helpers');

const MAINTENANCE_TYPES = {
  water_change: { key: 'water_change', label: 'Wasserwechsel', icon: '💧', hasPercentage: true },
  filter_change: { key: 'filter_change', label: 'Filter wechseln', icon: '🔄', hasPercentage: false },
  filter_clean: { key: 'filter_clean', label: 'Filter reinigen', icon: '🧹', hasPercentage: false },
  plants_cut: { key: 'plants_cut', label: 'Pflanzen schneiden', icon: '✂️', hasPercentage: false },
  plants_new: { key: 'plants_new', label: 'Neue Pflanzen', icon: '🌱', hasPercentage: false },
  care: { key: 'care', label: 'Pflege & Reinigung', icon: '🧽', hasPercentage: false },
  fertilize: { key: 'fertilize', label: 'Düngung', icon: '🌿', hasPercentage: false },
  feeding: { key: 'feeding', label: 'Spezialfütterung', icon: '🦐', hasPercentage: false },
  other: { key: 'other', label: 'Sonstige Arbeit', icon: '📝', hasPercentage: false },
};

function validateMaintenanceInput(body) {
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

function getAquariumTimeline(db, aquariumId, options = {}) {
  const days = Math.min(Math.max(Number(options.days) || 365, 1), 3650);
  const since = new Date(Date.now() - days * 86400000).toISOString();
  const filterKind = options.kind || 'all'; // 'all', 'maintenance', 'measurement'

  const timeline = [];

  // 1. Pflegemaßnahmen / Arbeiten
  if (filterKind === 'all' || filterKind === 'maintenance' || MAINTENANCE_TYPES[filterKind]) {
    let sql = `
      SELECT ml.*, u.username as created_by_username
      FROM maintenance_logs ml
      LEFT JOIN users u ON u.id = ml.created_by
      WHERE ml.aquarium_id = ? AND ml.logged_at >= ?
    `;
    const params = [aquariumId, since];
    if (MAINTENANCE_TYPES[filterKind]) {
      sql += ' AND ml.type = ?';
      params.push(filterKind);
    }
    sql += ' ORDER BY ml.logged_at DESC';

    const maintRows = db.prepare(sql).all(...params);
    for (const row of maintRows) {
      const typeDef = MAINTENANCE_TYPES[row.type] || { label: row.type, icon: '📝' };
      timeline.push({
        kind: 'maintenance',
        id: row.id,
        timestamp: row.logged_at,
        type: row.type,
        typeName: typeDef.label,
        icon: typeDef.icon,
        percentage: row.percentage,
        details: row.details,
        note: row.note,
        created_by: row.created_by,
        created_by_username: row.created_by_username,
        created_at: row.created_at,
      });
    }
  }

  // 2. Messungen
  if (filterKind === 'all' || filterKind === 'measurement') {
    const ms = db
      .prepare(
        `SELECT m.id, m.measured_at, m.note, m.created_by, u.username as created_by_username
         FROM measurements m
         LEFT JOIN users u ON u.id = m.created_by
         WHERE m.aquarium_id = ? AND m.measured_at >= ?
         ORDER BY m.measured_at DESC`
      )
      .all(aquariumId, since);

    if (ms.length > 0) {
      const vals = db
        .prepare(
          `SELECT mv.measurement_id, mv.param, mv.value
           FROM measurement_values mv
           JOIN measurements m ON m.id = mv.measurement_id
           WHERE m.aquarium_id = ? AND m.measured_at >= ?`
        )
        .all(aquariumId, since);

      const alerts = db
        .prepare(
          `SELECT a.id, a.measurement_id, a.param, a.level, a.value, a.message
           FROM alerts a
           WHERE a.aquarium_id = ? AND a.measurement_id IS NOT NULL`
        )
        .all(aquariumId);

      const alertsByMeas = new Map();
      for (const al of alerts) {
        if (!alertsByMeas.has(al.measurement_id)) alertsByMeas.set(al.measurement_id, []);
        alertsByMeas.get(al.measurement_id).push(al);
      }

      const valsByMeas = new Map();
      for (const v of vals) {
        if (!valsByMeas.has(v.measurement_id)) valsByMeas.set(v.measurement_id, {});
        valsByMeas.get(v.measurement_id)[v.param] = v.value;
      }

      for (const m of ms) {
        const values = valsByMeas.get(m.id) || {};
        timeline.push({
          kind: 'measurement',
          id: m.id,
          timestamp: m.measured_at,
          type: 'measurement',
          typeName: 'Wassermessung',
          icon: '🧪',
          values,
          paramCount: Object.keys(values).length,
          note: m.note,
          alerts: alertsByMeas.get(m.id) || [],
          created_by: m.created_by,
          created_by_username: m.created_by_username,
        });
      }
    }
  }

  // Chronologisch absteigend sortieren
  timeline.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  if (options.limit && Number.isFinite(Number(options.limit))) {
    return timeline.slice(0, Number(options.limit));
  }

  return timeline;
}

module.exports = {
  MAINTENANCE_TYPES,
  validateMaintenanceInput,
  getAquariumTimeline,
};

'use strict';
const express = require('express');
const db = require('../db');
const cfg = require('../../config');
const { wrap, str } = require('../utils/helpers');
const { auth, ownAquarium } = require('../middleware/auth');
const { aquariumInput, aquariumSummary } = require('../services/aquarium-service');
const { thresholdsOfAquarium, buildMessage } = require('../services/alert-service');

const router = express.Router();

router.get(
  '/',
  auth,
  wrap((req, res) => {
    const rows = db.prepare('SELECT * FROM aquariums WHERE user_id = ? ORDER BY name').all(req.user.id);
    res.json(rows.map((aq) => aquariumSummary(aq, db)));
  })
);

router.post(
  '/',
  auth,
  wrap((req, res) => {
    const { error, value } = aquariumInput(req.body);
    if (error) return res.status(400).json({ error });
    const info = db
      .prepare('INSERT INTO aquariums (user_id, name, volume_l, water_type, reminder_days, notes) VALUES (?, ?, ?, ?, ?, ?)')
      .run(req.user.id, value.name, value.volume_l, value.water_type, value.reminder_days, value.notes);
    res.json({ id: info.lastInsertRowid });
  })
);

router.get(
  '/:id',
  auth,
  ownAquarium,
  wrap((req, res) => {
    const aq = req.aq;
    const { profiles, thresholds, conflicts } = thresholdsOfAquarium(aq, db);
    const stock = db.prepare('SELECT id, species, count, profile FROM stock WHERE aquarium_id = ? ORDER BY species').all(aq.id);
    const alerts = db
      .prepare(
        `SELECT id, param, level, value, message, created_at FROM alerts WHERE aquarium_id = ? AND acked_at IS NULL ORDER BY (level = 'crit') DESC, created_at DESC`
      )
      .all(aq.id);
    // aktuellster Wert je Parameter mit Bewertung nach heutigen Grenzwerten
    const latest = {};
    const rows = db
      .prepare(
        `
    SELECT mv.param, mv.value, m.measured_at FROM measurement_values mv
    JOIN measurements m ON m.id = mv.measurement_id
    WHERE m.aquarium_id = ? AND m.measured_at = (
      SELECT MAX(m2.measured_at) FROM measurements m2 JOIN measurement_values v2 ON v2.measurement_id = m2.id
      WHERE m2.aquarium_id = m.aquarium_id AND v2.param = mv.param)`
      )
      .all(aq.id);
    for (const r of rows) {
      latest[r.param] = { value: r.value, measured_at: r.measured_at, status: cfg.evaluate(thresholds[r.param], r.value) };
    }
    res.json({ aquarium: aquariumSummary(aq, db), stock, profiles, thresholds, conflicts, alerts, latest });
  })
);

router.put(
  '/:id',
  auth,
  ownAquarium,
  wrap((req, res) => {
    const { error, value } = aquariumInput(req.body);
    if (error) return res.status(400).json({ error });
    db.prepare('UPDATE aquariums SET name = ?, volume_l = ?, water_type = ?, reminder_days = ?, notes = ? WHERE id = ?').run(
      value.name,
      value.volume_l,
      value.water_type,
      value.reminder_days,
      value.notes,
      req.aq.id
    );
    res.json({ ok: true });
  })
);

router.delete(
  '/:id',
  auth,
  ownAquarium,
  wrap((req, res) => {
    db.prepare('DELETE FROM aquariums WHERE id = ?').run(req.aq.id);
    res.json({ ok: true });
  })
);

// ---------- Besatz ----------
router.post(
  '/:id/stock',
  auth,
  ownAquarium,
  wrap((req, res) => {
    const species = str(req.body.species, 80);
    const count = Math.round(Number(req.body.count ?? 1));
    const profile = cfg.PROFILES[req.body.profile] ? req.body.profile : 'allgemein';
    if (!species) return res.status(400).json({ error: 'Bitte eine Art eingeben.' });
    if (!Number.isFinite(count) || count < 1 || count > 10000) {
      return res.status(400).json({ error: 'Anzahl: 1–10000.' });
    }
    const info = db
      .prepare('INSERT INTO stock (aquarium_id, species, count, profile) VALUES (?, ?, ?, ?)')
      .run(req.aq.id, species, count, profile);
    res.json({ id: info.lastInsertRowid });
  })
);

router.delete(
  '/:id/stock/:sid',
  auth,
  ownAquarium,
  wrap((req, res) => {
    db.prepare('DELETE FROM stock WHERE id = ? AND aquarium_id = ?').run(Number(req.params.sid), req.aq.id);
    res.json({ ok: true });
  })
);

// ---------- Messwerte ----------
router.post(
  '/:id/measurements',
  auth,
  ownAquarium,
  wrap((req, res) => {
    const values = req.body.values && typeof req.body.values === 'object' ? req.body.values : {};
    const params = new Map(cfg.PARAMETERS.map((p) => [p.key, p]));
    const clean = [];
    for (const [key, raw] of Object.entries(values)) {
      if (raw === '' || raw == null) continue;
      const p = params.get(key);
      if (!p) return res.status(400).json({ error: `Unbekannter Parameter: ${key}` });
      const v = Number(typeof raw === 'string' ? raw.replace(',', '.') : raw);
      if (!Number.isFinite(v) || v < p.min || v > p.max) {
        return res.status(400).json({ error: `${p.name}: Bitte einen Wert zwischen ${p.min} und ${p.max} eingeben.` });
      }
      clean.push([p, v]);
    }
    if (!clean.length) return res.status(400).json({ error: 'Bitte mindestens einen Wert eintragen.' });

    let measuredAt = new Date();
    if (req.body.measured_at) {
      measuredAt = new Date(req.body.measured_at);
      if (Number.isNaN(measuredAt.getTime()) || measuredAt.getTime() > Date.now() + 5 * 60000) {
        return res.status(400).json({ error: 'Das Messdatum ist ungültig oder liegt in der Zukunft.' });
      }
    }
    const iso = measuredAt.toISOString();
    const { thresholds } = thresholdsOfAquarium(req.aq, db);
    const created = [];

    db.transaction(() => {
      const info = db
        .prepare('INSERT INTO measurements (aquarium_id, measured_at, note, created_by) VALUES (?, ?, ?, ?)')
        .run(req.aq.id, iso, str(req.body.note, 500), req.user.id);
      const mid = info.lastInsertRowid;
      const insV = db.prepare('INSERT INTO measurement_values (measurement_id, param, value) VALUES (?, ?, ?)');
      const insA = db.prepare(
        'INSERT INTO alerts (aquarium_id, measurement_id, param, level, value, message) VALUES (?, ?, ?, ?, ?, ?)'
      );
      for (const [p, v] of clean) {
        insV.run(mid, p.key, v);
        const range = thresholds[p.key];
        const level = cfg.evaluate(range, v);
        if (level === 'warn' || level === 'crit') {
          const message = buildMessage(p, range, level, v);
          insA.run(req.aq.id, mid, p.key, level, v, message);
          created.push({ param: p.key, level, message });
        }
      }
      created.mid = mid;
    })();
    res.json({ id: created.mid, alerts: created });
  })
);

router.get(
  '/:id/measurements',
  auth,
  ownAquarium,
  wrap((req, res) => {
    const days = Math.min(Math.max(Number(req.query.days) || 90, 1), 3650);
    const since = new Date(Date.now() - days * 86400000).toISOString();
    const ms = db
      .prepare('SELECT id, measured_at, note FROM measurements WHERE aquarium_id = ? AND measured_at >= ? ORDER BY measured_at')
      .all(req.aq.id, since);
    const vals = db
      .prepare(
        `SELECT mv.measurement_id, mv.param, mv.value FROM measurement_values mv JOIN measurements m ON m.id = mv.measurement_id WHERE m.aquarium_id = ? AND m.measured_at >= ?`
      )
      .all(req.aq.id, since);
    const byId = new Map(ms.map((m) => [m.id, { ...m, values: {} }]));
    for (const v of vals) byId.get(v.measurement_id).values[v.param] = v.value;
    res.json([...byId.values()]);
  })
);

router.delete(
  '/:id/measurements/:mid',
  auth,
  ownAquarium,
  wrap((req, res) => {
    db.prepare('DELETE FROM measurements WHERE id = ? AND aquarium_id = ?').run(Number(req.params.mid), req.aq.id);
    res.json({ ok: true });
  })
);

// ---------- Alarme ----------
router.post(
  '/:id/alerts/ack',
  auth,
  ownAquarium,
  wrap((req, res) => {
    const ids = Array.isArray(req.body.ids) ? req.body.ids.map(Number).filter(Number.isInteger) : null;
    if (ids) {
      const stmt = db.prepare("UPDATE alerts SET acked_at = datetime('now') WHERE id = ? AND aquarium_id = ? AND acked_at IS NULL");
      db.transaction(() => ids.forEach((id) => stmt.run(id, req.aq.id)))();
    } else {
      db.prepare("UPDATE alerts SET acked_at = datetime('now') WHERE aquarium_id = ? AND acked_at IS NULL").run(req.aq.id);
    }
    res.json({ ok: true });
  })
);

module.exports = router;

'use strict';
const express = require('express');
const db = require('../db');
const cfg = require('../../config');
const { wrap, str } = require('../utils/helpers');
const { auth, ownAquarium, writeAquarium, ownerAquarium, getAquariumAccess } = require('../middleware/auth');
const { aquariumInput, aquariumSummary } = require('../services/aquarium-service');
const { thresholdsOfAquarium, buildMessage } = require('../services/alert-service');
const { saveImage, deleteImage, getImagePath, getMimeType } = require('../services/image-service');

const router = express.Router();

router.get(
  '/',
  auth,
  wrap((req, res) => {
    const ownRows = db
      .prepare(
        `
      SELECT a.*, u.username as owner_username, 'owner' as role
      FROM aquariums a
      JOIN users u ON u.id = a.user_id
      WHERE a.user_id = ?
      ORDER BY a.name
    `
      )
      .all(req.user.id);

    const sharedRows = db
      .prepare(
        `
      SELECT a.*, u.username as owner_username, s.role as role
      FROM aquarium_shares s
      JOIN aquariums a ON a.id = s.aquarium_id
      JOIN users u ON u.id = a.user_id
      WHERE s.user_id = ?
      ORDER BY a.name
    `
      )
      .all(req.user.id);

    const all = [...ownRows, ...sharedRows];
    res.json(all.map((aq) => aquariumSummary(aq, db, aq.role)));
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
    res.json({ aquarium: aquariumSummary(aq, db, req.accessRole), stock, profiles, thresholds, conflicts, alerts, latest, role: req.accessRole });
  })
);

router.put(
  '/:id',
  auth,
  writeAquarium,
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
  ownerAquarium,
  wrap((req, res) => {
    if (req.aq.image_file) {
      deleteImage(req.aq.image_file);
    }
    db.prepare('DELETE FROM aquariums WHERE id = ?').run(req.aq.id);
    res.json({ ok: true });
  })
);

// ---------- Freigaben (Sharing) ----------
router.get(
  '/:id/shares',
  auth,
  ownerAquarium,
  wrap((req, res) => {
    const rows = db
      .prepare(
        `
      SELECT s.user_id, u.username, u.email, s.role, s.created_at
      FROM aquarium_shares s
      JOIN users u ON u.id = s.user_id
      WHERE s.aquarium_id = ?
      ORDER BY u.username ASC
    `
      )
      .all(req.aq.id);
    res.json(rows);
  })
);

router.post(
  '/:id/shares',
  auth,
  ownerAquarium,
  wrap((req, res) => {
    const query = str(req.body.username || req.body.email || req.body.usernameOrEmail, 120);
    const role = req.body.role === 'write' ? 'write' : req.body.role === 'view' ? 'view' : null;
    if (!query) return res.status(400).json({ error: 'Bitte Benutzername oder E-Mail angeben.' });
    if (!role) return res.status(400).json({ error: 'Rolle muss „view“ (Lesen) oder „write“ (Schreiben) sein.' });

    const targetUser = db
      .prepare('SELECT id, username, email FROM users WHERE username = ? COLLATE NOCASE OR (email IS NOT NULL AND email = ? COLLATE NOCASE)')
      .get(query, query);
    if (!targetUser) return res.status(404).json({ error: 'Benutzer nicht gefunden.' });
    if (targetUser.id === req.aq.user_id) {
      return res.status(400).json({ error: 'Das Aquarium gehört diesem Benutzer bereits.' });
    }

    db.prepare(
      'INSERT INTO aquarium_shares (aquarium_id, user_id, role) VALUES (?, ?, ?) ON CONFLICT(aquarium_id, user_id) DO UPDATE SET role = excluded.role'
    ).run(req.aq.id, targetUser.id, role);

    res.json({ ok: true, user_id: targetUser.id, username: targetUser.username, email: targetUser.email, role });
  })
);

router.delete(
  '/:id/shares/:userId',
  auth,
  wrap((req, res) => {
    const access = getAquariumAccess(req.params.id, req.user);
    if (!access) return res.status(404).json({ error: 'Aquarium nicht gefunden.' });
    const targetUserId = Number(req.params.userId);
    if (access.role !== 'owner' && req.user.id !== targetUserId) {
      return res.status(403).json({ error: 'Keine Berechtigung zum Entfernen dieser Freigabe.' });
    }
    db.prepare('DELETE FROM aquarium_shares WHERE aquarium_id = ? AND user_id = ?').run(access.aq.id, targetUserId);
    res.json({ ok: true });
  })
);

// ---------- Aquarium-Bild ----------
router.get(
  '/:id/image',
  auth,
  ownAquarium,
  wrap((req, res) => {
    if (!req.aq.image_file) {
      return res.status(404).json({ error: 'Kein Bild vorhanden.' });
    }
    const imgPath = getImagePath(req.aq.image_file);
    if (!imgPath) {
      return res.status(404).json({ error: 'Bilddatei nicht gefunden.' });
    }
    const mime = getMimeType(req.aq.image_file);
    res.setHeader('Content-Type', mime);
    res.setHeader('Cache-Control', 'private, max-age=86400');
    res.sendFile(imgPath);
  })
);

router.post(
  '/:id/image',
  auth,
  writeAquarium,
  wrap((req, res) => {
    const { error, value } = saveImage(req.aq.id, req.body.image, req.aq.image_file);
    if (error) return res.status(400).json({ error });
    db.prepare('UPDATE aquariums SET image_file = ? WHERE id = ?').run(value.filename, req.aq.id);
    res.json({ ok: true, image_url: `api/aquariums/${req.aq.id}/image?t=${Date.now()}` });
  })
);

router.delete(
  '/:id/image',
  auth,
  writeAquarium,
  wrap((req, res) => {
    if (req.aq.image_file) {
      deleteImage(req.aq.image_file);
      db.prepare('UPDATE aquariums SET image_file = NULL WHERE id = ?').run(req.aq.id);
    }
    res.json({ ok: true });
  })
);

// ---------- Besatz ----------
router.post(
  '/:id/stock',
  auth,
  writeAquarium,
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
  writeAquarium,
  wrap((req, res) => {
    db.prepare('DELETE FROM stock WHERE id = ? AND aquarium_id = ?').run(Number(req.params.sid), req.aq.id);
    res.json({ ok: true });
  })
);

// ---------- Messwerte ----------
router.post(
  '/:id/measurements',
  auth,
  writeAquarium,
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
  writeAquarium,
  wrap((req, res) => {
    db.prepare('DELETE FROM measurements WHERE id = ? AND aquarium_id = ?').run(Number(req.params.mid), req.aq.id);
    res.json({ ok: true });
  })
);

// ---------- Alarme ----------
router.post(
  '/:id/alerts/ack',
  auth,
  writeAquarium,
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

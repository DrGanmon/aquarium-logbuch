'use strict';
const express = require('express');
const db = require('../db');
const cfg = require('../../config');
const { wrap, str } = require('../utils/helpers');
const { auth, ownAquarium, writeAquarium, ownerAquarium, getAquariumAccess } = require('../middleware/auth');
const { aquariumInput, aquariumSummary } = require('../services/aquarium-service');
const { thresholdsOfAquarium, buildMessage } = require('../services/alert-service');
const { saveImage, deleteImage, getImagePath, getMimeType } = require('../services/image-service');
const { validateMaintenanceInput, getAquariumTimeline } = require('../services/maintenance-service');

const router = express.Router();

router.get(
  '/',
  auth,
  wrap(async (req, res) => {
    const list = await db.aquariums.listForUser(req.user.id);
    res.json(list);
  })
);

router.post(
  '/',
  auth,
  wrap(async (req, res) => {
    const { error, value } = aquariumInput(req.body);
    if (error) return res.status(400).json({ error });
    const info = await db.aquariums.create({
      user_id: req.user.id,
      name: value.name,
      volume_l: value.volume_l,
      water_type: value.water_type,
      reminder_days: value.reminder_days,
      notes: value.notes,
    });
    res.json({ id: info.id });
  })
);

router.get(
  '/:id',
  auth,
  ownAquarium,
  wrap(async (req, res) => {
    const aq = req.aq;
    const stockRows = await db.stock.listForAquarium(aq.id);
    const stock = stockRows.map((s) => {
      const sp = cfg.speciesService.findSpeciesByName(s.species);
      return {
        ...s,
        scientificName: sp?.scientificName || null,
        category: sp?.category || null,
        minVolumeL: sp?.minVolumeL || null,
        socialType: sp?.socialType || null,
        minGroupCount: sp?.minGroupCount || 1,
        territorial: sp?.territorial || null,
        tags: sp?.tags || [],
        decorHints: sp?.decorHints || null,
        behaviorNotes: sp?.behaviorNotes || null,
      };
    });
    const { profiles, thresholds, conflicts, compatibility } = await thresholdsOfAquarium(aq, db, stockRows);
    const alerts = await db.alerts.listOpenForAquarium(aq.id);
    const latest = await db.measurements.getLatestValues(aq.id, thresholds);
    const stockCompatibility = compatibility || cfg.speciesService.analyzeStockCompatibility(aq, stockRows);
    const summary = await db.aquariums.getSummary(aq, req.accessRole);

    res.json({
      aquarium: summary,
      stock,
      profiles,
      thresholds,
      conflicts,
      stockCompatibility,
      alerts,
      latest,
      role: req.accessRole,
    });
  })
);

router.put(
  '/:id',
  auth,
  writeAquarium,
  wrap(async (req, res) => {
    const { error, value } = aquariumInput(req.body);
    if (error) return res.status(400).json({ error });
    await db.aquariums.update(req.aq.id, {
      name: value.name,
      volume_l: value.volume_l,
      water_type: value.water_type,
      reminder_days: value.reminder_days,
      notes: value.notes,
    });
    res.json({ ok: true });
  })
);

router.delete(
  '/:id',
  auth,
  ownerAquarium,
  wrap(async (req, res) => {
    if (req.aq.image_file) {
      deleteImage(req.aq.image_file);
    }
    await db.aquariums.delete(req.aq.id);
    res.json({ ok: true });
  })
);

// ---------- Freigaben (Sharing) ----------
router.get(
  '/:id/shares',
  auth,
  ownerAquarium,
  wrap(async (req, res) => {
    const rows = await db.shares.listForAquarium(req.aq.id);
    res.json(rows);
  })
);

router.post(
  '/:id/shares',
  auth,
  ownerAquarium,
  wrap(async (req, res) => {
    const query = str(req.body.username || req.body.email || req.body.usernameOrEmail, 120);
    const role = req.body.role === 'write' ? 'write' : req.body.role === 'view' ? 'view' : null;
    if (!query) return res.status(400).json({ error: 'Bitte Benutzername oder E-Mail angeben.' });
    if (!role) return res.status(400).json({ error: 'Rolle muss „view“ (Lesen) oder „write“ (Schreiben) sein.' });

    const targetUser = (await db.users.findByUsername(query)) || (await db.users.findByEmail(query));
    if (!targetUser) return res.status(404).json({ error: 'Benutzer nicht gefunden.' });
    if (targetUser.id === req.aq.user_id) {
      return res.status(400).json({ error: 'Das Aquarium gehört diesem Benutzer bereits.' });
    }

    await db.shares.upsert(req.aq.id, targetUser.id, role);
    res.json({ ok: true, user_id: targetUser.id, username: targetUser.username, email: targetUser.email, role });
  })
);

router.delete(
  '/:id/shares/:userId',
  auth,
  wrap(async (req, res) => {
    const access = await getAquariumAccess(req.params.id, req.user);
    if (!access) return res.status(404).json({ error: 'Aquarium nicht gefunden.' });
    const targetUserId = Number(req.params.userId);
    if (access.role !== 'owner' && req.user.id !== targetUserId) {
      return res.status(403).json({ error: 'Keine Berechtigung zum Entfernen dieser Freigabe.' });
    }
    await db.shares.delete(access.aq.id, targetUserId);
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
  wrap(async (req, res) => {
    const { error, value } = saveImage(req.aq.id, req.body.image, req.aq.image_file);
    if (error) return res.status(400).json({ error });
    await db.aquariums.updateImage(req.aq.id, value.filename);
    res.json({ ok: true, image_url: `api/aquariums/${req.aq.id}/image?t=${Date.now()}` });
  })
);

router.delete(
  '/:id/image',
  auth,
  writeAquarium,
  wrap(async (req, res) => {
    if (req.aq.image_file) {
      deleteImage(req.aq.image_file);
      await db.aquariums.updateImage(req.aq.id, null);
    }
    res.json({ ok: true });
  })
);

// ---------- Besatz ----------
router.post(
  '/:id/stock',
  auth,
  writeAquarium,
  wrap(async (req, res) => {
    const species = str(req.body.species, 80);
    const count = Math.round(Number(req.body.count ?? 1));
    let profile = req.body.profile;
    if (!profile || !cfg.PROFILES[profile]) {
      const sp = cfg.speciesService.findSpeciesByName(species);
      profile = sp?.profile && cfg.PROFILES[sp.profile] ? sp.profile : 'allgemein';
    }
    if (!species) return res.status(400).json({ error: 'Bitte eine Art eingeben.' });
    if (!Number.isFinite(count) || count < 1 || count > 10000) {
      return res.status(400).json({ error: 'Anzahl: 1–10000.' });
    }
    const info = await db.stock.create({
      aquarium_id: req.aq.id,
      species,
      count,
      profile,
    });
    res.json({ id: info.id });
  })
);

router.delete(
  '/:id/stock/:sid',
  auth,
  writeAquarium,
  wrap(async (req, res) => {
    await db.stock.delete(Number(req.params.sid), req.aq.id);
    res.json({ ok: true });
  })
);

// ---------- Messwerte ----------
router.post(
  '/:id/measurements',
  auth,
  writeAquarium,
  wrap(async (req, res) => {
    const values = req.body.values && typeof req.body.values === 'object' ? req.body.values : {};
    const params = new Map(cfg.PARAMETERS.map((p) => [p.key, p]));
    const cleanValues = {};
    for (const [key, raw] of Object.entries(values)) {
      if (raw === '' || raw == null) continue;
      const p = params.get(key);
      if (!p) return res.status(400).json({ error: `Unbekannter Parameter: ${key}` });
      const v = Number(typeof raw === 'string' ? raw.replace(',', '.') : raw);
      if (!Number.isFinite(v) || v < p.min || v > p.max) {
        return res.status(400).json({ error: `${p.name}: Bitte einen Wert zwischen ${p.min} und ${p.max} eingeben.` });
      }
      cleanValues[p.key] = v;
    }
    if (Object.keys(cleanValues).length === 0) return res.status(400).json({ error: 'Bitte mindestens einen Wert eintragen.' });

    let measuredAt = new Date();
    if (req.body.measured_at) {
      measuredAt = new Date(req.body.measured_at);
      if (Number.isNaN(measuredAt.getTime()) || measuredAt.getTime() > Date.now() + 5 * 60000) {
        return res.status(400).json({ error: 'Das Messdatum ist ungültig oder liegt in der Zukunft.' });
      }
    }
    const iso = measuredAt.toISOString();
    const { thresholds } = await thresholdsOfAquarium(req.aq, db);
    const alertsToCreate = [];
    for (const [key, v] of Object.entries(cleanValues)) {
      const p = params.get(key);
      const range = thresholds[key];
      const level = cfg.evaluate(range, v);
      if (level === 'warn' || level === 'crit') {
        const message = buildMessage(p, range, level, v);
        alertsToCreate.push({ param: key, level, value: v, message });
      }
    }

    const info = await db.measurements.create({
      aquarium_id: req.aq.id,
      measured_at: iso,
      note: str(req.body.note, 500),
      created_by: req.user.id,
      values: cleanValues,
      alerts: alertsToCreate,
    });

    res.json({ id: info.id, alerts: alertsToCreate });
  })
);

router.get(
  '/:id/measurements',
  auth,
  ownAquarium,
  wrap(async (req, res) => {
    const days = Math.min(Math.max(Number(req.query.days) || 90, 1), 3650);
    const ms = await db.measurements.listForAquarium(req.aq.id, { days });
    // Chronologisch aufsteigend für Graphen
    const sorted = [...ms].sort((a, b) => new Date(a.measured_at).getTime() - new Date(b.measured_at).getTime());
    res.json(sorted);
  })
);

router.delete(
  '/:id/measurements/:mid',
  auth,
  writeAquarium,
  wrap(async (req, res) => {
    await db.measurements.delete(Number(req.params.mid), req.aq.id);
    res.json({ ok: true });
  })
);

// ---------- Alarme ----------
router.post(
  '/:id/alerts/ack',
  auth,
  writeAquarium,
  wrap(async (req, res) => {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(Number).filter(Number.isInteger) : null;
    if (ids) {
      for (const alertId of ids) {
        await db.alerts.ack(alertId, req.aq.id);
      }
    } else {
      await db.alerts.ackAll(req.aq.id);
    }
    res.json({ ok: true });
  })
);

// ---------- Pflegemaßnahmen & Arbeiten (Maintenance Logs) ----------
router.get(
  '/:id/maintenance',
  auth,
  ownAquarium,
  wrap(async (req, res) => {
    const rows = await db.maintenance.listForAquarium(req.aq.id);
    res.json(rows);
  })
);

router.post(
  '/:id/maintenance',
  auth,
  writeAquarium,
  wrap(async (req, res) => {
    const { error, value } = validateMaintenanceInput(req.body);
    if (error) return res.status(400).json({ error });

    const info = await db.maintenance.create({
      aquarium_id: req.aq.id,
      logged_at: value.logged_at,
      type: value.type,
      percentage: value.percentage,
      details: value.details,
      note: value.note,
      created_by: req.user.id,
    });

    res.json({ ok: true, id: info.id });
  })
);

router.put(
  '/:id/maintenance/:logId',
  auth,
  writeAquarium,
  wrap(async (req, res) => {
    const logId = Number(req.params.logId);
    const existing = await db.maintenance.findById(logId);
    if (!existing || existing.aquarium_id !== req.aq.id) return res.status(404).json({ error: 'Eintrag nicht gefunden.' });

    const { error, value } = validateMaintenanceInput(req.body);
    if (error) return res.status(400).json({ error });

    await db.maintenance.update(logId, req.aq.id, {
      logged_at: value.logged_at,
      type: value.type,
      percentage: value.percentage,
      details: value.details,
      note: value.note,
    });

    res.json({ ok: true });
  })
);

router.delete(
  '/:id/maintenance/:logId',
  auth,
  writeAquarium,
  wrap(async (req, res) => {
    const logId = Number(req.params.logId);
    const existing = await db.maintenance.findById(logId);
    if (!existing || existing.aquarium_id !== req.aq.id) return res.status(404).json({ error: 'Eintrag nicht gefunden.' });

    await db.maintenance.delete(logId, req.aq.id);
    res.json({ ok: true });
  })
);

// ---------- Gesamtes Aquarium-Logbuch / Timeline (inkl. Messungen & Arbeiten) ----------
router.get(
  '/:id/logs',
  auth,
  ownAquarium,
  wrap(async (req, res) => {
    const timeline = await getAquariumTimeline(db, req.aq.id, {
      days: req.query.days,
      kind: req.query.kind,
      limit: req.query.limit,
    });
    res.json(timeline);
  })
);

module.exports = router;

'use strict';
const express = require('express');
const crypto = require('crypto');
const db = require('../db');
const cfg = require('../../config');
const { wrap, str } = require('../utils/helpers');
const { auth, ownAquarium, writeAquarium, ownerAquarium, getAquariumAccess } = require('../middleware/auth');
const { aquariumInput, aquariumSummary } = require('../services/aquarium-service');
const { thresholdsOfAquarium, buildMessage } = require('../services/alert-service');
const { saveImage, saveAquariumImage, saveStockImage, deleteImage, getImagePath, getMimeType } = require('../services/image-service');
const { validateMaintenanceInput, getAquariumTimeline } = require('../services/maintenance-service');
const { mailService } = require('../services/mail-service');

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
      motto: value.motto,
      description: value.description,
      measure_cycle_interval: value.measure_cycle_interval,
      measure_cycle_unit: value.measure_cycle_unit,
      measure_cycle_day_of_week: value.measure_cycle_day_of_week,
      measure_reminder_mail: value.measure_reminder_mail,
      fertilize_cycle_interval: value.fertilize_cycle_interval,
      fertilize_cycle_unit: value.fertilize_cycle_unit,
      fertilize_cycle_day_of_week: value.fertilize_cycle_day_of_week,
      fertilize_reminder_mail: value.fertilize_reminder_mail,
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
      motto: value.motto,
      description: value.description,
      measure_cycle_interval: value.measure_cycle_interval,
      measure_cycle_unit: value.measure_cycle_unit,
      measure_cycle_day_of_week: value.measure_cycle_day_of_week,
      measure_reminder_mail: value.measure_reminder_mail,
      fertilize_cycle_interval: value.fertilize_cycle_interval,
      fertilize_cycle_unit: value.fertilize_cycle_unit,
      fertilize_cycle_day_of_week: value.fertilize_cycle_day_of_week,
      fertilize_reminder_mail: value.fertilize_reminder_mail,
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

    const existingShare = await db.shares.find(req.aq.id, targetUser.id);
    if (existingShare && (existingShare.status === 'accepted' || (!existingShare.status && !req.body.forceNewInvite))) {
      // Rolle für bestehende akzeptierte Freigabe aktualisieren
      await db.shares.updateRole(req.aq.id, targetUser.id, role);
      return res.json({
        ok: true,
        user_id: targetUser.id,
        username: targetUser.username,
        email: targetUser.email,
        role,
        status: 'accepted',
      });
    }

    // Neue Freigabe oder Status pending: Token generieren und Einladungsmail senden
    const token = crypto.randomBytes(32).toString('hex');
    const expiresDays = 14;
    const tokenExpires = Date.now() + expiresDays * 86400000;

    await db.shares.upsert(req.aq.id, targetUser.id, role, 'pending', token, tokenExpires);

    if (targetUser.email && mailService) {
      try {
        mailService.sendShareInvitationEmail({
          user: targetUser,
          ownerUsername: req.user.username,
          aquariumName: req.aq.name,
          role,
          token,
          expiresDays,
        });
      } catch (e) {
        // Mail-Fehler soll Freigabe-Erstellung nicht abbrechen
      }
    }

    res.json({
      ok: true,
      user_id: targetUser.id,
      username: targetUser.username,
      email: targetUser.email,
      role,
      status: 'pending',
      token,
      message: 'Einladungs-E-Mail wurde an den Benutzer gesendet.',
    });
  })
);

router.post(
  '/:id/shares/:userId/resend',
  auth,
  ownerAquarium,
  wrap(async (req, res) => {
    const targetUserId = Number(req.params.userId);
    const targetUser = await db.users.findById(targetUserId);
    if (!targetUser) return res.status(404).json({ error: 'Benutzer nicht gefunden.' });

    const share = await db.shares.find(req.aq.id, targetUserId);
    if (!share) return res.status(404).json({ error: 'Freigabe nicht gefunden.' });
    if (share.status === 'accepted') {
      return res.status(400).json({ error: 'Diese Freigabe wurde bereits angenommen.' });
    }

    const token = crypto.randomBytes(32).toString('hex');
    const expiresDays = 14;
    const tokenExpires = Date.now() + expiresDays * 86400000;

    await db.shares.upsert(req.aq.id, targetUserId, share.role, 'pending', token, tokenExpires);

    if (targetUser.email && mailService) {
      mailService.sendShareInvitationEmail({
        user: targetUser,
        ownerUsername: req.user.username,
        aquariumName: req.aq.name,
        role: share.role,
        token,
        expiresDays,
      });
    }

    res.json({ ok: true, message: 'Einladungs-E-Mail erneut gesendet.', token });
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

// ---------- Aquarium-Bilder (Galerie & Mehrfach-Bilder) ----------
router.get(
  '/:id/images',
  auth,
  ownAquarium,
  wrap(async (req, res) => {
    const list = await db.aquariumImages.listForAquarium(req.aq.id);
    res.json(list);
  })
);

router.get(
  '/:id/images/:imageId',
  auth,
  ownAquarium,
  wrap(async (req, res) => {
    const img = await db.aquariumImages.findById(req.params.imageId);
    if (!img || img.aquarium_id !== req.aq.id) {
      return res.status(404).json({ error: 'Bild nicht gefunden.' });
    }
    const imgPath = getImagePath(img.filename);
    if (!imgPath) {
      return res.status(404).json({ error: 'Bilddatei nicht gefunden.' });
    }
    const mime = getMimeType(img.filename);
    res.setHeader('Content-Type', mime);
    res.setHeader('Cache-Control', 'private, max-age=86400');
    res.sendFile(imgPath);
  })
);

router.post(
  '/:id/images',
  auth,
  writeAquarium,
  wrap(async (req, res) => {
    const { error, value } = saveAquariumImage(req.aq.id, req.body.image);
    if (error) return res.status(400).json({ error });
    const caption = str(req.body.caption, 200) || null;
    const isPrimary = req.body.is_primary ? 1 : 0;
    const info = await db.aquariumImages.create({
      aquarium_id: req.aq.id,
      filename: value.filename,
      caption,
      is_primary: isPrimary,
    });
    res.json({
      ok: true,
      id: info.id,
      filename: info.filename,
      caption: info.caption,
      is_primary: info.is_primary,
      url: `api/aquariums/${req.aq.id}/images/${info.id}`,
    });
  })
);

router.put(
  '/:id/images/:imageId/primary',
  auth,
  writeAquarium,
  wrap(async (req, res) => {
    const ok = await db.aquariumImages.setPrimary(req.params.imageId, req.aq.id);
    if (!ok) return res.status(404).json({ error: 'Bild nicht gefunden.' });
    res.json({ ok: true });
  })
);

router.put(
  '/:id/images/:imageId',
  auth,
  writeAquarium,
  wrap(async (req, res) => {
    const caption = str(req.body.caption, 200) || null;
    const ok = await db.aquariumImages.updateCaption(req.params.imageId, req.aq.id, caption);
    if (!ok) return res.status(404).json({ error: 'Bild nicht gefunden.' });
    res.json({ ok: true });
  })
);

router.delete(
  '/:id/images/:imageId',
  auth,
  writeAquarium,
  wrap(async (req, res) => {
    const ok = await db.aquariumImages.delete(req.params.imageId, req.aq.id);
    if (!ok) return res.status(404).json({ error: 'Bild nicht gefunden.' });
    res.json({ ok: true });
  })
);

// Backward-compatible single image endpoints
router.get(
  '/:id/image',
  auth,
  ownAquarium,
  wrap(async (req, res) => {
    let filename = req.aq.image_file;
    if (req.query.imageId) {
      const img = await db.aquariumImages.findById(req.query.imageId);
      if (img && img.aquarium_id === req.aq.id) {
        filename = img.filename;
      }
    }
    if (!filename) {
      const imgs = await db.aquariumImages.listForAquarium(req.aq.id);
      if (imgs.length > 0) filename = imgs[0].filename;
    }
    if (!filename) {
      return res.status(404).json({ error: 'Kein Bild vorhanden.' });
    }
    const imgPath = getImagePath(filename);
    if (!imgPath) {
      return res.status(404).json({ error: 'Bilddatei nicht gefunden.' });
    }
    const mime = getMimeType(filename);
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
    const { error, value } = saveAquariumImage(req.aq.id, req.body.image);
    if (error) return res.status(400).json({ error });
    const info = await db.aquariumImages.create({
      aquarium_id: req.aq.id,
      filename: value.filename,
      caption: str(req.body.caption, 200) || null,
      is_primary: 1,
    });
    res.json({ ok: true, id: info.id, image_url: `api/aquariums/${req.aq.id}/image?t=${Date.now()}` });
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
    await db.aquariumImages.deleteAllForAquarium(req.aq.id);
    res.json({ ok: true });
  })
);

// ---------- Besatz & Bewohner ----------
router.post(
  '/:id/stock',
  auth,
  writeAquarium,
  wrap(async (req, res) => {
    const species = str(req.body.species, 80);
    const name = str(req.body.name, 80) || null;
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

    let imageFile = null;
    if (req.body.image) {
      const { error, value } = saveStockImage(Date.now(), req.body.image);
      if (error) return res.status(400).json({ error });
      imageFile = value.filename;
    }

    const info = await db.stock.create({
      aquarium_id: req.aq.id,
      species,
      name,
      count,
      profile,
      image_file: imageFile,
    });
    res.json({ id: info.id, species, name, count, profile, image_file: imageFile });
  })
);

router.put(
  '/:id/stock/:sid',
  auth,
  writeAquarium,
  wrap(async (req, res) => {
    const sid = Number(req.params.sid);
    const existing = await db.stock.findById(sid);
    if (!existing || existing.aquarium_id !== req.aq.id) {
      return res.status(404).json({ error: 'Bewohner nicht gefunden.' });
    }

    const species = req.body.species !== undefined ? str(req.body.species, 80) : existing.species;
    const name = req.body.name !== undefined ? (str(req.body.name, 80) || null) : existing.name;
    const count = req.body.count !== undefined ? Math.round(Number(req.body.count)) : existing.count;
    let profile = req.body.profile !== undefined ? req.body.profile : existing.profile;
    if (!profile || !cfg.PROFILES[profile]) {
      const sp = cfg.speciesService.findSpeciesByName(species);
      profile = sp?.profile && cfg.PROFILES[sp.profile] ? sp.profile : 'allgemein';
    }

    if (!species) return res.status(400).json({ error: 'Bitte eine Art eingeben.' });
    if (!Number.isFinite(count) || count < 1 || count > 10000) {
      return res.status(400).json({ error: 'Anzahl: 1–10000.' });
    }

    let imageFile = existing.image_file;
    if (req.body.image) {
      const { error, value } = saveStockImage(sid, req.body.image, existing.image_file);
      if (error) return res.status(400).json({ error });
      imageFile = value.filename;
    } else if (req.body.remove_image) {
      if (existing.image_file) deleteImage(existing.image_file);
      imageFile = null;
    }

    await db.stock.update(sid, {
      species,
      name,
      count,
      profile,
      image_file: imageFile,
    });

    res.json({ ok: true, id: sid, species, name, count, profile, image_file: imageFile });
  })
);

router.get(
  '/:id/stock/:sid/image',
  auth,
  ownAquarium,
  wrap(async (req, res) => {
    const s = await db.stock.findById(req.params.sid);
    if (!s || s.aquarium_id !== req.aq.id || !s.image_file) {
      return res.status(404).json({ error: 'Kein Foto für diesen Bewohner vorhanden.' });
    }
    const imgPath = getImagePath(s.image_file);
    if (!imgPath) {
      return res.status(404).json({ error: 'Bilddatei nicht gefunden.' });
    }
    const mime = getMimeType(s.image_file);
    res.setHeader('Content-Type', mime);
    res.setHeader('Cache-Control', 'private, max-age=86400');
    res.sendFile(imgPath);
  })
);

router.post(
  '/:id/stock/:sid/image',
  auth,
  writeAquarium,
  wrap(async (req, res) => {
    const sid = Number(req.params.sid);
    const existing = await db.stock.findById(sid);
    if (!existing || existing.aquarium_id !== req.aq.id) {
      return res.status(404).json({ error: 'Bewohner nicht gefunden.' });
    }
    const { error, value } = saveStockImage(sid, req.body.image, existing.image_file);
    if (error) return res.status(400).json({ error });
    await db.stock.updateImage(sid, value.filename);
    res.json({ ok: true, image_url: `api/aquariums/${req.aq.id}/stock/${sid}/image?t=${Date.now()}` });
  })
);

router.delete(
  '/:id/stock/:sid/image',
  auth,
  writeAquarium,
  wrap(async (req, res) => {
    const sid = Number(req.params.sid);
    const existing = await db.stock.findById(sid);
    if (!existing || existing.aquarium_id !== req.aq.id) {
      return res.status(404).json({ error: 'Bewohner nicht gefunden.' });
    }
    if (existing.image_file) {
      deleteImage(existing.image_file);
      await db.stock.updateImage(sid, null);
    }
    res.json({ ok: true });
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
    let days = req.query.days !== undefined && req.query.days !== '' ? Math.min(Math.max(Number(req.query.days) || 90, 1), 3650) : null;
    let from = req.query.from ? String(req.query.from).trim() : null;
    let to = req.query.to ? String(req.query.to).trim() : null;
    if (!from && days == null) {
      days = 90; // Standard 3 Monate
    }
    const ms = await db.measurements.listForAquarium(req.aq.id, { days, from, to });
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

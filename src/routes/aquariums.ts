import { getPlantCatalog } from '../services/plant-service';
import { chatProgress } from '../utils/chat-progress';
import { asError } from '../utils/app-error';
import type { Request, Response } from 'express';
import express = require('express');
import { Readable, pipeline } from 'node:stream';
import crypto = require('crypto');
import db = require('../db');
import cfg = require('../config/app-config');
import helpersModule = require('../utils/helpers');
const { wrap, str } = helpersModule;
import authModule = require('../middleware/auth');
const { auth, ownAquarium, writeAquarium, ownerAquarium, getAquariumAccess } = authModule;
import aquarium_serviceModule = require('../services/aquarium-service');
const { aquariumInput } = aquarium_serviceModule;
import alert_serviceModule = require('../services/alert-service');
const { thresholdsOfAquarium, buildMessage } = alert_serviceModule;
import image_serviceModule = require('../services/image-service');
const { saveAquariumImage, saveStockImage, deleteImage, getImagePath, getMimeType } = image_serviceModule;
import maintenance_serviceModule = require('../services/maintenance-service');
const { validateMaintenanceInput, getAquariumTimeline } = maintenance_serviceModule;
import dosing_serviceModule = require('../services/dosing-service');
const { validateDosingPumpInput, nextAutomaticDosingAt, manualDosingStatus } = dosing_serviceModule;
import mail_serviceModule = require('../services/mail-service');
const { mailService } = mail_serviceModule;
const {
  detectDelimiter,
  parseCsv,
  autoDetectMapping,
  generateCsv,
  importMeasurementsFromRows,
} = require('../services/measurement-csv-service');
import ai_chat_serviceModule = require('../services/ai-chat-service');
const { buildAquariumSystemPrompt, chatWithAquarium } = ai_chat_serviceModule;

const router = express.Router();

// Schutz gegen parallele Doppel-Submits (z. B. durch Doppelklicks oder Verbindungsverzögerungen)
const recentAquariumCreates = new Map<string, { result: Promise<{ id: number }>; timestamp: number }>();

function cleanRecentCreates() {
  const now = Date.now();
  for (const [key, data] of recentAquariumCreates.entries()) {
    if (now - data.timestamp > 5000) {
      recentAquariumCreates.delete(key);
    }
  }
}

function enrichStock(stockRows?: any, lang?: any) {
  return stockRows.map((s: any) => {
    const sp = cfg.speciesService.getSpeciesById(s.species, lang) || cfg.speciesService.findSpeciesByName(s.species, lang);
    return {
      ...s,
      speciesId: sp?.id || null,
      scientificName: sp?.scientificName || null,
      category: sp?.category || null,
      category_de: sp?.category_de || null,
      category_en: sp?.category_en || null,
      minVolumeL: sp?.minVolumeL || null,
      socialType: sp?.socialType || null,
      minGroupCount: sp?.minGroupCount || 1,
      territorial: sp?.territorial || null,
      tags: sp?.tags || [],
      decorHints: sp?.decorHints || null,
      behaviorNotes: sp?.behaviorNotes || null,
    };
  });
}

router.get(
  '/',
  auth,
  wrap(async (req: Request, res: Response) => {
    const list = await db.aquariums.listForUser(req.user.id);
    res.json(list);
  })
);

router.post(
  '/',
  auth,
  wrap(async (req: Request, res: Response) => {
    const { error, value } = aquariumInput(req.body);
    if (error !== undefined) return res.status(400).json({ error });

    cleanRecentCreates();
    const dedupKey = JSON.stringify([req.user.id, value]);
    const recent = recentAquariumCreates.get(dedupKey);
    if (recent && Date.now() - recent.timestamp < 3000) {
      return res.json(await recent.result);
    }

    const result = db.aquariums.create({
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
    if (recentAquariumCreates.size >= 1000) recentAquariumCreates.delete(recentAquariumCreates.keys().next().value!);
    recentAquariumCreates.set(dedupKey, { result, timestamp: Date.now() });
    try { res.json(await result); }
    catch (error) {
      if (recentAquariumCreates.get(dedupKey)?.result === result) recentAquariumCreates.delete(dedupKey);
      throw error;
    }
  })
);

router.get(
  '/:id',
  auth,
  ownAquarium,
  wrap(async (req: Request, res: Response) => {
    const aq = req.aq;
    const lang = String(req.query.lang || req.headers['x-language'] || req.user?.language || 'de');
    const stockRows = await db.stock.listForAquarium(aq.id);
    const compact = req.query.summary === 'true';
    const stock = compact ? [] : enrichStock(stockRows, lang);
    const { profiles, thresholds, conflicts, compatibility } = await thresholdsOfAquarium(aq, db, stockRows);
    const alerts = await db.alerts.listOpenForAquarium(aq.id);
    const latest = await db.measurements.getLatestValues(aq.id, thresholds);
    const stockCompatibility = compatibility || cfg.speciesService.analyzeStockCompatibility(aq, stockRows, lang);
    const summary = await db.aquariums.getSummary(aq, req.accessRole);
    const dosingPumps = compact ? [] : await db.dosingPumps.listForAquarium(aq.id);

    res.json({
      aquarium: summary,
      stock,
      profiles,
      thresholds,
      conflicts,
      stockCompatibility,
      alerts,
      latest,
      dosing_pumps: dosingPumps,
      role: req.accessRole,
    });
  })
);

router.put(
  '/:id',
  auth,
  writeAquarium,
  wrap(async (req: Request, res: Response) => {
    const { error, value } = aquariumInput(req.body);
    if (error !== undefined) return res.status(400).json({ error });
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
  wrap(async (req: Request, res: Response) => {
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
  wrap(async (req: Request, res: Response) => {
    const rows = await db.shares.listForAquarium(req.aq.id);
    res.json(rows);
  })
);

router.post(
  '/:id/shares',
  auth,
  ownerAquarium,
  wrap(async (req: Request, res: Response) => {
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
        const shareLang = targetUser.language || req.user.language || 'de';
        mailService.sendShareInvitationEmail({
          user: targetUser,
          ownerUsername: req.user.username,
          aquariumName: req.aq.name,
          role,
          token,
          expiresDays,
          lang: shareLang,
        });
      } catch {
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
  wrap(async (req: Request, res: Response) => {
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
  wrap(async (req: Request, res: Response) => {
    const access = await getAquariumAccess(String(req.params.id), req.user);
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
  wrap(async (req: Request, res: Response) => {
    const list = await db.aquariumImages.listForAquarium(req.aq.id);
    res.json(list);
  })
);

router.get(
  '/:id/images/:imageId',
  auth,
  ownAquarium,
  wrap(async (req: Request, res: Response) => {
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
  wrap(async (req: Request, res: Response) => {
    const { error, value } = saveAquariumImage(req.aq.id, req.body.image);
    if (error !== undefined) return res.status(400).json({ error });
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
  wrap(async (req: Request, res: Response) => {
    const ok = await db.aquariumImages.setPrimary(req.params.imageId, req.aq.id);
    if (!ok) return res.status(404).json({ error: 'Bild nicht gefunden.' });
    res.json({ ok: true });
  })
);

router.put(
  '/:id/images/:imageId',
  auth,
  writeAquarium,
  wrap(async (req: Request, res: Response) => {
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
  wrap(async (req: Request, res: Response) => {
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
  wrap(async (req: Request, res: Response) => {
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
  wrap(async (req: Request, res: Response) => {
    const { error, value } = saveAquariumImage(req.aq.id, req.body.image);
    if (error !== undefined) return res.status(400).json({ error });
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
  wrap(async (req: Request, res: Response) => {
    if (req.aq.image_file) {
      deleteImage(req.aq.image_file);
      await db.aquariums.updateImage(req.aq.id, null);
    }
    await db.aquariumImages.deleteAllForAquarium(req.aq.id);
    res.json({ ok: true });
  })
);

// ---------- Besatz & Bewohner ----------
router.get('/:id/plants', auth, ownAquarium, wrap(async (req: Request, res: Response) => {
  const lang = String(req.query.lang || req.headers['x-language'] || req.user?.language || 'de');
  const catalog = getPlantCatalog(lang);
  const rows = await db.plants.listForAquarium(req.aq.id);
  res.json(rows.map(row => {
    const plant = catalog.plants.find(item => item.id === row.plant_id);
    return { ...row, name: plant?.name || row.plant_id, scientificName: plant?.scientificName || '', category: plant?.category || '' };
  }));
}));
router.put('/:id/plants/:plantId', auth, writeAquarium, wrap(async (req: Request, res: Response) => {
  const plant = getPlantCatalog().plants.find(item => item.id === req.params.plantId);
  if (!plant) return res.status(400).json({ error: 'Pflanze nicht im Katalog gefunden.' });
  if (plant.waterType !== req.aq.water_type) return res.status(400).json({ error: 'Die Wasserart des Aquariums passt nicht zu dieser Pflanze.' });
  const count = req.body.count;
  if (!Number.isInteger(count) || count < 1 || count > 10000) return res.status(400).json({ error: 'Anzahl: 1–10000 ganze Pflanzen.' });
  await db.plants.set(req.aq.id, plant.id, count);
  res.json({ ok: true });
}));
router.delete('/:id/plants/:plantId', auth, writeAquarium, wrap(async (req: Request, res: Response) => {
  await db.plants.delete(req.aq.id, String(req.params.plantId));
  res.json({ ok: true });
}));

router.get('/:id/stock', auth, ownAquarium, wrap(async (req: Request, res: Response) => {
  const lang = String(req.query.lang || req.headers['x-language'] || req.user?.language || 'de');
  res.json(enrichStock(await db.stock.listForAquarium(req.aq.id), lang));
}));

router.post('/:id/stock/catalog', auth, writeAquarium, wrap(async (req: Request, res: Response) => {
  const species = cfg.speciesService.getSpeciesById(req.body.speciesId);
  if (!species) return res.status(400).json({ error: 'Art nicht im Katalog gefunden.' });
  if (species.waterType !== req.aq.water_type) return res.status(400).json({ error: 'Die Wasserart des Aquariums passt nicht zu dieser Art.' });
  const count = Number(req.body.count);
  if (!Number.isInteger(count) || count < 1 || count > 10000) return res.status(400).json({ error: 'Anzahl: 1–10000 ganze Tiere.' });
  const names = req.body.names ?? [];
  if (!Array.isArray(names) || (names.length && names.length !== count) || names.some((name: any) => typeof name !== 'string' || name.trim().length > 80)) {
    return res.status(400).json({ error: 'Namen müssen zur Anzahl passen und dürfen maximal 80 Zeichen lang sein.' });
  }
  const named = names.map((name: any) => name.trim()).filter(Boolean);
  const common = { aquarium_id: req.aq.id, species: species.name, profile: species.profile };
  const rows = named.map((name: any) => ({ ...common, count: 1, name }));
  const unnamed = count - named.length;
  if (unnamed) rows.push({ ...common, count: unnamed, name: null });
  const entries = await db.stock.createMany(rows);
  res.json({ added: count, entries });
}));

router.post(
  '/:id/stock',
  auth,
  writeAquarium,
  wrap(async (req: Request, res: Response) => {
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
      if (error !== undefined) return res.status(400).json({ error });
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
  wrap(async (req: Request, res: Response) => {
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
      if (error !== undefined) return res.status(400).json({ error });
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
  wrap(async (req: Request, res: Response) => {
    const s = await db.stock.findById(Number(req.params.sid));
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
  wrap(async (req: Request, res: Response) => {
    const sid = Number(req.params.sid);
    const existing = await db.stock.findById(sid);
    if (!existing || existing.aquarium_id !== req.aq.id) {
      return res.status(404).json({ error: 'Bewohner nicht gefunden.' });
    }
    const { error, value } = saveStockImage(sid, req.body.image, existing.image_file);
    if (error !== undefined) return res.status(400).json({ error });
    await db.stock.updateImage(sid, value.filename);
    res.json({ ok: true, image_url: `api/aquariums/${req.aq.id}/stock/${sid}/image?t=${Date.now()}` });
  })
);

router.delete(
  '/:id/stock/:sid/image',
  auth,
  writeAquarium,
  wrap(async (req: Request, res: Response) => {
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
  wrap(async (req: Request, res: Response) => {
    await db.stock.delete(Number(req.params.sid), req.aq.id);
    res.json({ ok: true });
  })
);

// ---------- Messwerte ----------
router.post(
  '/:id/measurements',
  auth,
  writeAquarium,
  wrap(async (req: Request, res: Response) => {
    const values = req.body.values && typeof req.body.values === 'object' ? req.body.values : {};
    const selection = req.body.selectedTests;
    if (selection !== undefined && !cfg.suiteService.validateSelection(selection, req.body.suiteId)) {
      return res.status(400).json({ error: 'Ungültige Testauswahl.' });
    }
    const selectedParameters = selection === undefined ? cfg.PARAMETERS : cfg.suiteService.resolveSelection(selection, req.body.suiteId);
    const params = new Map(selectedParameters.map(p => [p.key, p] as const));
    const cleanValues: Record<string, any> = {};
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
    if (req.body.suiteId && !cfg.suiteService.getSuite(req.body.suiteId)) {
      return res.status(400).json({ error: 'Unbekannte Testsuite.' });
    }

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
      const p = params.get(key)!;
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
      suite_id: req.body.suiteId || null,
      test_selection: selection,
    });

    res.json({ id: info.id, alerts: alertsToCreate });
  })
);

router.get(
  '/:id/measurements',
  auth,
  ownAquarium,
  wrap(async (req: Request, res: Response) => {
    let days = req.query.days !== undefined && req.query.days !== '' && req.query.days !== 'all'
      ? Math.min(Math.max(Number(req.query.days) || 90, 1), 3650)
      : null;
    const from = req.query.from ? String(req.query.from).trim() : null;
    const to = req.query.to ? String(req.query.to).trim() : null;
    const all = req.query.all === 'true' || req.query.days === 'all';
    if (!from && days == null && !all) {
      days = 90; // Standard 3 Monate
    }
    const ms = await db.measurements.listForAquarium(req.aq.id, { days, from, to, all });
    // Chronologisch aufsteigend für Graphen
    const sorted = [...ms].sort((a?: any, b?: any) => new Date(a.measured_at).getTime() - new Date(b.measured_at).getTime());
    res.json(sorted);
  })
);

router.delete(
  '/:id/measurements/:mid',
  auth,
  writeAquarium,
  wrap(async (req: Request, res: Response) => {
    await db.measurements.delete(Number(req.params.mid), req.aq.id);
    res.json({ ok: true });
  })
);

// ---------- CSV / Excel Export & Import ----------
router.get(
  '/:id/measurements/export',
  auth,
  ownAquarium,
  wrap(async (req: Request, res: Response) => {
    const days = req.query.days !== undefined && req.query.days !== '' && req.query.days !== 'all'
      ? Math.min(Math.max(Number(req.query.days) || 90, 1), 3650)
      : null;
    const from = req.query.from ? String(req.query.from).trim() : null;
    const to = req.query.to ? String(req.query.to).trim() : null;
    const all = req.query.all === 'true' || req.query.days === 'all' || (!days && !from && !to);

    const ms = await db.measurements.listForAquarium(req.aq.id, { days, from, to, all });
    const delimiter = req.query.delimiter === ',' ? ',' : ';';
    const csvData = generateCsv(ms, { delimiter, includeBOM: true });

    const safeName = (req.aq.name || 'aquarium').replace(/[^a-zA-Z0-9_\u00C0-\u017F-]/g, '_');
    const dateStr = new Date().toISOString().slice(0, 10);
    const filename = `messwerte_${safeName}_${dateStr}.csv`;

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"; filename*=UTF-8''${encodeURIComponent(filename)}`);
    res.send(csvData);
  })
);

router.post(
  '/:id/measurements/parse-csv-header',
  auth,
  writeAquarium,
  wrap(async (req: Request, res: Response) => {
    const csvText = typeof req.body?.csvText === 'string' ? req.body.csvText : '';
    if (!csvText.trim()) {
      return res.status(400).json({ error: 'Kein CSV-Inhalt übergeben.' });
    }
    const delimiter = req.body?.delimiter || detectDelimiter(csvText);
    const rows = parseCsv(csvText, { delimiter });
    if (rows.length === 0) {
      return res.status(400).json({ error: 'Die Datei enthält keine lesbaren Zeilen.' });
    }
    const headers = rows[0] || [];
    const sampleRows = rows.slice(1, 4);
    const autoMapping = autoDetectMapping(headers, cfg.suiteService.getAllKnownParameters());
    const totalDataRows = Math.max(0, rows.length - 1);

    res.json({
      delimiter,
      headers,
      sampleRows,
      autoMapping,
      totalRows: rows.length,
      totalDataRows,
    });
  })
);

router.post(
  '/:id/measurements/import-csv',
  auth,
  writeAquarium,
  wrap(async (req: Request, res: Response) => {
    const csvText = typeof req.body?.csvText === 'string' ? req.body.csvText : '';
    const mapping = req.body?.mapping && typeof req.body.mapping === 'object' ? req.body.mapping : {};
    const hasHeader = req.body?.hasHeader !== false;
    const delimiter = req.body?.delimiter || detectDelimiter(csvText);

    if (!csvText.trim()) {
      return res.status(400).json({ error: 'Bitte lade eine CSV-Datei hoch oder füge CSV-Text ein.' });
    }

    const rows = parseCsv(csvText, { delimiter });
    if (rows.length === 0) {
      return res.status(400).json({ error: 'Die CSV-Datei enthält keine Daten.' });
    }

    const result = await importMeasurementsFromRows({
      aquarium: req.aq,
      userId: req.user.id,
      rows,
      mapping,
      hasHeader,
      db,
    });

    res.json(result);
  })
);

// ---------- Alarme ----------
router.post(
  '/:id/alerts/ack',
  auth,
  writeAquarium,
  wrap(async (req: Request, res: Response) => {
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
  wrap(async (req: Request, res: Response) => {
    const rows = await db.maintenance.listForAquarium(req.aq.id);
    res.json(rows);
  })
);

router.post(
  '/:id/maintenance',
  auth,
  writeAquarium,
  wrap(async (req: Request, res: Response) => {
    const { error, value } = validateMaintenanceInput(req.body);
    if (error !== undefined) return res.status(400).json({ error });

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
  wrap(async (req: Request, res: Response) => {
    const logId = Number(req.params.logId);
    const existing = await db.maintenance.findById(logId);
    if (!existing || existing.aquarium_id !== req.aq.id) return res.status(404).json({ error: 'Eintrag nicht gefunden.' });
    if (existing.type === 'dosing_pump') return res.status(400).json({ error: 'Automatische Pumpeneinträge können nicht manuell bearbeitet werden.' });

    const { error, value } = validateMaintenanceInput(req.body);
    if (error !== undefined) return res.status(400).json({ error });

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
  wrap(async (req: Request, res: Response) => {
    const logId = Number(req.params.logId);
    const existing = await db.maintenance.findById(logId);
    if (!existing || existing.aquarium_id !== req.aq.id) return res.status(404).json({ error: 'Eintrag nicht gefunden.' });

    await db.maintenance.delete(logId, req.aq.id);
    res.json({ ok: true });
  })
);

// ---------- Dosierpumpen & Düngung ----------
router.get(
  ['/:id/dosing-pumps', '/:id/fertilizers'],
  auth,
  ownAquarium,
  wrap(async (req: Request, res: Response) => {
    const list = await db.dosingPumps.listForAquarium(req.aq.id);
    res.json(list.map(plan => ({ ...plan, schedule_timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      next_due_at: !plan.is_active ? null : plan.mode === 'manual'
        ? manualDosingStatus(plan).next_due_at
        : nextAutomaticDosingAt(plan).toISOString() })));
  })
);

router.post(
  ['/:id/dosing-pumps', '/:id/fertilizers'],
  auth,
  writeAquarium,
  wrap(async (req: Request, res: Response) => {
    const { error, value } = validateDosingPumpInput(req.body || {});
    if (error !== undefined) return res.status(400).json({ error });

    const pump = await db.dosingPumps.create({
      aquarium_id: req.aq.id,
      ...value,
    });
    res.json(pump);
  })
);

router.get(
  ['/:id/dosing-pumps/:pumpId', '/:id/fertilizers/:pumpId'],
  auth,
  ownAquarium,
  wrap(async (req: Request, res: Response) => {
    const pumpId = Number(req.params.pumpId);
    const pump = await db.dosingPumps.findById(pumpId);
    if (!pump || pump.aquarium_id !== req.aq.id) {
      return res.status(404).json({ error: 'Dosierpumpe nicht gefunden.' });
    }
    res.json(pump);
  })
);

router.put(
  ['/:id/dosing-pumps/:pumpId', '/:id/fertilizers/:pumpId'],
  auth,
  writeAquarium,
  wrap(async (req: Request, res: Response) => {
    const pumpId = Number(req.params.pumpId);
    const pump = await db.dosingPumps.findById(pumpId);
    if (!pump || pump.aquarium_id !== req.aq.id) {
      return res.status(404).json({ error: 'Dosierpumpe nicht gefunden.' });
    }

    const { error, value } = validateDosingPumpInput(req.body || {});
    if (error !== undefined) return res.status(400).json({ error });

    const resetSchedule = value.mode !== pump.mode || value.interval_days !== pump.interval_days || value.time_of_day !== pump.time_of_day || (!pump.is_active && value.is_active);
    const updated = await db.dosingPumps.update(pump.id, req.aq.id, { ...value,
      ...(resetSchedule ? { schedule_started_at: new Date().toISOString() } : {}),
      ...(resetSchedule || value.reminder_mail !== pump.reminder_mail ? { last_reminder_sent_at: null } : {}) });
    res.json(updated);
  })
);

router.delete(
  ['/:id/dosing-pumps/:pumpId', '/:id/fertilizers/:pumpId'],
  auth,
  writeAquarium,
  wrap(async (req: Request, res: Response) => {
    const pumpId = Number(req.params.pumpId);
    const pump = await db.dosingPumps.findById(pumpId);
    if (!pump || pump.aquarium_id !== req.aq.id) {
      return res.status(404).json({ error: 'Dosierpumpe nicht gefunden.' });
    }

    await db.dosingPumps.delete(pump.id, req.aq.id);
    res.json({ ok: true });
  })
);

router.post(
  ['/:id/dosing-pumps/:pumpId/dose', '/:id/fertilizers/:pumpId/dose'],
  auth,
  writeAquarium,
  wrap(async (req: Request, res: Response) => {
    const pumpId = Number(req.params.pumpId);
    const pump = await db.dosingPumps.findById(pumpId);
    if (!pump || pump.aquarium_id !== req.aq.id) {
      return res.status(404).json({ error: 'Dosierpumpe nicht gefunden.' });
    }

    if (pump.mode !== 'manual') return res.status(400).json({ error: 'Dosierpumpen werden ausschließlich automatisch protokolliert.' });
    const loggedAt = req.body?.logged_at ? new Date(req.body.logged_at) : new Date();
    if (!Number.isFinite(loggedAt.getTime()) || loggedAt.getTime() > Date.now() + 5 * 60000) return res.status(400).json({ error: 'Ungültiger Dosierzeitpunkt.' });
    const result = await db.dosingPumps.logDosing(pump.id, req.aq.id, req.user.id, loggedAt.toISOString());
    if (!result) return res.status(400).json({ error: 'Dosierung konnte nicht protokolliert werden.' });
    res.json(result);
  })
);

// ---------- Gesamtes Aquarium-Logbuch / Timeline (inkl. Messungen & Arbeiten) ----------
router.get(
  '/:id/logs',
  auth,
  ownAquarium,
  wrap(async (req: Request, res: Response) => {
    let limit: number | null = 25;
    if (req.query.limit !== undefined) {
      if (req.query.limit === 'all' || req.query.limit === '0') {
        limit = null;
      } else {
        const parsed = Number(req.query.limit);
        limit = Number.isFinite(parsed) && parsed > 0 ? parsed : 25;
      }
    }
    const offset = req.query.offset !== undefined ? Math.max(0, Number(req.query.offset) || 0) : 0;

    const timeline = await getAquariumTimeline(db, req.aq.id, {
      days: req.query.days,
      kind: req.query.kind,
      limit,
      offset,
    });
    res.json(timeline);
  })
);

// ---------- Aquarium KI-Chat & Kontext ----------
router.get(
  '/:id/chat/context',
  auth,
  ownAquarium,
  wrap(async (req: Request, res: Response) => {
    const data = await buildAquariumSystemPrompt(req.aq.id, db);
    res.json({
      ok: true,
      systemPrompt: data.systemPrompt,
      aquariumName: data.aquarium?.name,
      stockCount: data.stockCount,
      measurementsCount: data.measurementsCount,
    });
  })
);

router.get(
  '/:id/chat/history',
  auth,
  ownAquarium,
  wrap(async (req: Request, res: Response) => {
    const list = await db.aquariumChats.listForAquarium(req.aq.id, {
      limit: req.query.limit ? Number(req.query.limit) : 100,
    });
    res.json({
      ok: true,
      messages: list,
      count: list.length,
    });
  })
);

router.delete(
  '/:id/chat/history',
  auth,
  writeAquarium,
  wrap(async (req: Request, res: Response) => {
    await db.aquariumChats.clearForAquarium(req.aq.id);
    res.json({
      ok: true,
      message: 'Chat-Verlauf erfolgreich gelöscht.',
    });
  })
);

router.post(
  '/:id/chat',
  auth,
  ownAquarium,
  wrap(async (req: Request, res: Response) => {
    const { messages, message, provider, stream, saveHistory } = req.body || {};
    const controller = new AbortController();
    let streaming = false;
    const progressEnabled = req.body?.progress === true;
    const progress = chatProgress(res, progressEnabled);
    const disconnect = () => { if (!res.writableFinished) controller.abort(); };
    res.once('close', disconnect);
    try {
      const result = await chatWithAquarium({
        aquariumId: req.aq.id,
        user: req.user,
        messages,
        message,
        provider,
        stream: Boolean(stream) && !progressEnabled,
        onProgress: progressEnabled ? progress.status : undefined,
        customDb: db,
        saveHistory: saveHistory !== false,
        signal: controller.signal,
      });

      if (!progressEnabled && stream && 'stream' in result && result.stream) {
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        streaming = true;
        // Node fetch ReadableStream weiterleiten
        pipeline(Readable.fromWeb(result.stream as import("node:stream/web").ReadableStream), res, (error) => {
          res.removeListener('close', disconnect);
          if (error && !res.destroyed) res.destroy(error);
        });
        return;
      }

      if (progressEnabled) { progress.done({ reply: result.reply });return; }
      res.json({
        ok: true,
        reply: result.reply,
        model: result.model,
        provider: result.provider,
        usage: result.usage,
      });
    } catch (caught: unknown) {
      if (controller.signal.aborted || res.destroyed) return;
      const err = asError(caught);
      if (progressEnabled && res.headersSent) { progress.error(err.message);return; }
      const status = err.status || (err.code === 'NO_API_KEY' ? 400 : 500);
      res.status(status).json({
        error: err.message,
        code: err.code || 'CHAT_ERROR',
        provider: err.provider || null,
        status,
      });
    } finally {
      if (!streaming) res.removeListener('close', disconnect);
    }
  })
);

export = router;

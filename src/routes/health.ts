import express from 'express';
import db = require('../db');
import speciesCatalog = require('../services/species-service');
import { healthService, canonicalHealthSpeciesId } from '../services/health-service';
import authModule = require('../middleware/auth');
import { AppError } from '../utils/app-error';
import { asRecord } from '../utils/validation';
import type { Request, RequestHandler } from 'express';
import type { HealthMeasurement, SpeciesRanges } from '../types/health';
import type { StockRecord, WaterType } from '../types/domain';
const { auth, ownAquarium } = authModule;
const wrap = (handler: RequestHandler): RequestHandler => async (req, res, next) => {
  try { await handler(req, res, next); }
  catch (error) {
    if (error instanceof AppError) res.status(error.status).json({ error: error.message, code: error.code });
    else next(error);
  }
};
const router = express.Router();
const language = (req: Request) => String(req.query.lang || req.headers['x-language'] || req.user.language || 'de');

function residentProfile(stock: StockRecord, waterType: WaterType, lang: string) {
  const species = speciesCatalog.getSpeciesById(stock.species, lang) || speciesCatalog.findSpeciesByName(stock.species, lang);
  const id = canonicalHealthSpeciesId(species?.id || stock.species);
  const profile = healthService.speciesProfile(id, waterType, lang);
  return { stockId: stock.id, name: stock.name, count: stock.count, speciesId: id,
    speciesName: species?.name || profile?.name || stock.species, scientificName: species?.scientificName || profile?.scientificName || null,
    supported: Boolean(profile), ranges: species as SpeciesRanges | null || healthService.speciesRanges(id) };
}

router.get('/catalog', auth, wrap(async (req, res) => {
  const water = String(req.query.waterType || 'all');
  if (!['fresh', 'salt', 'all'].includes(water)) throw new AppError('Ungültiger Wassertyp.', 400);
  res.json(healthService.catalog({ waterType: water === 'all' ? undefined : water as WaterType,
    speciesId: String(req.query.speciesId || '').slice(0, 120), query: String(req.query.q || '').slice(0, 160), language: language(req) }));
}));

router.get('/diseases/:diseaseId', auth, wrap(async (req, res) => {
  const disease = healthService.disease(String(req.params.diseaseId), language(req), String(req.query.speciesId || ''));
  if (!disease) throw new AppError('Krankheit nicht gefunden.', 404);
  res.json({ disease });
}));

router.get('/aquariums/:id/residents', auth, ownAquarium, wrap(async (req, res) => {
  const lang = language(req);
  const stock = await db.stock.listForAquarium(req.aq.id);
  res.json({ aquarium: { id: req.aq.id, name: req.aq.name, waterType: req.aq.water_type },
    residents: stock.map(item => { const { ranges, ...resident } = residentProfile(item, req.aq.water_type, lang); return resident; }) });
}));

router.post('/aquariums/:id/diagnosis', auth, ownAquarium, wrap(async (req, res) => {
  const stockId = req.body.stockId;
  if (typeof stockId !== 'number' || !Number.isSafeInteger(stockId) || stockId < 1) throw new AppError('Bitte einen Bewohner auswählen.', 400);
  const stock = await db.stock.findById(stockId);
  if (!stock || stock.aquarium_id !== req.aq.id) throw new AppError('Bewohner nicht gefunden.', 404);
  const lang = language(req);
  const resident = residentProfile(stock, req.aq.water_type, lang);
  if (!resident.supported || !resident.ranges) throw new AppError('Für diesen Bewohner und Wassertyp sind keine Diagnosedaten vorhanden.', 400);
  const latest = asRecord(await db.measurements.getLatestValues(req.aq.id));
  const measurements: Record<string, HealthMeasurement> = Object.create(null);
  for (const [parameter, raw] of Object.entries(latest)) {
    const value = asRecord(raw);
    if (typeof value.value === 'number' && Number.isFinite(value.value) && typeof value.measured_at === 'string') measurements[parameter] = { value: value.value, measured_at: value.measured_at };
  }
  const outcome = healthService.diagnose({ waterType: req.aq.water_type, speciesId: resident.speciesId, species: resident.ranges, measurements }, req.body.answers ?? [], lang);
  res.json({ ...outcome, aquarium: { id: req.aq.id, name: req.aq.name, waterType: req.aq.water_type },
    resident: { stockId: resident.stockId, name: resident.name, speciesId: resident.speciesId, speciesName: resident.speciesName },
    measurements: Object.entries(measurements).map(([parameter, measured]) => ({ parameter, ...measured })) });
}));

export = router;

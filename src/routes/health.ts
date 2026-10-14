import { chatProgress } from '../utils/chat-progress';
import express from 'express';
import db = require('../db');
import speciesCatalog = require('../services/species-service');
import { healthService, canonicalHealthSpeciesId } from '../services/health-service';
import authModule = require('../middleware/auth');
import { AppError } from '../utils/app-error';
import { asRecord } from '../utils/validation';
import type { Request, RequestHandler } from 'express';
import aiChatService = require('../services/ai-chat-service');
import { healthChatConfig, healthChatMessages, healthChatPrompt } from '../services/health-chat-service';
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

router.get('/medications', auth, wrap(async (req, res) => {
  const water = String(req.query.waterType || 'all');
  const legalStatus = String(req.query.legalStatus || '');
  if (!['fresh', 'salt', 'all'].includes(water) || !['', 'otc', 'rx', 'not_a_medicine'].includes(legalStatus)) throw new AppError('Ungültiger Medikamentenfilter.', 400);
  res.json(healthService.medications({ waterType: water === 'all' ? undefined : water as WaterType,
    diseaseId: String(req.query.diseaseId || '').slice(0, 120), legalStatus,
    query: String(req.query.q || '').slice(0, 160), language: language(req) }));
}));

router.get('/medications/:medicationId', auth, wrap(async (req, res) => {
  const medication = healthService.medication(String(req.params.medicationId), language(req));
  if (!medication) throw new AppError('Medikament nicht gefunden.', 404);
  res.json({ medication });
}));

router.get('/aquariums/:id/residents', auth, ownAquarium, wrap(async (req, res) => {
  const lang = language(req);
  const stock = await db.stock.listForAquarium(req.aq.id);
  res.json({ aquarium: { id: req.aq.id, name: req.aq.name, waterType: req.aq.water_type },
    residents: stock.map(item => { const { ranges, ...resident } = residentProfile(item, req.aq.water_type, lang); return resident; }) });
}));

async function diagnosisFor(req: Request) {
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
  const context = { waterType: req.aq.water_type, speciesId: resident.speciesId, species: resident.ranges, measurements };
  const outcome = healthService.diagnose(context, req.body.answers ?? [], lang);
  return { context, outcome, resident, lang };
}

router.post('/aquariums/:id/diagnosis', auth, ownAquarium, wrap(async (req, res) => {
  const { context, outcome, resident } = await diagnosisFor(req);
  const selectedAi = healthChatConfig(await db.users.findById(req.user.id));
  res.json({ ...outcome, aiChat: selectedAi ? { provider: selectedAi.provider, model: selectedAi.model } : null, aquarium: { id: req.aq.id, name: req.aq.name, waterType: req.aq.water_type },
    resident: { stockId: resident.stockId, name: resident.name, speciesId: resident.speciesId, speciesName: resident.speciesName },
    measurements: Object.entries(context.measurements).map(([parameter, measured]) => ({ parameter, ...measured })) });
}));

router.post('/aquariums/:id/diagnosis/chat', auth, ownAquarium, wrap(async (req, res) => {
  const selectedAi = healthChatConfig(await db.users.findById(req.user.id));
  if (!selectedAi) throw new AppError('Bitte für die ausgewählte KI einen API-Key und ein Modell im Profil oder in der Serverkonfiguration hinterlegen.', 400);
  const messages = healthChatMessages(req.body.messages, req.body.message);
  const { context, outcome, resident, lang } = await diagnosisFor(req);
  const systemPrompt = healthChatPrompt(context, outcome, resident, req.aq, lang);
  const controller = new AbortController();
  const disconnect = () => { if (!res.writableFinished) controller.abort(); };
  res.once('close', disconnect);
  const progressEnabled = req.body?.progress === true;
  const progress = chatProgress(res, progressEnabled);
  try {
    progress.status('generating');
    const result = await aiChatService.chatWithContext({ ...selectedAi, systemPrompt, messages, signal: controller.signal });
    if (progressEnabled) progress.done({ reply: result.reply });
    else res.json({ reply: result.reply, provider: selectedAi.provider, model: selectedAi.model });
  } catch (error) {
    if (controller.signal.aborted || res.destroyed) return;
    if (progressEnabled && res.headersSent) progress.error(error instanceof Error ? error.message : String(error));
    else throw error;
  } finally { res.removeListener('close', disconnect); }
}));

export = router;

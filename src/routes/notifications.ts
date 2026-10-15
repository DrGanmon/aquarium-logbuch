import express from 'express';
import type { Request, Response, RequestHandler } from 'express';
import db = require('../db');
import authModule = require('../middleware/auth');
import { AppError } from '../utils/app-error';

const { auth } = authModule;
const router = express.Router();
const wrap = (handler: RequestHandler): RequestHandler => async (req, res, next) => {
  try { await handler(req, res, next); } catch (error) { next(error); }
};

router.get('/', auth, wrap(async (req: Request, res: Response) => {
  const rawLimit = req.query.limit === undefined ? 50 : Number(req.query.limit);
  if (!Number.isInteger(rawLimit) || rawLimit < 1 || rawLimit > 100) throw new AppError('Ungültiges Limit.', 400);
  const aquariums = await db.aquariums.listForUser(req.user.id);
  const [social, waterGroups, unreadSocial] = await Promise.all([
    db.notifications.listForUser(req.user.id, rawLimit),
    Promise.all(aquariums.map(async aquarium => ({
      aquariumId: aquarium.id, aquariumName: aquarium.name,
      alerts: await db.alerts.listOpenForAquarium(aquarium.id),
    }))),
    db.notifications.unreadCount(req.user.id),
  ]);
  const water = waterGroups.flatMap(group => group.alerts.map((alert: Record<string, unknown>) => ({
    ...alert, aquariumId: group.aquariumId, aquariumName: group.aquariumName,
  })));
  res.setHeader('Cache-Control', 'no-store').json({ social, water, unreadSocial, openWater: water.length });
}));

router.post('/read', auth, wrap(async (req: Request, res: Response) => {
  let ids: number[] | undefined;
  if (req.body.ids !== undefined) {
    const requestedIds: unknown[] = req.body.ids;
    if (!Array.isArray(requestedIds) || requestedIds.some((value: unknown) => !Number.isInteger(value) || Number(value) < 1)) {
      throw new AppError('Ungültige Benachrichtigungsauswahl.', 400);
    }
    ids = [...new Set(requestedIds.map(value => Number(value)))];
  }
  const updated = await db.notifications.markRead(req.user.id, ids);
  res.json({ ok: true, updated });
}));

export = router;

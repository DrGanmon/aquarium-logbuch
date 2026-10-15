import express from 'express';
import type { Request, Response } from 'express';
import db = require('../db');
import { metricsAccessService } from '../services/metrics-access-service';
import rateLimitModule = require('../utils/rate-limit');
const { checkAndNoteAttempt } = rateLimitModule;

const router = express.Router();

router.get('/', async (req: Request, res: Response) => {
  res.setHeader('Cache-Control', 'no-store');
  const clientKey = req.ip || req.socket.remoteAddress || 'unknown';
  if (await checkAndNoteAttempt(`metrics-scrape:${clientKey}`, 300)) {
    res.setHeader('Retry-After', '60');
    return res.status(429).json({ error: 'Zu viele Metrikabfragen.' });
  }
  if (!await metricsAccessService.authorize(req.get('authorization'))) {
    res.setHeader('WWW-Authenticate', 'Bearer realm="metrics"');
    return res.status(401).json({ error: 'Nicht autorisiert.' });
  }
  res.json(await db.getAdminMetrics());
});

export = router;
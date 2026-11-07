import express = require('express');
import type { Request, Response, NextFunction } from 'express';
import envModule = require('../config/env');
import authModule = require('../middleware/auth');
import { calDavPassword } from '../services/caldav-service';
import { buildUserCalendar, calendarIcs } from '../services/calendar-service';

const { auth } = authModule;
const { APP_URL, APP_PATH } = envModule;
const router = express.Router();
const wrap = (handler: (req: Request, res: Response) => Promise<unknown>) => (req: Request, res: Response, next: NextFunction) => { handler(req, res).catch(next); };

function connection(req: Request, password: { password: string; created_at: string }) {
  const base = APP_URL || `${req.protocol}://${req.get('host')}${APP_PATH}`;
  return { username: req.user.username, password: password.password, created_at: password.created_at,
    serverUrl: `${base}/caldav/`, calendarUrl: `${base}/caldav/${req.user.id}/pflege/`, wellKnownUrl: `${base.replace(/^(https?:\/\/[^/]+).*$/, '$1')}/.well-known/caldav` };
}
// Account security stays online: the password is created on first use and only shown to its owner.
router.get('/me/caldav', auth, wrap(async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json(connection(req, await calDavPassword(req.user.id)));
}));
router.post('/me/caldav/password', auth, wrap(async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json(connection(req, await calDavPassword(req.user.id, true)));
}));
router.get('/me/calendar.ics', auth, wrap(async (req, res) => {
  const language = req.user.language === 'en' ? 'en' : 'de';
  const now = new Date();
  const body = calendarIcs(await buildUserCalendar(req.user.id, language, now));
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Disposition', `attachment; filename="${language === 'en' ? 'aquarium-care' : 'aquarienpflege'}-${now.getFullYear()}-${now.getFullYear() + 1}.ics"`);
  res.type('text/calendar; charset=utf-8').send(body);
}));

export = router;

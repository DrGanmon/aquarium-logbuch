import express = require('express');
import type { Request, Response, NextFunction } from 'express';
import envModule = require('../config/env');
import authModule = require('../middleware/auth');
import { calDavPassword } from '../services/caldav-service';
import { buildUserCalendar, calendarIcs, calendarAquariumSelection } from '../services/calendar-service';
import { MAX_CALENDAR_EXCLUSIONS, serializeCalendarSelection } from '../services/calendar-selection';
import db = require('../db');

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
// Which aquariums appear in the iCal export and the CalDAV calendar; new aquariums are included by default.
router.get('/me/calendar/aquariums', auth, wrap(async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json(await calendarAquariumSelection(req.user.id));
}));
router.put('/me/calendar/aquariums', auth, wrap(async (req, res) => {
  const input = req.body?.excludedAquariumIds;
  if (!Array.isArray(input) || input.length > MAX_CALENDAR_EXCLUSIONS || input.some(id => !Number.isSafeInteger(id) || id < 1)) {
    return res.status(400).json({ error: 'excludedAquariumIds muss eine Liste von Aquarium-IDs sein.' });
  }
  const eligible = new Set((await calendarAquariumSelection(req.user.id)).map(aquarium => aquarium.id));
  const excluded = [...new Set(input as number[])].filter(id => eligible.has(id)).sort((a, b) => a - b);
  await db.users.update(req.user.id, { calendar_excluded_aquariums: serializeCalendarSelection(excluded) });
  res.setHeader('Cache-Control', 'no-store');
  res.json(await calendarAquariumSelection(req.user.id));
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

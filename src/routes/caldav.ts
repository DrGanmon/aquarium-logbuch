import express = require('express');
import type { Request, Response, NextFunction } from 'express';
import envModule = require('../config/env');
import rateLimitModule = require('../utils/rate-limit');
import { verifyCalDav } from '../services/caldav-service';
import { buildUserCalendar, entryIcs, calendarIcs, etagOf, type UserCalendar } from '../services/calendar-service';

const { APP_PATH } = envModule;
const { checkAndNoteAttempt } = rateLimitModule;
const router = express.Router();
const CALENDAR = 'pflege';
const ALLOW = 'OPTIONS, GET, HEAD, PROPFIND, REPORT';
const NS = 'xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav" xmlns:CS="http://calendarserver.org/ns/" xmlns:A="http://apple.com/ns/ical/"';
type CalDavUser = { id: number; username: string; language?: string | null };
type CalDavRequest = Request & { calDavUser?: CalDavUser };

const xml = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const href = (path: string) => xml(`${APP_PATH}/caldav/${path}`);
function multistatus(res: Response, responses: string[]) {
  res.status(207).type('application/xml; charset=utf-8').setHeader('Cache-Control', 'private, no-store');
  res.send(`<?xml version="1.0" encoding="utf-8"?>\n<D:multistatus ${NS}>${responses.join('')}</D:multistatus>`);
}
const response = (path: string, props: string) => `<D:response><D:href>${href(path)}</D:href><D:propstat><D:prop>${props}</D:prop><D:status>HTTP/1.1 200 OK</D:status></D:propstat></D:response>`;

router.use(express.text({ type: () => true, limit: '256kb' }));
router.use((req: Request, res: Response, next: NextFunction) => {
  res.setHeader('DAV', '1, 3, calendar-access');
  res.setHeader('Allow', ALLOW);
  // Clients probe capabilities before they authenticate.
  if (req.method === 'OPTIONS') return res.status(204).end();
  next();
});

/** HTTP Basic with username or e-mail and the generated CalDAV password; never the account password. */
router.use(async (req: CalDavRequest, res: Response, next: NextFunction) => {
  try {
    res.setHeader('Cache-Control', 'private, no-store');
    const client = req.ip || req.socket.remoteAddress || 'unknown';
    if (await checkAndNoteAttempt(`caldav:${client}`, 600)) { res.setHeader('Retry-After', '60');return res.status(429).send('Zu viele Anfragen.'); }
    const header = req.get('authorization') || '';
    const match = header.match(/^Basic\s+([A-Za-z0-9+/=]+)$/i);
    const decoded = match ? Buffer.from(match[1]!, 'base64').toString('utf8') : '';
    const separator = decoded.indexOf(':');
    const user = separator > 0 ? await verifyCalDav(decoded.slice(0, separator), decoded.slice(separator + 1)) : null;
    if (!user) {
      if (header && (await checkAndNoteAttempt(`caldav-failed:${client}`, 20) || (separator > 0 && await checkAndNoteAttempt(`caldav-failed-login:${decoded.slice(0, separator).toLowerCase()}`, 20)))) {
        res.setHeader('Retry-After', '900');return res.status(429).send('Zu viele fehlgeschlagene Anmeldungen.');
      }
      res.setHeader('WWW-Authenticate', 'Basic realm="Aquarium-Logbuch CalDAV", charset="UTF-8"');
      return res.status(401).send('Anmeldung mit CalDAV-Zugangsdaten erforderlich.');
    }
    req.calDavUser = user;
    next();
  } catch (error) { next(error); }
});

/** The authenticated account may only see its own principal and calendar. */
function owner(req: CalDavRequest, res: Response): CalDavUser | null {
  const user = req.calDavUser!;
  if (String(req.params.userId) !== String(user.id)) { res.status(404).send('Nicht gefunden.');return null; }
  return user;
}
const principalProps = (user: CalDavUser) => `<D:resourcetype><D:principal/><D:collection/></D:resourcetype><D:displayname>${xml(user.username)}</D:displayname>`
  + `<D:current-user-principal><D:href>${href(`${user.id}/`)}</D:href></D:current-user-principal><D:principal-URL><D:href>${href(`${user.id}/`)}</D:href></D:principal-URL>`
  + `<C:calendar-home-set><D:href>${href(`${user.id}/`)}</D:href></C:calendar-home-set>`;
const calendarProps = (calendar: UserCalendar, user: CalDavUser) => `<D:resourcetype><D:collection/><C:calendar/></D:resourcetype><D:displayname>${xml(calendar.name)}</D:displayname>`
  + `<C:calendar-description>${xml(user.language === 'en' ? 'Read-only care schedule from Aquarium-Logbuch' : 'Schreibgeschützter Pflegeplan aus dem Aquarium-Logbuch')}</C:calendar-description>`
  + '<C:supported-calendar-component-set><C:comp name="VEVENT"/></C:supported-calendar-component-set><A:calendar-color>#2A9D8FFF</A:calendar-color>'
  + `<CS:getctag>${calendar.version}</CS:getctag><D:getetag>"${calendar.version.slice(0, 32)}"</D:getetag>`
  + '<D:current-user-privilege-set><D:privilege><D:read/></D:privilege><D:privilege><C:read-free-busy/></D:privilege></D:current-user-privilege-set>'
  + '<D:supported-report-set><D:supported-report><D:report><C:calendar-multiget/></D:report></D:supported-report><D:supported-report><D:report><C:calendar-query/></D:report></D:supported-report></D:supported-report-set>'
  + `<D:owner><D:href>${href(`${user.id}/`)}</D:href></D:owner><D:current-user-principal><D:href>${href(`${user.id}/`)}</D:href></D:current-user-principal>`;
const objects = (calendar: UserCalendar) => calendar.entries.map(entry => ({ name: `${entry.uid}.ics`, body: entryIcs(calendar, entry) }));
const objectProps = (body: string, withData: boolean) => `<D:resourcetype/><D:getcontenttype>text/calendar; charset=utf-8; component=VEVENT</D:getcontenttype><D:getetag>${xml(etagOf(body))}</D:getetag>`
  + `<D:getcontentlength>${Buffer.byteLength(body)}</D:getcontentlength>${withData ? `<C:calendar-data>${xml(body)}</C:calendar-data>` : ''}`;
const safeDecode = (value: string) => { try { return decodeURIComponent(value); } catch { return value; } };
const depth = (req: Request) => req.get('depth') === '0' ? 0 : 1;
const load = (user: CalDavUser) => buildUserCalendar(user.id, user.language === 'en' ? 'en' : 'de');

function dav(handler: (req: CalDavRequest, res: Response) => Promise<unknown>) {
  return (req: Request, res: Response, next: NextFunction) => { handler(req as CalDavRequest, res).catch(next); };
}
const readOnly = (_req: Request, res: Response) => res.status(403).type('application/xml; charset=utf-8')
  .send(`<?xml version="1.0" encoding="utf-8"?>\n<D:error ${NS}><D:need-privileges/></D:error>`);

// Service discovery: the root points clients to the principal of the signed-in account.
router.get('/', dav(async (req, res) => { res.redirect(`${APP_PATH}/caldav/${req.calDavUser!.id}/${CALENDAR}/`); }));
router.propfind('/', dav(async (req, res) => {
  multistatus(res, [response('', `<D:resourcetype><D:collection/></D:resourcetype><D:current-user-principal><D:href>${href(`${req.calDavUser!.id}/`)}</D:href></D:current-user-principal>`)]);
}));
router.get('/:userId/', dav(async (req, res) => {
  const user = owner(req, res);if (!user) return;
  res.redirect(`${APP_PATH}/caldav/${user.id}/${CALENDAR}/`);
}));
router.propfind('/:userId/', dav(async (req, res) => {
  const user = owner(req, res);if (!user) return;
  const items = [response(`${user.id}/`, principalProps(user))];
  if (depth(req) > 0) items.push(response(`${user.id}/${CALENDAR}/`, calendarProps(await load(user), user)));
  multistatus(res, items);
}));
router.get('/:userId/pflege/', dav(async (req, res) => {
  const user = owner(req, res);if (!user) return;
  const body = calendarIcs(await load(user));
  res.type('text/calendar; charset=utf-8').setHeader('ETag', etagOf(body));
  res.send(body);
}));
router.propfind('/:userId/pflege/', dav(async (req, res) => {
  const user = owner(req, res);if (!user) return;
  const calendar = await load(user);
  const items = [response(`${user.id}/${CALENDAR}/`, calendarProps(calendar, user))];
  if (depth(req) > 0) for (const item of objects(calendar)) items.push(response(`${user.id}/${CALENDAR}/${item.name}`, objectProps(item.body, false)));
  multistatus(res, items);
}));
router.report('/:userId/pflege/', dav(async (req, res) => {
  const user = owner(req, res);if (!user) return;
  const body = typeof req.body === 'string' ? req.body : '';
  const all = objects(await load(user));
  let selected = all;
  if (/calendar-multiget/i.test(body)) {
    const wanted = new Set([...body.matchAll(/<(?:[\w-]+:)?href[^>]*>([^<]+)<\/(?:[\w-]+:)?href>/gi)].map(match => safeDecode(match[1]!.trim()).split('/').pop()));
    selected = all.filter(item => wanted.has(item.name));
  } else if (!/calendar-query/i.test(body)) {
    return res.status(403).type('application/xml; charset=utf-8').send(`<?xml version="1.0" encoding="utf-8"?>\n<D:error ${NS}><D:supported-report/></D:error>`);
  }
  multistatus(res, selected.map(item => response(`${user.id}/${CALENDAR}/${item.name}`, objectProps(item.body, true))));
}));
const object = async (req: CalDavRequest, res: Response) => {
  const user = owner(req, res);if (!user) return null;
  const item = objects(await load(user)).find(entry => entry.name === req.params.object);
  if (!item) { res.status(404).send('Nicht gefunden.');return null; }
  return { user, item };
};
router.get('/:userId/pflege/:object', dav(async (req, res) => {
  const found = await object(req, res);if (!found) return;
  res.type('text/calendar; charset=utf-8').setHeader('ETag', etagOf(found.item.body));
  res.send(found.item.body);
}));
router.propfind('/:userId/pflege/:object', dav(async (req, res) => {
  const found = await object(req, res);if (!found) return;
  multistatus(res, [response(`${found.user.id}/${CALENDAR}/${found.item.name}`, objectProps(found.item.body, false))]);
}));
// The calendar is generated from the app data and therefore read-only for CalDAV clients.
router.use((req: Request, res: Response, next: NextFunction) => {
  if (['PUT', 'DELETE', 'POST', 'PROPPATCH', 'MKCALENDAR', 'MKCOL', 'MOVE', 'COPY', 'LOCK', 'UNLOCK', 'ACL'].includes(req.method)) return readOnly(req, res);
  next();
});
router.use((_req: Request, res: Response) => { res.status(404).send('Nicht gefunden.'); });

export = router;

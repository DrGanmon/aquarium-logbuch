import { createHash } from 'node:crypto';
import { EventEmitter } from 'node:events';
import type { Request } from 'express';
import db = require('../db');
import aquariumRoutes = require('../routes/aquariums');
import authRoutes = require('../routes/auth');
import configRoutes = require('../routes/config');
import healthRoutes = require('../routes/health');
import cfg = require('../config/app-config');
import { offlineAtomic, offlineConnection } from '../db/offline-transaction';
import { workspaceWrite, canonicalResource, type WorkspaceOperation, type WorkspaceSnapshot } from '../shared/offline-workspace';
import { AppError } from '../utils/app-error';

function canonical(value: any): any {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).filter(key => key !== '_id').sort().map(key => [key, canonical(value[key])]));
  return value;
}
const fingerprint = (value: unknown) => createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
/** Run the existing route validators/permissions without a loopback HTTP request. */
export function workspaceDispatch(original: Request, path: string, method = 'GET', body: any = {}): Promise<any> {
  return new Promise((resolve, reject) => {
    const request: any = Object.create(original);
    Object.assign(request, { method, body, params: {}, originalUrl: '/api' + path, url: path, baseUrl: '/api', offlineOperation: true });
    let router: any = configRoutes;
    if (path.startsWith('/aquariums')) { router = aquariumRoutes;request.url = path.slice('/aquariums'.length) || '/'; }
    else if (path.startsWith('/health/')) { router = healthRoutes;request.url = path.slice('/health'.length); }
    else if (path === '/me' || path.startsWith('/me/avatar')) router = authRoutes;
    const response: any = new EventEmitter();
    response.statusCode = 200;response.headers = {};
    response.setHeader = (key: string, value: any) => { response.headers[key.toLowerCase()] = value;return response; };
    response.getHeader = (key: string) => response.headers[key.toLowerCase()];
    response.status = (code: number) => { response.statusCode = code;return response; };
    response.type = () => response;
    response.json = response.send = response.end = (data: any) => {
      if (response.headersSent) return response;
      response.headersSent = true;response.writableFinished = true;
      if (response.statusCode >= 400) reject(Object.assign(new AppError(data?.error || `HTTP ${response.statusCode}`, response.statusCode), { code: data?.code }));
      else resolve(data);
      response.emit('finish');return response;
    };
    request.res = response;response.req = request;
    router.handle(request, response, (error: unknown) => reject(error || new AppError('Offline-Aktion nicht gefunden.', 404)));
  });
}
async function targetState(path: string, method: string, owner: number) {
  const target = canonicalResource(path), parts = target.split('/');
  if (target.startsWith('/me')) {
    const user = await db.users.findById(owner);
    if (!user) throw new AppError('Benutzer nicht gefunden.', 404);
    if (target === '/me/test-inventory') return user.test_inventory || '{}';
    if (target === '/me/tests') return [user.selected_suite, user.selected_tests];
    if (target === '/me/avatar') return user.avatar_file;
    return Object.fromEntries(['username', 'first_name', 'last_name', 'bio', 'language', 'default_graph_range'].map(key => [key, (user as any)[key]]));
  }
  const id = Number(parts[2]);
  const aq = await db.aquariums.findById(id);
  if (!aq) return null;
  if (parts.length === 3) {
    if (method !== 'DELETE') return aq;
    return [aq, await db.stock.listForAquarium(id), await db.plants.listForAquarium(id), await db.measurements.listForAquarium(id, { all: true }), await db.maintenance.listForAquarium(id), await db.dosingPumps.listForAquarium(id), await db.aquariumImages.listForAquarium(id)];
  }
  const sub = parts[3], item = parts[4];
  if (sub === 'stock') { const row = await db.stock.findById(Number(item));return row?.aquarium_id === id ? row : null; }
  if (sub === 'plants') return (await db.plants.listForAquarium(id)).find(row => row.plant_id === decodeURIComponent(item)) || null;
  if (sub === 'maintenance') { const row = await db.maintenance.findById(Number(item));return row?.aquarium_id === id ? row : null; }
  if (sub === 'measurements') { const row = await db.measurements.findById(Number(item));return row?.aquarium_id === id ? row : null; }
  if (sub === 'fertilizers') { const row = await db.dosingPumps.findById(Number(item));return row?.aquarium_id === id ? row : null; }
  if (sub === 'images') return await db.aquariumImages.listForAquarium(id);
  return aq;
}
async function authorize(original: Request, path: string, method: string) {
  if (!path.startsWith('/aquariums/')) return;
  const id = Number(path.split('/')[2]);
  const access = await db.aquariums.getAccess(id, original.user);
  if (!access) throw new AppError('Aquarium nicht gefunden.', 404);
  if (access.role === 'view' || (method === 'DELETE' && path === `/aquariums/${id}` && access.role !== 'owner')) throw new AppError('Keine Schreibberechtigung.', 403);
}
function receipts() {
  return offlineConnection(db.getRawDb()!, db.type) as any;
}
async function findReceipt(key: string): Promise<any> {
  const raw = receipts();
  return db.type === 'sqlite' ? raw.prepare('SELECT * FROM measurement_operations WHERE operation_key = ?').get(key)
    : raw.collection('measurement_operations').findOne({ operation_key: key });
}
async function putReceipt(key: string, hash: string, response: unknown) {
  const raw = receipts(), value = JSON.stringify(response);
  if (db.type === 'sqlite') raw.prepare('INSERT INTO measurement_operations (operation_key, request_hash, response) VALUES (?, ?, ?)').run(key, hash, value);
  else await raw.collection('measurement_operations').insertOne({ operation_key: key, request_hash: hash, response: value });
}
export async function applyWorkspaceOperation(original: Request, command: WorkspaceOperation) {
  if (!command || typeof command !== 'object' || typeof command.path !== 'string' || typeof command.method !== 'string' || !command.body || typeof command.body !== 'object' || Array.isArray(command.body) || (command.base != null && typeof command.base !== 'string')) throw new AppError('Ungültige Offline-Aktion.', 400);
  if (command.owner !== original.user.id) throw new AppError('Der Eintrag gehört zu einer anderen Benutzersitzung.', 403);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(command.id) || !workspaceWrite(command.path, command.method, command.body)) throw new AppError('Ungültige Offline-Aktion.', 400);
  if (/\/-\d+(?=\/|$)/.test(command.path)) throw new AppError('Abhängige Einträge müssen zuerst synchronisiert werden.', 409);
  const key = `${command.owner}:workspace:${command.id}`, hash = fingerprint({ id: command.id, owner: command.owner, path: command.path, method: command.method, body: command.body, base: command.base });
  const execute = async () => offlineAtomic(db, async () => {
    const previous = await findReceipt(key);
    if (previous) {
      if (previous.request_hash !== hash) throw new AppError('Die Operations-ID wurde bereits für andere Daten verwendet.', 409);
      return JSON.parse(previous.response);
    }
    await authorize(original, command.path, command.method);
    const target = canonicalResource(command.path);
    const needsBase = (command.method !== 'POST' || /\/(image|avatar|dose)$/.test(command.path)) && !command.path.endsWith('/alerts/ack');
    if (needsBase) {
      let expected = command.base;
      if (expected?.startsWith('after:')) {
        const receipt = await findReceipt(`${command.owner}:workspace:${expected.slice(6)}`);
        if (!receipt) throw new AppError('Vorherige Änderung ist noch nicht synchronisiert.', 409);
        const prior = JSON.parse(receipt.response);
        if (prior.target !== target && !prior.versions?.[(command.method === 'DELETE' ? 'DELETE ' : '') + target] && !prior.versions?.[target]) throw new AppError('Ungültige Änderungsabhängigkeit.', 400);
        expected = prior.versions?.[(command.method === 'DELETE' ? 'DELETE ' : '') + target] || prior.versions?.[target] || (command.method === 'DELETE' ? prior.deleteVersion : prior.version);
      }
      const current = await targetState(command.path, command.method, command.owner);
      const actual = current === null ? 'missing' : fingerprint(current);
      if (!expected || expected !== actual) throw Object.assign(new AppError('Der Eintrag wurde auf einem anderen Gerät geändert. Bitte beide Stände prüfen.', 409), { conflict: { current, version: actual } });
    }
    const body = { ...command.body };delete body.operation_id;delete body.operation_user_id;
    if (command.path.endsWith('/alerts/ack') && Array.isArray(body.offline_alerts)) {
      const ids = Array.isArray(body.ids) ? body.ids : [];
      for (const selector of body.offline_alerts) {
        const receipt = await findReceipt(`${command.owner}:workspace:${selector.operation}`) || await findReceipt(`${command.owner}:${selector.operation}`);
        if (!receipt) throw new AppError('Die zugehörige Messung muss zuerst synchronisiert werden.', 409);
        const saved = JSON.parse(receipt.response), measurementId = saved.result?.id || saved.id;
        const alerts = await db.alerts.listAllForAquarium(Number(command.path.split('/')[2]));
        for (const alert of alerts) if (alert.measurement_id === measurementId && alert.param === selector.param) ids.push(alert.id);
      }
      body.ids = ids;delete body.offline_alerts;
    }
    const csvAquarium = command.path.endsWith('/measurements/import-csv') ? Number(command.path.split('/')[2]) : null;
    const before = csvAquarium ? new Set((await db.measurements.listForAquarium(csvAquarium, { all: true })).map(row => row.id)) : null;
    const result = await workspaceDispatch(original, command.path, command.method, body);
    if (csvAquarium && before) result.entries = (await db.measurements.listForAquarium(csvAquarium, { all: true })).filter(row => !before.has(row.id)).sort((a, b) => a.id - b.id).map(row => ({ id: row.id }));
    let updatedTarget = target;
    if (command.method === 'POST' && result?.id && !/\/(image|avatar|dose)$/.test(command.path)) updatedTarget += '/' + result.id;
    updatedTarget = canonicalResource(updatedTarget);
    const current = await targetState(updatedTarget, 'PUT', command.owner);
    const deleted = await targetState(updatedTarget, 'DELETE', command.owner);
    const response = { result, target: updatedTarget, version: current === null ? 'missing' : fingerprint(current), deleteVersion: deleted === null ? 'missing' : fingerprint(deleted) };
    const versions: Record<string, string> = {};
    for (const entry of result?.entries || []) {
      const path = command.path.replace(/\/(catalog|import-csv)$/, '') + '/' + entry.id;
      versions[path] = fingerprint(await targetState(path, 'PUT', command.owner));
    }
    if (result?.log_id) {
      const path = `/aquariums/${command.path.split('/')[2]}/maintenance/${result.log_id}`;
      versions[path] = fingerprint(await targetState(path, 'PUT', command.owner));
    }
    const aquariumMatch = command.path.match(/^\/aquariums\/(\d+)/);
    if (aquariumMatch) {
      const path = '/aquariums/' + aquariumMatch[1];
      const value = await targetState(path, 'DELETE', command.owner);
      versions['DELETE ' + path] = value === null ? 'missing' : fingerprint(value);
    }
    versions['/me/test-inventory'] = fingerprint(await targetState('/me/test-inventory', 'PUT', command.owner));
    Object.assign(response, { versions });
    await putReceipt(key, hash, response);return response;
  });
  try { return await execute(); }
  catch (error) {
    if ((error as any)?.code !== 11000) throw error;
    return execute();
  }
}
export async function workspaceSnapshot(original: Request): Promise<WorkspaceSnapshot> {
  return offlineAtomic(db, async () => {
    const responses: Record<string, any> = {}, versions: Record<string, string> = {};
    const capture = async (path: string) => responses[path] = await workspaceDispatch(original, path);
    const list = await capture('/aquariums');await capture('/me');const config = await capture('/config');
    for (const suite of config.suites) await capture('/me/test-inventory?suiteId=' + encodeURIComponent(suite.id));
    for (const aquarium of list) {
      const root = `/aquariums/${aquarium.id}`;
      await capture(root);
      for (const suffix of ['/stock', '/plants', '/maintenance', '/fertilizers', '/images', '/measurements?all=true']) {
        await capture(root + suffix);
      }
      await capture(`/health/aquariums/${aquarium.id}/residents`);
      versions[root + '/images'] = fingerprint(await db.aquariumImages.listForAquarium(aquarium.id));
      versions[root] = fingerprint(await targetState(root, 'PUT', original.user.id));
      versions['DELETE ' + root] = fingerprint(await targetState(root, 'DELETE', original.user.id));
      for (const [collection, key] of [['stock', 'id'], ['plants', 'plant_id'], ['maintenance', 'id'], ['fertilizers', 'id'], ['images', 'id'], ['measurements', 'id']]) {
        const rows = responses[root + '/' + collection + (collection === 'measurements' ? '?all=true' : '')];
        for (const row of rows) {
          const path = `${root}/${collection}/${encodeURIComponent(row[key])}`;
          const value = await targetState(path, 'PUT', original.user.id);versions[path] = value === null ? 'missing' : fingerprint(value);
        }
      }
    }
    for (const path of ['/me', '/me/tests', '/me/test-inventory', '/me/avatar']) versions[path] = fingerprint(await targetState(path, 'PUT', original.user.id));
    const snapshot: WorkspaceSnapshot = { schema: 1, owner: original.user.id, language: String(original.headers['x-language'] || original.user.language || 'de'), updatedAt: new Date().toISOString(), responses, versions,
      rules: { profiles: cfg.PROFILES, parameters: cfg.PARAMETERS } };
    snapshot.version = fingerprint({ ...snapshot, updatedAt: undefined });
    return snapshot;
  });
}

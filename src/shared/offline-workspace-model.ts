import { validateMeasurementDraft } from './measurement-draft';
import { prepareCsvMeasurements } from './measurement-csv';
import type { WorkspaceOperation, WorkspaceSnapshot } from './offline-workspace';
import { aquariumInput } from './aquarium-input';
import { validateMaintenanceInput } from './maintenance';
import { validateDosingPumpInput, manualDosingStatus, nextAutomaticDosingAt } from './dosing';
import { calculateCycleStatus } from './cycles';
import { calculateThresholds } from './thresholds';
import { analyzeCompatibility } from './compatibility';
import type { CatalogSnapshot } from './offline-catalog';
import { canonicalHealthSpeciesId } from './diagnosis';
import { AppError } from '../utils/app-error';
export const cloneWorkspace = <T>(value: T): T => JSON.parse(JSON.stringify(value));
const check = (result: any) => { if (result.error !== undefined) throw new AppError(result.error, 400);return result.value; };
export function remapOperation(command: WorkspaceOperation, mapping: Record<string, number>): WorkspaceOperation {
  const path = command.path.replace(/\/-\d+(?=\/|$)/g, part => '/' + (mapping[part.slice(1)] ?? part.slice(1)));
  return { ...command, path, aquarium: String(mapping[command.aquarium] ?? command.aquarium) };
}
export function remapSnapshot(snapshot: WorkspaceSnapshot, mapping: Record<string, number>) {
  const mapped = (value: any, key = ''): any => {
    if (typeof value === 'number' && ['id', 'aquarium_id', 'measurement_id', 'stockId'].includes(key)) return mapping[value] ?? value;
    if (typeof value === 'string' && (value.startsWith('/aquariums/') || value.startsWith('api/aquariums/') || value.startsWith('/health/aquariums/'))) return value.replace(/\/-\d+(?=\/|$)/g, part => '/' + (mapping[part.slice(1)] ?? part.slice(1)));
    if (Array.isArray(value)) return value.map(item => mapped(item));
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([name, item]) => [mapped(name), mapped(item, name)]));
    return value;
  };
  return mapped(snapshot) as WorkspaceSnapshot;
}
export function applyLocalOperation(snapshot: WorkspaceSnapshot, command: WorkspaceOperation, catalogs: { species?: CatalogSnapshot<'species'>; plants?: CatalogSnapshot<'plants'>; health?: CatalogSnapshot<'health'> } = {}): any {
  const r = snapshot.responses, body = command.body, parts = command.path.split('/');
  const id = Number(parts[2]), root = `/aquariums/${id}`, type = parts[3], item = parts[4];
  const now = command.createdAt, temporary = command.temporaryIds[0];
  const list = (path: string): any[] => r[path] ||= [];
  const profile = r['/me'], config = r['/config'];
  let result: any = { ok: true };
  if (command.path === '/me') {
    const allowed = ['username', 'firstName', 'lastName', 'bio', 'language', 'defaultGraphRange'];
    if (Object.keys(body).some(key => !allowed.includes(key))) throw new AppError('Diese Kontoeinstellung benötigt eine Verbindung.', 400);
    if (body.username !== undefined && !/^[\p{L}\p{N}_.-]{3,40}$/u.test(String(body.username))) throw new AppError('Ungültiger Benutzername.', 400);
    Object.assign(profile, body);result = { user: profile };
  } else if (command.path === '/me/tests') {
    const selectedSuite = body.selectedSuite || config.userPreferences.selectedSuite;
    if (!config.suites.some((suite: any) => suite.id === selectedSuite)) throw new AppError('Unbekannte Testsuite.', 400);
    const selected = body.selectedTests;
    if (!Array.isArray(selected) || new Set(selected).size !== selected.length || selected.some((reference: any) => typeof reference !== 'string' || !config.suites.some((suite: any) => suite.tests.some((test: any) => reference === `${suite.id}:${test.key}` || (suite.id === selectedSuite && reference === test.key))))) throw new AppError('Ungültige Testauswahl.', 400);
    config.userPreferences = { selectedSuite, selectedTests: selected };profile.selectedSuite = selectedSuite;profile.selectedTests = selected;result = config.userPreferences;
  } else if (command.path.startsWith('/me/test-inventory/')) {
    const inventory = r['/me/test-inventory?suiteId=' + encodeURIComponent(body.suiteId || profile.selectedSuite)];
    const test = inventory?.items.find((entry: any) => entry.key === decodeURIComponent(parts[3]));
    if (!test) throw new AppError('Unbekannter Verbrauchstest.', 400);
    for (const field of ['used', 'capacity']) if (body[field] !== undefined && body[field] !== null && (!Number.isInteger(body[field]) || body[field] < (field === 'used' ? 0 : 1) || body[field] > 1000000)) throw new AppError('Ungültiger Testbestand.', 400);
    const variant = test.consumable.variants.find((entry: any) => entry.id === body.variant);
    if (body.variant !== undefined && !variant) throw new AppError('Unbekannte Testvariante.', 400);
    if (variant) { test.variant = variant.id;test.capacity = variant.capacity;test.tracksUsage = variant.trackUsage !== false; }
    for (const field of ['used', 'capacity', 'reminderEnabled']) if (body[field] !== undefined) test[field] = body[field];
    if (body.reset) test.used = 0;result = inventory;
  } else if (command.path === '/me/avatar') { profile.hasAvatar = command.method !== 'DELETE';result = { user: profile }; }
  else if (command.path === '/aquariums') {
    const aquarium = { ...check(aquariumInput(body)), id: temporary, user_id: command.owner, created_at: now, role: 'owner', alerts: [], has_image: false };
    list('/aquariums').push(aquarium);
    r[`/aquariums/${temporary}`] = { aquarium, role: 'owner', profiles: [], thresholds: {}, conflicts: [], stockCompatibility: {}, alerts: [], latest: {}, stock: [], dosing_pumps: [] };
    for (const collection of ['stock', 'plants', 'maintenance', 'fertilizers', 'images', 'measurements?all=true']) r[`/aquariums/${temporary}/${collection}`] = [];
    result = { id: temporary };
  } else {
    const detail = r[root];
    if (!detail) throw new AppError('Aquarium nicht offline verfügbar.', 404);
    if (detail.role === 'view') throw new AppError('Keine Schreibberechtigung.', 403);
    if (!type) {
      if (command.method === 'DELETE') {
        if (detail.role !== 'owner') throw new AppError('Nur Eigentümer können das Aquarium löschen.', 403);
        r['/aquariums'] = list('/aquariums').filter(aquarium => aquarium.id !== id);
        for (const path of Object.keys(r)) if (path === root || path.startsWith(root + '/')) delete r[path];
      } else Object.assign(detail.aquarium, check(aquariumInput(body)));
    } else if (type === 'measurement-draft') {
      const path = root + '/measurement-draft';
      if (item === 'complete') {
        if (!r[path] || r[path].draftId !== body.draftId) throw new AppError('Dieser Test wurde bereits geschlossen.', 409);
        result = applyLocalOperation(snapshot, { ...command, path: root + '/measurements' }, catalogs);
        r[path] = null;
      } else r[path] = command.method === 'DELETE' ? null : validateMeasurementDraft(body, config.suites);
    } else if (type === 'plants') {
      const plants = list(root + '/plants');
      if (command.method === 'DELETE') r[root + '/plants'] = plants.filter(plant => plant.plant_id !== decodeURIComponent(item));
      else {
        const plant = catalogs.plants?.data.plants.find(entry => entry.id === decodeURIComponent(item));
        if (!plant || plant.waterType !== detail.aquarium.water_type) throw new AppError('Pflanze oder Wasserart passt nicht.', 400);
        if (!Number.isInteger(body.count) || body.count < 1 || body.count > 10000) throw new AppError('Anzahl: 1–10000 ganze Pflanzen.', 400);
        const entry = { aquarium_id: id, plant_id: plant.id, count: body.count, name: plant.name, scientificName: plant.scientificName, category: plant.category };
        r[root + '/plants'] = [...plants.filter(row => row.plant_id !== plant.id), entry];
      }
    } else if (type === 'stock') {
      const rows = list(root + '/stock');
      if (item === 'catalog') {
        const species = catalogs.species?.data.species.find(entry => entry.id === body.speciesId);
        if (!species || species.waterType !== detail.aquarium.water_type || !Number.isInteger(Number(body.count)) || Number(body.count) < 1 || Number(body.count) > 10000) throw new AppError('Ungültige Art, Wasserart oder Anzahl.', 400);
        const names = body.names || [];
        if (!Array.isArray(names) || (names.length && names.length !== Number(body.count)) || names.some(name => typeof name !== 'string' || name.trim().length > 80)) throw new AppError('Ungültige Namen.', 400);
        const named = names.map(name => name.trim()).filter(Boolean), counts = named.map(() => 1);
        if (Number(body.count) > named.length) { named.push(null);counts.push(Number(body.count) - counts.length); }
        const entries = named.map((name, index) => ({ id: command.temporaryIds[index], aquarium_id: id, species: species.name, speciesId: species.id, profile: species.profile || 'allgemein', count: counts[index], name }));
        rows.push(...entries);result = { added: Number(body.count), entries };
      } else if (command.method === 'DELETE' && !parts[5]) r[root + '/stock'] = rows.filter(row => row.id !== Number(item));
      else {
        const existing = item ? rows.find(row => row.id === Number(item)) : undefined;
        if (item && !existing) throw new AppError('Bewohner nicht gefunden.', 404);
        if (parts[5] === 'image' && existing) { existing.image_file = command.method === 'DELETE' ? null : 'offline-' + command.id; }
        if (parts[5] !== 'image') {
          const entry = { ...existing, ...body, id: existing?.id ?? temporary, aquarium_id: id };
          entry.species = String(entry.species || '').trim().slice(0, 80);entry.count = Math.round(Number(entry.count ?? 1));
          if (!entry.species || !Number.isFinite(entry.count) || entry.count < 1 || entry.count > 10000) throw new AppError('Ungültiger Bewohner oder Anzahl.', 400);
          const match = catalogs.species?.data.species.find(species => species.id === entry.species || species.name === entry.species || species.name_de === entry.species || species.name_en === entry.species || species.aliases?.includes(entry.species));
          if (body.image) entry.image_file = 'offline-' + command.id;
          if (body.remove_image) entry.image_file = null;
          delete entry.image;delete entry.remove_image;
          entry.profile ||= match?.profile || 'allgemein';entry.speciesId = match?.id || null;
          if (existing) Object.assign(existing, entry);else rows.push(entry);
          result = entry;
        }
      }
    } else if (type === 'maintenance') {
      const rows = list(root + '/maintenance');
      if (command.method === 'DELETE') r[root + '/maintenance'] = rows.filter(row => row.id !== Number(item));
      else {
        const entry = { ...check(validateMaintenanceInput(body)), id: item ? Number(item) : temporary, aquarium_id: id, created_by: command.owner, created_by_username: profile.username, created_at: now };
        if (item) { const index = rows.findIndex(row => row.id === Number(item));if (index < 0) throw new AppError('Eintrag nicht gefunden.', 404);rows[index] = entry; }
        else rows.push(entry);
        result = { id: entry.id };
      }
    } else if (type === 'measurements') {
      if (item === 'import-csv') {
        const prepared = prepareCsvMeasurements(body, config.allParameters || snapshot.rules.parameters);
        const entries = prepared.entries.map((entry, index) => {
          const child = { ...command, path: root + '/measurements', body: { ...entry, __csv: true }, temporaryIds: [command.temporaryIds[index]] };
          return applyLocalOperation(snapshot, child, catalogs);
        });
        return { ok: true, imported: entries.length, skipped: prepared.skipped, errors: prepared.errors, entries, alerts: 0 };
      }
      const rows = list(root + '/measurements?all=true');
      if (command.method === 'DELETE') { r[root + '/measurements?all=true'] = rows.filter(row => row.id !== Number(item));detail.alerts = detail.alerts.filter((alert: any) => alert.measurement_id !== Number(item)); }
      else {
        const selection = body.selectedTests;
        if (selection !== undefined && !Array.isArray(selection)) throw new AppError('Ungültige Testauswahl.', 400);
        const definitions = selection === undefined ? (body.__csv ? config.allParameters || snapshot.rules.parameters : snapshot.rules.parameters) : config.suites.flatMap((suite: any) => suite.tests.filter((test: any) => selection.includes(`${suite.id}:${test.key}`) || (suite.id === (body.suiteId || config.defaultSuiteId) && selection.includes(test.key))));
        if (selection !== undefined && (!Array.isArray(selection) || definitions.length !== selection.length)) throw new AppError('Ungültige Testauswahl.', 400);
        const values: Record<string, number> = {};
        for (const [key, raw] of Object.entries(body.values || {})) {
          if (raw === '' || raw == null) continue;
          const parameter = definitions.find((test: any) => test.key === key), value = Number(String(raw).replace(',', '.'));
          if (!parameter || !Number.isFinite(value) || value < parameter.min || value > parameter.max) throw new AppError('Ungültiger Messwert: ' + key, 400);
          values[key] = value;
        }
        const time = new Date(body.measured_at || now);
        if ((!Object.keys(values).length && !(body.__csv && body.note)) || !Number.isFinite(time.getTime()) || time.getTime() > Date.now() + 5 * 60000) throw new AppError('Ungültige Messung oder Messzeit.', 400);
        const entry = { id: temporary, aquarium_id: id, measured_at: time.toISOString(), values, note: String(body.note || '').slice(0, 500), created_by: command.owner, created_by_username: profile.username, operation: command.id };
        rows.push(entry);result = { id: temporary };
        const saved = config.userPreferences.selectedTests, fallbackSuite = body.suiteId || config.userPreferences.selectedSuite;
        const selected = selection ?? (!body.suiteId && Array.isArray(saved) && (saved.length === 0 || saved.some((value: string) => value.includes(':'))) ? saved : (config.suites.find((suite: any) => suite.id === fallbackSuite)?.tests || []).map((test: any) => test.key));
        for (const suite of config.suites) {
          const inventory = r['/me/test-inventory?suiteId=' + encodeURIComponent(suite.id)];
          if (!inventory) continue;
          for (const test of inventory.items) if (test.tracksUsage && values[test.key] !== undefined && (selected.includes(`${suite.id}:${test.key}`) || (suite.id === fallbackSuite && selected.includes(test.key)))) test.used++;
        }
      }
    } else if (type === 'fertilizers' || type === 'dosing-pumps') {
      const rows = list(root + '/fertilizers');
      if (parts[5] === 'dose') {
        const plan = rows.find(row => row.id === Number(item));
        if (!plan || plan.mode !== 'manual') throw new AppError('Nur manuelle Dünger können protokolliert werden.', 400);
        plan.last_dosed_at = body.logged_at || now;
        list(root + '/maintenance').push({ id: temporary, aquarium_id: id, logged_at: plan.last_dosed_at, type: 'fertilize', details: `${plan.fertilizer_name}: ${plan.amount_ml} ml`, note: plan.note, created_by: command.owner, created_at: now });
        result = { ok: true };
      } else if (command.method === 'DELETE') r[root + '/fertilizers'] = rows.filter(row => row.id !== Number(item));
      else {
        const value = check(validateDosingPumpInput(body));
        const entry = { ...value, id: item ? Number(item) : temporary, aquarium_id: id, created_at: now, schedule_started_at: now, last_dosed_at: null };
        if (item) { const existing = rows.find(row => row.id === Number(item));if (!existing) throw new AppError('Dünger nicht gefunden.', 404);Object.assign(existing, value);result = existing; }
        else { rows.push(entry);result = entry; }
      }
    } else if (type === 'images') {
      const rows = list(root + '/images');
      if (command.method === 'DELETE') r[root + '/images'] = rows.filter(row => row.id !== Number(item));
      else if (command.method === 'POST') {
        if (body.is_primary) for (const row of rows) row.is_primary = 0;
        const entry = { id: temporary, aquarium_id: id, caption: body.caption || null, is_primary: body.is_primary || rows.length === 0 ? 1 : 0, filename: 'offline-' + command.id, created_at: now, image_url: `api/aquariums/${id}/images/${temporary}` };
        rows.push(entry);result = entry;
      } else if (parts[5] === 'primary') for (const row of rows) row.is_primary = row.id === Number(item) ? 1 : 0;
      else { const row = rows.find(entry => entry.id === Number(item));if (!row) throw new AppError('Bild nicht gefunden.', 404);row.caption = body.caption || null; }
    } else if (type === 'image') {
      if (command.method === 'DELETE') { detail.aquarium.image_file = null;r[root + '/images'] = []; }
      else { for (const photo of list(root + '/images')) photo.is_primary = 0;list(root + '/images').push({ id: temporary, aquarium_id: id, caption: body.caption || null, filename: 'offline-' + command.id, is_primary: 1, created_at: now }); }
      result = { ok: true, id: temporary };
    }
    else if (type === 'alerts' && item === 'ack') {
      const selected = detail.alerts.filter((alert: any) => !body.ids || body.ids.includes(alert.id) || body.offline_alerts?.some((entry: any) => entry.operation === alert.operation && entry.param === alert.param));
      const acknowledged = r['__acknowledgedAlerts'] ||= [];
      acknowledged.push(...selected.map((alert: any) => ({ operation: alert.operation, param: alert.param, id: alert.id })));
      detail.alerts = detail.alerts.filter((alert: any) => !selected.includes(alert));
    }
  }
  return result;
}
export function deriveWorkspace(snapshot: WorkspaceSnapshot, catalogs: { species?: CatalogSnapshot<'species'>; plants?: CatalogSnapshot<'plants'>; health?: CatalogSnapshot<'health'> } = {}) {
  const r = snapshot.responses, config = r['/config'];
  for (const aquarium of r['/aquariums'] || []) {
    const root = `/aquariums/${aquarium.id}`, detail = r[root];if (!detail) continue;
    const rows = (r[root + '/measurements?all=true'] || []).sort((a: any, b: any) => a.measured_at.localeCompare(b.measured_at));
    const stock = r[root + '/stock'] || [], logs = (r[root + '/maintenance'] || []).sort((a: any, b: any) => b.logged_at.localeCompare(a.logged_at));
    for (const entry of stock) { entry.has_image = Boolean(entry.image_file);entry.image_url = entry.image_file ? `api/aquariums/${aquarium.id}/stock/${entry.id}/image` : null; }
    if (catalogs.species) for (const entry of stock) {
      const species = catalogs.species.data.species.find(item => item.id === entry.speciesId || item.id === entry.species || [item.name, item.name_de, item.name_en, item.scientificName, ...(item.aliases || [])].some(name => name && name.toLowerCase() === entry.species.toLowerCase()));
      entry.variantName = (species?.variantOf || species?.selectionOf) ? species.name : null;
    }
    if (catalogs.plants) for (const entry of r[root + '/plants'] || []) {
      const plant = catalogs.plants.data.plants.find(item => item.id === entry.plant_id);
      entry.variantName = plant?.variantOf ? plant.name : null;
    }
    const profiles: string[] = [...new Set<string>(stock.map((entry: any) => entry.profile || 'allgemein'))];
    const ranges = calculateThresholds(detail.aquarium.water_type, profiles, snapshot.rules.profiles, snapshot.rules.parameters);
    Object.assign(detail, ranges, { profiles, stock });
    if (catalogs.species) detail.stockCompatibility = analyzeCompatibility(detail.aquarium, stock, snapshot.language, name => catalogs.species!.data.species.find(species => species.id === name || [species.name, species.name_de, species.name_en, species.scientificName, ...(species.aliases || [])].some(value => value?.toLowerCase() === name.toLowerCase())) as any || null);
    const latest: Record<string, any> = {};
    for (const row of rows) for (const [key, value] of Object.entries(row.values)) {
      const range = detail.thresholds[key];
      latest[key] = { value, measured_at: row.measured_at, status: range && ((range.critMin != null && Number(value) < range.critMin) || (range.critMax != null && Number(value) > range.critMax)) ? 'crit' : range && ((range.okMin != null && Number(value) < range.okMin) || (range.okMax != null && Number(value) > range.okMax)) ? 'warn' : 'ok' };
    }
    detail.latest = latest;
    detail.alerts ||= [];
    for (const row of rows.filter((entry: any) => entry.id < 0)) for (const [key, value] of Object.entries(row.values)) {
      const range = detail.thresholds[key];
      const status = range && ((range.critMin != null && Number(value) < range.critMin) || (range.critMax != null && Number(value) > range.critMax)) ? 'crit' : range && ((range.okMin != null && Number(value) < range.okMin) || (range.okMax != null && Number(value) > range.okMax)) ? 'warn' : 'ok';
      if ((r['__acknowledgedAlerts'] || []).some((entry: any) => entry.operation === row.operation && entry.param === key) || status === 'ok' || detail.alerts.some((alert: any) => alert.measurement_id === row.id && alert.param === key)) continue;
      detail.alerts.push({ id: row.id - Object.keys(row.values).indexOf(key), aquarium_id: aquarium.id, measurement_id: row.id, operation: row.operation, param: key, value, level: status, message: `${key}: ${value} (${status})`, created_at: row.measured_at });
    }
    detail.aquarium.last_measured_at = rows.at(-1)?.measured_at || null;
    const water = logs.find((log: any) => log.type === 'water_change');
    Object.assign(detail.aquarium, { last_water_change_at: water?.logged_at || null, last_water_change_percent: water?.percentage || null, last_maintenance_at: logs[0]?.logged_at || null, last_maintenance_type: logs[0]?.type || null,
      open_crit: detail.alerts.filter((alert: any) => alert.level === 'crit').length, open_warn: detail.alerts.filter((alert: any) => alert.level === 'warn').length });
    for (const prefix of ['measure', 'fertilize']) {
      const last = prefix === 'measure' ? rows.at(-1)?.measured_at : logs.find((log: any) => log.type === 'fertilize' || log.type === 'dosing_pump')?.logged_at;
      detail.aquarium[`${prefix}_cycle_status`] = calculateCycleStatus({ interval: detail.aquarium[`${prefix}_cycle_interval`], unit: detail.aquarium[`${prefix}_cycle_unit`], day_of_week: detail.aquarium[`${prefix}_cycle_day_of_week`], reminder_mail: detail.aquarium[`${prefix}_reminder_mail`] }, last, detail.aquarium.created_at, new Date(), snapshot.language);
    }
    detail.aquarium.overdue = detail.aquarium.measure_cycle_status.is_due;
    const plans = r[root + '/fertilizers'] || [];
    for (const plan of plans) plan.next_due_at = !plan.is_active ? null : plan.mode === 'manual' ? manualDosingStatus(plan).next_due_at : nextAutomaticDosingAt(plan).toISOString();
    detail.dosing_pumps = plans;
    r[`/health/aquariums/${aquarium.id}/residents`] = { aquarium: { id: aquarium.id, name: aquarium.name, waterType: aquarium.water_type }, residents: stock.map((entry: any) => {
      const species = catalogs.species?.data.species.find(item => item.id === entry.speciesId || item.name === entry.species || item.name_de === entry.species || item.name_en === entry.species || item.aliases?.includes(entry.species));
      return { stockId: entry.id, name: entry.name || null, count: entry.count, speciesId: canonicalHealthSpeciesId(species?.id || entry.speciesId || entry.species), speciesName: species?.name || entry.species, scientificName: species?.scientificName || null, supported: Boolean(catalogs.health?.data.diagnosis[aquarium.water_type === 'salt' ? 'salt' : 'fresh'].species[canonicalHealthSpeciesId(species?.id || entry.speciesId || entry.species)]), ranges: species || null };
    }) };
    r[root + '/logs'] = [...logs.map((log: any) => ({ ...log, kind: 'maintenance', timestamp: log.logged_at, typeName: config.maintenanceTypes[log.type]?.label || log.type, icon: config.maintenanceTypes[log.type]?.icon || '📝' })), ...rows.map((measurement: any) => ({ ...measurement, kind: 'measurement', type: 'measurement', timestamp: measurement.measured_at }))].sort((a, b) => b.timestamp.localeCompare(a.timestamp));
    const gallery = r[root + '/images'] || [];
    detail.aquarium.has_image = Boolean(detail.aquarium.image_file);detail.aquarium.image_url = detail.aquarium.image_file ? `api/aquariums/${aquarium.id}/image` : null;
    const primary = gallery.find((image: any) => image.is_primary) || gallery[0];
    if (primary) { detail.aquarium.has_image = true;detail.aquarium.image_url = `api/aquariums/${aquarium.id}/images/${primary.id}`; }
    detail.aquarium.images_count = gallery.length;
    Object.assign(aquarium, detail.aquarium);
  }
  for (const [key, inventory] of Object.entries(r)) if (key.startsWith('/me/test-inventory?')) for (const test of inventory.items) {
    test.remaining = test.capacity == null ? null : Math.max(0, test.capacity - test.used);test.percentage = test.capacity ? Math.round(test.used / test.capacity * 100) : null;
    test.needsRefill = test.tracksUsage && test.capacity != null && test.used >= Math.ceil(test.capacity * 0.75);
  }
  if (config) {
    config.currentSuite = config.suites.find((suite: any) => suite.id === config.userPreferences.selectedSuite) || config.currentSuite;
    const selected = config.userPreferences.selectedTests;
    config.parameters = Array.isArray(selected) && selected.some((value: string) => value.includes(':')) ? config.suites.flatMap((suite: any) => suite.tests.filter((test: any) => selected.includes(`${suite.id}:${test.key}`))) : config.currentSuite?.tests || config.parameters;
  }
  return snapshot;
}
export function queryWorkspace(snapshot: WorkspaceSnapshot, path: string): any {
  const url = new URL(path, 'https://offline.invalid'), q = url.searchParams, r = snapshot.responses, pathname = url.pathname.replace(/\/dosing-pumps(?=\/|$)/g, '/fertilizers');
  if (pathname === '/notifications') {
    const water = (r['/aquariums'] || []).flatMap((aq: any) => (r[`/aquariums/${aq.id}`]?.alerts || []).map((alert: any) => ({ ...alert, aquariumId: aq.id, aquariumName: aq.name })));
    return { social: [], water, unreadSocial: 0, openWater: water.length };
  }
  if (pathname === '/me/test-inventory') return r[pathname + '?suiteId=' + encodeURIComponent(q.get('suiteId') || r['/me'].selectedSuite)];
  const match = pathname.match(/^\/aquariums\/(-?\d+)(?:\/(measurements|logs))?$/);
  if (match?.[2]) {
    const collection = match[2], all = q.get('all') === 'true' || q.get('days') === 'all' || q.get('limit') === 'all' || q.get('limit') === '0';
    let rows = r[`/aquariums/${match[1]}/${collection === 'measurements' ? 'measurements?all=true' : 'logs'}`];
    if (!rows) return undefined;
    const days = q.get('days'), from = q.get('from'), to = q.get('to');
    const since = from ? Date.parse(from.length === 10 ? from + 'T00:00:00Z' : from) : all ? -Infinity : Date.now() - Number(days || (collection === 'logs' ? 365 : 90)) * 86400000;
    const until = to ? Date.parse(to.length === 10 ? to + 'T23:59:59.999Z' : to) : Infinity;
    rows = rows.filter((row: any) => { const time = Date.parse(row.measured_at || row.timestamp);return time >= since && time <= until && (!q.get('kind') || q.get('kind') === 'all' || row.kind === q.get('kind') || row.type === q.get('kind')); });
    if (collection === 'logs') { const offset = Number(q.get('offset') || 0);rows = rows.slice(offset, all ? undefined : offset + Number(q.get('limit') || 25)); }
    return rows;
  }
  if (pathname.startsWith('/aquariums/') && !Object.hasOwn(r, pathname)) throw new AppError('Aquarium oder Eintrag ist nicht offline verfügbar.', 404);
  return r[pathname];
}

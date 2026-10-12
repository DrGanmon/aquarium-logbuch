'use strict';
import { randomUUID } from 'node:crypto';
import suiteService = require('./suite-service');
import mail_serviceModule = require('./mail-service');
const { mailService } = mail_serviceModule;
import logger = require('../utils/logger');

function inventoryOf(user?: any) {
  return JSON.parse(user?.test_inventory || '{}');
}
function normalizeInventory(raw?: any) {
  let source;
  try { source = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch { return '{}'; }
  const result: Record<string, any> = {};
  if (!source || typeof source !== 'object' || Array.isArray(source)) return '{}';
  for (const suite of suiteService.getSuites()) {
    if (!suite) continue;
    const saved = source[suite.id];
    if (!saved || typeof saved !== 'object') continue;
    for (const test of suite.tests.filter((item: any) => item.consumable)) {
      const entry = saved[test.key];
      if (!entry || typeof entry !== 'object') continue;
      const clean = entryFor(test);
      if (Number.isSafeInteger(entry.used) && entry.used >= 0) clean.used = entry.used;
      if (entry.capacity === null || (Number.isSafeInteger(entry.capacity) && entry.capacity > 0)) clean.capacity = entry.capacity;
      if (test.consumable.variants.some((variant: any) => variant.id === entry.variant)) clean.variant = entry.variant;
      if (typeof entry.reminderEnabled === 'boolean') clean.reminderEnabled = entry.reminderEnabled;
      if (entry.reminderSentAt && Number.isFinite(Date.parse(entry.reminderSentAt))) clean.reminderSentAt = entry.reminderSentAt;
      if (typeof entry.reminderToken === 'string') clean.reminderToken = entry.reminderToken;
      (result[suite.id] ||= {})[test.key] = clean;
    }
  }
  return JSON.stringify(result);
}
function entryFor(test?: any, saved: any = {}) {
  const variants = test.consumable.variants || [];
  const variant = variants.find((item: any) => item.id === saved.variant) || variants[0];
  return {
    used: 0,
    capacity: variant ? variant.capacity : test.consumable.capacity,
    variant: variant?.id || null,
    reminderEnabled: true,
    reminderSentAt: null,
    ...saved,
  };
}
function inventoryItems(user?: any, suiteId?: any, lang: any = 'de') {
  const suite = suiteService.getSuite(suiteId, lang);
  if (!suite) return null;
  const saved = inventoryOf(user)[suiteId] || {};
  return suite.tests.filter((test: any) => test.consumable).map((test: any) => {
    const entry = entryFor(test, saved[test.key]);
    const variant = test.consumable.variants.find((item: any) => item.id === entry.variant);
    const tracksUsage = variant?.trackUsage !== false;
    const percentage = entry.capacity > 0 ? Math.round(entry.used / entry.capacity * 100) : null;
    return {
      key: test.key, name: test.name, ...entry,
      remaining: entry.capacity > 0 ? Math.max(0, entry.capacity - entry.used) : null,
      percentage,
      needsRefill: tracksUsage && entry.capacity > 0 && entry.used >= Math.ceil(entry.capacity * 0.75),
      tracksUsage,
      consumable: test.consumable,
    };
  });
}
function invalid(message?: any) {
  const error: Error & { status?: number; code?: string; provider?: string; apiError?: unknown } = new Error(message);
  error.status = 400;
  return error;
}
async function updateInventory(db?: any, userId?: any, suiteId?: any, key?: any, body: any = {}) {
  const test = suiteService.getSuite(suiteId)?.tests.find((item: any) => item.key === key && item.consumable);
  if (!test) throw invalid('Unbekannter Verbrauchstest.');
  if (body.used !== undefined && (!Number.isSafeInteger(body.used) || body.used < 0 || body.used > 1000000)) {
    throw invalid('Die Anzahl verwendeter Tests muss eine ganze Zahl zwischen 0 und 1000000 sein.');
  }
  if (body.capacity !== undefined && body.capacity !== null && (!Number.isSafeInteger(body.capacity) || body.capacity < 1 || body.capacity > 1000000)) {
    throw invalid('Die Reichweite muss eine ganze Zahl zwischen 1 und 1000000 sein.');
  }
  if (body.variant !== undefined && !test.consumable.variants.some((item: any) => item.id === body.variant)) {
    throw invalid('Unbekannte Testvariante.');
  }
  for (const field of ['reset', 'reminderEnabled']) {
    if (body[field] !== undefined && typeof body[field] !== 'boolean') throw invalid('Ungültige Einstellung.');
  }
  const updated = await db.users.mutateTestInventory(userId, (inventory: any) => {
    const saved = inventory[suiteId] ||= {};
    const entry = entryFor(test, saved[key]);
    if (body.variant !== undefined && body.variant !== entry.variant) {
      entry.variant = body.variant;
      entry.capacity = test.consumable.variants.find((item: any) => item.id === body.variant).capacity;
    }
    if (body.used !== undefined) entry.used = body.used;
    if (body.capacity !== undefined) entry.capacity = body.capacity;
    if (body.reminderEnabled !== undefined) entry.reminderEnabled = body.reminderEnabled;
    if (body.reset) {
      entry.used = 0;
      entry.reminderSentAt = null;
      delete entry.reminderToken;
    }
    saved[key] = entry;
  });
  if (!updated) throw invalid('Benutzer nicht gefunden.');
  await checkUserReminders(db, userId);
}
function applyUsage(inventory?: any, user?: any, values?: any, suiteId: any = null) {
    const id = suiteId || user.selected_suite || suiteService.getDefaultSuite()?.id || 'jbl-pro';
    const suite = suiteService.getSuite(id);
    if (!suite) return;
    const saved = inventory[id] ||= {};
    for (const test of suite.tests) {
      if (!test.consumable || values[test.key] === '' || values[test.key] == null || !Number.isFinite(Number(values[test.key]))) continue;
      const entry = entryFor(test, saved[test.key]);
      if (test.consumable.variants.find((item: any) => item.id === entry.variant)?.trackUsage === false) continue;
      entry.used += 1;
      saved[test.key] = entry;
    }
}
async function recordUsage(db?: any, userId?: any, values?: any, suiteId: any = null) {
  await db.users.mutateTestInventory(userId, (inventory?: any, user?: any) => applyUsage(inventory, user, values, suiteId));
  // SMTP errors must not turn an already saved measurement into a failed request.
  await checkUserReminders(db, userId);
}
async function checkUserReminders(db?: any, userId?: any) {
  const config = mailService.getConfig();
  if (!config.enabled || !config.host) return 0;
  const claimed = await db.users.mutateTestInventory(userId, (inventory?: any, user?: any) => {
    if (!user.email || !user.email_verified) return [];
    const reminders = [];
    for (const suiteId of Object.keys(inventory)) {
      const suite = suiteService.getSuite(suiteId, user.language || 'de');
      if (!suite) continue;
      for (const test of suite.tests.filter((item: any) => item.consumable)) {
        const entry = inventory[suiteId][test.key];
        if (!entry || !entry.reminderEnabled || entry.reminderSentAt || !(entry.capacity > 0) || entry.used < Math.ceil(entry.capacity * 0.75)) continue;
        const variant = test.consumable.variants.find((item: any) => item.id === entry.variant);
        if (variant?.trackUsage === false) continue;
        entry.reminderSentAt = new Date().toISOString();
        entry.reminderToken = randomUUID();
        reminders.push({ suiteId, key: test.key, name: test.name, variantName: variant?.name || '', ...entry });
      }
    }
    return reminders;
  });
  let sent = 0;
  for (const reminder of claimed?.result || []) {
    try {
      const result = mailService.sendTestRefillReminderEmail({ user: claimed.user, test: reminder });
      if (!result?.ok) throw new Error('Erinnerung konnte nicht eingereiht werden.');
      sent++;
    } catch (error) {
      await db.users.mutateTestInventory(userId, (inventory: any) => {
        const entry = inventory[reminder.suiteId]?.[reminder.key];
        if (entry?.reminderToken === reminder.reminderToken) {
          entry.reminderSentAt = null;
          delete entry.reminderToken;
        }
      });
      logger.error(`Nachkauferinnerung für ${reminder.key}: ${error.message}`, 'test-inventory');
    }
  }
  return sent;
}
async function checkAllReminders(db?: any) {
  const config = mailService.getConfig();
  if (!config.enabled || !config.host) return;
  for (const user of await db.users.listForAdmin()) await checkUserReminders(db, user.id);
}
export = { inventoryItems, updateInventory, applyUsage, recordUsage, checkUserReminders, checkAllReminders, normalizeInventory };

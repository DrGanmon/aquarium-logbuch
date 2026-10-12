import { randomUUID } from 'node:crypto';
import catalog = require('./suite-service');
import mail = require('./mail-service');
import logger = require('../utils/logger');
import { AppError, asError } from '../utils/app-error';
import { asRecord, isRecord } from '../utils/validation';
import type { Consumable, WaterTest, InventoryEntry, TestInventory } from '../types/catalog';
import type { InventoryDatabase, InventoryUser } from '../types/inventory';
type ConsumableTest = WaterTest & { consumable: Consumable };
const isConsumable = (test: WaterTest): test is ConsumableTest => test.consumable !== null;
function entryFor(test: ConsumableTest, saved: Partial<InventoryEntry> = {}): InventoryEntry {
  const variant = test.consumable.variants.find(item => item.id === saved.variant) || test.consumable.variants[0];
  return { used: 0, capacity: variant ? variant.capacity : test.consumable.capacity, variant: variant?.id || null,
    reminderEnabled: true, reminderSentAt: null, ...saved };
}
interface RefillReminder extends InventoryEntry { suiteId: string; key: string; name: string; variantName: string }
interface RefillMailer {
  getConfig(): { enabled: boolean; host: string };
  sendTestRefillReminderEmail(input: { user: InventoryUser; test: RefillReminder }): { ok: boolean };
}
/** Coordinates atomic inventory changes and reminder claims, with injected dependencies. */
class TestInventoryService {
  constructor(private readonly suites = catalog.suiteService, private readonly mailer: RefillMailer = mail.mailService) {}
  normalizeInventory(raw: unknown): string {
    let parsed: unknown;
    try { parsed = typeof raw === 'string' ? JSON.parse(raw) as unknown : raw; } catch { return '{}'; }
    const source = asRecord(parsed);
    const result: TestInventory = Object.create(null);
    for (const suite of this.suites.getSuites()) {
      const saved = asRecord(Object.hasOwn(source, suite.id) ? source[suite.id] : undefined);
      for (const test of suite.tests.filter(isConsumable)) {
        if (!Object.hasOwn(saved, test.key) || !isRecord(saved[test.key])) continue;
        const entry = asRecord(saved[test.key]);
        const clean = entryFor(test);
        if (typeof entry.used === 'number' && Number.isSafeInteger(entry.used) && entry.used >= 0) clean.used = entry.used;
        if (entry.capacity === null || typeof entry.capacity === 'number' && Number.isSafeInteger(entry.capacity) && entry.capacity > 0) clean.capacity = entry.capacity;
        if (typeof entry.variant === 'string' && test.consumable.variants.some(variant => variant.id === entry.variant)) clean.variant = entry.variant;
        if (typeof entry.reminderEnabled === 'boolean') clean.reminderEnabled = entry.reminderEnabled;
        if (typeof entry.reminderSentAt === 'string' && Number.isFinite(Date.parse(entry.reminderSentAt))) clean.reminderSentAt = entry.reminderSentAt;
        if (typeof entry.reminderToken === 'string') clean.reminderToken = entry.reminderToken;
        (result[suite.id] ||= {})[test.key] = clean;
      }
    }
    return JSON.stringify(result);
  }
  inventoryItems(user: Pick<InventoryUser, 'test_inventory'>, suiteId: string, lang = 'de') {
    const suite = this.suites.getSuite(suiteId, lang);
    if (!suite) return null;
    const inventory = JSON.parse(this.normalizeInventory(user.test_inventory)) as TestInventory;
    const saved = inventory[suiteId] || {};
    return suite.tests.filter(isConsumable).map(test => {
      const entry = entryFor(test, saved[test.key]);
      const variant = test.consumable.variants.find(item => item.id === entry.variant);
      const tracksUsage = variant?.trackUsage !== false;
      return { key: test.key, name: test.name, ...entry,
        remaining: entry.capacity !== null && entry.capacity > 0 ? Math.max(0, entry.capacity - entry.used) : null,
        percentage: entry.capacity !== null && entry.capacity > 0 ? Math.round(entry.used / entry.capacity * 100) : null,
        needsRefill: tracksUsage && entry.capacity !== null && entry.capacity > 0 && entry.used >= Math.ceil(entry.capacity * 0.75),
        tracksUsage, consumable: test.consumable };
    });
  }
  async updateInventory(db: InventoryDatabase, userId: number, suiteId: string, key: string, input: unknown = {}): Promise<void> {
    const body = asRecord(input);
    const test = this.suites.getSuite(suiteId)?.tests.filter(isConsumable).find(item => item.key === key);
    if (!test) throw new AppError('Unbekannter Verbrauchstest.', 400);
    const validCount = (value: unknown, minimum: number): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= minimum && value <= 1000000;
    if (body.used !== undefined && !validCount(body.used, 0)) throw new AppError('Die Anzahl verwendeter Tests muss eine ganze Zahl zwischen 0 und 1000000 sein.', 400);
    if (body.capacity !== undefined && body.capacity !== null && !validCount(body.capacity, 1)) throw new AppError('Die Reichweite muss eine ganze Zahl zwischen 1 und 1000000 sein.', 400);
    const variant = body.variant !== undefined ? test.consumable.variants.find(item => item.id === body.variant) : undefined;
    if (body.variant !== undefined && !variant) throw new AppError('Unbekannte Testvariante.', 400);
    for (const field of ['reset', 'reminderEnabled']) if (body[field] !== undefined && typeof body[field] !== 'boolean') throw new AppError('Ungültige Einstellung.', 400);
    const updated = await db.users.mutateTestInventory(userId, inventory => {
      const saved = inventory[suiteId] ||= {};
      const entry = entryFor(test, saved[key]);
      if (variant && variant.id !== entry.variant) { entry.variant = variant.id; entry.capacity = variant.capacity; }
      if (validCount(body.used, 0)) entry.used = body.used;
      if (body.capacity === null || validCount(body.capacity, 1)) entry.capacity = body.capacity;
      if (typeof body.reminderEnabled === 'boolean') entry.reminderEnabled = body.reminderEnabled;
      if (body.reset) { entry.used = 0; entry.reminderSentAt = null; delete entry.reminderToken; }
      saved[key] = entry;
    });
    if (!updated) throw new AppError('Benutzer nicht gefunden.', 400);
    await this.checkUserReminders(db, userId);
  }
  applyUsage(inventory: TestInventory, user: InventoryUser, values: Record<string, unknown>, suiteId: string | null = null): void {
    const id = suiteId || user.selected_suite || this.suites.getDefaultSuite()?.id || 'jbl-pro';
    const suite = this.suites.getSuite(id);
    if (!suite) return;
    const saved = inventory[id] ||= {};
    for (const test of suite.tests.filter(isConsumable)) {
      if (values[test.key] === '' || values[test.key] == null || !Number.isFinite(Number(values[test.key]))) continue;
      const entry = entryFor(test, saved[test.key]);
      if (test.consumable.variants.find(item => item.id === entry.variant)?.trackUsage === false) continue;
      entry.used += 1;
      saved[test.key] = entry;
    }
  }
  async recordUsage(db: InventoryDatabase, userId: number, values: Record<string, unknown>, suiteId: string | null = null): Promise<void> {
    await db.users.mutateTestInventory(userId, (inventory, user) => this.applyUsage(inventory, user, values, suiteId));
    await this.checkUserReminders(db, userId);
  }
  async checkUserReminders(db: InventoryDatabase, userId: number): Promise<number> {
    const config = this.mailer.getConfig();
    if (!config.enabled || !config.host) return 0;
    const claimed = await db.users.mutateTestInventory(userId, (inventory, user) => {
      const reminders: RefillReminder[] = [];
      if (!user.email || !user.email_verified) return reminders;
      for (const suiteId of Object.keys(inventory)) {
        const suite = this.suites.getSuite(suiteId, user.language || 'de');
        if (!suite) continue;
        for (const test of suite.tests.filter(isConsumable)) {
          const entry = inventory[suiteId][test.key];
          if (!entry || !entry.reminderEnabled || entry.reminderSentAt || entry.capacity === null || entry.capacity <= 0 || entry.used < Math.ceil(entry.capacity * 0.75)) continue;
          const variant = test.consumable.variants.find(item => item.id === entry.variant);
          if (variant?.trackUsage === false) continue;
          entry.reminderSentAt = new Date().toISOString();
          entry.reminderToken = randomUUID();
          reminders.push({ suiteId, key: test.key, name: test.name, variantName: variant?.name || '', ...entry });
        }
      }
      return reminders;
    });
    if (!claimed) return 0;
    let sent = 0;
    for (const reminder of claimed.result) {
      try {
        if (!this.mailer.sendTestRefillReminderEmail({ user: claimed.user, test: reminder }).ok) throw new Error('Erinnerung konnte nicht eingereiht werden.');
        sent++;
      } catch (error) {
        await db.users.mutateTestInventory(userId, inventory => {
          const entry = inventory[reminder.suiteId]?.[reminder.key];
          if (entry?.reminderToken === reminder.reminderToken) { entry.reminderSentAt = null; delete entry.reminderToken; }
        });
        logger.error(`Nachkauferinnerung für ${reminder.key}: ${asError(error).message}`, 'test-inventory');
      }
    }
    return sent;
  }
  async checkAllReminders(db: InventoryDatabase): Promise<void> {
    const config = this.mailer.getConfig();
    if (!config.enabled || !config.host) return;
    for (const user of await db.users.listForAdmin()) await this.checkUserReminders(db, user.id);
  }
}
const testInventoryService = new TestInventoryService();
export = { TestInventoryService, testInventoryService,
  inventoryItems: testInventoryService.inventoryItems.bind(testInventoryService), updateInventory: testInventoryService.updateInventory.bind(testInventoryService),
  applyUsage: testInventoryService.applyUsage.bind(testInventoryService), recordUsage: testInventoryService.recordUsage.bind(testInventoryService),
  checkUserReminders: testInventoryService.checkUserReminders.bind(testInventoryService), checkAllReminders: testInventoryService.checkAllReminders.bind(testInventoryService),
  normalizeInventory: testInventoryService.normalizeInventory.bind(testInventoryService) };

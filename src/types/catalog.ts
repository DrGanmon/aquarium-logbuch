export interface Thresholds { okMin: number | null; okMax: number | null; critMin: number | null; critMax: number | null }
export interface ConsumableVariant { id: string; name: string; name_en?: string; capacity: number | null; trackUsage?: boolean }
export interface Consumable {
  capacity: number | null;
  note: string;
  variants: ConsumableVariant[];
  [metadata: string]: unknown;
}
export interface WaterTest {
  key: string; name: string; name_de: string; name_en: string; unit: string;
  decimals: number; step: number; min: number; max: number; wait: number; verified: boolean;
  hint: string; hint_de: string; hint_en: string;
  fresh: Thresholds; salt: Thresholds; consumable: Consumable | null;
}
export interface TestSuite {
  id: string; name: string; name_de: string; name_en: string;
  description: string; description_de: string; description_en: string;
  isDefault: boolean; testCount: number; tests: WaterTest[];
}
export interface StoredTestSuite extends TestSuite { rawTests: Record<string, unknown>[]; file: string }
export interface InventoryEntry {
  used: number; capacity: number | null; variant: string | null; reminderEnabled: boolean;
  reminderSentAt: string | null; reminderToken?: string;
}
export type TestInventory = Record<string, Record<string, InventoryEntry>>;

export interface SpeciesCatalogDescriptor { id: string; name: string; description: string; count: number; file: string }

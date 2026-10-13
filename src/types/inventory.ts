import type { TestInventory } from './catalog';
export interface InventoryUser {
  id: number; email: string | null; email_verified: number | boolean; language: string;
  selected_suite: string | null; selected_tests?: string | null; test_inventory: string | null;
}
export interface InventoryRepository {
  mutateTestInventory<T>(id: number, mutate: (inventory: TestInventory, user: InventoryUser) => T): Promise<{ user: InventoryUser; result: T } | null>;
  listForAdmin(): Promise<Pick<InventoryUser, 'id'>[]>;
}
export interface InventoryDatabase { users: InventoryRepository }

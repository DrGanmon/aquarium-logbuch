import type { Aquarium, AccessRole, SessionUser, UserRecord, StockRecord, DosingPump, DosingPumpInput, Measurement, AquariumInput } from './domain';
import type { InventoryRepository } from './inventory';
export type RepositoryContract<Base, Contract> = Omit<Base, keyof Contract> & Contract;
export interface UserQueries extends InventoryRepository {
  create(input: Pick<UserRecord, 'username'> & Partial<Omit<UserRecord, 'id' | 'created_at'>>): Promise<Pick<UserRecord, 'id' | 'username' | 'email' | 'oidc_sub' | 'email_verified' | 'language'>>;
  update(id: number, fields: Partial<Omit<UserRecord, 'id' | 'created_at'>>): Promise<boolean>;
  listForAdmin(): Promise<Pick<UserRecord, 'id' | 'username' | 'email' | 'oidc_sub' | 'password_hash' | 'created_at' | 'email_verified'>[]>;
  findById(id: number): Promise<UserRecord | null>;
  findByUsername(username: string, excludeId?: number | null): Promise<UserRecord | null>;
  findByEmail(email: string, excludeId?: number | null): Promise<UserRecord | null>;
  findByOidcSub(subject: string, excludeId?: number | null): Promise<UserRecord | null>;
  findByEmailVerifyToken(token: string): Promise<UserRecord | null>;
  findByPasswordResetToken(token: string): Promise<UserRecord | null>;
  findByDeleteToken(token: string): Promise<UserRecord | null>;
}
export interface AquariumQueries {
  create(input: AquariumInput & { user_id: number }): Promise<{ id: number }>;
  update(id: number, fields: Partial<Omit<Aquarium, 'id' | 'user_id' | 'created_at'>>): Promise<boolean>;
  findById(id: number): Promise<Aquarium | null>;
  getAccess(id: number | string, user: Pick<SessionUser, 'id' | 'isAdmin'>): Promise<{ aq: Aquarium; role: AccessRole } | null>;
  listAllRaw(): Promise<Aquarium[]>;
}
export interface StockRepository {
  findById(id: number): Promise<StockRecord | null>;
  listForAquarium(id: number): Promise<StockRecord[]>;
  create(input: Pick<StockRecord, 'aquarium_id' | 'species'> & Partial<Omit<StockRecord, 'id' | 'aquarium_id' | 'species'>>): Promise<{ id: number }>;
  createMany(rows: (Omit<StockRecord, 'id' | 'image_file'> & { image_file?: string | null })[]): Promise<{ id: number }[]>;
}
export interface PumpRepository {
  findById(id: number): Promise<DosingPump | null>;
  listForAquarium(id: number): Promise<DosingPump[]>;
  create(input: DosingPumpInput & { aquarium_id: number }): Promise<DosingPump | null>;
  update(id: number, aquariumId: number | null, fields: Partial<DosingPumpInput> & { last_dosed_at?: string | null }): Promise<DosingPump | null>;
}
export interface MeasurementQueries {
  listForAquarium(id: number, options?: { all?: boolean; limit?: number | null; offset?: number; from?: string | null; to?: string | null; days?: number | null }): Promise<Measurement[]>;
  findById(id: number): Promise<Measurement | null>;
  findLastForAquarium(id: number): Promise<Measurement | null>;
}

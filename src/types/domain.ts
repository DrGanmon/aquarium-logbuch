/** Shared backend contracts. Adapter-specific extra columns remain extensible. */
export type WaterType = 'fresh' | 'salt';
export type AccessRole = 'view' | 'write' | 'owner';
export interface SessionUser {
  id: number;
  username: string;
  email: string | null;
  language: string;
  isAdmin: boolean;
  first_name?: string;
  last_name?: string;
}
export interface Aquarium {
  id: number;
  user_id: number;
  name: string;
  water_type: WaterType;
  volume_l: number | null;
  [column: string]: any;
}
export interface DosingPumpInput {
  name: string;
  fertilizer_name: string;
  amount_ml: number;
  interval_days: number;
  time_of_day: string | null;
  is_active: 0 | 1;
  note: string | null;
}
export type ValidationResult<T> = { value: T; error?: never } | { error: string; value?: never };
export interface DatabaseOptions {
  type?: 'sqlite' | 'mongodb' | 'mongo';
  uri?: string;
  dbName?: string;
  dataDir?: string;
  dbPath?: string;
  migrationsDir?: string;
}

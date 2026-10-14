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
export type CycleUnit = 'days' | 'weeks';
export interface AquariumInput {
  name: string; water_type: WaterType; volume_l: number | null; reminder_days: number;
  notes: string | null; motto: string | null; description: string | null;
  measure_cycle_interval: number | null; measure_cycle_unit: CycleUnit; measure_cycle_day_of_week: number | null; measure_reminder_mail: 0 | 1;
  fertilize_cycle_interval: number | null; fertilize_cycle_unit: CycleUnit; fertilize_cycle_day_of_week: number | null; fertilize_reminder_mail: 0 | 1;
}
export interface Aquarium extends AquariumInput {
  id: number; user_id: number; image_file: string | null; created_at: string;
  role?: AccessRole; owner_username?: string | null;
  last_measure_reminder_sent_at?: string | null; last_fertilize_reminder_sent_at?: string | null;
}
export interface StockRecord {
  id: number; aquarium_id: number; species: string; count: number; profile: string; name: string | null; image_file: string | null;
}
export interface Measurement {
  id: number; aquarium_id?: number; measured_at: string; note: string | null; created_by: number | null;
  values: Record<string, number>; suite_id?: string | null; test_selection?: string[];
  alerts?: { param: string; level: 'crit' | 'warn'; value: number; message: string }[]; created_by_username?: string | null;
}
export interface UserRecord {
  terms_version: string | null; terms_accepted_at: string | null;
  id: number; username: string; email: string | null; password_hash: string | null; created_at: string;
  oidc_sub: string | null; language: string; first_name: string | null; last_name: string | null; bio: string | null; avatar_file: string | null;
  selected_suite: string | null; selected_tests: string | null; default_graph_range: string | null; test_inventory: string | null;
  email_verified: number | boolean; email_verify_token: string | null; email_verify_expires: number | null;
  password_reset_token: string | null; password_reset_expires: number | null; account_delete_token: string | null; account_delete_expires: number | null;
  openai_api_key_prefix?: string | null; openai_api_key_suffix?: string | null;
  gemini_api_key_prefix?: string | null; gemini_api_key_suffix?: string | null;
  claude_api_key_prefix?: string | null; claude_api_key_suffix?: string | null;
  openai_api_key: string | null; openai_model: string | null; gemini_api_key: string | null; gemini_model: string | null;
  claude_api_key: string | null; claude_model: string | null; ai_provider: string | null;
}
export interface DosingPumpInput {
  mode?: 'manual' | 'automatic';
  reminder_mail?: 0 | 1;
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

export interface DosingPump extends DosingPumpInput { id: number; aquarium_id: number; last_dosed_at: string | null; last_reminder_sent_at: string | null; schedule_started_at: string; created_at: string }
export interface AquariumImage { id: number; aquarium_id: number; filename: string; caption: string | null; is_primary: number | boolean; created_at: string }
export interface AquariumShare {
  aquarium_id: number; user_id: number; role: 'view' | 'write'; status: 'pending' | 'accepted';
  token: string | null; token_expires: number | null; created_at: string; accepted_at: string | null;
  aquarium_name?: string; water_type?: WaterType; volume_l?: number | null;
  owner_username?: string | null; target_username?: string | null; target_email?: string | null;
}
export interface Invitation {
  id: number; code: string; type: 'code' | 'mail'; email: string | null; created_by: number | null;
  max_uses: number; used_count: number; expires_at: number; note: string | null; created_at: string; created_by_username?: string | null;
}

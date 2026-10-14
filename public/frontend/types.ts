export type Id = string | number;
export type Language = "de" | "en";
export type Theme = "system" | "light" | "dark";
export interface User {
  id: Id;
  username: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  bio?: string;
  isAdmin?: boolean;
  hasAvatar?: boolean;
  language?: Language;
  theme?: Theme;
  defaultGraphRange?: string;
  hasPassword?: boolean;
  oidcLinked?: boolean;
  hasOpenaiKey?: boolean;
  hasGeminiKey?: boolean;
  hasClaudeKey?: boolean;
  aiProvider?: string;
  openaiModel?: string;
  geminiModel?: string;
  claudeModel?: string;
  canInvite?: boolean;
  registrationMode?: "open" | "invite_admin" | "invite_open" | "closed";
  hasOidc?: boolean;
  oidcEnabled?: boolean;
  oidcProviderName?: string;
  openaiKeyMasked?: string | null;
  geminiKeyMasked?: string | null;
  claudeKeyMasked?: string | null;
  openaiKeySet?: boolean;
  geminiKeySet?: boolean;
  claudeKeySet?: boolean;
}
export interface Range {
  okMin?: number | null;
  okMax?: number | null;
  critMin?: number | null;
  critMax?: number | null;
}
export interface Parameter {
  key: string;
  name: string;
  unit: string;
  decimals: number;
  step: number;
  min: number;
  max: number;
  wait: number;
  hint?: string;
}
export interface TestInventoryItem {
  key: string;
  name: string;
  used: number | string;
  capacity: number | string | null;
  variant: string | null;
  reminderEnabled: boolean;
  reminderSentAt: string | null;
  tracksUsage: boolean;
  consumable: {
    capacity: number | null;
    note: string;
    source: string;
    variants: { id: string; name: string; capacity: number | null; trackUsage?: boolean }[];
  };
}
export interface SpeciesRange {
  min?: number;
  max?: number;
  idealMin?: number;
  idealMax?: number;
}
export interface SpeciesImage {
  url: string;
  width: number;
  height: number;
  title: string;
  author: string;
  authorUrl: string;
  requiredAttribution: string;
  source: string;
  sourceUrl: string;
  originalSource: string;
  originalSourceUrl: string;
  license: string;
  licenseUrl: string;
  publicDomainBasis: string;
  shareAlike: boolean;
  attribution: string;
  modifications: string;
}
export interface Species {
  image?: SpeciesImage | null;
  id: string;
  name: string;
  scientificName?: string;
  category?: string;
  profile: string;
  waterType: string;
  minVolumeL?: number;
  socialType?: string;
  minGroupCount?: number;
  territorial?: string;
  decorHints?: string;
  behaviorNotes?: string;
  description?: string;
  parameters?: Record<string, Range>;
  temp?: SpeciesRange;
  ph?: SpeciesRange;
  gh?: SpeciesRange;
  kh?: SpeciesRange;
  salinity?: SpeciesRange | null;
  tankRegion?: string;
  minTankLengthCm?: number;
  diet?: string;
}
export interface Suite {
  id: string;
  name: string;
  tests?: Parameter[];
}
export interface MaintenanceType {
  key: string;
  label: string;
  icon: string;
  hasPercentage: boolean;
}
export interface AppConfig {
  parameters: Parameter[];
  allParameters: Parameter[];
  profiles: Record<string, string>;
  species: Species[];
  waterTypes: Record<string, string>;
  maintenanceTypes: Record<string, MaintenanceType>;
  suites: Suite[];
  currentSuite: Suite;
  userPreferences: { selectedSuite: string; selectedTests: string[] | null };
}
export interface CycleStatus {
  status_label?: string;
  cycle_label?: string;
  next_due_at?: string;
  configured?: boolean;
  is_overdue?: boolean;
  reminder_mail?: boolean;
  last_action_at?: string;
  is_due?: boolean;
  label?: string;
  next_due?: string;
  days_overdue?: number;
}
export interface Aquarium {
  id: Id;
  name: string;
  motto?: string | null;
  description?: string | null;
  notes?: string | null;
  water_type: string;
  volume_l?: number | null;
  role?: "owner" | "write" | "view";
  has_image?: boolean;
  owner_username?: string;
  shares_count?: number;
  open_crit?: number;
  open_warn?: number;
  overdue?: boolean;
  fertilize_overdue?: boolean;
  last_measured_at?: string;
  last_fertilized_at?: string;
  last_water_change_at?: string;
  last_water_change_percent?: number;
  measure_cycle_status?: CycleStatus;
  fertilize_cycle_status?: CycleStatus;
  measure_cycle_interval?: number;
  measure_cycle_unit?: string;
  measure_cycle_day_of_week?: number | null;
  measure_reminder_mail?: number | boolean;
  fertilize_cycle_interval?: number;
  fertilize_cycle_unit?: string;
  fertilize_cycle_day_of_week?: number | null;
  fertilize_reminder_mail?: number | boolean;
}
export interface Stock {
  speciesId?: string | null;
  id: Id;
  species: string;
  name?: string;
  count: number;
  profile: string;
  has_image?: boolean;
  image_file?: string;
}
export interface Measurement {
  id: Id;
  measured_at: string;
  note?: string;
  values: Record<string, number>;
}
export interface Alert {
  id: Id;
  message: string;
  level?: string;
  severity?: string;
  created_at?: string;
}
export interface LatestValue {
  value: number;
  measured_at: string;
  status?: string;
}
export interface CompatibilityIssue {
  message: string;
  severity?: string;
  level?: string;
}
export interface AquariumDetail {
  aquarium: Aquarium;
  stock: Stock[];
  thresholds: Record<string, Range>;
  conflicts: string[];
  alerts: Alert[];
  latest: Record<string, LatestValue>;
  role: "owner" | "write" | "view";
  stockCompatibility?: {
    issues?: CompatibilityIssue[];
    warnings?: CompatibilityIssue[];
    conflicts?: CompatibilityIssue[];
  };
  dosing_pumps: Pump[];
}
export interface Photo {
  id: Id;
  caption?: string;
  is_primary?: number | boolean;
  image_url?: string;
}
export interface Pump {
  id: Id;
  name: string;
  fertilizer_name: string;
  amount_ml: number;
  interval_days: number;
  time_of_day?: string | null;
  is_active: number | boolean;
  note?: string | null;
  last_dosed_at?: string;
  next_due_at?: string;
}
export interface LogEntry {
  typeName?: string;
  id: Id;
  kind: string;
  type?: string;
  label?: string;
  icon?: string;
  logged_at?: string;
  measured_at?: string;
  timestamp?: string;
  percentage?: number | null;
  details?: string | null;
  note?: string | null;
  values?: Record<string, number>;
}
export interface Share {
  user_id?: Id;
  aquarium_id: Id;
  aquarium_name?: string;
  owner_username?: string;
  username?: string;
  email?: string;
  role: string;
  status?: string;
  token?: string;
  created_at?: string;
}
export interface ChatMessage {
  role: string;
  content: string;
  id?: Id;
}
export interface Registration {
  termsVersion: string;
  registration: boolean;
  localLogin: boolean;
  oidc: boolean;
  oidcName: string;
  isClosed: boolean;
  isInviteOnly: boolean;
}
export type Translate = (
  key: string,
  params?: Record<string, unknown>,
) => string;
export type FormValue = string | number | boolean | null;
export type FormData = Record<string, FormValue>;
export interface Field {
  key: string;
  label: string;
  type?: string;
  required?: boolean;
  min?: number;
  max?: number;
  options?: Record<string, string>;
}

export interface AquariumPlant { aquarium_id: number; plant_id: string; count: number; name: string; scientificName: string; category: string }

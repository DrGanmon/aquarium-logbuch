import type { DiseaseSpecies, DiagnosisDocument } from '../types/health';
import type { HealthCatalog, DiseaseDetail, MedicationCatalog, MedicationDetail } from './health-catalog';
import type { PlantCatalog } from './plants';
import type { SearchableSpecies } from './species-search';

export const CATALOG_SCHEMA = 1;
export const CATALOG_NAMES = ['species', 'plants', 'health'] as const;
export type CatalogName = typeof CATALOG_NAMES[number];
export interface OfflineSpecies extends SearchableSpecies { id: string; profile?: string; minVolumeL?: number; minGroupCount?: number; [key: string]: unknown }
export type CatalogData = {
  species: { species: OfflineSpecies[]; categories: string[] };
  plants: PlantCatalog & { searchText: Record<string, string> };
  health: { diagnosis: Record<'fresh' | 'salt', DiagnosisDocument>; catalog: HealthCatalog; diseases: DiseaseDetail[]; associations: Record<'fresh' | 'salt', Record<string, DiseaseSpecies>>; medications: MedicationCatalog; medicationDetails: MedicationDetail[] };
};
export type CatalogSnapshot<K extends CatalogName = CatalogName> = K extends CatalogName ? {
  schema: number; kind: K; language: 'de' | 'en'; version: string; data: CatalogData[K];
} : never;

import type { VariantEntry } from './catalog-variants';
import type { CatalogImage } from "./catalog-image";
export interface PlantRange { min: number; max: number; idealMin?: number; idealMax?: number; unit?: string }
export interface Plant extends VariantEntry {
  image?: CatalogImage | null;
  id: string; name: string; scientificName: string; synonyms: string[]; category: string;
  waterType: 'fresh' | 'salt'; origin: string; placement: string[]; growthRate: string;
  heightCm: PlantRange | null; difficulty: string; light: string; co2Demand: string | null; co2: string;
  temp: PlantRange; ph: PlantRange; gh?: PlantRange; kh?: PlantRange; salinity?: PlantRange;
  propagation?: string; substrate?: string; herbivoreResistant?: boolean; edibleForHerbivores?: boolean;
  nutrientExport?: string; risks?: string[]; tags: string[]; description: string; careNotes: string;
  sources: string[]; verifiedFields: string[]; legal: { euInvasiveList: boolean };
}
export interface PlantCatalog {
  id: string; name: string; version: string; description: string; plants: Plant[];
  fieldDefinitions: Record<string, string | Record<string, string>>; notes: string[];
  sources: Record<string, { title: string; publisher: string; url: string; type: string }>;
}
export type PlantSummary = Pick<Plant, 'id' | 'name' | 'scientificName' | 'category' | 'waterType' | 'description' | 'difficulty' | 'light' | 'growthRate' | 'variants' | 'variantOf' | 'variantKind'>;

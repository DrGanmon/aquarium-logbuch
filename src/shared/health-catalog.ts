import type { Disease, HealthSource, Medication, MedicationRole } from '../types/health';
export interface HealthSpecies { id: string; name: string; scientificName: string; waterType: 'fresh' | 'salt' }
export interface DiseaseSummary {
  id: string; name: string; waterType: 'fresh' | 'salt'; category: string; keySigns: string[]; synonyms: string[];
  contagious: Disease['contagious']; affectedSpeciesCount: number; speciesSigns: string[]; susceptibility: string | null;
}
export interface HealthCatalog { diseases: DiseaseSummary[]; species: HealthSpecies[]; total: number }
export interface DiseaseDetail extends Disease {
  waterType: 'fresh' | 'salt'; sourceDetails: (HealthSource & { id: string })[];
  speciesSigns: string[]; treatmentCautions: string[]; disclaimer: string; legalNotes: string[]; affectedSpeciesNames: HealthSpecies[];
  medications: (MedicationDetail & { role: MedicationRole; roleLabel: string })[];
}
export interface MedicationItem extends Medication { kind: 'medication' | 'supply' }
export interface MedicationDetail extends MedicationItem {
  disclaimer: string; legalNotes: string[]; legalStatusVerifiedNote: string;
  sourceDetails: (HealthSource & { id: string })[];
}
export interface MedicationCatalog {
  items: MedicationItem[]; total: number; version: string; description: string; disclaimer: string;
  homePharmacyScale: string; homePharmacyCriteria: string[]; legalNotes: string[]; legalStatusVerifiedNote: string;
}

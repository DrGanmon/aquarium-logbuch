import type { Disease, DiagnosisOutcome, AnswerInput, HealthSource } from '../../src/types/health';
export type { AnswerInput };
export interface HealthSpecies { id: string; name: string; scientificName: string; waterType: 'fresh' | 'salt' }
export interface DiseaseSummary {
  id: string; name: string; waterType: 'fresh' | 'salt'; category: string; keySigns: string[]; synonyms: string[];
  contagious: Disease['contagious']; affectedSpeciesCount: number; speciesSigns: string[]; susceptibility: string | null;
}
export interface HealthCatalog { diseases: DiseaseSummary[]; species: HealthSpecies[]; total: number }
export interface DiseaseDetail extends Disease {
  waterType: 'fresh' | 'salt'; sourceDetails: (HealthSource & { id: string })[];
  speciesSigns: string[]; treatmentCautions: string[]; disclaimer: string; legalNotes: string[]; affectedSpeciesNames: HealthSpecies[];
}
export interface HealthResident {
  stockId: number; name: string | null; count: number; speciesId: string; speciesName: string;
  scientificName: string | null; supported: boolean;
}
export interface ResidentResponse { aquarium: { id: number; name: string; waterType: string }; residents: HealthResident[] }
export interface DiagnosisResponse extends DiagnosisOutcome {
  aquarium: ResidentResponse['aquarium']; resident: Pick<HealthResident, 'stockId' | 'name' | 'speciesId' | 'speciesName'>;
  measurements: { parameter: string; value: number; measured_at: string }[];
}

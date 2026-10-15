import type { DiagnosisOutcome, AnswerInput } from '../../src/types/health';
export type { AnswerInput };
export type { HealthSpecies, DiseaseSummary, HealthCatalog, DiseaseDetail, MedicationItem, MedicationDetail, MedicationCatalog } from '../../src/shared/health-catalog';
export interface HealthResident {
  stockId: number; name: string | null; count: number; speciesId: string; speciesName: string;
  scientificName: string | null; supported: boolean;
}
export interface ResidentResponse { aquarium: { id: number; name: string; waterType: string }; residents: HealthResident[] }
export interface DiagnosisResponse extends DiagnosisOutcome {
  aiChat: { provider: 'openai' | 'gemini' | 'claude'; model: string } | null;
  aquarium: ResidentResponse['aquarium']; resident: Pick<HealthResident, 'stockId' | 'name' | 'speciesId' | 'speciesName'>;
  measurements: { parameter: string; value: number; measured_at: string }[];
}

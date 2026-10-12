import type { WaterType } from './domain';
export type HealthLanguage = 'de' | 'en';
export type HealthAnswer = 'yes' | 'no' | 'unknown';
export interface AnswerInput { questionId: string; answer: HealthAnswer }
export interface HealthSource { title: string; url?: string; type?: string; publisher?: string; authors?: string; year?: number }
export interface Disease {
  id: string; name: string; synonyms: string[]; category: string; description: string;
  pathogen: { type: string; scientificName: string };
  contagious: { status: string; zoonotic: boolean; transmission: string; notes: string };
  generalSigns: string[]; keySigns: string[]; predisposingFactors: string[]; diagnosis: string;
  treatment: { summary: string; steps: string[]; prognosis: string; activeSubstances: { substance: string; prescriptionRequired: boolean | null; invertebrateSafe: boolean | null; notes: string }[] };
  prevention: string[]; sources: string[]; affectedSpecies: string[]; affectedSpeciesCount: number;
}
export interface DiseaseSpecies {
  name: string; scientificName: string; collections: string[];
  diseases: { diseaseId: string; disease: string; susceptibility: string; signs: string[]; note?: string }[];
  treatmentCautions: string[];
}
export interface DiseaseDocument {
  version: string; disclaimer: string; legalNotes: string[]; diseases: Disease[];
  speciesIndex: Record<string, DiseaseSpecies>; sources: Record<string, HealthSource>;
}
export interface MeasurementCondition {
  param: string; op: '<' | '<=' | '>' | '>=' | '==' | '!='; value?: number | boolean; ref?: string;
}
export interface HealthQuestion {
  text: string; hint?: string; generic?: boolean; scope: string;
  measurable?: { mode: 'auto' | 'partial'; logic: 'any' | 'all'; conditions: MeasurementCondition[]; manualQuestion?: string; note?: string };
}
export interface DiagnosisLeaf {
  result: { diseaseId: string; probability: number }[]; certainty: string; advice: string; rareCombination?: boolean;
}
export type DiagnosisNode = DiagnosisLeaf | { question: string; yes: DiagnosisNode; no: DiagnosisNode };
export interface DiagnosisTree {
  candidates: string[]; maxQuestions: number; matrix: Record<string, Record<string, number>>; root: DiagnosisNode;
}
export interface DiagnosisSpecies {
  name: string; scientificName: string; treeId: string;
  speciesSigns: Record<string, string[]>; questionHints: Record<string, string>;
  candidates: { diseaseId: string; susceptibility: string; priorWeight: number }[];
}
export interface DiagnosisDocument {
  disclaimer: string; diseaseNames: Record<string, string>;
  parameters: Record<string, { label: string; unit: string | null; type: string }>;
  questions: Record<string, HealthQuestion>; species: Record<string, DiagnosisSpecies>; trees: Record<string, DiagnosisTree>;
}
export interface SpeciesRanges {
  id: string; name: string; scientificName?: string; waterType?: WaterType;
  temp?: NumericRange | null; ph?: NumericRange | null; gh?: NumericRange | null; kh?: NumericRange | null;
}
export interface NumericRange { min?: number | null; max?: number | null; idealMin?: number | null; idealMax?: number | null }
export interface HealthMeasurement { value: number | boolean; measured_at: string }
export interface HealthContext {
  waterType: WaterType; speciesId: string; species: SpeciesRanges;
  measurements: Record<string, HealthMeasurement>; now?: number;
}
export interface AutomaticAnswer {
  questionId: string; text: string; answer: 'yes' | 'no';
  evidence: { param: string; label: string; value: number | boolean; unit: string | null; measuredAt: string }[];
}
export interface DiagnosisOutcome {
  complete: boolean; method: 'tree' | 'matrix'; reason: 'question' | 'confidence' | 'limit' | 'no_information';
  question: { id: string; text: string; hint?: string; measurable: boolean; missingParameters: string[] } | null;
  answeredCount: number; maxQuestions: number; automaticAnswers: AutomaticAnswer[];
  answers: AnswerInput[];
  results: { diseaseId: string; name: string; probability: number; signs: string[]; susceptibility: string | null }[];
  caution: string[]; disclaimer: string;
}

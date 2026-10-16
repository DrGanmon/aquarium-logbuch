import { DiagnosisEngine, canonicalHealthSpeciesId, HEALTH_MEASUREMENT_MAX_AGE_MS } from '../shared/diagnosis';
export { canonicalHealthSpeciesId, HEALTH_MEASUREMENT_MAX_AGE_MS };
import fs from 'node:fs';
import path from 'node:path';
import { isRecord } from '../utils/validation';
import speciesModule = require('./species-service');
import type { WaterType } from '../types/domain';
import type {
  AnswerInput, DiagnosisDocument, DiagnosisNode, DiseaseDocument, HealthContext, HealthLanguage, SpeciesRanges, MedicationDocument,
} from '../types/health';

const DATA_DIRECTORY = path.join(__dirname, '../config/health');
const waterFile = (water: WaterType) => water === 'salt' ? 'saltwater' : 'freshwater';
export const healthLanguage = (language: string): HealthLanguage => language.toLowerCase().startsWith('en') ? 'en' : 'de';
const own = <T>(record: Record<string, T>, key: string): T | undefined => Object.hasOwn(record, key) ? record[key] : undefined;

interface HealthBundle { diseases: DiseaseDocument; diagnosis: DiagnosisDocument }

/** Read-only, versioned disease database; no user data is stored in this shared cache. */
export class HealthService {
  private readonly bundles = new Map<string, HealthBundle>();
  private readonly medicationDocuments = new Map<HealthLanguage, MedicationDocument>();
  constructor(private readonly directory = DATA_DIRECTORY, private readonly species = speciesModule.speciesCatalog) {}

  private read(filename: string): Record<string, unknown> {
    const data: unknown = JSON.parse(fs.readFileSync(path.join(this.directory, filename), 'utf8'));
    if (!isRecord(data)) throw new Error(`Ungültige Gesundheitsdaten: ${filename}`);
    return data;
  }

  bundle(waterType: WaterType, language = 'de'): HealthBundle {
    const lang = healthLanguage(language);
    const key = `${waterType}:${lang}`;
    const cached = this.bundles.get(key);
    if (cached) return cached;
    const diseases = this.read(`${lang}/diseases-${waterFile(waterType)}.json`) as unknown as DiseaseDocument;
    const diagnosis = this.read(`${lang}/diagnosis-${waterFile(waterType)}.json`) as unknown as DiagnosisDocument;
    if (!Array.isArray(diseases.diseases) || !isRecord(diseases.speciesIndex) || !isRecord(diseases.sources)
      || !isRecord(diagnosis.species) || !isRecord(diagnosis.questions) || !isRecord(diagnosis.trees)) throw new Error('Unvollständige Gesundheitsdaten.');
    // Forms share the parent's existing source estimates, not newly invented priors.
    const catalog = this.species.getAllSpecies(lang);
    const pending = catalog.filter(item => item.waterType === waterType && item.variantOf && !Object.hasOwn(diagnosis.species, item.id));
    for (let pass = 0; pending.length && pass < catalog.length; pass++) {
      for (let index = pending.length - 1; index >= 0; index--) {
        const item = pending[index]!;
        const parent = own(diagnosis.species, item.variantOf!);
        const association = own(diseases.speciesIndex, item.variantOf!);
        if (!parent || !association) continue;
        diagnosis.species[item.id] = structuredClone(parent);
        diseases.speciesIndex[item.id] = structuredClone(association);
        if (item.variantKind === 'color' || item.variantKind === 'fin_form' || item.variantKind === 'cultivar') {
          const hint = lang === 'en' ? 'Consider normal coloration and fin shape of this form. Assess new changes together with breathing and behavior; inherited probabilities are not validated for this form.' : 'Normale Färbung und Flossenform dieser Zuchtform berücksichtigen. Neue Veränderungen mit Atmung und Verhalten beurteilen; übernommene Wahrscheinlichkeiten sind nicht für diese Form validiert.';
          for (const question of ['white_spots', 'dust', 'cloudy_skin']) diagnosis.species[item.id]!.questionHints[question] = hint;
        }
        for (const disease of diseases.diseases) if (disease.affectedSpecies.includes(item.variantOf!) && !disease.affectedSpecies.includes(item.id)) {
          disease.affectedSpecies.push(item.id);disease.affectedSpeciesCount = disease.affectedSpecies.length;
        }
        pending.splice(index, 1);
      }
    }
    diseases.speciesCount = Object.keys(diseases.speciesIndex).length;
    const diseaseIds = new Set(diseases.diseases.map(disease => disease.id));
    if (diseaseIds.size !== diseases.diseases.length) throw new Error('Doppelte Krankheits-IDs.');
    for (const [id, association] of Object.entries(diseases.speciesIndex)) {
      const species = this.species.getSpeciesById(id, lang);
      if (!species) throw new Error(`Unbekannte Gesundheitsart: ${id}`);
      association.name = species.name; association.scientificName = species.scientificName;
    }
    for (const disease of diseases.diseases) {
      if (!disease.id || !disease.name || !Array.isArray(disease.affectedSpecies) || disease.sources.some(id => !own(diseases.sources, id))) throw new Error(`Ungültige Krankheit: ${disease.id}`);
    }
    for (const [speciesId, species] of Object.entries(diagnosis.species)) {
      const catalogSpecies = this.species.getSpeciesById(speciesId, lang);
      if (!catalogSpecies) throw new Error(`Unbekannte Diagnoseart: ${speciesId}`);
      species.name = catalogSpecies.name; species.scientificName = catalogSpecies.scientificName;
      const tree = own(diagnosis.trees, species.treeId);
      if (!tree || !own(diseases.speciesIndex, speciesId) || species.candidates.some(candidate => !diseaseIds.has(candidate.diseaseId) || candidate.priorWeight <= 0)) throw new Error(`Ungültiger Diagnosebaum: ${speciesId}`);
      const validateNode = (node: DiagnosisNode, depth = 0): void => {
        if (depth > 13) throw new Error('Diagnosebaum ist zu tief.');
        if ('question' in node) {
          if (!own(diagnosis.questions, node.question) || !own(tree.matrix, node.question)) throw new Error('Unbekannte Diagnosefrage.');
          validateNode(node.yes, depth + 1); validateNode(node.no, depth + 1);
        } else if (!Array.isArray(node.result) || node.result.some(result => result.diseaseId !== '_none' && !diseaseIds.has(result.diseaseId))) throw new Error('Ungültiges Diagnoseergebnis.');
      };
      validateNode(tree.root);
      for (const row of Object.values(tree.matrix)) for (const probability of Object.values(row)) {
        if (!Number.isFinite(probability) || probability < 0 || probability > 1) throw new Error('Ungültige Diagnosewahrscheinlichkeit.');
      }
    }
    const bundle = { diseases, diagnosis };
    this.bundles.set(key, bundle);
    return bundle;
  }

  speciesProfile(speciesId: string, waterType: WaterType, language = 'de') {
    return own(this.bundle(waterType, language).diagnosis.species, canonicalHealthSpeciesId(speciesId));
  }

  speciesRanges(speciesId: string): SpeciesRanges | null {
    const species = this.species.getSpeciesById(canonicalHealthSpeciesId(speciesId));
    return species ? { id: species.id, name: species.name, scientificName: species.scientificName,
      waterType: species.waterType === 'salt' ? 'salt' : 'fresh', temp: species.temp, ph: species.ph, gh: species.gh, kh: species.kh } : null;
  }

  private medicationDocument(language = 'de'): MedicationDocument {
    const lang = healthLanguage(language);
    const cached = this.medicationDocuments.get(lang);
    if (cached) return cached;
    const document = this.read(`${lang}/medications.json`) as unknown as MedicationDocument;
    if (!Array.isArray(document.medications) || !Array.isArray(document.supplies) || !isRecord(document.sources)) throw new Error('Unvollständige Medikamentendaten.');
    const ids = new Set<string>();
    const diseaseIds = new Set(['fresh', 'salt'].flatMap(water => this.bundle(water as WaterType, lang).diseases.diseases.map(disease => disease.id)));
    for (const item of [...document.medications, ...document.supplies]) {
      if (!item.id || ids.has(item.id) || !item.name || !Array.isArray(item.indications) || !Array.isArray(item.sources)
        || item.sources.some(id => !own(document.sources, id)) || item.indications.some(indication => !diseaseIds.has(indication.diseaseId))
        || !['otc', 'rx', 'not_a_medicine'].includes(item.legalStatus) || item.waterTypes.some(water => !['fresh', 'salt'].includes(water))) {
        throw new Error(`Ungültiges Medikament: ${item.id}`);
      }
      ids.add(item.id);
    }
    for (const water of ['fresh', 'salt'] as const) for (const disease of this.bundle(water, lang).diseases.diseases) {
      if (disease.recommendedMedications.some(item => !ids.has(item.medicationId))) throw new Error(`Unbekannte Medikamentenzuordnung: ${disease.id}`);
    }
    this.medicationDocuments.set(lang, document);
    return document;
  }

  medications(options: { waterType?: WaterType; diseaseId?: string; query?: string; legalStatus?: string; language?: string } = {}) {
    const document = this.medicationDocument(options.language);
    const query = (options.query || '').trim().toLocaleLowerCase();
    const items = [...document.medications.map(item => ({ ...item, kind: 'medication' as const })),
      ...document.supplies.map(item => ({ ...item, kind: 'supply' as const }))].filter(item =>
      (!options.waterType || item.waterTypes.includes(options.waterType))
      && (!options.diseaseId || item.indications.some(indication => indication.diseaseId === options.diseaseId))
      && (!options.legalStatus || item.legalStatus === options.legalStatus)
      && (!query || [item.name, item.category, ...item.activeSubstances, ...item.productExamples.map(product => product.name)].join(' ').toLocaleLowerCase().includes(query)));
    return { items, total: items.length, version: document.version, description: document.description, disclaimer: document.disclaimer,
      homePharmacyScale: document.homePharmacyScale, homePharmacyCriteria: document.homePharmacyCriteria,
      legalNotes: document.legalNotes, legalStatusVerifiedNote: document.legalStatusVerifiedNote };
  }

  medication(id: string, language = 'de') {
    const document = this.medicationDocument(language);
    const item = this.medications({ language }).items.find(item => item.id === id);
    return item ? { ...item, disclaimer: document.disclaimer, legalNotes: document.legalNotes,
      legalStatusVerifiedNote: document.legalStatusVerifiedNote,
      sourceDetails: item.sources.map(id => ({ id, ...document.sources[id] })) } : null;
  }

  catalog(options: { waterType?: WaterType; speciesId?: string; query?: string; language?: string } = {}) {
    const waters: WaterType[] = options.waterType ? [options.waterType] : ['fresh', 'salt'];
    const speciesId = options.speciesId ? canonicalHealthSpeciesId(options.speciesId) : undefined;
    const query = (options.query || '').trim().toLocaleLowerCase();
    const species = new Map<string, { id: string; name: string; scientificName: string; waterType: WaterType }>();
    const diseases = [];
    for (const waterType of waters) {
      const bundle = this.bundle(waterType, options.language);
      for (const [id, item] of Object.entries(bundle.diseases.speciesIndex)) {
        const canonical = canonicalHealthSpeciesId(id);
        species.set(canonical, { id: canonical, name: item.name, scientificName: item.scientificName, waterType });
      }
      for (const disease of bundle.diseases.diseases) {
        const affectedSpecies = [...new Set(disease.affectedSpecies.map(canonicalHealthSpeciesId))];
        if (speciesId && !affectedSpecies.includes(speciesId)) continue;
        if (query && ![disease.name, disease.description, disease.pathogen.scientificName, ...disease.synonyms, ...disease.keySigns].join(' ').toLocaleLowerCase().includes(query)) continue;
        const association = speciesId ? own(bundle.diseases.speciesIndex, speciesId)?.diseases.find(item => item.diseaseId === disease.id) : undefined;
        diseases.push({ id: disease.id, name: disease.name, waterType, category: disease.category,
          keySigns: disease.keySigns, synonyms: disease.synonyms, contagious: disease.contagious, affectedSpeciesCount: affectedSpecies.length,
          speciesSigns: association?.signs || [], susceptibility: association?.susceptibility || null });
      }
    }
    return { diseases, species: [...species.values()].sort((a, b) => a.name.localeCompare(b.name)), total: diseases.length };
  }

  disease(id: string, language = 'de', speciesId?: string) {
    for (const waterType of ['fresh', 'salt'] as const) {
      const { diseases } = this.bundle(waterType, language);
      const disease = diseases.diseases.find(item => item.id === id);
      if (!disease) continue;
      const association = speciesId ? own(diseases.speciesIndex, canonicalHealthSpeciesId(speciesId)) : undefined;
      const affectedSpecies = [...new Set(disease.affectedSpecies.map(canonicalHealthSpeciesId))];
      return { ...disease, waterType, affectedSpecies, affectedSpeciesCount: affectedSpecies.length,
        medications: disease.recommendedMedications.map(recommendation => ({ ...this.medication(recommendation.medicationId, language)!, role: recommendation.role, roleLabel: recommendation.roleLabel })),
        sourceDetails: disease.sources.map(source => ({ id: source, ...diseases.sources[source] })),
        speciesSigns: association?.diseases.find(item => item.diseaseId === id)?.signs || [],
        treatmentCautions: association?.treatmentCautions || [], disclaimer: diseases.disclaimer, legalNotes: diseases.legalNotes,
        affectedSpeciesNames: this.catalog({ waterType, language }).species.filter(item => disease.affectedSpecies.some(id => canonicalHealthSpeciesId(id) === item.id)) };
    }
    return null;
  }

  /** Read-only reference data; diagnosis execution and aquarium data are excluded. */
  offlineSnapshot(language = 'de') {
    const catalog = this.catalog({ language });
    return {
      catalog,
      diseases: catalog.diseases.map(item => this.disease(item.id, language)!),
      diagnosis: { fresh: this.bundle('fresh', language).diagnosis, salt: this.bundle('salt', language).diagnosis },
      associations: { fresh: this.bundle('fresh', language).diseases.speciesIndex, salt: this.bundle('salt', language).diseases.speciesIndex },
      medications: this.medications({ language }),
      medicationDetails: this.medications({ language }).items.map(item => this.medication(item.id, language)!),
    };
  }

  private engine = new DiagnosisEngine((water, language) => this.bundle(water, language));
  diagnose(context: HealthContext, input: unknown = [], language = 'de') { return this.engine.diagnose(context, input, language); }
  answeredQuestions(context: HealthContext, answers: AnswerInput[], language = 'de') { return this.engine.answeredQuestions(context, answers, language); }

}
export const healthService = new HealthService();

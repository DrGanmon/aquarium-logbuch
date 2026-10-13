import fs from 'node:fs';
import path from 'node:path';
import { AppError } from '../utils/app-error';
import { asRecord, isRecord } from '../utils/validation';
import speciesModule = require('./species-service');
import type { WaterType } from '../types/domain';
import type {
  AnswerInput, AutomaticAnswer, DiagnosisDocument, DiagnosisNode, DiagnosisOutcome, DiagnosisTree,
  Disease, DiseaseDocument, HealthContext, HealthLanguage, HealthMeasurement, HealthQuestion, SpeciesRanges, MedicationDocument,
} from '../types/health';

const DATA_DIRECTORY = path.join(__dirname, '../config/health');
export const HEALTH_MEASUREMENT_MAX_AGE_MS = 24 * 3600 * 1000;
const waterFile = (water: WaterType) => water === 'salt' ? 'saltwater' : 'freshwater';
export const canonicalHealthSpeciesId = (id: string): string => id === 'symphysodon-spp' ? 'symphysodon-sp' : id;
export const healthLanguage = (language: string): HealthLanguage => language.toLowerCase().startsWith('en') ? 'en' : 'de';
const own = <T>(record: Record<string, T>, key: string): T | undefined => Object.hasOwn(record, key) ? record[key] : undefined;

interface HealthBundle { diseases: DiseaseDocument; diagnosis: DiagnosisDocument }
interface CheckedMeasurement { answer?: boolean; evidence: AutomaticAnswer['evidence']; missing: string[] }

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

  private measurable(question: HealthQuestion, context: HealthContext, document: DiagnosisDocument): CheckedMeasurement {
    if (!question.measurable) return { evidence: [], missing: [] };
    const evidence = new Map<string, AutomaticAnswer['evidence'][number]>();
    const evaluations: (boolean | undefined)[] = [];
    const missing = new Set<string>();
    const now = context.now ?? Date.now();
    for (const condition of question.measurable.conditions) {
      let reference: unknown = condition.value;
      if (condition.ref) {
        const parts = condition.ref.split('.');
        reference = parts[0] === 'species' ? context.species : undefined;
        for (const part of parts.slice(1)) reference = own(asRecord(reference), part);
        if (reference == null) continue; // Empty species bounds are deliberately not constraints.
      }
      const measured = own(context.measurements, condition.param);
      const measuredTime = measured ? Date.parse(measured.measured_at) : NaN;
      if (!measured || !Number.isFinite(measuredTime) || measuredTime > now + 5 * 60000 || now - measuredTime > HEALTH_MEASUREMENT_MAX_AGE_MS
        || typeof measured.value !== typeof reference || typeof measured.value === 'number' && !Number.isFinite(measured.value)) {
        evaluations.push(undefined); missing.add(condition.param); continue;
      }
      const value = measured.value;
      let matches = false;
      if (typeof value === 'number' && typeof reference === 'number') {
        switch (condition.op) {
          case '<': matches = value < reference; break; case '<=': matches = value <= reference; break;
          case '>': matches = value > reference; break; case '>=': matches = value >= reference; break;
          case '==': matches = value === reference; break; case '!=': matches = value !== reference; break;
        }
      } else if (typeof value === 'boolean' && typeof reference === 'boolean') matches = condition.op === '!=' ? value !== reference : value === reference;
      evaluations.push(matches);
      evidence.set(condition.param, { param: condition.param, label: document.parameters[condition.param]?.label || condition.param,
        value, unit: document.parameters[condition.param]?.unit || null, measuredAt: measured.measured_at });
    }
    if (!evaluations.length) return { evidence: [], missing: [] };
    const logic = question.measurable.logic;
    const yes = logic === 'all' ? evaluations.every(value => value === true) : evaluations.some(value => value === true);
    const no = logic === 'all' ? evaluations.some(value => value === false) : evaluations.every(value => value === false);
    return { answer: yes ? true : no && question.measurable.mode === 'auto' ? false : undefined,
      evidence: [...evidence.values()], missing: [...missing] };
  }

  answeredQuestions(context: HealthContext, answers: AnswerInput[], language = 'de') {
    // Replay the validated path to retain the exact wording, including partial water questions.
    return answers.map((answer, index) => {
      const previous = this.diagnose(context, answers.slice(0, index), language);
      return { ...answer, text: previous.question?.text || answer.questionId };
    });
  }

  diagnose(context: HealthContext, input: unknown = [], language = 'de'): DiagnosisOutcome {
    const bundle = this.bundle(context.waterType, language);
    const document = bundle.diagnosis;
    const speciesId = canonicalHealthSpeciesId(context.speciesId);
    const profile = own(document.species, speciesId);
    if (!profile) throw new AppError('Für diese Art und diesen Wassertyp sind keine Diagnosedaten vorhanden.', 400);
    const tree = document.trees[profile.treeId];
    const maxQuestions = Math.min(13, tree.maxQuestions);
    if (!Array.isArray(input) || input.length > maxQuestions) throw new AppError('Ungültige Diagnoseantworten.', 400);
    const answers: AnswerInput[] = [];
    const seen = new Set<string>();
    for (const raw of input) {
      if (!isRecord(raw) || typeof raw.questionId !== 'string' || !own(tree.matrix, raw.questionId)
        || typeof raw.answer !== 'string' || !['yes', 'no', 'unknown'].includes(raw.answer) || seen.has(raw.questionId)) throw new AppError('Ungültige Diagnoseantwort.', 400);
      seen.add(raw.questionId); answers.push({ questionId: raw.questionId, answer: raw.answer as AnswerInput['answer'] });
    }
    const automatic = new Map<string, boolean>();
    const automaticAnswers: AutomaticAnswer[] = [];
    const measured = new Map<string, CheckedMeasurement>();
    // Shared water checks remain visible for invertebrates even when their disease
    // matrix has no water-quality row. Only matrix questions affect the ranking.
    const questionIds = new Set([...Object.keys(tree.matrix), ...Object.entries(document.questions)
      .filter(([, question]) => question.scope === 'all' && question.measurable).map(([id]) => id)]);
    for (const id of questionIds) {
      const checked = this.measurable(document.questions[id], context, document);
      measured.set(id, checked);
      if (checked.answer !== undefined) {
        if (own(tree.matrix, id)) automatic.set(id, checked.answer);
        automaticAnswers.push({ questionId: id, text: document.questions[id].text, answer: checked.answer ? 'yes' : 'no', evidence: checked.evidence });
      }
    }
    const prior = Object.fromEntries([...profile.candidates.map(candidate => [candidate.diseaseId, candidate.priorWeight] as const), ['_none', 3] as const]);
    const normalize = (weights: Record<string, number>) => {
      const total = Object.values(weights).reduce((sum, value) => sum + value, 0);
      return Object.fromEntries(Object.entries(weights).map(([id, value]) => [id, value / total]));
    };
    let weights = normalize(prior);
    const probability = (id: string, diseaseId: string): number => {
      const question = document.questions[id];
      const fallback = id === 'eats_normally' ? 0.4 : question.generic ? 0.2 : 0.03;
      return Math.min(0.999, Math.max(0.001, own(tree.matrix[id], diseaseId) ?? fallback));
    };
    const update = (id: string, yes: boolean) => {
      weights = normalize(Object.fromEntries(Object.entries(weights).map(([diseaseId, weight]) => {
        const likelihood = probability(id, diseaseId);
        return [diseaseId, weight * (yes ? likelihood : 1 - likelihood)];
      })));
    };
    for (const [id, yes] of automatic) update(id, yes);
    const answered = new Set(automatic.keys());
    let node: DiagnosisNode = tree.root;
    let method: DiagnosisOutcome['method'] = 'tree';
    const skipAutomatic = () => {
      for (let depth = 0; method === 'tree' && 'question' in node && automatic.has(node.question) && depth < 32; depth++) {
        node = automatic.get(node.question) ? node.yes : node.no;
      }
      if (method === 'tree' && !('question' in node)) method = 'matrix';
    };
    const entropy = (distribution: Record<string, number>) => -Object.values(distribution).reduce((sum, value) => sum + (value > 0 ? value * Math.log2(value) : 0), 0);
    const next = (count: number): { id?: string; reason: DiagnosisOutcome['reason'] } => {
      skipAutomatic();
      if (count >= maxQuestions) return { reason: 'limit' };
      // Priors alone and unknown-only answers must not establish a positive finding.
      if (answered.size > 0 && Math.max(...Object.values(weights)) >= 0.8) return { reason: 'confidence' };
      if (method === 'tree' && 'question' in node && !answered.has(node.question)) return { id: node.question, reason: 'question' };
      method = 'matrix';
      let best: string | undefined, bestGain = 0.05;
      for (const id of Object.keys(tree.matrix)) {
        if (answered.has(id)) continue;
        const yesWeights: Record<string, number> = {}, noWeights: Record<string, number> = {};
        for (const [diseaseId, weight] of Object.entries(weights)) {
          yesWeights[diseaseId] = weight * probability(id, diseaseId); noWeights[diseaseId] = weight - yesWeights[diseaseId];
        }
        const pYes = Object.values(yesWeights).reduce((sum, value) => sum + value, 0);
        const gain = entropy(weights) - pYes * entropy(normalize(yesWeights)) - (1 - pYes) * entropy(normalize(noWeights));
        if (gain > bestGain) { bestGain = gain; best = id; }
      }
      return { id: best, reason: best ? 'question' : 'no_information' };
    };
    for (let index = 0; index < answers.length; index++) {
      const answer = answers[index];
      const expected = next(index);
      if (expected.id !== answer.questionId) throw new AppError('Die Fragen oder Aquariumwerte haben sich geändert. Bitte den Assistenten neu starten.', 409);
      answered.add(answer.questionId);
      if (answer.answer === 'unknown') method = 'matrix';
      else {
        update(answer.questionId, answer.answer === 'yes');
        if (method === 'tree' && 'question' in node) node = answer.answer === 'yes' ? node.yes : node.no;
      }
    }
    const following = next(answers.length);
    const question = following.id ? document.questions[following.id] : null;
    const index = own(bundle.diseases.speciesIndex, speciesId);
    const results = Object.entries(weights).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([diseaseId, probability]) => ({
      diseaseId, probability, name: document.diseaseNames[diseaseId], signs: profile.speciesSigns[diseaseId] || [],
      susceptibility: profile.candidates.find(candidate => candidate.diseaseId === diseaseId)?.susceptibility || null,
    }));
    const checked = following.id ? measured.get(following.id) : undefined;
    return { complete: !following.id, method, reason: following.reason, answeredCount: answers.length, maxQuestions, answers,
      question: question && following.id ? { id: following.id,
        text: question.measurable?.mode === 'partial' && !checked?.missing.length ? question.measurable.manualQuestion || question.text : question.text,
        hint: profile.questionHints[following.id] || question.hint, measurable: Boolean(question.measurable),
        missingParameters: checked?.missing.map(id => document.parameters[id]?.label || id) || [] } : null,
      automaticAnswers, results, caution: index?.treatmentCautions || [], disclaimer: document.disclaimer };
  }
}
export const healthService = new HealthService();

import { AppError } from '../utils/app-error';
import { asRecord, isRecord } from '../utils/validation';
import type { AnswerInput, AutomaticAnswer, DiseaseDocument, DiagnosisDocument, DiagnosisNode, HealthContext, HealthQuestion, DiagnosisOutcome } from '../types/health';
import type { WaterType } from '../types/domain';
export const HEALTH_MEASUREMENT_MAX_AGE_MS = 24 * 3600 * 1000;
export const canonicalHealthSpeciesId = (id: string): string => id === 'symphysodon-spp' ? 'symphysodon-sp' : id;
const own = <T>(record: Record<string, T>, key: string): T | undefined => Object.hasOwn(record, key) ? record[key] : undefined;
interface CheckedMeasurement { answer?: boolean; evidence: AutomaticAnswer['evidence']; missing: string[] }
export class DiagnosisEngine {
  constructor(private readonly resolveBundle: (water: WaterType, language: string) => { diagnosis: DiagnosisDocument; diseases: Pick<DiseaseDocument, 'speciesIndex'> }) {}
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
    const bundle = this.resolveBundle(context.waterType, language);
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

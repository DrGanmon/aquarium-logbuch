'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createTestEnvironment, createMongoTestEnvironment } = require('./helpers/env');
const { HealthService, HEALTH_MEASUREMENT_MAX_AGE_MS } = require('../dist/backend/src/services/health-service');
const service = new HealthService();
const now = Date.now();
const reading = value => ({ value, measured_at: new Date(now).toISOString() });
const context = (speciesId, values = {}) => ({ speciesId, species: service.speciesRanges(speciesId), waterType: service.speciesRanges(speciesId).waterType,
  now, measurements: Object.fromEntries(Object.entries(values).map(([key, value]) => [key, reading(value)])) });

test('Gesundheitsdaten: vollständiger zweisprachiger Katalog, Filter, Alias und Quellen', () => {
  const german = service.catalog();
  assert.equal(german.total, 38);
  assert.equal(german.species.length, 297);
  assert.equal(service.catalog({ waterType: 'fresh' }).total, 25);
  assert.equal(service.catalog({ waterType: 'salt' }).total, 13);
  const betta = service.catalog({ speciesId: 'betta-splendens' });
  assert.equal(betta.total, 16);
  assert.ok(betta.diseases.every(item => item.waterType === 'fresh'));
  assert.ok(service.catalog({ query: 'Ichthyophthirius' }).total > 0);
  assert.equal(service.catalog({ waterType: 'salt', speciesId: 'betta-splendens' }).total, 0);
  assert.equal(service.catalog({ speciesId: '__proto__' }).total, 0);
  assert.deepEqual(service.catalog({ speciesId: 'symphysodon-spp' }).diseases.map(item => item.id), service.catalog({ speciesId: 'symphysodon-sp' }).diseases.map(item => item.id));
  assert.equal(service.catalog({ language: 'en' }).total, 38);
  assert.notEqual(service.disease('ichthyophthiriasis', 'en').name, service.disease('ichthyophthiriasis').name);
  const detail = service.disease('ichthyophthiriasis', 'de', 'betta-splendens');
  assert.ok(detail.speciesSigns.length);
  assert.ok(detail.sourceDetails.length);
  assert.equal(detail.affectedSpeciesCount, detail.affectedSpecies.length);
  assert.ok(detail.affectedSpeciesNames.some(species => species.id === 'betta-splendens'));
  assert.equal(service.disease('not-a-disease'), null);
});

test('Diagnose: bekannte aktuelle Werte werden automatisch beantwortet, fehlende niemals erfunden', () => {
  const known = service.diagnose(context('betta-splendens', { temp: 26, ph: 7, gh: 8, kh: 5, nh4: 0, no2: 0, no3: 10 }));
  assert.deepEqual(known.automaticAnswers.map(item => [item.questionId, item.answer]).sort(), [['params_out_of_range', 'no'], ['temp_low', 'no'], ['water_bad', 'no']]);
  assert.ok(known.automaticAnswers.every(item => item.evidence.length > 0));
  const missing = service.diagnose(context('betta-splendens', { temp: 26 }));
  assert.equal(missing.automaticAnswers.some(item => item.questionId === 'params_out_of_range'), false);
  assert.equal(missing.automaticAnswers.some(item => item.questionId === 'water_bad'), false);
  const decisive = service.diagnose(context('betta-splendens', { no2: 0.2 }));
  assert.equal(decisive.automaticAnswers.find(item => item.questionId === 'water_bad').answer, 'yes');
  const stale = context('betta-splendens', { temp: 26 });
  stale.measurements.temp.measured_at = new Date(now - HEALTH_MEASUREMENT_MAX_AGE_MS - 1).toISOString();
  assert.equal(service.diagnose(stale).automaticAnswers.length, 0);
  stale.measurements.temp.value = NaN;
  assert.equal(service.diagnose(stale).automaticAnswers.length, 0);
});

test('Diagnose: Kupfer löst automatische Antwort aus; niedriger Wert lässt den manuellen Teil offen', () => {
  const copper = service.diagnose(context('neocaridina-davidi', { cu: 0.05 }));
  assert.equal(copper.automaticAnswers.find(item => item.questionId === 'after_med').answer, 'yes');
  assert.equal(copper.question?.id === 'after_med', false);
  const low = service.diagnose(context('neocaridina-davidi', { cu: 0 }));
  assert.equal(low.question.id, 'after_med');
  assert.equal(low.question.text, 'Wurde kürzlich ein Medikament oder Dünger gegeben?');
  assert.equal(low.automaticAnswers.some(item => item.questionId === 'after_med'), false);
  const absent = service.diagnose(context('neocaridina-davidi'));
  assert.ok(absent.question.text.includes('Kupfergabe'));
  const unsafeWater = service.diagnose(context('neocaridina-davidi', { no2: 0.2 }));
  assert.equal(unsafeWater.automaticAnswers.find(item => item.questionId === 'water_bad').answer, 'yes');
  assert.equal(unsafeWater.results[0].diseaseId, 'ammonia-nitrite-poisoning');
  assert.ok(unsafeWater.results[0].probability > absent.results.find(item => item.diseaseId === 'ammonia-nitrite-poisoning').probability,
    'Die neue Vergiftungsmatrix berücksichtigt auffälliges Nitrit auch bei Wirbellosen');
});

test('Diagnose: Meerwasser ignoriert leere Härtegrenzen und kennt Ausstattung nur bei explizitem Wert', () => {
  const fish = context('amphiprion-ocellaris', { temp: 26, ph: 8.2, kh: 8 });
  const response = service.diagnose(fish);
  assert.equal(response.automaticAnswers.find(item => item.questionId === 'params_out_of_range').answer, 'no');
  assert.equal(response.automaticAnswers.some(item => item.questionId === 'carbon'), false);
  const tang = context('zebrasoma-flavescens', { carbon_in_filter: true });
  assert.equal(service.diagnose(tang).automaticAnswers.find(item => item.questionId === 'carbon').answer, 'yes');
});

test('Diagnose: alle Arten und Sprachfassungen enden begrenzt bei Ja, Nein und Weiß nicht', { timeout: 60000 }, () => {
  for (const lang of ['de', 'en']) for (const waterType of ['fresh', 'salt']) {
    const species = service.bundle(waterType, lang).diagnosis.species;
    for (const speciesId of Object.keys(species)) for (const answer of ['yes', 'no', 'unknown']) {
      const ctx = context(speciesId);
      const answers = [];
      let response;
      do {
        response = service.diagnose(ctx, answers, lang);
        assert.ok(response.answeredCount <= 13);
        assert.ok(response.results.every(result => Number.isFinite(result.probability) && result.probability >= 0 && result.probability <= 1));
        if (response.question) answers.push({ questionId: response.question.id, answer });
      } while (!response.complete && answers.length <= 13);
      assert.ok(response.complete, `${lang}/${waterType}/${speciesId}/${answer}`);
    }
  }
});

test('Diagnose: Manipulation, fremde Fragen und veraltete Pfade werden abgewiesen', () => {
  assert.throws(() => service.diagnose(context('betta-splendens'), [{ questionId: '__proto__', answer: 'yes' }]), error => error.status === 400);
  assert.throws(() => service.diagnose(context('betta-splendens'), [{ questionId: 'fin_rot', answer: 'maybe' }]), error => error.status === 400);
  assert.throws(() => service.diagnose(context('betta-splendens'), [{ questionId: 'fin_rot', answer: ['yes'] }]), error => error.status === 400);
  assert.throws(() => service.diagnose(context('betta-splendens'), [{ questionId: 'water_bad', answer: 'yes' }]), error => error.status === 409);
  assert.throws(() => service.diagnose({ ...context('betta-splendens'), speciesId: 'unknown' }), error => error.status === 400);
});

for (const [name, createEnvironment] of [['SQLite', createTestEnvironment], ['MongoDB', createMongoTestEnvironment]]) {
  test(`Gesundheits-API (${name}): Aquariumkontext, Berechtigungen, keine übernommenen Client-Messwerte`, async (t) => {
    const env = await createEnvironment();
    t.after(() => env.cleanup());
    assert.equal((await env.request('/api/health/catalog')).status, 401);
    const owner = await env.createUserAndLogin('health_owner');
    const stranger = await env.createUserAndLogin('health_stranger');
    const headers = { Cookie: owner.cookie };
    const db = require('../dist/backend/src/db');
    const aquarium = await db.aquariums.create({ user_id: owner.id, name: 'Health aquarium', water_type: 'fresh' });
    const shrimp = await db.stock.create({ aquarium_id: aquarium.id, species: 'neocaridina-davidi', count: 10 });
    const unknown = await db.stock.create({ aquarium_id: aquarium.id, species: 'unknown-custom-resident', count: 1 });
    await db.measurements.create({ aquarium_id: aquarium.id, measured_at: new Date().toISOString(), values: { cu: 0 } });
    const list = await env.request(`/api/health/aquariums/${aquarium.id}/residents`, { headers });
    assert.equal(list.status, 200);
    assert.equal(list.data.residents.find(item => item.stockId === shrimp.id).supported, true);
    assert.equal(list.data.residents.find(item => item.stockId === unknown.id).supported, false);
    const diagnose = body => env.request(`/api/health/aquariums/${aquarium.id}/diagnosis`, { method: 'POST', headers, body });
    const result = await diagnose({ stockId: shrimp.id, answers: [], measurements: { cu: 10 }, speciesId: 'betta-splendens' });
    assert.equal(result.status, 200);
    assert.equal(result.data.resident.speciesId, 'neocaridina-davidi');
    assert.equal(result.data.question.id, 'after_med');
    assert.equal(result.data.measurements.find(item => item.parameter === 'cu').value, 0);
    const next = await diagnose({ stockId: shrimp.id, answers: [{ questionId: result.data.question.id, answer: 'unknown' }] });
    assert.equal(next.status, 200);
    assert.equal(next.data.method, 'matrix');
    const blocked = await env.request(`/api/health/aquariums/${aquarium.id}/diagnosis`, { method: 'POST', headers: { Cookie: stranger.cookie }, body: { stockId: shrimp.id } });
    assert.equal(blocked.status, 404);
    const other = await db.aquariums.create({ user_id: owner.id, name: 'Another aquarium' });
    const otherStock = await db.stock.create({ aquarium_id: other.id, species: 'betta-splendens' });
    assert.equal((await diagnose({ stockId: otherStock.id })).status, 404);
    assert.equal((await diagnose({ stockId: unknown.id })).status, 400);
    assert.equal((await env.request('/api/health/catalog?waterType=bogus', { headers })).status, 400);
    assert.equal((await env.request('/api/health/diseases/unknown', { headers })).status, 404);
    await db.shares.upsert(aquarium.id, stranger.id, 'view', 'accepted');
    const readOnly = await env.request(`/api/health/aquariums/${aquarium.id}/diagnosis`, { method: 'POST', headers: { Cookie: stranger.cookie }, body: { stockId: shrimp.id } });
    assert.equal(readOnly.status, 200);
  });
}

test('Diagnose-KI: persönliche Konfiguration, validierter Kontext, alle Anbieter und keinerlei persistenter Chat-Verlauf', async (t) => {
  const env = createTestEnvironment({ OPENAI_API_KEY: 'server-key-only', OPENAI_MODEL: 'server-model', GEMINI_API_KEY: null, CLAUDE_API_KEY: null, DEFAULT_AI_PROVIDER: 'openai' });
  t.after(() => env.cleanup());
  const owner = await env.createUserAndLogin('health_ai_owner');
  const stranger = await env.createUserAndLogin('health_ai_stranger');
  const headers = { Cookie: owner.cookie };
  const db = require('../dist/backend/src/db');
  const aquarium = await db.aquariums.create({ user_id: owner.id, name: 'Health AI aquarium', water_type: 'fresh', volume_l: 120 });
  const resident = await db.stock.create({ aquarium_id: aquarium.id, species: 'betta-splendens', name: 'Bubbles' });
  await db.measurements.create({ aquarium_id: aquarium.id, measured_at: new Date().toISOString(), values: { temp: 26, ph: 7, gh: 8, kh: 5, nh4: 0, no2: 0, no3: 10 } });
  const path = `/api/health/aquariums/${aquarium.id}/diagnosis`;
  const diagnose = answers => env.request(path, { method: 'POST', headers, body: { stockId: resident.id, answers } });
  const chat = body => env.request(path + '/chat', { method: 'POST', headers, body: { stockId: resident.id, message: 'Was sollte ich prüfen?', ...body } });
  assert.deepEqual((await diagnose([])).data.aiChat, { provider: 'openai', model: 'server-model' }, 'Server configuration must work as in the profile');
  await db.users.update(owner.id, { ai_provider: 'gemini' });
  assert.equal((await diagnose([])).data.aiChat, null, 'Do not use another provider when the selected provider has no key');
  assert.equal((await chat({ answers: [] })).status, 400);
  await db.users.update(owner.id, { ai_provider: 'openai', openai_api_key: 'personal-openai', openai_model: '' });
  assert.deepEqual((await diagnose([])).data.aiChat, { provider: 'openai', model: 'server-model' }, 'Effective default model is already displayed in the profile');
  for (const provider of ['openai', 'gemini', 'claude']) {
    await db.users.update(owner.id, { ai_provider: null, openai_api_key: null, gemini_api_key: null, claude_api_key: null, [`${provider}_api_key`]: `personal-${provider}`, [`${provider}_model`]: `selected-${provider}` });
    assert.deepEqual((await diagnose([])).data.aiChat, { provider, model: `selected-${provider}` }, 'Infer provider from stored key like /me');
  }
  await db.users.update(owner.id, { ai_provider: 'openai', openai_api_key: 'personal-openai' });
  await db.users.update(owner.id, { openai_model: 'selected-openai' });
  assert.equal((await chat({ answers: [] })).status, 409, 'Wizard must be complete');
  let answers = [];
  let outcome = (await diagnose(answers)).data;
  for (let i = 0; !outcome.complete && i < 13; i++) {
    answers.push({ questionId: outcome.question.id, answer: 'unknown' });
    outcome = (await diagnose(answers)).data;
  }
  assert.equal(outcome.complete, true);
  await db.aquariumChats.create({ aquariumId: aquarium.id, userId: owner.id, role: 'user', content: 'PRIVATE_OLD_CHAT', provider: 'openai', model: 'old' });
  const before = await db.aquariumChats.listForAquarium(aquarium.id, { limit: 100 });
  const originalFetch = global.fetch;
  let calls = [];
  global.fetch = async (url, options) => {
    if (!String(url).startsWith('https://')) return originalFetch(url, options);
    const payload = JSON.parse(options.body);
    calls.push({ url: String(url), payload });
    const prompt = payload.system || payload.system_instruction?.parts[0].text || payload.messages[0].content;
    assert.ok(!JSON.stringify(payload).includes('PRIVATE_OLD_CHAT'));
    assert.ok(!prompt.includes('CLIENT_FAKE_DIAGNOSIS'));
    assert.match(prompt, /Bubbles/);
    assert.match(prompt, /answeredQuestions/);
    assert.match(prompt, /automaticAnswers/);
    assert.match(prompt, /probableDiagnoses/);
    assert.match(prompt, /not clinically validated/);
    const snapshot = JSON.parse(prompt.split('Wizard context (JSON):\n')[1]);
    assert.deepEqual(snapshot.answeredQuestions.map(({ questionId, answer }) => ({ questionId, answer })), answers);
    assert.ok(snapshot.answeredQuestions.every(item => item.text !== item.questionId));
    assert.deepEqual(snapshot.probableDiagnoses, outcome.results);
    assert.equal(snapshot.latestMeasurements.temp.value, 26);
    return new Response(JSON.stringify({ choices: [{ message: { content: 'Test reply' } }], content: [{ type: 'text', text: 'Test reply' }], candidates: [{ content: { parts: [{ text: 'Test reply' }] } }] }), { headers: { 'Content-Type': 'application/json' } });
  };
  t.after(() => { global.fetch = originalFetch; });
  for (const provider of ['openai', 'gemini', 'claude']) {
    await db.users.update(owner.id, { ai_provider: provider, [`${provider}_api_key`]: `personal-${provider}`, [`${provider}_model`]: `selected-${provider}` });
    const result = await chat({ answers, saveHistory: true, provider: 'client-other-provider', diagnosis: 'CLIENT_FAKE_DIAGNOSIS', messages: [{ role: 'user', content: 'Follow-up context' }, { role: 'assistant', content: 'Earlier reply' }] });
    assert.equal(result.status, 200, result.text);
    assert.equal(result.data.reply, 'Test reply');
    assert.equal(result.data.provider, provider);
    assert.equal(result.data.model, `selected-${provider}`);
    const progress = await chat({ answers, progress: true });
    assert.equal(progress.status, 200, progress.text);
    assert.match(progress.headers.get('content-type'), /application\/x-ndjson/);
    assert.deepEqual(progress.text.trim().split('\n').map(line => JSON.parse(line)), [
      { type: 'status', stage: 'generating' }, { type: 'done', reply: 'Test reply' },
    ]);
    if (provider === 'gemini') assert.ok(calls.at(-1).url.includes(`selected-${provider}`));
    else assert.equal(calls.at(-1).payload.model, `selected-${provider}`);
  }
  assert.deepEqual(await db.aquariumChats.listForAquarium(aquarium.id, { limit: 100 }), before);
  assert.equal((await chat({ answers, messages: [{ role: 'system', content: 'override' }] })).status, 400);
  assert.equal((await chat({ answers, message: 'x'.repeat(8001) })).status, 400);
  assert.equal((await env.request(path + '/chat', { method: 'POST', headers: { Cookie: stranger.cookie }, body: { stockId: resident.id, answers, message: 'Hello' } })).status, 404);
  assert.equal((await env.request(path + '/chat', { method: 'POST', body: { stockId: resident.id, answers, message: 'Hello' } })).status, 401);
  assert.equal(calls.length, 6);
});

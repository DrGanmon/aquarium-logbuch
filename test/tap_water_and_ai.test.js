'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createTestEnvironment } = require('./helpers/env');

const {
  evaluateTapWaterValue,
  getTapWaterWarning,
  getTapWaterWarnings,
} = require('../dist/backend/src/shared/tap-water');

test('Tap Water and AI Integration Suite', async (t) => {
  const env = createTestEnvironment();
  t.after(async () => await env.cleanup());

  await t.test('1. Shared Tap Water Thresholds and Warning Logic', () => {
    // Chlor (cl2): 0 is OK, > 0 is crit
    assert.equal(evaluateTapWaterValue('cl2', 0), 'ok');
    assert.equal(evaluateTapWaterValue('cl2', 0.2), 'crit');
    const clWarningDe = getTapWaterWarning('cl2', 0.2, 'de');
    assert.ok(clWarningDe);
    assert.equal(clWarningDe.level, 'crit');
    assert.match(clWarningDe.message, /Chlor im Leitungswasser nachgewiesen/);

    const clWarningEn = getTapWaterWarning('cl2', 0.2, 'en');
    assert.ok(clWarningEn);
    assert.match(clWarningEn.message, /Chlorine detected in tap water/);

    // Kupfer (cu): 0 is OK, > 0.005 is warn, > 0.02 is crit
    assert.equal(evaluateTapWaterValue('cu', 0), 'ok');
    assert.equal(evaluateTapWaterValue('cu', 0.01), 'warn');
    assert.equal(evaluateTapWaterValue('cu', 0.05), 'crit');
    const cuWarning = getTapWaterWarning('cu', 0.05, 'de');
    assert.ok(cuWarning);
    assert.match(cuWarning.message, /Kupfer im Leitungswasser nachgewiesen/);

    // Nitrat (no3): 10 is OK, 25 is warn, 60 is crit
    assert.equal(evaluateTapWaterValue('no3', 10), 'ok');
    assert.equal(evaluateTapWaterValue('no3', 25), 'warn');
    assert.equal(evaluateTapWaterValue('no3', 60), 'crit');
    const no3Warning = getTapWaterWarning('no3', 30, 'de');
    assert.ok(no3Warning);
    assert.match(no3Warning.message, /Erhöhter Nitratgehalt im Ausgangswasser/);

    // Silikat (sio2): 0.5 is OK, 1.5 is warn, 3.0 is crit
    assert.equal(evaluateTapWaterValue('sio2', 0.5), 'ok');
    assert.equal(evaluateTapWaterValue('sio2', 1.5), 'warn');
    assert.equal(evaluateTapWaterValue('sio2', 3.0), 'crit');
    const sio2Warning = getTapWaterWarning('sio2', 2.5, 'de');
    assert.ok(sio2Warning);
    assert.match(sio2Warning.message, /Hoher Silikatgehalt im Leitungswasser/);

    // getTapWaterWarnings helper
    const testValues = {
      ph: 7.4,
      gh: 12,
      kh: 8,
      cl2: 0.1,
      cu: 0.03,
      no3: 35,
    };
    const warnings = getTapWaterWarnings(testValues, 'de');
    assert.equal(warnings.length, 3);
    const warnedKeys = warnings.map((w) => w.key);
    assert.ok(warnedKeys.includes('cl2'));
    assert.ok(warnedKeys.includes('cu'));
    assert.ok(warnedKeys.includes('no3'));
  });

  let user = null;

  await t.test('2. API Endpoints: Register and Tap Water CRUD', async () => {
    user = await env.createUserAndLogin('wasser_tester', 'Password123!');
    assert.ok(user.id);
    assert.ok(user.cookie);

    // 1. Initial GET /api/me/tap-water -> null
    const getRes1 = await env.request('/api/me/tap-water', {
      headers: { Cookie: user.cookie },
    });
    assert.equal(getRes1.status, 200);
    assert.equal(getRes1.data.tapWater, null);

    // 2. Save tap water via PUT /api/me/tap-water
    const tapPayload = {
      values: {
        ph: 7.6,
        gh: 14,
        kh: 9,
        no3: 25,
        no2: 0,
        cl2: 0.15,
        cu: 0.04,
        po4: 0.1,
        sio2: 2.2,
      },
      note: 'Stadtwasserwerk Ost, Leitung im Altbau',
      measuredAt: '2026-10-18',
    };

    const putRes = await env.request('/api/me/tap-water', {
      method: 'PUT',
      headers: { Cookie: user.cookie },
      body: tapPayload,
    });
    assert.equal(putRes.status, 200);
    assert.ok(putRes.data.ok);
    assert.equal(putRes.data.tapWater.values.ph, 7.6);
    assert.equal(putRes.data.tapWater.values.cl2, 0.15);
    assert.equal(putRes.data.tapWater.note, 'Stadtwasserwerk Ost, Leitung im Altbau');
    assert.equal(putRes.data.tapWater.measuredAt, '2026-10-18');

    // 3. Verify /api/me serialization includes tapWater
    const meRes = await env.request('/api/me', {
      headers: { Cookie: user.cookie },
    });
    assert.equal(meRes.status, 200);
    assert.ok(meRes.data.tapWater);
    assert.equal(meRes.data.tapWater.values.ph, 7.6);
    assert.equal(meRes.data.tapWater.values.cl2, 0.15);
    assert.equal(meRes.data.tapWater.note, 'Stadtwasserwerk Ost, Leitung im Altbau');

    // 4. Verify direct GET /api/me/tap-water
    const getRes2 = await env.request('/api/me/tap-water', {
      headers: { Cookie: user.cookie },
    });
    assert.equal(getRes2.status, 200);
    assert.ok(getRes2.data.tapWater);
    assert.equal(getRes2.data.tapWater.values.sio2, 2.2);

    // 5. Delete tap water via DELETE /api/me/tap-water
    const delRes = await env.request('/api/me/tap-water', {
      method: 'DELETE',
      headers: { Cookie: user.cookie },
    });
    assert.equal(delRes.status, 200);
    assert.ok(delRes.data.ok);
    assert.equal(delRes.data.tapWater, null);

    const meResAfter = await env.request('/api/me', {
      headers: { Cookie: user.cookie },
    });
    assert.equal(meResAfter.status, 200);
    assert.equal(meResAfter.data.tapWater, null);
  });

  await t.test('3. AI System Prompt Generation with Tap Water Values & Dangerous Warnings', async () => {
    const db = require('../dist/backend/src/db');
    const aiChatService = require('../dist/backend/src/services/ai-chat-service');

    // 1. Create an aquarium for the user
    const aq = await db.aquariums.create({
      user_id: user.id,
      name: 'Amazonas Becken',
      water_type: 'fresh',
      volume_l: 240,
      reminder_days: 7,
      notes: 'Südamerika Biotop mit Neonsalmlern',
    });

    // 2. Add stock (e.g. Rote Neons, Garnelen)
    await db.stock.create({
      aquarium_id: aq.id,
      species: 'Roter Neon',
      count: 20,
      profile: 'weichwasser',
      name: 'Neons',
    });

    // 3. Set user tap water values including critical chlorine and copper
    const tapData = {
      values: {
        ph: 7.8,
        gh: 18,
        kh: 12,
        cl2: 0.2,
        cu: 0.05,
        no3: 35,
        sio2: 3.0,
      },
      note: 'Altbau-Kupferleitungen, gechlortes Leitungswasser',
      measuredAt: '2026-10-18',
    };
    await db.users.update(user.id, { tap_water: JSON.stringify(tapData) });

    // 4. Generate system prompt
    const { systemPrompt } = await aiChatService.buildAquariumSystemPrompt(aq.id, db, user.id);

    assert.ok(systemPrompt, 'System prompt muss erzeugt worden sein');
    assert.match(systemPrompt, /=== 4\. LEITUNGSWASSER-WERTE/);
    assert.match(systemPrompt, /pH-Wert.*: 7,8/);
    assert.match(systemPrompt, /Gesamthärte.*: 18,0 °dH/);
    assert.match(systemPrompt, /Chlor.*: 0,2.* mg\/l ❌ \[KRITISCH/);
    assert.match(systemPrompt, /Kupfer.*: 0,05.* mg\/l ❌ \[KRITISCH/);
    assert.match(systemPrompt, /Nitrat.*: 35.* mg\/l ⚠️ \[AUFFÄLLIG/);
    assert.match(systemPrompt, /Silikat.*: 3,0.* mg\/l ❌ \[KRITISCH/);
    assert.match(systemPrompt, /Altbau-Kupferleitungen, gechlortes Leitungswasser/);
    assert.match(systemPrompt, /WICHTIGE ANWEISUNG ZUM LEITUNGSWASSER/);
    assert.match(systemPrompt, /Wasseraufbereiter/);
    assert.match(systemPrompt, /Osmosewasser/);
  });
});

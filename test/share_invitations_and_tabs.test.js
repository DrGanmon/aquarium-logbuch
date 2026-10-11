'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { createTestEnvironment } = require('./helpers/env');
const { loadTemplate, createShareAquariumMail } = require('../src/services/mail-template');

test('E-Mail-Template: share-aquarium.tpl Vorlage und Token-Ersetzung', () => {
  const tplContent = loadTemplate('share-aquarium');
  assert.ok(tplContent, 'share-aquarium.tpl sollte existieren und geladen werden');
  assert.ok(tplContent.includes('{{username}}'), 'Token {{username}} fehlt in share-aquarium.tpl');
  assert.ok(tplContent.includes('{{ownerUsername}}'), 'Token {{ownerUsername}} fehlt in share-aquarium.tpl');
  assert.ok(tplContent.includes('{{aquariumName}}'), 'Token {{aquariumName}} fehlt in share-aquarium.tpl');
  assert.ok(tplContent.includes('{{roleLabel}}'), 'Token {{roleLabel}} fehlt in share-aquarium.tpl');
  assert.ok(tplContent.includes('{{acceptUrl}}'), 'Token {{acceptUrl}} fehlt in share-aquarium.tpl');
  assert.ok(tplContent.includes('{{logoUrl}}'), 'Token {{logoUrl}} fehlt in share-aquarium.tpl');
  assert.ok(tplContent.includes('{{ctaText}}'), 'Token {{ctaText}} fehlt in share-aquarium.tpl');

  const { subject, html, text } = createShareAquariumMail({
    username: 'Max',
    ownerUsername: 'Lisa',
    aquariumName: 'Südamerika Scape 300L',
    role: 'write',
    acceptUrl: 'http://localhost:3000/#/share-invitation?token=secret123',
    expiresDays: 14,
  });

  assert.ok(subject.includes('Lisa'));
  assert.ok(subject.includes('Südamerika Scape 300L'));
  assert.ok(html.includes('Max'));
  assert.ok(html.includes('Lisa'));
  assert.ok(html.includes('Südamerika Scape 300L'));
  assert.ok(html.includes('http://localhost:3000/#/share-invitation?token=secret123'));
  assert.ok(html.includes('Schreibrechte'));
  assert.ok(text.includes('Max'));
  assert.ok(text.includes('http://localhost:3000/#/share-invitation?token=secret123'));
});

test('Aquarium-Freigaben: Einladungsmail, Token, Annahme, Ablehnung und Übersicht-Tabs', async (t) => {
  const env = createTestEnvironment();
  t.after(async () => await env.cleanup());

  const owner = await env.createUserAndLogin('owner_tim', 'passTim1234', 'tim@test.local');
  const recipient = await env.createUserAndLogin('guest_sara', 'passSara1234', 'sara@test.local');
  const thirdUser = await env.createUserAndLogin('third_user', 'passThird123', 'third@test.local');

  // 1. Owner erstellt Aquarium
  const createAq = await env.request('/api/aquariums', {
    method: 'POST',
    headers: { Cookie: owner.cookie },
    body: { name: 'Garnelen-Paradies', water_type: 'fresh', volume_l: 60 },
  });
  assert.strictEqual(createAq.status, 200);
  const aqId = createAq.data.id;

  // 2. Owner teilt Aquarium mit Sara
  const shareReq = await env.request(`/api/aquariums/${aqId}/shares`, {
    method: 'POST',
    headers: { Cookie: owner.cookie },
    body: { usernameOrEmail: 'sara@test.local', role: 'view' },
  });
  assert.strictEqual(shareReq.status, 200);
  assert.strictEqual(shareReq.data.status, 'pending');
  assert.ok(shareReq.data.token);
  const token = shareReq.data.token;

  // 3. Vor Annahme: Sara sieht das Aquarium NICHT in /api/aquariums und kann es nicht aufrufen
  const listBefore = await env.request('/api/aquariums', { headers: { Cookie: recipient.cookie } });
  assert.strictEqual(listBefore.status, 200);
  assert.strictEqual(listBefore.data.length, 0);

  const viewBefore = await env.request(`/api/aquariums/${aqId}`, { headers: { Cookie: recipient.cookie } });
  assert.strictEqual(viewBefore.status, 404);

  // 4. Sara ruft offene Einladungen ab
  const pending = await env.request('/api/shares/pending', { headers: { Cookie: recipient.cookie } });
  assert.strictEqual(pending.status, 200);
  assert.strictEqual(pending.data.length, 1);
  assert.strictEqual(pending.data[0].aquarium_name, 'Garnelen-Paradies');
  assert.strictEqual(pending.data[0].owner_username, 'owner_tim');
  assert.strictEqual(pending.data[0].role, 'view');

  // 5. Token-Validierungsendpunkt
  const inviteInfo = await env.request(`/api/shares/invite/${token}`);
  assert.strictEqual(inviteInfo.status, 200);
  assert.strictEqual(inviteInfo.data.valid, true);
  assert.strictEqual(inviteInfo.data.aquarium_name, 'Garnelen-Paradies');
  assert.strictEqual(inviteInfo.data.owner_username, 'owner_tim');

  // 6. Einladung ablehnen (Sara lehnt Einladung ab)
  const declineRes = await env.request('/api/shares/decline', {
    method: 'POST',
    headers: { Cookie: recipient.cookie },
    body: { aquarium_id: aqId },
  });
  assert.strictEqual(declineRes.status, 200);
  assert.strictEqual(declineRes.data.ok, true);

  // Keine offenen Einladungen mehr
  const pendingAfterDecline = await env.request('/api/shares/pending', { headers: { Cookie: recipient.cookie } });
  assert.strictEqual(pendingAfterDecline.status, 200);
  assert.strictEqual(pendingAfterDecline.data.length, 0);

  // 7. Owner lädt Sara erneut ein (Schreibrechte)
  const reShare = await env.request(`/api/aquariums/${aqId}/shares`, {
    method: 'POST',
    headers: { Cookie: owner.cookie },
    body: { usernameOrEmail: 'guest_sara', role: 'write' },
  });
  assert.strictEqual(reShare.status, 200);
  assert.strictEqual(reShare.data.status, 'pending');
  assert.strictEqual(reShare.data.role, 'write');
  const newToken = reShare.data.token;

  // 8. Resend-Endpoint testen
  const resendRes = await env.request(`/api/aquariums/${aqId}/shares/${recipient.id}/resend`, {
    method: 'POST',
    headers: { Cookie: owner.cookie },
  });
  assert.strictEqual(resendRes.status, 200);
  assert.strictEqual(resendRes.data.ok, true);
  const activeToken = resendRes.data.token;

  // 9. Sara nimmt die Einladung per Token an
  const acceptRes = await env.request('/api/shares/accept', {
    method: 'POST',
    headers: { Cookie: recipient.cookie },
    body: { token: activeToken },
  });
  assert.strictEqual(acceptRes.status, 200);
  assert.strictEqual(acceptRes.data.ok, true);
  assert.strictEqual(acceptRes.data.aquarium_id, aqId);

  // 10. Nach Annahme: Aquarium erscheint in /api/aquariums für Sara
  const listAfter = await env.request('/api/aquariums', { headers: { Cookie: recipient.cookie } });
  assert.strictEqual(listAfter.status, 200);
  assert.strictEqual(listAfter.data.length, 1);
  assert.strictEqual(listAfter.data[0].id, aqId);
  assert.strictEqual(listAfter.data[0].role, 'write');
  assert.strictEqual(listAfter.data[0].owner_username, 'owner_tim');

  // Sara kann Aquarium einsehen und Messung hinzufügen (Schreibrechte)
  const viewAfter = await env.request(`/api/aquariums/${aqId}`, { headers: { Cookie: recipient.cookie } });
  assert.strictEqual(viewAfter.status, 200);
  assert.strictEqual(viewAfter.data.role, 'write');

  const addMeas = await env.request(`/api/aquariums/${aqId}/measurements`, {
    method: 'POST',
    headers: { Cookie: recipient.cookie },
    body: { values: { temp: 24.5, ph: 6.8 } },
  });
  assert.strictEqual(addMeas.status, 200);

  // Dritter User (third_user) hat keinen Zugriff
  const thirdView = await env.request(`/api/aquariums/${aqId}`, { headers: { Cookie: thirdUser.cookie } });
  assert.strictEqual(thirdView.status, 404);
});

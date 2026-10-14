'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const sharp = require('sharp');
const { createTestEnvironment } = require('./helpers/env');
const manifest = require('../public/plants-images/manifest.json');
const attribution = require('../public/plants-images/attribution.json');

test('Pflanzenbilder: Zuordnung, WebP-Abmessungen und vollständige Bildnachweise', async () => {
  assert.equal(Object.keys(manifest).length, 139);
  const plants = require('../src/config/plants/plants.json').plants;
  for (const [id, image] of Object.entries(manifest)) {
    assert.ok(plants.some(plant => plant.id === id));
    assert.equal(image.url, `plants-images/${id}.webp`);
    const metadata = await sharp(path.join('public', image.url)).metadata();
    await sharp(path.join('public', image.url), { failOn: 'error' }).raw().toBuffer();
    assert.equal(metadata.format, 'webp');assert.equal(metadata.width, image.width);assert.equal(metadata.height, image.height);
    assert.ok(image.width <= 768 && image.height <= 768);
    const original = attribution.images.find(item => item.id === id);
    for (const key of ['author', 'sourceUrl', 'license', 'licenseUrl', 'attribution', 'shareAlike']) assert.equal(image[key], original[key] ?? '');
    assert.ok(image.modifications.includes('nicht beschnitten'));
    assert.ok(fs.existsSync(path.join('public', image.url)));
  }
});

test('Pflanzen-API: Bilder und Bildnachweise in beiden Sprachen, Details ohne Bild und abrufbare Assets', async t => {
  const env = createTestEnvironment({ DB_TYPE: 'sqlite' });t.after(() => env.cleanup());
  const account = await env.createUserAndLogin('plant_images');
  for (const lang of ['de', 'en']) {
    for (const [id, image] of Object.entries(manifest)) {
      const result = await env.request(`/api/plants/${id}`, { headers: { Cookie: account.cookie, 'X-Language': lang } });
      assert.equal(result.status, 200);assert.deepEqual(result.data.plant.image, image);
    }
    const missing = await env.request('/api/plants/taxiphyllum-barbieri', { headers: { Cookie: account.cookie, 'X-Language': lang } });
    assert.equal(missing.data.plant.image, null);
  }
  const response = await fetch(`${await env.start()}/${Object.values(manifest)[0].url}`);
  assert.equal(response.status, 200);assert.match(response.headers.get('content-type'), /image\/webp/);
});

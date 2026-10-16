'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

test('Frontend: Katalogdaten und Katalogbilder ändern weder Frontend-Hash noch Service Worker', { timeout: 90000 }, async t => {
  const root = path.resolve(__dirname, '..');
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'aquarium-catalog-build-'));
  t.after(() => fs.rmSync(fixture, { recursive: true, force: true }));
  for (const name of ['src', 'scripts', 'vite.config.mts', 'version.json', 'package.json']) {
    fs.cpSync(path.join(root, name), path.join(fixture, name), { recursive: true });
  }
  fs.cpSync(path.join(root, 'public'), path.join(fixture, 'public'), {
    recursive: true,
    filter: source => !/^(dist|species-images|plants-images|js)(\/|$)/.test(path.relative(path.join(root, 'public'), source).replaceAll('\\', '/')),
  });
  fs.mkdirSync(path.join(fixture, 'public/dist'));
  fs.symlinkSync(path.join(root, 'node_modules'), path.join(fixture, 'node_modules'), 'dir');
  const { build } = await import('vite');
  const compile = async () => {
    await build({ configFile: path.join(fixture, 'vite.config.mts'), mode: 'production', logLevel: 'silent' });
    return {
      manifest: JSON.parse(fs.readFileSync(path.join(fixture, 'public/dist/frontend-version.json'), 'utf8')),
      worker: fs.readFileSync(path.join(fixture, 'public/dist/sw.js'), 'utf8'),
    };
  };
  const original = await compile();
  assert.ok(!Object.keys(original.manifest.assets).some(name => name.includes('handbuch')), 'Das Handbuch gehört nicht in den Shell-Cache');
  for (const kind of ['species', 'plants', 'health']) {
    const directory = path.join(fixture, 'src/config', kind);
    const files = fs.readdirSync(directory, { recursive: true }).filter(name => name.endsWith('.json'));
    assert.ok(files.length > 0);
    for (const name of files) {
      const file = path.join(directory, name), data = JSON.parse(fs.readFileSync(file, 'utf8'));
      data.description = `Geänderter ${kind}-Katalog für den Regressionstest`;
      fs.writeFileSync(file, JSON.stringify(data));
    }
    assert.deepEqual(await compile(), original, `${kind}: reine Datenänderungen dürfen kein Frontend-Update erzeugen`);
  }
  for (const kind of ['species', 'plants']) {
    const directory = path.join(fixture, 'public', kind + '-images');
    fs.mkdirSync(directory);
    fs.writeFileSync(path.join(directory, 'manifest.json'), JSON.stringify({ test: { title: 'Geändertes Katalogbild' } }));
    fs.copyFileSync(path.join(fixture, 'public/icon-192.png'), path.join(directory, 'test.png'));
  }
  assert.deepEqual(await compile(), original, 'Katalogbilder gehören nicht zur Frontend-Version');

  const guide = path.join(fixture, 'public/handbuch');
  fs.mkdirSync(guide, { recursive: true });
  fs.writeFileSync(path.join(guide, 'index.html'), '<h1>Geändertes öffentliches Nutzerhandbuch</h1>');
  fs.mkdirSync(path.join(guide, 'en'), { recursive: true });
  fs.writeFileSync(path.join(guide, 'en/index.html'), '<h1>Updated English user guide</h1>');
  fs.writeFileSync(path.join(guide, 'guide.css'), 'body { color: green; }');
  fs.copyFileSync(path.join(fixture, 'public/icon-192.png'), path.join(guide, 'neuer-screenshot.png'));
  assert.deepEqual(await compile(), original, 'Handbuchtexte, Gestaltung und Screenshots dürfen Frontend-Hash und Service Worker nicht ändern');

  // Keep hashing actual UI changes: ignoring catalog views would hide real updates.
  const main = path.join(fixture, 'public/frontend/main.ts'), source = fs.readFileSync(main, 'utf8');
  fs.writeFileSync(main, source + '\ndocument.documentElement.dataset.catalogIsolation = "changed-ui";\n');
  assert.notEqual((await compile()).manifest.version, original.manifest.version);
  for (const file of ['src/config/species/freshwater-popular.json', 'src/config/plants/plants.json', 'src/config/health/de/diseases-freshwater.json', 'public/species-images/manifest.json', 'public/plants-images/manifest.json']) {
    const relative = path.relative(path.dirname(main), path.join(fixture, file)).replaceAll('\\', '/');
    fs.writeFileSync(main, source + `\nimport catalog from ${JSON.stringify(relative)};\nconsole.log(catalog);\n`);
    await assert.rejects(compile(), /Katalogdaten dürfen nicht ins Frontend-Bundle importiert werden/);
  }
  fs.writeFileSync(main, source);
  const worker = path.join(fixture, 'public/frontend/worker-tasks.ts');
  fs.appendFileSync(worker, '\nimport catalog from "../../src/config/species/freshwater-popular.json";\nconsole.log(catalog);\n');
  await assert.rejects(compile(), /Katalogdaten dürfen nicht ins Frontend-Bundle importiert werden/);
});

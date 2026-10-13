'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
function checkFixture(t, source) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aquarium-backend-types-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.symlinkSync(path.join(root, 'node_modules'), path.join(dir, 'node_modules'), 'dir');
  fs.writeFileSync(path.join(dir, 'fixture.ts'), source);
  fs.writeFileSync(path.join(dir, 'tsconfig.json'), JSON.stringify({
    extends: path.join(root, 'tsconfig.backend.json'),
    compilerOptions: { rootDir: path.parse(root).root, noEmit: true },
    files: [path.join(root, 'src/types/express.d.ts')],
    include: ['fixture.ts'],
  }));
  return spawnSync(process.execPath, ['-e', 'process.exitCode = require(process.argv[1]).checkBackend(process.argv[2])', path.join(root, 'scripts/build-backend.js'), path.join(dir, 'tsconfig.json')], { encoding: 'utf8', timeout: 20000 });
}
test('Backend-Typen prüfen Express-Benutzer und Dosierpumpen', (t) => {
  const result = checkFixture(t, `import type { Request } from 'express';
    import type { DosingPumpInput } from '${path.join(root, 'src/types/domain')}';
    declare const req: Request;
    const id: number = req.user.id;
    const water: 'fresh' | 'salt' = req.aq.water_type;
    const pump: DosingPumpInput = { name:'Kanal 1', fertilizer_name:'Eisen', amount_ml:2.5,
      interval_days:1, time_of_day:null, is_active:1, note:null };
    export { id, water, pump };`);
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr);
});
test('Backend-Typen weisen ungültige API-Verträge zurück', (t) => {
  const result = checkFixture(t, `import type { Request } from 'express';
    import type { DosingPumpInput } from '${path.join(root, 'src/types/domain')}';
    declare const req: Request;
    req.user.isAdmin = 'yes';
    req.aq.water_type = 'brackish';
    const pump: DosingPumpInput = { name:'Kanal 1' };`);
  assert.ifError(result.error);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /TS2322/);
  assert.match(result.stderr, /DosingPumpInput/);
});

test('Produktionslayout läuft ohne TypeScript-Quellen oder Compiler', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aquarium-production-layout-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.cpSync(path.join(root, 'dist/backend'), path.join(dir, 'dist/backend'), { recursive: true });
  for (const file of ['server.js', 'config.js', 'oidc.js', 'version.json', 'public/index.html', 'public/icon-192.png', 'public/species-images/manifest.json', 'public/locales/de.json', 'public/locales/en.json']) {
    fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
    fs.copyFileSync(path.join(root, file), path.join(dir, file));
  }
  fs.mkdirSync(path.join(dir, 'public/dist'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'public/dist/app.js'), '// production fixture');
  fs.symlinkSync(path.join(root, 'node_modules'), path.join(dir, 'node_modules'), 'dir');
  const env = { ...process.env, DB_TYPE: 'sqlite', NO_SUPERVISOR: '1', SUPERVISOR: 'false' };
  delete env.DATA_DIR;
  delete env.LOG_FILE;
  const result = spawnSync(process.execPath, ['-e', `
    const assert = require('node:assert/strict');
    const Module = require('node:module');
    const originalLoad = Module._load;
    Module._load = function(name, ...args) {
      if (name === 'typescript' || name.startsWith('@types/')) throw new Error('Development dependency loaded: ' + name);
      return originalLoad.call(this, name, ...args);
    };
    const app = require('./server');
    const cfg = require('./config');
    const db = require('./dist/backend/src/db');
    (async () => {
      await db.init();
      assert.ok(cfg.speciesService.getAllSpecies().length > 100);
      assert.ok(cfg.suiteService.getSuites().length > 0);
      assert.equal(require('./dist/backend/src/config/env').DATA_DIR, require('node:path').join(process.cwd(), 'data'));
      const server = require('node:http').createServer(app);
      await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
      try {
        const url = 'http://127.0.0.1:' + server.address().port;
        assert.equal((await fetch(url + '/')).status, 200);
        assert.equal((await fetch(url + '/api/registration')).status, 200);
      } finally {
        await new Promise(resolve => server.close(resolve));
        await db.close();
      }
    })().catch(error => { console.error(error); process.exitCode = 1; });
  `], { cwd: dir, env, encoding: 'utf8', timeout: 20000 });
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test('Repository- und Worker-Verträge erkennen falsche Nutzdaten', (t) => {
  const result = checkFixture(t, `import type { StockRepository } from '${path.join(root, 'src/types/repositories')}';
    import { WorkerPool } from '${path.join(root, 'src/utils/worker-pool')}';
    declare const stock: StockRepository;
    stock.create({ aquarium_id: 1, species: 'Guppy', count: 'three' });
    const pool = new WorkerPool();
    pool.exec('hashPassword', { pw: 123 });
    pool.exec('missingTask', {});`);
  assert.ifError(result.error);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /TS2322/);
  assert.match(result.stderr, /missingTask/);
});

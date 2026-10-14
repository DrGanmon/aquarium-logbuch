'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');

for (const failing of ['frontend', 'backend']) {
  test(`Build bricht bei Typfehlern im ${failing} vor dem Bundling ab`, { timeout: 30000 }, (t) => {
    const root = path.resolve(__dirname, '..');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aquarium-build-check-'));
    t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
    for (const folder of ['scripts', 'public', 'src/templates', 'src/config/species', 'src/config/suites', 'src/config/health'])
      fs.mkdirSync(path.join(dir, folder), { recursive: true });
    fs.symlinkSync(path.join(root, 'node_modules'), path.join(dir, 'node_modules'), 'dir');
    for (const script of ['build.js', 'build-backend.js', 'typecheck.js'])
      fs.copyFileSync(path.join(root, 'scripts', script), path.join(dir, 'scripts', script));
    for (const target of ['frontend', 'backend']) {
      const folder = target === 'frontend' ? path.join(dir, 'public') : dir;
      const config = target === 'frontend' ? 'tsconfig.json' : 'tsconfig.backend.json';
      fs.writeFileSync(path.join(folder, config), JSON.stringify({
        compilerOptions: { strict: true, skipLibCheck: true, types: [], outDir: './dist/backend' },
        files: ['fixture.ts'],
      }));
      fs.writeFileSync(path.join(folder, 'fixture.ts'),
        `export const value: number = ${target === failing ? '"invalid"' : '1'};`);
    }
    const env = { ...process.env };
    delete env.NODE_TEST_CONTEXT;
    const result = spawnSync(process.execPath, [path.join(dir, 'scripts/build.js'), '--minify'], {
      cwd: dir, env, encoding: 'utf8', timeout: 25000,
    });
    assert.ifError(result.error);
    assert.equal(result.status, 1, result.stdout + result.stderr);
    assert.match(result.stderr, /TS2322/);
    assert.match(result.stderr, failing === 'frontend' ? /typecheck\.js fehlgeschlagen/ : /build-backend\.js fehlgeschlagen/);
    // There is deliberately no Vite config: compiler failures must stop before bundling.
    assert.doesNotMatch(result.stderr, /vite.config|ERR_MODULE_NOT_FOUND/);
    assert.equal(fs.existsSync(path.join(dir, 'public/dist')), false);
  });
}

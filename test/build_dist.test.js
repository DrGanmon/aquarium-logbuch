'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { buildFrontend } = require('../scripts/build');
const ts = require('typescript');

const rootDir = path.resolve(__dirname, '..');
const publicDir = path.join(rootDir, 'public');
const distDir = path.join(publicDir, 'dist');

const jsUnminPath = path.join(distDir, 'app.js');
const jsUnminMapPath = path.join(distDir, 'app.js.map');
const workerUnminPath = path.join(distDir, 'worker.js');
const workerUnminMapPath = path.join(distDir, 'worker.js.map');
const cssUnminPath = path.join(distDir, 'style.css');

const jsMinPath = path.join(distDir, 'app.min.js');
const jsMinMapPath = path.join(distDir, 'app.min.js.map');
const workerMinPath = path.join(distDir, 'worker.min.js');
const workerMinMapPath = path.join(distDir, 'worker.min.js.map');
const cssMinPath = path.join(distDir, 'style.min.css');

function staticGraph(entry, seen = new Set()) {
  if (seen.has(entry)) return seen;
  seen.add(entry);
  const source = ts.createSourceFile(entry, fs.readFileSync(path.join(distDir, entry), 'utf8'), ts.ScriptTarget.Latest, true);
  for (const node of source.statements) {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      assert.ok(node.moduleSpecifier.text.startsWith('./'), 'Chunk imports stay relative for subpath hosting');
      staticGraph(node.moduleSpecifier.text.slice(2), seen);
    }
  }
  return seen;
}
function verifyLazyBuild(entry) {
  const initial = staticGraph(entry);
  const bytes = [...initial].reduce((sum, file) => sum + fs.statSync(path.join(distDir, file)).size, 0);
  assert.ok(![...initial].some(file => /chunk-(AquariumView|HealthView|AdminPanel|WaterChart|ChatDialog)-/.test(file)), 'Heavy views and dialogs stay outside startup dependencies');
  if (entry.includes('.min')) assert.ok(bytes < 350000, `Initial dependency graph must remain below 350 KB (got ${bytes})`);
  const files = fs.readdirSync(distDir).filter(file => file.endsWith('.js'));
  for (const file of files) {
    const source = ts.createSourceFile(file, fs.readFileSync(path.join(distDir, file), 'utf8'), ts.ScriptTarget.Latest, true);
    function visit(node) {
      if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword && ts.isStringLiteral(node.arguments[0])) {
        assert.ok(node.arguments[0].text.startsWith('./'), 'Lazy chunks resolve relative to their importing bundle');
        assert.ok(fs.existsSync(path.join(distDir, node.arguments[0].text)), `Missing dynamic import from ${file}: ${node.arguments[0].text}`);
      }
      ts.forEachChild(node, visit);
    }
    visit(source);
  }
  const aquarium = files.find(file => file.startsWith('chunk-AquariumView-'));
  assert.ok(aquarium);
  assert.ok(![...staticGraph(aquarium)].some(file => /chunk-(WaterChart|ChatDialog|CsvDialog)-/.test(file)), 'Charts and dialogs load separately from tank details');
}

async function startAppServer() {
  delete require.cache[require.resolve('../dist/backend/src/app')];
  const app = require('../dist/backend/src/app');
  const server = require('node:http').createServer(app);
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, () => resolve());
  });
  return { server, port: server.address().port };
}

async function verifyServedBundles(port, entry) {
  const bundleRes = await fetch(`http://127.0.0.1:${port}/dist/${entry}`);
  assert.equal(bundleRes.status, 200);
  assert.ok(bundleRes.headers.get('content-type').includes('javascript'));
  assert.ok(!bundleRes.headers.get('cache-control').includes('immutable'), 'Stable entry revalidates after updates');
  await bundleRes.arrayBuffer();
  const chunk = fs.readdirSync(distDir).find(file => file.startsWith('chunk-WaterChart-') && file.endsWith('.js'));
  const chunkRes = await fetch(`http://127.0.0.1:${port}/dist/${chunk}`);
  assert.equal(chunkRes.status, 200);
  assert.ok(chunkRes.headers.get('content-type').includes('javascript'));
  assert.match(chunkRes.headers.get('cache-control'), /max-age=31536000, immutable/);
  await chunkRes.arrayBuffer();
}

function cleanDist() {
  if (fs.existsSync(distDir)) {
    const files = fs.readdirSync(distDir);
    for (const f of files) {
      if (f !== '.gitkeep') {
        fs.unlinkSync(path.join(distDir, f));
      }
    }
  } else {
    fs.mkdirSync(distDir, { recursive: true });
    fs.writeFileSync(path.join(distDir, '.gitkeep'), '');
  }
}

// Multiple real Vite builds and bundle checks exceed Bun's default 5-second limit.
test('Frontend Build vs. Dist Prozess (Unminified vs. Minified)', { timeout: 60000 }, async (t) => {
  await t.test('buildFrontend({ minify: false }) erstellt unminifiziertes Entwicklungs-Bundle (app.js, worker.js & style.css)', async () => {
    cleanDist();

    const result = await buildFrontend({ minify: false });
    assert.equal(result.isMinify, false);
    assert.equal(result.jsFile, 'app.js');
    assert.equal(result.workerFile, 'worker.js');
    assert.equal(result.cssFile, 'style.css');
    assert.ok(result.jsSize > 0, 'JS-Größe > 0');
    assert.ok(result.workerSize > 0, 'Worker-Größe > 0');
    assert.ok(result.cssSize > 0, 'CSS-Größe > 0');

    assert.ok(fs.existsSync(jsUnminPath), 'dist/app.js existiert');
    assert.ok(fs.existsSync(jsUnminMapPath), 'dist/app.js.map existiert');
    assert.ok(fs.existsSync(workerUnminPath), 'dist/worker.js existiert');
    assert.ok(fs.existsSync(workerUnminMapPath), 'dist/worker.js.map existiert');
    assert.ok(fs.existsSync(cssUnminPath), 'dist/style.css existiert');


    // Minified-Dateien dürfen nicht existieren
    assert.ok(!fs.existsSync(jsMinPath), 'dist/app.min.js existiert nicht nach unminifiziertem Build');
    assert.ok(!fs.existsSync(workerMinPath), 'dist/worker.min.js existiert nicht nach unminifiziertem Build');
    assert.ok(!fs.existsSync(cssMinPath), 'dist/style.min.css existiert nicht nach unminifiziertem Build');

    const jsContent = fs.readFileSync(jsUnminPath, 'utf8');
    const cssContent = fs.readFileSync(cssUnminPath, 'utf8');

    // Unminifiziertes JS enthält gebündelte Logik und lesbare Formatierung
    assert.ok(jsContent.includes('function') || jsContent.includes('const'), 'JS Bundle enthält unminifizierten Code');
    assert.ok(jsContent.includes('sourceMappingURL=app.js.map'), 'Source Map Link vorhanden');
    verifyLazyBuild('app.js');

    // Unminifiziertes CSS enthält Zeilenumbrüche
    assert.ok(cssContent.includes('\n'), 'CSS enthält Zeilenumbrüche');

  });

  await t.test('Express bindet unminifiziertes Bundle (dist/app.js & dist/style.css) ein, wenn nur dieses existiert', async () => {
    cleanDist();
    await buildFrontend({ minify: false });

    const { server, port } = await startAppServer();

    try {
      const res = await fetch(`http://127.0.0.1:${port}/`);
      assert.equal(res.status, 200);
      const html = await res.text();
      assert.ok(html.includes('dist/app.js'), 'HTML bindet dist/app.js ein');
      assert.ok(html.includes('dist/style.css'), 'HTML bindet dist/style.css ein');
      assert.ok(!html.includes('dist/app.min.js'), 'Kein dist/app.min.js');

      await verifyServedBundles(port, 'app.js');
    } finally {
      server.close();
    }
  });

  await t.test('buildFrontend({ minify: true }) erstellt minifiziertes Produktions-Bundle (app.min.js, worker.min.js & style.min.css)', async () => {
    cleanDist();

    const result = await buildFrontend({ minify: true });
    assert.equal(result.isMinify, true);
    assert.equal(result.jsFile, 'app.min.js');
    assert.equal(result.workerFile, 'worker.min.js');
    assert.equal(result.cssFile, 'style.min.css');
    assert.ok(result.jsSize > 0, 'JS-Größe > 0');
    assert.ok(result.workerSize > 0, 'Worker-Größe > 0');
    assert.ok(result.cssSize > 0, 'CSS-Größe > 0');

    assert.ok(fs.existsSync(jsMinPath), 'dist/app.min.js existiert');
    assert.ok(fs.existsSync(jsMinMapPath), 'dist/app.min.js.map existiert');
    assert.ok(fs.existsSync(workerMinPath), 'dist/worker.min.js existiert');
    assert.ok(fs.existsSync(workerMinMapPath), 'dist/worker.min.js.map existiert');
    assert.ok(fs.existsSync(cssMinPath), 'dist/style.min.css existiert');


    // Unminifizierte Dateien wurden bereinigt
    assert.ok(!fs.existsSync(jsUnminPath), 'dist/app.js existiert nicht nach minifiziertem Build');
    assert.ok(!fs.existsSync(workerUnminPath), 'dist/worker.js existiert nicht nach minifiziertem Build');
    assert.ok(!fs.existsSync(cssUnminPath), 'dist/style.css existiert nicht nach minifiziertem Build');

    const jsContent = fs.readFileSync(jsMinPath, 'utf8');

    assert.ok(jsContent.includes('sourceMappingURL=app.min.js.map'), 'Source Map Link vorhanden');
    verifyLazyBuild('app.min.js');

  });

  await t.test('Express bindet minifiziertes Bundle (dist/app.min.js & dist/style.min.css) bevorzugt ein', async () => {
    cleanDist();
    await buildFrontend({ minify: true });

    const { server, port } = await startAppServer();

    try {
      const res = await fetch(`http://127.0.0.1:${port}/`);
      assert.equal(res.status, 200);
      const html = await res.text();
      assert.ok(html.includes('dist/app.min.js'), 'HTML bindet dist/app.min.js ein');
      assert.ok(html.includes('dist/style.min.css'), 'HTML bindet dist/style.min.css ein');

      await verifyServedBundles(port, 'app.min.js');
    } finally {
      server.close();
    }
  });

  await t.test('Express meldet einen fehlenden Vue-Build ohne Legacy-Fallback', async () => {
    cleanDist();
    const { server, port } = await startAppServer();
    try {
      const response = await fetch(`http://127.0.0.1:${port}/`);
      assert.equal(response.status, 503);
      assert.match(await response.text(), /npm run build/);
    } finally { server.close(); }
    await buildFrontend({ minify: true });
  });

  await t.test('.gitkeep im dist-Ordner und .gitignore Konfiguration', async () => {
    const gitkeepPath = path.join(distDir, '.gitkeep');
    assert.ok(fs.existsSync(gitkeepPath), 'public/dist/.gitkeep existiert');

    const gitignorePath = path.join(rootDir, '.gitignore');
    const gitignore = fs.readFileSync(gitignorePath, 'utf8');
    assert.ok(gitignore.includes('public/dist/**'), '.gitignore enthält public/dist/**');
    assert.ok(gitignore.includes('!public/dist/**/.gitkeep'), '.gitignore schließt .gitkeep nicht aus');
  });
});

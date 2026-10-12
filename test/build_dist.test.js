'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { buildFrontend } = require('../scripts/build');

const rootDir = path.resolve(__dirname, '..');
const publicDir = path.join(rootDir, 'public');
const distDir = path.join(publicDir, 'dist');

const jsUnminPath = path.join(distDir, 'app.js');
const jsUnminMapPath = path.join(distDir, 'app.js.map');
const workerUnminPath = path.join(distDir, 'worker.js');
const workerUnminMapPath = path.join(distDir, 'worker.js.map');
const cssUnminPath = path.join(distDir, 'style.css');
const cssUnminMapPath = path.join(distDir, 'style.css.map');

const jsMinPath = path.join(distDir, 'app.min.js');
const jsMinMapPath = path.join(distDir, 'app.min.js.map');
const workerMinPath = path.join(distDir, 'worker.min.js');
const workerMinMapPath = path.join(distDir, 'worker.min.js.map');
const cssMinPath = path.join(distDir, 'style.min.css');
const cssMinMapPath = path.join(distDir, 'style.min.css.map');

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

test('Frontend Build vs. Dist Prozess (Unminified vs. Minified)', async (t) => {
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

    // Unminifiziertes CSS enthält Zeilenumbrüche
    assert.ok(cssContent.includes('\n'), 'CSS enthält Zeilenumbrüche');

  });

  await t.test('Express bindet unminifiziertes Bundle (dist/app.js & dist/style.css) ein, wenn nur dieses existiert', async () => {
    cleanDist();
    await buildFrontend({ minify: false });

    delete require.cache[require.resolve('../src/app')];
    const app = require('../src/app');

    const http = require('http');
    const server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, resolve));
    const port = server.address().port;

    try {
      const res = await fetch(`http://127.0.0.1:${port}/`);
      assert.equal(res.status, 200);
      const html = await res.text();
      assert.ok(html.includes('dist/app.js'), 'HTML bindet dist/app.js ein');
      assert.ok(html.includes('dist/style.css'), 'HTML bindet dist/style.css ein');
      assert.ok(!html.includes('dist/app.min.js'), 'Kein dist/app.min.js');

      const bundleRes = await fetch(`http://127.0.0.1:${port}/dist/app.js`);
      assert.equal(bundleRes.status, 200);
      assert.ok(bundleRes.headers.get('content-type').includes('javascript'));
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
    const cssContent = fs.readFileSync(cssMinPath, 'utf8');

    assert.ok(jsContent.includes('sourceMappingURL=app.min.js.map'), 'Source Map Link vorhanden');

  });

  await t.test('Express bindet minifiziertes Bundle (dist/app.min.js & dist/style.min.css) bevorzugt ein', async () => {
    cleanDist();
    await buildFrontend({ minify: true });

    delete require.cache[require.resolve('../src/app')];
    const app = require('../src/app');

    const http = require('http');
    const server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, resolve));
    const port = server.address().port;

    try {
      const res = await fetch(`http://127.0.0.1:${port}/`);
      assert.equal(res.status, 200);
      const html = await res.text();
      assert.ok(html.includes('dist/app.min.js'), 'HTML bindet dist/app.min.js ein');
      assert.ok(html.includes('dist/style.min.css'), 'HTML bindet dist/style.min.css ein');

      const bundleRes = await fetch(`http://127.0.0.1:${port}/dist/app.min.js`);
      assert.equal(bundleRes.status, 200);
      assert.ok(bundleRes.headers.get('content-type').includes('javascript'));
    } finally {
      server.close();
    }
  });

  await t.test('Express meldet einen fehlenden Vue-Build ohne Legacy-Fallback', async () => {
    cleanDist();
    delete require.cache[require.resolve('../src/app')];
    const server = require('http').createServer(require('../src/app'));
    await new Promise(resolve => server.listen(0, resolve));
    try {
      const response = await fetch(`http://127.0.0.1:${server.address().port}/`);
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

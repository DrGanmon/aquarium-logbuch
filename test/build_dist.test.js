'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { buildFrontend } = require('../scripts/build');

const rootDir = path.resolve(__dirname, '..');
const publicDir = path.join(rootDir, 'public');
const distDir = path.join(publicDir, 'dist');
const jsBundlePath = path.join(distDir, 'app.min.js');
const jsMapPath = path.join(distDir, 'app.min.js.map');
const cssBundlePath = path.join(distDir, 'style.min.css');
const cssMapPath = path.join(distDir, 'style.min.css.map');

test('Frontend Dist & Minification Build Prozess', async (t) => {
  await t.test('buildFrontend() kompiliert und minifiziert JavaScript und CSS erfolgreich', async () => {
    // Vorher aufräumen
    if (fs.existsSync(distDir)) {
      fs.rmSync(distDir, { recursive: true, force: true });
    }

    const result = await buildFrontend();
    assert.ok(result, 'Build-Ergebnis existiert');
    assert.ok(result.jsSize > 0, 'JS-Bundle-Größe > 0');
    assert.ok(result.cssSize > 0, 'CSS-Bundle-Größe > 0');
    assert.ok(result.duration >= 0, 'Build-Dauer ermittelt');

    // Dateien müssen existieren
    assert.ok(fs.existsSync(jsBundlePath), 'dist/app.min.js existiert');
    assert.ok(fs.existsSync(jsMapPath), 'dist/app.min.js.map existiert');
    assert.ok(fs.existsSync(cssBundlePath), 'dist/style.min.css existiert');
    assert.ok(fs.existsSync(cssMapPath), 'dist/style.min.css.map existiert');

    const jsContent = fs.readFileSync(jsBundlePath, 'utf8');
    const cssContent = fs.readFileSync(cssBundlePath, 'utf8');

    // JS Bundle enthält alle Kernmodule gebündelt
    assert.ok(jsContent.includes('Aquarium-Logbuch') || jsContent.includes('initApp'), 'JS Bundle enthält App-Code');
    assert.ok(!jsContent.includes('import { initApp'), 'ES Module-Imports wurden zu einem Bundle zusammengefasst');
    assert.ok(jsContent.includes('sourceMappingURL=app.min.js.map'), 'Source Map Link vorhanden');

    // CSS Bundle ist minifiziert
    assert.ok(cssContent.length > 5000, 'CSS Bundle enthält Styles');
    assert.ok(cssContent.includes('sourceMappingURL=style.min.css.map'), 'CSS Source Map Link vorhanden');
  });

  await t.test('Express liefert minifiziertes Dist-Bundle in index.html aus, wenn dist/ vorhanden ist', async () => {
    // Sicherstellen, dass das Bundle gebaut ist
    await buildFrontend();

    // App neu anfordern
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

      // Prüfen, ob das Bundle über Express abrufbar ist
      const bundleRes = await fetch(`http://127.0.0.1:${port}/dist/app.min.js`);
      assert.equal(bundleRes.status, 200);
      assert.ok(bundleRes.headers.get('content-type').includes('javascript'));
    } finally {
      server.close();
    }
  });

  await t.test('Express fällt automatisch auf ungebündelte Quelldateien (app.js & style.css) zurück, wenn kein dist/ existiert (z. B. npm start ohne Build)', async () => {
    // Dist-Dateien löschen, aber .gitkeep belassen
    if (fs.existsSync(jsBundlePath)) fs.unlinkSync(jsBundlePath);
    if (fs.existsSync(jsMapPath)) fs.unlinkSync(jsMapPath);
    if (fs.existsSync(cssBundlePath)) fs.unlinkSync(cssBundlePath);
    if (fs.existsSync(cssMapPath)) fs.unlinkSync(cssMapPath);

    // Sicherstellen, dass .gitkeep existiert
    if (!fs.existsSync(distDir)) fs.mkdirSync(distDir, { recursive: true });
    fs.writeFileSync(path.join(distDir, '.gitkeep'), '');

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
      assert.ok(html.includes('<script type="module" src="app.js"></script>'), 'HTML bindet app.js ein');
      assert.ok(html.includes('<link rel="stylesheet" href="style.css">'), 'HTML bindet style.css ein');
      assert.ok(!html.includes('dist/app.min.js'), 'Kein dist/app.min.js im ungebauten Modus');

      // Prüfen, ob app.js und style.css abrufbar sind
      const appJsRes = await fetch(`http://127.0.0.1:${port}/app.js`);
      assert.equal(appJsRes.status, 200);

      const styleCssRes = await fetch(`http://127.0.0.1:${port}/style.css`);
      assert.equal(styleCssRes.status, 200);
    } finally {
      server.close();
    }
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

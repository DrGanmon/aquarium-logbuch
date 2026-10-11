#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const esbuild = require('esbuild');

const rootDir = path.resolve(__dirname, '..');
const publicDir = path.join(rootDir, 'public');
const distDir = path.join(publicDir, 'dist');

async function buildFrontend(options = {}) {
  const isWatch = options.watch || process.argv.includes('--watch') || process.argv.includes('-w');
  const isMinify = options.minify !== undefined
    ? Boolean(options.minify)
    : (process.argv.includes('--minify') || process.argv.includes('--dist') || process.argv.includes('-m') || process.argv.includes('dist'));

  const startTime = Date.now();

  if (!fs.existsSync(distDir)) {
    fs.mkdirSync(distDir, { recursive: true });
  }

  const jsEntryPoint = path.join(publicDir, 'app.js');
  const cssEntryPoint = path.join(publicDir, 'style.css');

  const jsFileName = isMinify ? 'app.min.js' : 'app.js';
  const cssFileName = isMinify ? 'style.min.css' : 'style.css';

  const jsOutputFile = path.join(distDir, jsFileName);
  const cssOutputFile = path.join(distDir, cssFileName);

  // Veraltete Bundles des jeweils anderen Modus bereinigen
  const oppositeJs = path.join(distDir, isMinify ? 'app.js' : 'app.min.js');
  const oppositeJsMap = path.join(distDir, isMinify ? 'app.js.map' : 'app.min.js.map');
  const oppositeCss = path.join(distDir, isMinify ? 'style.css' : 'style.min.css');
  const oppositeCssMap = path.join(distDir, isMinify ? 'style.css.map' : 'style.min.css.map');

  if (fs.existsSync(oppositeJs)) fs.unlinkSync(oppositeJs);
  if (fs.existsSync(oppositeJsMap)) fs.unlinkSync(oppositeJsMap);
  if (fs.existsSync(oppositeCss)) fs.unlinkSync(oppositeCss);
  if (fs.existsSync(oppositeCssMap)) fs.unlinkSync(oppositeCssMap);

  console.log(`🚀 Starte Frontend-${isMinify ? 'Dist (Minified)' : 'Build (Unminified)'}...`);

  // JS Bundle Build Config
  const jsConfig = {
    entryPoints: [jsEntryPoint],
    bundle: true,
    minify: isMinify,
    sourcemap: true,
    target: ['es2022'],
    format: 'esm',
    outfile: jsOutputFile,
    logLevel: 'info',
    legalComments: isMinify ? 'inline' : 'eof',
  };

  // CSS Minification Build Config
  const cssConfig = {
    entryPoints: [cssEntryPoint],
    bundle: true,
    minify: isMinify,
    sourcemap: true,
    outfile: cssOutputFile,
    logLevel: 'info',
  };

  if (isWatch) {
    const jsCtx = await esbuild.context(jsConfig);
    const cssCtx = await esbuild.context(cssConfig);
    await Promise.all([jsCtx.watch(), cssCtx.watch()]);
    console.log(`👀 Watch-Modus aktiv (${isMinify ? 'minified' : 'unminified'}). Überwache Änderungen...`);
    return { jsCtx, cssCtx, isMinify };
  }

  // Einmaliger Build
  await Promise.all([
    esbuild.build(jsConfig),
    esbuild.build(cssConfig),
  ]);

  const jsStat = fs.statSync(jsOutputFile);
  const cssStat = fs.statSync(cssOutputFile);
  const duration = Date.now() - startTime;

  console.log(`✅ ${isMinify ? 'Dist-Build (Minified)' : 'Build (Unminified)'} erfolgreich abgeschlossen in ${duration}ms!`);
  console.log(`📦 JS Bundle:  dist/${jsFileName}   (${(jsStat.size / 1024).toFixed(1)} KB)`);
  console.log(`🎨 CSS Bundle: dist/${cssFileName} (${(cssStat.size / 1024).toFixed(1)} KB)`);

  return {
    isMinify,
    jsFile: jsFileName,
    cssFile: cssFileName,
    jsSize: jsStat.size,
    cssSize: cssStat.size,
    duration,
  };
}

if (require.main === module) {
  buildFrontend().catch((err) => {
    console.error('❌ Build fehlgeschlagen:', err);
    process.exit(1);
  });
}

module.exports = { buildFrontend };

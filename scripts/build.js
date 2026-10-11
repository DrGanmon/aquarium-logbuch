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
  const startTime = Date.now();

  if (!fs.existsSync(distDir)) {
    fs.mkdirSync(distDir, { recursive: true });
  }

  const jsEntryPoint = path.join(publicDir, 'app.js');
  const jsOutputFile = path.join(distDir, 'app.min.js');
  const cssEntryPoint = path.join(publicDir, 'style.css');
  const cssOutputFile = path.join(distDir, 'style.min.css');

  console.log('🚀 Starte Frontend-Build (Dist / Minification)...');

  // JS Bundle Build Config
  const jsConfig = {
    entryPoints: [jsEntryPoint],
    bundle: true,
    minify: true,
    sourcemap: true,
    target: ['es2022'],
    format: 'esm',
    outfile: jsOutputFile,
    logLevel: 'info',
    legalComments: 'inline',
  };

  // CSS Minification Build Config
  const cssConfig = {
    entryPoints: [cssEntryPoint],
    bundle: true,
    minify: true,
    sourcemap: true,
    outfile: cssOutputFile,
    logLevel: 'info',
  };

  if (isWatch) {
    const jsCtx = await esbuild.context(jsConfig);
    const cssCtx = await esbuild.context(cssConfig);
    await Promise.all([jsCtx.watch(), cssCtx.watch()]);
    console.log('👀 Watch-Modus aktiv. Überwache Änderungen an Frontend-Dateien...');
    return { jsCtx, cssCtx };
  }

  // Einmaliger Build
  await Promise.all([
    esbuild.build(jsConfig),
    esbuild.build(cssConfig),
  ]);

  const jsStat = fs.statSync(jsOutputFile);
  const cssStat = fs.statSync(cssOutputFile);
  const duration = Date.now() - startTime;

  console.log(`✅ Build erfolgreich abgeschlossen in ${duration}ms!`);
  console.log(`📦 JS Bundle:  dist/app.min.js   (${(jsStat.size / 1024).toFixed(1)} KB)`);
  console.log(`🎨 CSS Bundle: dist/style.min.css (${(cssStat.size / 1024).toFixed(1)} KB)`);

  return {
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

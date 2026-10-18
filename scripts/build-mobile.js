#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');

async function buildMobile() {
  const { build } = await import('vite');
  const output = path.join(root, 'dist/mobile');
  fs.rmSync(output, { recursive: true, force: true });
  await build({ configFile: path.join(root, 'vite.config.mts'), mode: 'mobile' });
  const version = require('./version').resolveVersion();
  const html = fs.readFileSync(path.join(root, 'public/index.html'), 'utf8')
    .replace('<head>', `<head>\n    <meta name="aquarium-app-version" content="${version}" />`)
    .replace('width=device-width, initial-scale=1', 'width=device-width, initial-scale=1, viewport-fit=cover')
    .replace(/\s*<link rel="manifest"[^>]+>/, '');
  fs.writeFileSync(path.join(output, 'index.html'), html);
  for (const file of ['icon-192.png', 'apple-touch-icon.png', 'favicon-16x16.png', 'favicon-32x32.png', 'favicon.ico'])
    fs.copyFileSync(path.join(root, 'public', file), path.join(output, file));
  console.log('Capacitor-Prototyp gebaut: dist/mobile (ohne Service Worker, Handbuch oder Katalogdaten).');
}
if (require.main === module) buildMobile().catch(error => { console.error(error);process.exitCode = 1; });
module.exports = { buildMobile };

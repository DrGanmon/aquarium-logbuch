#!/usr/bin/env node
"use strict";
const fs = require("node:fs");
const path = require("node:path");
async function buildFrontend(options = {}) {
  const { build } = await import("vite");
  const isMinify = options.minify ?? process.argv.includes("--minify");
  const watch = options.watch ?? process.argv.includes("--watch");
  const rootDir = path.resolve(__dirname, "..");
  const result = await build({
    configFile: path.join(rootDir, "vite.config.mts"),
    mode: isMinify ? "production" : "development",
    build: { watch: watch ? {} : null },
  });
  if (watch) return result;
  const suffix = isMinify ? ".min" : "";
  const files = {
    jsFile: `app${suffix}.js`,
    workerFile: `worker${suffix}.js`,
    cssFile: `style${suffix}.css`,
  };
  const size = (name) =>
    fs.statSync(path.join(rootDir, "public/dist", name)).size;
  return {
    isMinify,
    ...files,
    jsSize: size(files.jsFile),
    workerSize: size(files.workerFile),
    cssSize: size(files.cssFile),
  };
}
// Run independent compiler work in separate processes so both Node and Bun
// can use multiple cores. Wait for both before emitting frontend bundles.
async function buildApplication() {
  const { spawn } = require('node:child_process');
  const jobs = [
    ['typecheck.js', path.join(__dirname, '../public/tsconfig.json')],
    ['build-backend.js'],
  ];
  const children = [];
  let interrupted;
  const handlers = ['SIGINT', 'SIGTERM'].map(signal => {
    const handler = () => {
      interrupted = signal;
      for (const child of children) child.kill(signal);
    };
    process.on(signal, handler);
    return handler;
  });
  try {
    const results = await Promise.allSettled(jobs.map(([script, ...args]) =>
      new Promise((resolve, reject) => {
        const child = spawn(process.execPath, [path.join(__dirname, script), ...args], { stdio: 'inherit' });
        children.push(child);
        child.once('error', reject);
        child.once('close', (code, signal) => {
          if (code === 0) resolve();
          else reject(new Error(`${script} fehlgeschlagen (${signal || code}).`));
        });
      })
    ));
    if (interrupted) {
      process.exitCode = interrupted === 'SIGINT' ? 130 : 143;
      return;
    }
    const failures = results.filter(result => result.status === 'rejected');
    if (failures.length) throw new AggregateError(failures.map(result => result.reason), 'Build-Prüfung fehlgeschlagen.');
  } finally {
    ['SIGINT', 'SIGTERM'].forEach((signal, index) => process.removeListener(signal, handlers[index]));
  }
  return buildFrontend();
}
if (require.main === module) {
  buildApplication().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
module.exports = { buildFrontend };

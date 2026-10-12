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
if (require.main === module)
  buildFrontend().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
module.exports = { buildFrontend };

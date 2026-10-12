#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const configPath = path.join(root, 'tsconfig.backend.json');
function backendProgram(noEmit = false, project = configPath) {
  project = path.resolve(project);
  const config = ts.readConfigFile(project, ts.sys.readFile);
  if (config.error) return { diagnostics: [config.error] };
  const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, path.dirname(project), { noEmit }, project);
  const program = ts.createProgram(parsed.fileNames, parsed.options);
  return { program, diagnostics: [...parsed.errors, ...ts.getPreEmitDiagnostics(program)] };
}
function printDiagnostics(diagnostics) {
  if (diagnostics.length) console.error(ts.formatDiagnosticsWithColorAndContext(diagnostics, {
    getCurrentDirectory: () => root, getCanonicalFileName: (file) => file, getNewLine: () => '\n',
  }));
}
function checkBackend(project = configPath) {
  const { diagnostics } = backendProgram(true, project);
  printDiagnostics(diagnostics);
  return diagnostics.some((d) => d.category === ts.DiagnosticCategory.Error) ? 1 : 0;
}
function buildBackend() {
  const { program, diagnostics } = backendProgram();
  printDiagnostics(diagnostics);
  if (diagnostics.some((d) => d.category === ts.DiagnosticCategory.Error)) throw new Error('Backend-Typprüfung fehlgeschlagen.');
  fs.rmSync(path.join(root, 'dist/backend'), { recursive: true, force: true });
  const result = program.emit();
  printDiagnostics(result.diagnostics);
  if (result.emitSkipped) throw new Error('Backend-Kompilierung fehlgeschlagen.');
  // Preserve relative paths for templates and modular species/test catalogs.
  for (const directory of ['src/templates', 'src/config/species', 'src/config/suites']) {
    fs.cpSync(path.join(root, directory), path.join(root, 'dist/backend', directory), { recursive: true });
  }
  console.log('Backend kompiliert: dist/backend');
}
if (require.main === module) {
  try { if (process.argv.includes('--check')) process.exitCode = checkBackend(); else buildBackend(); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
module.exports = { buildBackend, checkBackend };

#!/usr/bin/env node
'use strict';
const path = require('node:path');

// Use the compiler API instead of vue-tsc's Node-specific module-loading patch.
// Volar maps diagnostics back to .vue scripts and templates on both runtimes.
function typecheck(project = path.join(__dirname, '../public/tsconfig.json')) {
  const ts = require('typescript');
  const vue = require('@vue/language-core');
  const { proxyCreateProgram } = require('@volar/typescript/lib/node/proxyCreateProgram');
  const configPath = path.resolve(project).replaceAll('\\', '/');
  const config = ts.readConfigFile(configPath, ts.sys.readFile);
  const vueConfig = vue.createParsedCommandLine(ts, ts.sys, configPath);
  const extensions = vue.getAllExtensions(vueConfig.vueOptions);
  const parsed = ts.parseJsonConfigFileContent(config.config || {}, ts.sys,
    path.dirname(configPath), undefined, configPath, undefined,
    extensions.map((extension) => ({ extension, isMixedContent: true, scriptKind: ts.ScriptKind.Deferred })));
  parsed.options.allowNonTsExtensions = true;
  const createProgram = proxyCreateProgram(ts, ts.createProgram, () => ({
    languagePlugins: [vue.createVueLanguagePlugin(ts, parsed.options, vueConfig.vueOptions, (id) => id)],
  }));
  const program = createProgram({ rootNames: parsed.fileNames, options: parsed.options,
    host: ts.createCompilerHost(parsed.options) });
  const diagnostics = [config.error, ...parsed.errors, ...ts.getPreEmitDiagnostics(program)].filter(Boolean);
  if (diagnostics.length) {
    console.error(ts.formatDiagnosticsWithColorAndContext(diagnostics, {
      getCurrentDirectory: () => process.cwd(), getCanonicalFileName: (file) => file,
      getNewLine: () => ts.sys.newLine,
    }));
  }
  return diagnostics.some((diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error) ? 1 : 0;
}
if (require.main === module) {
  const frontendCode = typecheck(process.argv[2]);
  const backendCode = process.argv[2] ? 0 : require('./build-backend').checkBackend();
  process.exitCode = frontendCode || backendCode;
}
module.exports = { typecheck };

#!/usr/bin/env node
'use strict';
// Compare the maintained OpenAPI document with Express routes without starting the app.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const spec = JSON.parse(fs.readFileSync(path.join(root, 'docs/api/openapi.json'), 'utf8'));
const methods = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options', 'trace'];
const expected = new Map();
const source = filename => ts.createSourceFile(filename, fs.readFileSync(filename, 'utf8'), ts.ScriptTarget.Latest, true);
function walk(node, visitor) {
  visitor(node);
  ts.forEachChild(node, child => walk(child, visitor));
}
function strings(node) {
  if (ts.isStringLiteral(node)) return [node.text];
  if (ts.isArrayLiteralExpression(node)) return node.elements.flatMap(strings);
  throw new Error('Dynamischen Routenpfad manuell in der Dokumentationsprüfung behandeln.');
}
const app = source(path.join(root, 'src/app.ts'));
const imports = new Map();
walk(app, node => {
  if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference)) {
    const name = node.moduleReference.expression.text;
    if (name.startsWith('./routes/')) imports.set(node.name.text, path.join(root, 'src', name + '.ts'));
  }
});
walk(app, node => {
  if (!ts.isCallExpression(node) || node.expression.getText(app) !== 'app.use' || node.arguments.length !== 2) return;
  const filename = imports.get(node.arguments[1].getText(app));
  if (!filename) return;
  const prefix = strings(node.arguments[0])[0];
  const file = source(filename);
  walk(file, route => {
    if (!ts.isCallExpression(route) || !ts.isPropertyAccessExpression(route.expression) || route.expression.expression.getText(file) !== 'router') return;
    const method = route.expression.name.text;
    if (!methods.includes(method) && method !== 'all') return;
    const middleware = route.arguments.slice(1, -1).map(arg => arg.getText(file));
    for (const routePath of strings(route.arguments[0])) {
      const url = (prefix + (routePath === '/' ? '' : routePath)).replace(/:(\w+)/g, '{$1}');
      for (const verb of method === 'all' ? methods : [method]) {
        const key = verb.toUpperCase() + ' ' + url;
        assert(!expected.has(key), 'Doppelt registrierte Route: ' + key);
        expected.set(key, { url, verb, middleware });
      }
    }
  });
});
assert.equal(spec.openapi, '3.0.3');
assert.equal(spec.components.securitySchemes.SessionCookie.name, 'session');
const documented = new Set();
const ids = new Set();
for (const [url, item] of Object.entries(spec.paths)) {
  for (const verb of methods) {
    const operation = item[verb];
    if (!operation) continue;
    const key = verb.toUpperCase() + ' ' + url;
    documented.add(key);
    assert(expected.has(key), 'Dokumentierte Route fehlt im Backend: ' + key);
    assert(operation.summary && operation.description, 'Beschreibung fehlt: ' + key);
    assert(operation.operationId && !ids.has(operation.operationId), 'Operation-ID fehlt/ist doppelt: ' + key);
    ids.add(operation.operationId);
    const parameters = [...(item.parameters || []), ...(operation.parameters || [])].map(parameter => {
      if (!parameter.$ref) return parameter;
      return spec.components.parameters[parameter.$ref.split('/').at(-1)];
    });
    const placeholders = [...url.matchAll(/\{(\w+)\}/g)].map(match => match[1]).sort();
    const pathParameters = parameters.filter(parameter => parameter.in === 'path');
    assert.deepEqual(pathParameters.map(parameter => parameter.name).sort(), placeholders, 'Pfadparameter passen nicht: ' + key);
    assert(pathParameters.every(parameter => parameter.required), 'Pfadparameter muss erforderlich sein: ' + key);
    if (url.startsWith('/api/') && !['get', 'head', 'options'].includes(verb)) {
      assert(parameters.some(parameter => parameter.name === 'X-Requested-With' && parameter.required), 'CSRF-Header fehlt: ' + key);
    }
    const middleware = expected.get(key).middleware;
    if (middleware.includes('auth')) {
      const security = operation.security || spec.security;
      assert(security.length && security.every(requirement => Object.hasOwn(requirement, 'SessionCookie')), 'Sitzungsschutz fehlt: ' + key);
    }
    assert(Object.keys(operation.responses).some(code => /^[23]\d\d$/.test(code)), 'Erfolgsantwort fehlt: ' + key);
  }
}
for (const key of expected.keys()) assert(documented.has(key), 'API-Dokumentation fehlt: ' + key);
function checkReferences(value) {
  if (!value || typeof value !== 'object') return;
  if (value.$ref) {
    assert(value.$ref.startsWith('#/'), 'Nur interne Referenzen sind vorgesehen.');
    const resolved = value.$ref.slice(2).split('/').reduce((current, part) => current?.[part.replace(/~1/g, '/').replace(/~0/g, '~')], spec);
    assert(resolved, 'Ungültige OpenAPI-Referenz: ' + value.$ref);
  }
  for (const child of Object.values(value)) checkReferences(child);
}
checkReferences(spec);
console.log(`API-Dokumentation geprüft: ${Object.keys(spec.paths).length} Pfade, ${documented.size} Operationen, alle Routen und Referenzen vorhanden.`);

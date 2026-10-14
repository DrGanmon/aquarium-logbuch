'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

function checkFixture(t, scriptSource, templateSource) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aquarium-typecheck-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  // Resolve the project's Vue types without installing anything in the fixture.
  fs.symlinkSync(path.resolve(__dirname, '../node_modules'), path.join(dir, 'node_modules'), 'dir');
  const scriptAttributes = 'setup lang="ts"';
  const content = [`<script ${scriptAttributes}>`, scriptSource, '</script>', `<template>${templateSource}</template>`].join('\n');
  fs.writeFileSync(path.join(dir, 'Example.vue'), content);
  fs.writeFileSync(path.join(dir, 'tsconfig.json'), JSON.stringify({
    compilerOptions: { strict: true, noEmit: true, skipLibCheck: true,
      target: 'ES2022', module: 'ESNext', moduleResolution: 'Bundler' },
    include: ['*.vue'],
  }));
  return spawnSync(process.execPath, [path.resolve(__dirname, '../scripts/typecheck.js'), path.join(dir, 'tsconfig.json')],
    { encoding: 'utf8', timeout: 20000 });
}

test('Runtime-unabhängige Typprüfung erkennt Fehler in Vue-Scripts', (t) => {
  const result = checkFixture(t, 'const count: number = "wrong";', '{{ count }}');
  assert.ifError(result.error);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /TS2322/);
  assert.match(result.stderr, /Example.vue/);
});

test('Runtime-unabhängige Typprüfung erkennt Fehler in Vue-Templates', (t) => {
  const result = checkFixture(t, 'const count = 1;', '{{ count.missingMethod() }}');
  assert.ifError(result.error);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /missingMethod/);
  assert.match(result.stderr, /Example.vue/);
});

test('Runtime-unabhängige Typprüfung akzeptiert gültige Vue-Komponenten', (t) => {
  const result = checkFixture(t, 'const count: number = 1;', '{{ count.toFixed(1) }}');
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr);
});

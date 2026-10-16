#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');

// Ignore only known development/documentation paths. Unknown files rebuild safely.
// public/handbuch is shipped in Docker, unlike docs/user-guide source files.
function isAppPath(file) {
  return !/^(?:docs\/|test\/|tools\/|\.agents\/|\.codex\/|\.idea\/|\.vscode\/)/.test(file)
    && !/^(?:[^/]+\.md|\.gitignore|\.editorconfig)$/.test(file);
}
function classifyPaths(files) {
  return {
    appChanged: files.some(isAppPath),
    checksChanged: files.some(file => isAppPath(file) || file.startsWith('test/')),
  };
}
function gitFiles(cwd, args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).split('\0').filter(Boolean);
}
function commitChanges(cwd, commit) {
  return classifyPaths(gitFiles(cwd, ['diff-tree', '--root', '--no-commit-id', '--name-only', '--no-renames', '-r', '-z', commit, '--']));
}
function detectChanges({ cwd = root, base, head = 'HEAD', pullRequest = false, force = false } = {}) {
  if (force || !base || /^0+$/.test(base)) return { appChanged: true, checksChanged: true };
  if (!/^[a-f0-9]{40,64}$/.test(base) || !(head === 'HEAD' || /^[a-f0-9]{40,64}$/.test(head))) throw new Error('Ungültige Git-Vergleichsbasis.');
  try {
    if (pullRequest) base = execFileSync('git', ['merge-base', base, head], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
    return classifyPaths(gitFiles(cwd, ['diff', '--name-only', '--no-renames', '-z', base, head, '--']));
  } catch {
    // Deleted history, force pushes or unavailable objects must never hide changes.
    return { appChanged: true, checksChanged: true };
  }
}
if (require.main === module) {
  try {
    const result = detectChanges({ base: process.env.BUILD_BASE, head: process.env.BUILD_HEAD || 'HEAD', pullRequest: process.env.BUILD_PULL_REQUEST === 'true', force: process.env.BUILD_FORCE === 'true' });
    if (process.argv.includes('--github-output')) {
      if (!process.env.GITHUB_OUTPUT) throw new Error('GITHUB_OUTPUT fehlt.');
      fs.appendFileSync(process.env.GITHUB_OUTPUT, `app_changed=${result.appChanged}\nchecks_changed=${result.checksChanged}\n`);
    }
    console.log(JSON.stringify(result));
  } catch (error) { console.error(error.message);process.exitCode = 1; }
}
module.exports = { isAppPath, classifyPaths, commitChanges, detectChanges };

#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const { commitChanges } = require('./build-changes');
const pattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([1-9]\d*))?-ALPHA$/;
function validateVersion(version) {
  if (!pattern.test(version)) throw new Error(`Ungültige Version: ${version}. Erwartet MAJOR.MINOR.REVISION[-PATCH]-ALPHA.`);
  return version;
}
function formatVersion(config) {
  for (const key of ['major', 'minor', 'revision', 'patch']) {
    if (!Number.isSafeInteger(config[key]) || config[key] < 0) throw new Error(`Ungültiger Versionszähler: ${key}`);
  }
  return validateVersion(`${config.major}.${config.minor}.${config.revision}${config.patch ? `-${config.patch}` : ''}-ALPHA`);
}
function applyCommits(config, subjects) {
  const next = { ...config };
  for (const subject of subjects) {
    if (/^feat(?:\([^\r\n)]+\))?!?:\s/i.test(subject)) { next.revision++; next.patch = 0; }
    else if (/^fix(?:\([^\r\n)]+\))?!?:\s/i.test(subject)) next.patch++;
  }
  return formatVersion(next);
}
function git(cwd, args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}
function resolveVersion({ cwd = root, override = process.env.APP_VERSION } = {}) {
  if (override) return validateVersion(override);
  const config = JSON.parse(fs.readFileSync(path.join(cwd, 'version.json'), 'utf8'));
  formatVersion(config);
  if (!/^[a-f0-9]{40,64}$/.test(config.baseCommit)) throw new Error('baseCommit muss ein vollständiger Git-Commit-Hash sein.');
  try { git(cwd, ['rev-parse', '--show-toplevel']); }
  catch { return formatVersion(config); } // Exported sources / local Docker: use the recorded baseline.
  try {
    git(cwd, ['merge-base', '--is-ancestor', config.baseCommit, 'HEAD']);
    const commits = git(cwd, ['log', '--reverse', '--topo-order', '--no-merges', '--format=%H%x00%s', `${config.baseCommit}..HEAD`]);
    const subjects = commits.split('\n').filter(Boolean).map(line => line.split('\0'))
      .filter(([commit, subject]) => /^(?:feat|fix)(?:\([^\r\n)]+\))?!?:\s/i.test(subject) && commitChanges(cwd, commit).appChanged)
      .map(([, subject]) => subject);
    return applyCommits(config, subjects);
  } catch (error) {
    throw new Error('Versionsbasis fehlt in der Git-Historie. Vollständig auschecken (fetch-depth: 0) oder APP_VERSION angeben.', { cause: error });
  }
}
function bumpManual(kind, cwd = root) {
  if (!['major', 'minor'].includes(kind)) throw new Error('Nur Major und Minor werden manuell erhöht.');
  const file = path.join(cwd, 'version.json');
  const config = JSON.parse(fs.readFileSync(file, 'utf8'));
  formatVersion(config);
  config[kind]++;
  if (kind === 'major') config.minor = 0;
  config.revision = 0;
  config.patch = 0;
  config.baseCommit = git(cwd, ['rev-parse', 'HEAD']);
  const version = formatVersion(config);
  fs.writeFileSync(file, JSON.stringify(config, null, 2) + '\n');
  for (const name of ['package.json', 'package-lock.json']) {
    const target = path.join(cwd, name);
    if (!fs.existsSync(target)) continue;
    const data = JSON.parse(fs.readFileSync(target, 'utf8'));
    data.version = version;
    if (data.packages?.['']) data.packages[''].version = version;
    fs.writeFileSync(target, JSON.stringify(data, null, 2) + '\n');
  }
  return version;
}
if (require.main === module) {
  try {
    const args = process.argv.slice(2);
    if (args.some((arg) => !['--major', '--minor', '--github-output'].includes(arg)) || (args.includes('--major') && args.includes('--minor'))) throw new Error('Aufruf: version.js [--major | --minor | --github-output]');
    const version = args.includes('--major') ? bumpManual('major') : args.includes('--minor') ? bumpManual('minor') : resolveVersion();
    if (args.includes('--github-output')) {
      if (!process.env.GITHUB_OUTPUT) throw new Error('GITHUB_OUTPUT fehlt.');
      fs.appendFileSync(process.env.GITHUB_OUTPUT, `version=${version}\n`);
    }
    console.log(version);
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
module.exports = { resolveVersion, applyCommits, formatVersion, validateVersion, bumpManual };

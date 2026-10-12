'use strict';
const fs = require('node:fs');
const path = require('node:path');
function getAppVersion() {
  const built = path.resolve(__dirname, '../../public/dist/version.json');
  if (fs.existsSync(built)) return JSON.parse(fs.readFileSync(built, 'utf8')).version;
  const version = require('../../version.json');
  return `${version.major}.${version.minor}.${version.revision}${version.patch ? `-${version.patch}` : ''}-ALPHA`;
}
module.exports = { getAppVersion };

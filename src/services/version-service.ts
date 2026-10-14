import { APP_ROOT } from '../utils/paths';
import fs = require('node:fs');
import path = require('node:path');
function getAppVersion() {
  const built = path.join(APP_ROOT, 'public/dist/version.json');
  if (fs.existsSync(built)) return JSON.parse(fs.readFileSync(built, 'utf8')).version;
  const version = JSON.parse(fs.readFileSync(path.join(APP_ROOT, 'version.json'), 'utf8'));
  return `${version.major}.${version.minor}.${version.revision}${version.patch ? `-${version.patch}` : ''}-ALPHA`;
}
export = { getAppVersion };

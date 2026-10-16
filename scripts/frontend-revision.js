'use strict';
const { createHash } = require('node:crypto');
const digest = value => createHash('sha256').update(value).digest('hex');
/** Stable content identities; deployment versions and source maps do not affect the frontend. */
function frontendRevision(files, workerSource) {
  const assets = Object.fromEntries(Object.entries(files).sort(([a], [b]) => a.localeCompare(b, 'en')).map(([name, content]) => [name, digest(content)]));
  const version = digest(JSON.stringify(assets) + '\n' + workerSource);
  // Served HTML carries this build's metadata, even when its source template is unchanged.
  assets['./'] = digest(assets['./'] + '\n' + version);
  return { schema: 1, version, assets };
}
module.exports = { frontendRevision };

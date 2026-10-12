'use strict';
// Stable launcher for both runtimes. Application code is compiled from server.ts.
const fs = require('node:fs');
const path = require('node:path');
const compiled = path.join(__dirname, 'dist/backend/server.js');
if (!fs.existsSync(compiled)) {
  throw new Error('Backend fehlt. Bitte npm run build:backend oder bun run build:backend:bun ausführen.');
}
const app = require(compiled);
if (require.main === module) app.startServer();
module.exports = app;

'use strict';
const app = require('./src/app');
const { PORT } = require('./src/config/env');

if (require.main === module) {
  app.listen(PORT, () => console.log(`Aquarium-Logbuch läuft auf http://localhost:${PORT}`));
}

module.exports = app;

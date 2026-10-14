'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { createTestEnvironment } = require('./helpers/env');

test('Cleanup wartet auch ohne HTTP-Start auf das SQLite-Migrationsbackup', async () => {
  const env = createTestEnvironment({ DB_TYPE: 'sqlite' });
  const db = require('../dist/backend/src/db');
  const directory = env.getDataDir();

  await env.cleanup();

  assert.equal(db.db, null, 'Die SQLite-Verbindung muss geschlossen sein');
  assert.equal(fs.existsSync(directory), false, 'Das Testverzeichnis muss entfernt sein');
});

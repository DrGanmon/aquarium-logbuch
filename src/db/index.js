'use strict';
const { DB_TYPE, MONGODB_URI, MONGODB_DB_NAME, DATA_DIR } = require('../config/env');
const SqliteAdapter = require('./sqlite-adapter');
const MongoAdapter = require('./mongo-adapter');

let dbInstance = null;

function createDb(options = {}) {
  const type = (options.type || DB_TYPE || 'sqlite').toLowerCase();
  if (type === 'mongodb' || type === 'mongo') {
    return new MongoAdapter({
      uri: options.uri || MONGODB_URI,
      dbName: options.dbName || MONGODB_DB_NAME,
      ...options,
    });
  }
  return new SqliteAdapter({
    dataDir: options.dataDir || DATA_DIR,
    dbPath: options.dbPath,
    ...options,
  });
}

function getDb() {
  if (!dbInstance) {
    dbInstance = createDb();
    // For SQLite, initialize immediately if synchronous setup is needed
    if (dbInstance.type === 'sqlite') {
      dbInstance.init();
    }
  }
  return dbInstance;
}

const db = getDb();
db.createDb = createDb;

module.exports = db;

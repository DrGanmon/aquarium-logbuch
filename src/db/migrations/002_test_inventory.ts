export = {
  version: 2,
  name: '002_test_inventory',
  async up(db?: any, context: any = {}) {
    if (context.type === 'mongodb' || typeof db.collection === 'function') {
      await db.collection('users').updateMany(
        { test_inventory: { $exists: false } },
        { $set: { test_inventory: '{}' } },
      );
    } else if (!db.prepare('PRAGMA table_info(users)').all().some((column: any) => column.name === 'test_inventory')) {
      db.exec("ALTER TABLE users ADD COLUMN test_inventory TEXT NOT NULL DEFAULT '{}'");
    }
  },
};

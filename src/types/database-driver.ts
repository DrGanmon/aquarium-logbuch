import type SQLite from 'better-sqlite3';
import type { Collection, Db, Document } from 'mongodb';
/** Raw SQL columns and custom backup fields are dynamic; repository contracts type their consumers. */
export type SqliteConnection = Omit<SQLite.Database, 'prepare'> & {
  prepare<Row = Record<string, any>>(sql: string): SQLite.Statement<unknown[], Row>;
};
/** This application uses numeric document IDs and string counter IDs, not default ObjectIds. */
export interface StoredDocument extends Document { _id?: number | string }
export type MongoConnection = Omit<Db, 'collection'> & {
  collection<T extends Document = StoredDocument>(name: string): Collection<T>;
};

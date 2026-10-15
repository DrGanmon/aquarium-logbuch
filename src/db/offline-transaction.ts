import { AsyncLocalStorage } from 'node:async_hooks';
import Database = require('better-sqlite3');
import type { ClientSession } from 'mongodb';
interface Context { root: object; sqlite?: any; session?: ClientSession; commit: (() => unknown)[]; rollback: (() => unknown)[] }
const context = new AsyncLocalStorage<Context>();
const locks = new WeakMap<object, Promise<unknown>>();
export const offlineTransactionActive = () => Boolean(context.getStore());
export function afterOfflineCommit(callback: () => unknown) { const current = context.getStore();if (!current) return false;current.commit.push(callback);return true; }
export function afterOfflineRollback(callback: () => unknown) { context.getStore()?.rollback.push(callback); }
/** Repository closures retain this proxy; each call selects the transaction-local connection. */
export function offlineConnection<T extends object>(root: T, type: 'sqlite' | 'mongodb'): T {
  return new Proxy(root, { get(target: any, key) {
    if (type === 'sqlite') {
      const current = context.getStore();
      const connection = current?.root === root ? current.sqlite : target;
      const value = connection[key];return typeof value === 'function' ? value.bind(connection) : value;
    }
    if (key !== 'collection') { const value = target[key];return typeof value === 'function' ? value.bind(target) : value; }
    return (...args: any[]) => {
      const collection = target.collection(...args);
      return new Proxy(collection, { get(object, name) {
        const value = object[name];if (typeof value !== 'function') return value;
        return (...inputs: any[]) => {
          const current = context.getStore();
          const indexes: Record<string, number> = { find: 1, findOne: 1, insertOne: 1, insertMany: 1, updateOne: 2, updateMany: 2, replaceOne: 2, deleteOne: 1, deleteMany: 1, findOneAndUpdate: 2, findOneAndDelete: 1, findOneAndReplace: 2, aggregate: 1, countDocuments: 1, bulkWrite: 1, distinct: 2 };
          const index = indexes[String(name)];
          if (current?.root === root && current.session && index !== undefined) inputs[index] = { ...inputs[index], session: current.session };
          return value.apply(object, inputs);
        };
      } });
    };
  } });
}
export async function offlineAtomic<T>(adapter: { type: string; getRawDb(): any; dbPath?: string; client?: any }, work: () => Promise<T>): Promise<T> {
  const root = adapter.getRawDb();
  const previous = locks.get(root) || Promise.resolve();
  let release!: () => void;
  const lock = new Promise<void>(resolve => { release = resolve; });locks.set(root, lock);
  await previous.catch(() => {});
  const current: Context = { root, commit: [], rollback: [] };
  let sqlite: any, session: ClientSession | undefined;
  try {
    let result: T;
    if (adapter.type === 'sqlite') {
      sqlite = adapter.dbPath === ':memory:' ? root : new Database(adapter.dbPath!);
      sqlite.pragma('foreign_keys = ON');sqlite.pragma('busy_timeout = 5000');
      current.sqlite = sqlite;sqlite.exec('BEGIN IMMEDIATE');
      result = await context.run(current, work);
      sqlite.exec('COMMIT');
    } else {
      session = adapter.client.startSession();current.session = session;
      result = (await session!.withTransaction(async () => {
        for (const cleanup of current.rollback.splice(0)) await cleanup();current.commit = [];
        return context.run(current, work);
      }))!;
    }
    for (const callback of current.commit) { try { await callback(); } catch { /* Committed data must not be replayed because cleanup failed. */ } }
    return result;
  } catch (error) {
    if (sqlite?.inTransaction) sqlite.exec('ROLLBACK');
    for (const cleanup of current.rollback) { try { await cleanup(); } catch { /* Best effort orphan cleanup. */ } }
    throw error;
  } finally {
    if (sqlite && sqlite !== root) sqlite.close();
    await session?.endSession();release();
  }
}

import { createHmac, randomBytes } from 'node:crypto';
import fs = require('node:fs');
import path = require('node:path');
import Database = require('better-sqlite3');
import env = require('../config/env');
import rateLimit = require('../utils/rate-limit');

const { WINDOW_MS, MAX_KEYS, MAX_LIMIT } = rateLimit;
type ControllerRequest = { type: 'rate-limit:controller-request'; requestId: string; operation: 'check-and-note' | 'clear'; key: string; limit?: number };

export class RateLimitStore {
  private readonly db: Database.Database;
  private readonly secret: Buffer;
  private lastPruned = 0;

  constructor(options: { filename?: string; secret?: string } = {}) {
    const filename = options.filename || path.join(env.DATA_DIR, 'rate-limits.sqlite');
    const secret = options.secret || process.env.RATE_LIMIT_CONTROLLER_SECRET || '';
    if (!/^[a-f0-9]{64}$/i.test(secret)) throw new Error('RATE_LIMIT_CONTROLLER_SECRET muss 32 zufällige Bytes als Hex enthalten.');
    this.secret = Buffer.from(secret, 'hex');
    fs.mkdirSync(path.dirname(filename), { recursive: true });
    this.db = new Database(filename);
    if (filename !== ':memory:') fs.chmodSync(filename, 0o600);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('synchronous = FULL');
    this.db.pragma('busy_timeout = 5000');
    this.db.exec(`CREATE TABLE IF NOT EXISTS rate_limit_attempts (key_hash TEXT NOT NULL, happened_at INTEGER NOT NULL);
      CREATE INDEX IF NOT EXISTS idx_rate_limit_key_time ON rate_limit_attempts(key_hash, happened_at);
      CREATE INDEX IF NOT EXISTS idx_rate_limit_time ON rate_limit_attempts(happened_at);`);
  }

  private hash(key: string): string { return createHmac('sha256', this.secret).update(key, 'utf8').digest('hex'); }

  checkAndNote(key: string, limit: number, now = Date.now()): boolean {
    const keyHash = this.hash(key);
    return this.db.transaction(() => {
      if (now - this.lastPruned >= 60000) {
        this.db.prepare('DELETE FROM rate_limit_attempts WHERE happened_at <= ?').run(now - WINDOW_MS);
        this.lastPruned = now;
      }
      const countRow = this.db.prepare('SELECT COUNT(*) AS count FROM rate_limit_attempts WHERE key_hash = ? AND happened_at > ?').get(keyHash, now - WINDOW_MS) as { count?: number } | undefined;
      const count = Number(countRow?.count || 0);
      if (count >= limit) return true;
      if (count === 0) {
        const keysRow = this.db.prepare('SELECT COUNT(DISTINCT key_hash) AS count FROM rate_limit_attempts').get() as { count?: number } | undefined;
        const keys = Number(keysRow?.count || 0);
        if (keys >= MAX_KEYS) {
          const oldest = this.db.prepare('SELECT key_hash FROM rate_limit_attempts GROUP BY key_hash ORDER BY MAX(happened_at) ASC LIMIT 1').get() as { key_hash?: string } | undefined;
          if (oldest?.key_hash) this.db.prepare('DELETE FROM rate_limit_attempts WHERE key_hash = ?').run(oldest.key_hash);
        }
      }
      this.db.prepare('INSERT INTO rate_limit_attempts (key_hash, happened_at) VALUES (?, ?)').run(keyHash, now);
      return false;
    })();
  }

  clear(key: string): void { this.db.prepare('DELETE FROM rate_limit_attempts WHERE key_hash = ?').run(this.hash(key)); }
  close(): void { this.db.close(); }
}

function validRequest(message: unknown): message is ControllerRequest {
  if (!message || typeof message !== 'object') return false;
  const msg = message as Partial<ControllerRequest>;
  return msg.type === 'rate-limit:controller-request'
    && typeof msg.requestId === 'string' && msg.requestId.length >= 1 && msg.requestId.length <= 160
    && (msg.operation === 'check-and-note' || msg.operation === 'clear')
    && typeof msg.key === 'string' && msg.key.length >= 1 && msg.key.length <= 1024 && !msg.key.includes('\0')
    && (msg.operation === 'clear' || (Number.isSafeInteger(msg.limit) && Number(msg.limit) >= 1 && Number(msg.limit) <= MAX_LIMIT));
}

export function runRateLimitController(): void {
  process.umask(0o077);
  const store = new RateLimitStore();
  const pipeMode = process.env.RATE_LIMIT_CONTROLLER_PIPE === '1';
  const send = (message: object) => {
    if (pipeMode) process.stdout.write(`${JSON.stringify(message)}\n`);
    else if (typeof process.send === 'function' && process.connected) process.send(message);
  };
  const handle = (message: unknown) => {
    if (!validRequest(message)) return;
    try {
      if (message.operation === 'clear') { store.clear(message.key);send({ type: 'rate-limit:controller-response', requestId: message.requestId, ok: true }); }
      else send({ type: 'rate-limit:controller-response', requestId: message.requestId, blocked: store.checkAndNote(message.key, message.limit!) });
    } catch {
      send({ type: 'rate-limit:controller-response', requestId: message.requestId, error: 'controller-error' });
      setImmediate(() => process.exit(1));
    }
  };
  let keepAlive: ReturnType<typeof setInterval> | undefined;
  const shutdown = () => { if (keepAlive) clearInterval(keepAlive);store.close();process.exit(0); };
  if (pipeMode) {
    process.stdin.setEncoding('utf8');
    let input = '';
    process.stdin.on('data', (chunk: string) => {
      input += chunk;
      if (input.length > 1024 * 1024) process.exit(1);
      let newline;
      while ((newline = input.indexOf('\n')) >= 0) {
        const line = input.slice(0, newline);input = input.slice(newline + 1);
        if (!line || line.length > 4096) continue;
        try { handle(JSON.parse(line)); } catch { /* Invalid parent input is ignored without exposing details. */ }
      }
    });
    process.stdin.resume();
    // Node does not keep a child alive solely for a piped stdin stream.
    keepAlive = setInterval(() => {}, 60000);
    process.stdin.once('end', shutdown);
  } else process.on('message', handle);
  process.once('SIGTERM', shutdown);process.once('SIGINT', shutdown);
  send({ type: 'rate-limit:controller-ready', pid: process.pid });
}

if (require.main === module || process.env.IS_RATE_LIMIT_CONTROLLER === '1') runRateLimitController();
export function loadControllerSecret(dataDir = env.DATA_DIR): string {
  const filename = path.join(dataDir, 'rate-limit-controller.key');
  if (!fs.existsSync(filename)) {
    fs.mkdirSync(path.dirname(filename), { recursive: true });
    const temporary = `${filename}.${process.pid}.${randomBytes(8).toString('hex')}.tmp`;
    const fd = fs.openSync(temporary, 'wx', 0o600);
    try { fs.writeFileSync(fd, randomBytes(32).toString('hex') + '\n');fs.fsyncSync(fd); }
    finally { fs.closeSync(fd); }
    try { fs.linkSync(temporary, filename); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error; }
    finally { fs.unlinkSync(temporary); }
  }
  fs.chmodSync(filename, 0o600);
  const secret = fs.readFileSync(filename, 'utf8').trim();
  if (!/^[a-f0-9]{64}$/i.test(secret)) throw new Error('rate-limit-controller.key enthält keinen gültigen Schlüssel.');
  return secret;
}

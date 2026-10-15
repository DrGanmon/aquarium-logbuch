import { createCipheriv, createDecipheriv, randomBytes, scrypt } from 'node:crypto';
import { encryptSecret, decryptSecret } from './app-crypto';
import { AppError } from '../utils/app-error';

const MAGIC = Buffer.from('AQLBENC1');
const KEY_CONTEXT = 'aquarium-backup-key:v1';
const PASSWORD_CONTEXT = 'aquarium-backup-password:v1';
const SETTINGS = 'app_secrets';

export function validateBackupPassword(password: unknown): asserts password is string {
  if (typeof password !== 'string' || password.length < 12 || password.length > 1024)
    throw new AppError('Das Backup-Passwort muss 12 bis 1024 Zeichen enthalten.', 400);
}

// Available before schema migrations as well; this store is deliberately excluded from exports/restores.
export async function readBackupPassword(db: any): Promise<string | null> {
  let row;
  if (typeof db.collection === 'function') row = await db.collection(SETTINGS).findOne({ _id: 'backup-password' });
  else {
    if (!db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name = ?").get(SETTINGS)) return null;
    row = db.prepare(`SELECT value FROM ${SETTINGS} WHERE id = ?`).get('backup-password');
  }
  return row ? decryptSecret(row.value, PASSWORD_CONTEXT) : null;
}

export async function saveBackupPassword(db: any, password: unknown): Promise<void> {
  validateBackupPassword(password);
  const value = encryptSecret(password, PASSWORD_CONTEXT);
  if (typeof db.collection === 'function') await db.collection(SETTINGS).updateOne({ _id: 'backup-password' }, { $set: { value } }, { upsert: true });
  else {
    db.exec(`CREATE TABLE IF NOT EXISTS ${SETTINGS} (id TEXT PRIMARY KEY, value TEXT NOT NULL)`);
    db.prepare(`INSERT INTO ${SETTINGS} (id, value) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET value = excluded.value`).run('backup-password', value);
  }
}

function deriveKey(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => scrypt(password, salt, 32, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }, (error, key) => error ? reject(error) : resolve(key)));
}

export function isEncryptedBackup(data: Buffer): boolean { return data.subarray(0, MAGIC.length).equals(MAGIC); }

function parseArchive(data: Buffer) {
  if (!isEncryptedBackup(data) || data.length < 12) throw new Error('Ungültiges Backup-Format.');
  const length = data.readUInt32BE(8);
  if (length > 4096 || length < 2 || data.length < 12 + length + 16) throw new Error('Ungültiges Backup-Format.');
  const aad = data.subarray(0, 12 + length);
  const header = JSON.parse(data.subarray(12, 12 + length).toString('utf8'));
  if (!['password', 'app'].includes(header.mode) || typeof header.salt !== 'string' || Buffer.from(header.salt, 'base64url').length !== 16 || typeof header.iv !== 'string' || Buffer.from(header.iv, 'base64url').length !== 12 || typeof header.localKey !== 'string') throw new Error('Ungültiges Backup-Format.');
  return { header, aad, ciphertext: data.subarray(aad.length, -16), tag: data.subarray(-16) };
}

function decryptWithKey(data: Buffer, key: Buffer): Buffer {
  const { header, aad, ciphertext, tag } = parseArchive(data);
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(header.iv, 'base64url'));
  decipher.setAAD(aad);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

// The app-wrapped archive key keeps local restore/privacy cleanup possible after password changes.
// It never exposes the key without the separately held APP_ENCRYPTION_KEY.
export function decryptLocalBackup(data: Buffer): Buffer {
  if (!isEncryptedBackup(data)) return data;
  const { header } = parseArchive(data);
  return decryptWithKey(data, Buffer.from(decryptSecret(header.localKey, KEY_CONTEXT), 'base64url'));
}

export async function decryptBackup(data: Buffer, password?: unknown): Promise<Buffer> {
  if (!isEncryptedBackup(data)) return data;
  try {
    if (password === undefined || password === '') return decryptLocalBackup(data);
    validateBackupPassword(password);
    const { header } = parseArchive(data);
    if (header.mode !== 'password') throw new Error();
    return decryptWithKey(data, await deriveKey(password, Buffer.from(header.salt, 'base64url')));
  } catch { throw new AppError('Backup kann nicht entschlüsselt werden. Passwort bzw. App-Schlüssel prüfen; möglicherweise ist die Datei beschädigt.', 400); }
}

function encryptWithKey(data: Buffer, key: Buffer, mode: string, salt: Buffer): Buffer {
  const iv = randomBytes(12);
  const header = Buffer.from(JSON.stringify({ mode, salt: salt.toString('base64url'), iv: iv.toString('base64url'), localKey: encryptSecret(key.toString('base64url'), KEY_CONTEXT) }));
  const size = Buffer.alloc(4); size.writeUInt32BE(header.length);
  const aad = Buffer.concat([MAGIC, size, header]);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(aad);
  return Buffer.concat([aad, cipher.update(data), cipher.final(), cipher.getAuthTag()]);
}

export async function encryptBackup(data: Buffer, password: string | null): Promise<Buffer> {
  const salt = randomBytes(16);
  return encryptWithKey(data, password === null ? randomBytes(32) : await deriveKey(password, salt), password === null ? 'app' : 'password', salt);
}

export function rewriteLocalBackup(original: Buffer, data: Buffer): Buffer {
  if (!isEncryptedBackup(original)) {
    // Historical plaintext archives become encrypted when privacy cleanup rewrites them.
    return encryptWithKey(data, randomBytes(32), 'app', randomBytes(16));
  }
  const { header } = parseArchive(original);
  return encryptWithKey(data, Buffer.from(decryptSecret(header.localKey, KEY_CONTEXT), 'base64url'), header.mode, Buffer.from(header.salt, 'base64url'));
}

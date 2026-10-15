import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import fs = require('node:fs');
import path = require('node:path');
import env = require('../config/env');

const KEY_FILE = path.join(env.DATA_DIR, 'app-encryption.key');

export function encryptionKey(create: boolean): Buffer {
  const configured = process.env.APP_ENCRYPTION_KEY?.trim() || process.env.AI_TOKEN_ENCRYPTION_KEY?.trim();
  if (configured) {
    if (!/^[a-fA-F0-9]{64}$/.test(configured)) throw new Error('APP_ENCRYPTION_KEY muss 64 Hex-Zeichen (32 zufällige Bytes) enthalten.');
    return Buffer.from(configured, 'hex');
  }
  const legacyFile = path.join(env.DATA_DIR, 'ai-token-encryption.key');
  if (!fs.existsSync(KEY_FILE) && fs.existsSync(legacyFile)) {
    try { fs.linkSync(legacyFile, KEY_FILE); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error; }
  }
  if (!fs.existsSync(KEY_FILE) && create) {
    fs.mkdirSync(path.dirname(KEY_FILE), { recursive: true });
    // Publish a complete file atomically; concurrent workers must never read a partial key.
    const temporary = `${KEY_FILE}.${process.pid}.${randomBytes(8).toString('hex')}.tmp`;
    const fd = fs.openSync(temporary, 'wx', 0o600);
    try {
      fs.fchmodSync(fd, 0o600);
      fs.writeFileSync(fd, randomBytes(32).toString('hex') + '\n');
      fs.fsyncSync(fd);
    } finally { fs.closeSync(fd); }
    try { fs.linkSync(temporary, KEY_FILE); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error; }
    finally { fs.unlinkSync(temporary); }
  }
  if (!fs.existsSync(KEY_FILE)) throw new Error('App-Verschlüsselungsschlüssel fehlt. APP_ENCRYPTION_KEY oder die ursprüngliche app-encryption.key wiederherstellen.');
  const key = fs.readFileSync(KEY_FILE, 'utf8').trim();
  if (!/^[a-fA-F0-9]{64}$/.test(key)) throw new Error('Die Datei app-encryption.key enthält keinen gültigen Verschlüsselungsschlüssel.');
  fs.chmodSync(KEY_FILE, 0o600);
  return Buffer.from(key, 'hex');
}


export function encryptSecret(value: string, context: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(true), iv);
  cipher.setAAD(Buffer.from(context));
  const data = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return ['app:v1', iv.toString('base64url'), data.toString('base64url'), cipher.getAuthTag().toString('base64url')].join(':');
}

export function decryptSecret(value: string, context: string): string {
  try {
    const parts = value.split(':');
    if (parts.length !== 5 || parts[0] !== 'app' || parts[1] !== 'v1') throw new Error();
    const iv = Buffer.from(parts[2], 'base64url'), tag = Buffer.from(parts[4], 'base64url');
    if (iv.length !== 12 || tag.length !== 16) throw new Error();
    const decipher = createDecipheriv('aes-256-gcm', encryptionKey(false), iv);
    decipher.setAAD(Buffer.from(context));
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(Buffer.from(parts[3], 'base64url')), decipher.final()]).toString('utf8');
  } catch { throw new Error('App-Geheimnis kann nicht entschlüsselt werden. Ursprünglichen APP_ENCRYPTION_KEY prüfen.'); }
}

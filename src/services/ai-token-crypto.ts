import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import fs = require('node:fs');
import path = require('node:path');
import env = require('../config/env');
import type { UserRecord } from '../types/domain';

export const AI_PROVIDERS = ['openai', 'gemini', 'claude'] as const;
export type AiProvider = typeof AI_PROVIDERS[number];
const PREFIX = 'ai-key:v1:';
const KEY_FILE = path.join(env.DATA_DIR, 'ai-token-encryption.key');

function encryptionKey(create: boolean): Buffer {
  const configured = process.env.AI_TOKEN_ENCRYPTION_KEY?.trim();
  if (configured) {
    if (!/^[a-fA-F0-9]{64}$/.test(configured)) throw new Error('AI_TOKEN_ENCRYPTION_KEY muss 64 Hex-Zeichen (32 zufällige Bytes) enthalten.');
    return Buffer.from(configured, 'hex');
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
  if (!fs.existsSync(KEY_FILE)) throw new Error('KI-Verschlüsselungsschlüssel fehlt. AI_TOKEN_ENCRYPTION_KEY oder die ursprüngliche ai-token-encryption.key wiederherstellen.');
  const key = fs.readFileSync(KEY_FILE, 'utf8').trim();
  if (!/^[a-fA-F0-9]{64}$/.test(key)) throw new Error('Die Datei ai-token-encryption.key enthält keinen gültigen Verschlüsselungsschlüssel.');
  fs.chmodSync(KEY_FILE, 0o600);
  return Buffer.from(key, 'hex');
}

function context(userId: number, provider: AiProvider): Buffer {
  if (!Number.isSafeInteger(userId) || userId < 1) throw new Error('Ungültige Benutzer-ID für KI-Verschlüsselung.');
  return Buffer.from(`aquarium-personal-ai-key:v1:${userId}:${provider}`, 'utf8');
}

export function decryptAiToken(value: string, userId: number, provider: AiProvider): string {
  if (!value.startsWith(PREFIX)) throw new Error('Persönlicher KI-Schlüssel ist nicht verschlüsselt.');
  try {
    const parts = value.slice(PREFIX.length).split(':');
    if (parts.length !== 3 || parts.some(part => !/^[A-Za-z0-9_-]+$/.test(part))) throw new Error('Ungültiges Format.');
    const [iv, encrypted, tag] = parts.map(part => Buffer.from(part, 'base64url'));
    if (iv.length !== 12 || tag.length !== 16 || !encrypted.length) throw new Error('Ungültiges Format.');
    const decipher = createDecipheriv('aes-256-gcm', encryptionKey(false), iv);
    decipher.setAAD(context(userId, provider));
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
  } catch {
    // Do not include ciphertext, keys, provider responses or OpenSSL internals in logs/errors.
    throw new Error('Persönlicher KI-Schlüssel kann nicht entschlüsselt werden. Ursprünglichen Verschlüsselungsschlüssel prüfen.');
  }
}

function encryptAiToken(value: string, userId: number, provider: AiProvider): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(true), iv);
  cipher.setAAD(context(userId, provider));
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return PREFIX + [iv, encrypted, cipher.getAuthTag()].map(part => part.toString('base64url')).join(':');
}

/** For writes/imports: retain validated ciphertext, encrypt plaintext, derive hints atomically. */
export function encryptPersonalAiFields(userId: number, fields: Partial<UserRecord>): Partial<UserRecord> {
  const result = { ...fields };
  // Validate all encrypted values before creating a key or modifying any data.
  for (const provider of AI_PROVIDERS) {
    const value = fields[`${provider}_api_key`];
    if (typeof value === 'string' && value.startsWith('ai-key:')) decryptAiToken(value, userId, provider);
  }
  for (const provider of AI_PROVIDERS) {
    const field = `${provider}_api_key` as const;
    const value = fields[field];
    if (value === undefined) {
      delete result[`${provider}_api_key_prefix`];
      delete result[`${provider}_api_key_suffix`];
      continue;
    }
    if (value !== null && typeof value !== 'string') throw new Error('Ungültiger persönlicher KI-Schlüssel.');
    const token = value?.startsWith('ai-key:') ? decryptAiToken(value, userId, provider) : value?.trim() || null;
    result[field] = token ? (value?.startsWith(PREFIX) ? value : encryptAiToken(token, userId, provider)) : null;
    result[`${provider}_api_key_prefix`] = token ? token.slice(0, 4) : null;
    result[`${provider}_api_key_suffix`] = token ? token.slice(-4) : null;
  }
  return result;
}

/** Decrypt only for the provider request, never for profile/administration serialization. */
export function personalAiToken(user: Partial<UserRecord> | null | undefined, provider: AiProvider): string {
  const value = user?.[`${provider}_api_key`];
  if (!value) return '';
  return decryptAiToken(value, Number(user?.id), provider);
}

export function personalAiMask(user: Partial<UserRecord>, provider: AiProvider, serverKey: string): string | null {
  if (!user[`${provider}_api_key`]) return serverKey ? 'Über Server konfiguriert' : null;
  const prefix = user[`${provider}_api_key_prefix`] || '';
  const suffix = user[`${provider}_api_key_suffix`] || '';
  // Short keys still keep their identification fields, but never reveal the entire token in the UI.
  const encryptedPart = user[`${provider}_api_key`]?.slice(PREFIX.length).split(':')[1] || '';
  const hintBytes = Buffer.byteLength(prefix, 'utf8') + Buffer.byteLength(suffix, 'utf8');
  return Buffer.from(encryptedPart, 'base64url').length > hintBytes && prefix.length === 4 && suffix.length === 4 ? `${prefix}...${suffix}` : '***';
}

'use strict';
import crypto = require('crypto');
import { promisify } from 'util';
import worker_poolModule = require('./worker-pool');
const { workerPool } = worker_poolModule;

const scryptAsync = promisify(crypto.scrypt) as (password: crypto.BinaryLike, salt: crypto.BinaryLike, keylen: number) => Promise<Buffer>;
const sha = (s: crypto.BinaryLike) => crypto.createHash('sha256').update(s).digest('hex');

function hashPasswordSync(pw: string) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(pw, salt, 64);
  return `${salt.toString('hex')}:${hash.toString('hex')}`;
}

async function hashPassword(pw: string) {
  const salt = crypto.randomBytes(16);
  const hash = await scryptAsync(pw, salt, 64);
  return `${salt.toString('hex')}:${hash.toString('hex')}`;
}

function verifyPasswordSync(pw: string, stored: string | null | undefined) {
  const [saltHex, hashHex] = String(stored || '').split(':');
  if (!saltHex || !hashHex) return false;
  const hash = crypto.scryptSync(pw, Buffer.from(saltHex, 'hex'), 64);
  return crypto.timingSafeEqual(hash, Buffer.from(hashHex, 'hex'));
}

async function verifyPassword(pw: string, stored: string | null | undefined) {
  const [saltHex, hashHex] = String(stored || '').split(':');
  if (!saltHex || !hashHex) return false;
  try {
    const hash = await scryptAsync(pw, Buffer.from(saltHex, 'hex'), 64);
    return crypto.timingSafeEqual(hash, Buffer.from(hashHex, 'hex'));
  } catch (e) {
    return false;
  }
}

const DUMMY_HASH = hashPasswordSync('dummy-password-for-timing');

function hasLocalPassword(userOrId?: { password_hash?: string | null } | string | null, db: unknown = null) {
  if (userOrId && typeof userOrId === 'object') {
    return !!(userOrId.password_hash && userOrId.password_hash.includes(':'));
  }
  if (typeof userOrId === 'string' && userOrId.includes(':')) {
    return true;
  }
  return false;
}

export = {
  sha,
  hashPassword,
  hashPasswordSync,
  verifyPassword,
  verifyPasswordSync,
  DUMMY_HASH,
  hasLocalPassword,
};

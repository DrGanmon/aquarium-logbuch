'use strict';
const crypto = require('crypto');
const { promisify } = require('util');
const { workerPool } = require('./worker-pool');

const scryptAsync = promisify(crypto.scrypt);
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');

function hashPasswordSync(pw) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(pw, salt, 64);
  return `${salt.toString('hex')}:${hash.toString('hex')}`;
}

async function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  const hash = await scryptAsync(pw, salt, 64);
  return `${salt.toString('hex')}:${hash.toString('hex')}`;
}

function verifyPasswordSync(pw, stored) {
  const [saltHex, hashHex] = String(stored || '').split(':');
  if (!saltHex || !hashHex) return false;
  const hash = crypto.scryptSync(pw, Buffer.from(saltHex, 'hex'), 64);
  return crypto.timingSafeEqual(hash, Buffer.from(hashHex, 'hex'));
}

async function verifyPassword(pw, stored) {
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

function hasLocalPassword(userOrId, db = null) {
  if (userOrId && typeof userOrId === 'object') {
    return !!(userOrId.password_hash && userOrId.password_hash.includes(':'));
  }
  if (typeof userOrId === 'string' && userOrId.includes(':')) {
    return true;
  }
  return false;
}

module.exports = {
  sha,
  hashPassword,
  hashPasswordSync,
  verifyPassword,
  verifyPasswordSync,
  DUMMY_HASH,
  hasLocalPassword,
};

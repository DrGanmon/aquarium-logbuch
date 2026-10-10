'use strict';
const crypto = require('crypto');

const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');

function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(pw, salt, 64);
  return `${salt.toString('hex')}:${hash.toString('hex')}`;
}

function verifyPassword(pw, stored) {
  const [saltHex, hashHex] = String(stored || '').split(':');
  if (!saltHex || !hashHex) return false; // Konto ohne lokales Passwort (nur OIDC)
  const hash = crypto.scryptSync(pw, Buffer.from(saltHex, 'hex'), 64);
  return crypto.timingSafeEqual(hash, Buffer.from(hashHex, 'hex'));
}

const DUMMY_HASH = hashPassword('dummy-password-for-timing');

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
  verifyPassword,
  DUMMY_HASH,
  hasLocalPassword,
};

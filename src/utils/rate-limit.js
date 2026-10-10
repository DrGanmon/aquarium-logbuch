'use strict';

// Einfache Begrenzung gegen Passwort-Raten
const attempts = new Map();

function tooManyAttempts(key) {
  const now = Date.now();
  const rec = (attempts.get(key) || []).filter((t) => now - t < 15 * 60 * 1000);
  attempts.set(key, rec);
  return rec.length >= 8;
}

function noteAttempt(key) {
  attempts.set(key, [...(attempts.get(key) || []), Date.now()]);
}

function clearAttempts(key) {
  attempts.delete(key);
}

module.exports = {
  tooManyAttempts,
  noteAttempt,
  clearAttempts,
};

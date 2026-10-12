'use strict';

// Einfache Begrenzung gegen Passwort-Raten
const attempts = new Map<string, number[]>();

function tooManyAttempts(key: string) {
  const now = Date.now();
  const rec = (attempts.get(key) || []).filter((t: number) => now - t < 15 * 60 * 1000);
  attempts.set(key, rec);
  return rec.length >= 8;
}

function noteAttempt(key: string) {
  attempts.set(key, [...(attempts.get(key) || []), Date.now()]);
}

function clearAttempts(key: string) {
  attempts.delete(key);
}

export = {
  tooManyAttempts,
  noteAttempt,
  clearAttempts,
};

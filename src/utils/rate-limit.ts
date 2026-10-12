const WINDOW_MS = 15 * 60 * 1000;
const MAX_KEYS = 10000;
let lastPruned = 0;
const attempts = new Map<string, number[]>();
function prune(now: number): void {
  for (const [key, times] of attempts) {
    if (!times.length || times[times.length - 1] <= now - WINDOW_MS) attempts.delete(key);
  }
}
function tooManyAttempts(key: string, limit = 8): boolean {
  const now = Date.now();
  const recent = (attempts.get(key) || []).filter(time => now - time < WINDOW_MS);
  if (recent.length) attempts.set(key, recent); else attempts.delete(key);
  return recent.length >= limit;
}
function noteAttempt(key: string, limit = 8): void {
  const now = Date.now();
  if (now - lastPruned >= 60000) { prune(now); lastPruned = now; }
  if (!attempts.has(key) && attempts.size >= MAX_KEYS) attempts.delete(attempts.keys().next().value!);
  const recent = (attempts.get(key) || []).filter(time => now - time < WINDOW_MS);
  attempts.set(key, [...recent.slice(-Math.max(1, limit - 1)), now]);
}
function clearAttempts(key: string): void { attempts.delete(key); }
export = { tooManyAttempts, noteAttempt, clearAttempts };

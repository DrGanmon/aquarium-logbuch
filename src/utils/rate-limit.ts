const WINDOW_MS = 15 * 60 * 1000;
const MAX_KEYS = 10000;
const MAX_LIMIT = 1000;
const IPC_TIMEOUT_MS = 2000;
type Operation = 'check-and-note' | 'clear';
type Reply = { type: 'rate-limit:response'; requestId: string; blocked?: boolean; ok?: boolean; error?: string };
const attempts = new Map<string, number[]>();
const pending = new Map<string, { resolve: (reply: Reply) => void; timer: ReturnType<typeof setTimeout> }>();
let requestCounter = 0;
let lastPruned = 0;
let listenerBound = false;
function prune(now: number): void {
  for (const [key, times] of attempts) {
    if (!times.length || times[times.length - 1] <= now - WINDOW_MS) attempts.delete(key);
  }
}
function localCheckAndNote(key: string, limit: number): boolean {
  const now = Date.now();
  if (now - lastPruned >= 60000) { prune(now); lastPruned = now; }
  const recent = (attempts.get(key) || []).filter(time => now - time < WINDOW_MS);
  if (recent.length >= limit) { attempts.set(key, recent); return true; }
  if (!attempts.has(key) && attempts.size >= MAX_KEYS) attempts.delete(attempts.keys().next().value!);
  attempts.set(key, [...recent.slice(-Math.max(1, limit - 1)), now]);
  return false;
}

function bindListener(): void {
  if (listenerBound) return;
  listenerBound = true;
  process.on('message', (message: unknown) => {
    if (!message || typeof message !== 'object') return;
    const reply = message as Partial<Reply>;
    if (reply.type !== 'rate-limit:response' || typeof reply.requestId !== 'string') return;
    const entry = pending.get(reply.requestId);
    if (!entry) return;
    pending.delete(reply.requestId);
    clearTimeout(entry.timer);
    entry.resolve(reply as Reply);
  });
}

function validKey(key: string): boolean { return typeof key === 'string' && key.length >= 1 && key.length <= 1024 && !key.includes('\0'); }
function validLimit(limit: number): boolean { return Number.isSafeInteger(limit) && limit >= 1 && limit <= MAX_LIMIT; }

async function remote(operation: Operation, key: string, limit?: number): Promise<Reply> {
  bindListener();
  const requestId = `${process.pid}-${Date.now().toString(36)}-${(++requestCounter).toString(36)}`;
  return new Promise(resolve => {
    const timer = setTimeout(() => {
      pending.delete(requestId);
      resolve({ type: 'rate-limit:response', requestId, error: 'controller-timeout' });
    }, IPC_TIMEOUT_MS);
    timer.unref?.();
    pending.set(requestId, { resolve, timer });
    try { process.send!({ type: 'rate-limit:request', requestId, operation, key, limit }); }
    catch {
      clearTimeout(timer);pending.delete(requestId);
      resolve({ type: 'rate-limit:response', requestId, error: 'controller-unavailable' });
    }
  });
}

/** Atomically checks and reserves one attempt. Controller failures fail closed. */
async function checkAndNoteAttempt(key: string, limit = 8): Promise<boolean> {
  if (!validKey(key) || !validLimit(limit)) return true;
  if (process.env.IS_SUPERVISED_WORKER === '1' && typeof process.send === 'function') {
    const reply = await remote('check-and-note', key, limit);
    return reply.error ? true : reply.blocked !== false;
  }
  return localCheckAndNote(key, limit);
}

async function clearAttempts(key: string): Promise<void> {
  if (!validKey(key)) return;
  if (process.env.IS_SUPERVISED_WORKER === '1' && typeof process.send === 'function') { await remote('clear', key);return; }
  attempts.delete(key);
}

export = { checkAndNoteAttempt, clearAttempts, WINDOW_MS, MAX_KEYS, MAX_LIMIT };

import { activeOwner, readLocal, writeLocal, cacheable, offlineState } from './offline-store';
import { session, language, t } from "./state";
export class ApiError extends Error {
  constructor(message: string, public readonly status: number, public readonly code?: string) {
    super(message);this.name = 'ApiError';
  }
}
export interface RequestOptions {
  method?: string;
  body?: unknown;
  signal?: AbortSignal;
}
export async function api<T>(
  path: string,
  { method = "GET", body, signal }: RequestOptions = {},
): Promise<T> {
  const owner = session.user?.id ?? await activeOwner().catch(() => undefined);
  const cacheKey = `${owner}:${path === "/me" ? "identity" : language.value}:${path}`;
  let response: Response;
  try {
    response = await fetch("api" + path, {
      method,
      signal,
      headers: {
        "Content-Type": "application/json",
        "X-Requested-With": "fetch",
        "X-Language": language.value,
      },
      credentials: "same-origin",
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    offlineState.offline = false;
  } catch (error) {
    if (error instanceof TypeError && !signal?.aborted) {
      offlineState.offline = true;
      if (method === 'GET' && owner) {
        if (path === '/setup/status') return { required: false } as T;
        if (cacheable(path)) {
          const cached = await readLocal<T>(cacheKey).catch(() => undefined);
          if (cached !== undefined) return cached;
        }
      }
    }
    throw error;
  }
  if (response.ok && method === 'GET' && cacheable(path) && path !== '/me' && owner && response.headers.get('X-Aquarium-User') !== String(owner)) {
    await writeLocal('activeOwner', undefined).catch(() => {});
    session.user = null;
    throw new ApiError(t('offline.accountChanged'), 409);
  }
  const data: unknown = await response.json().catch(() => ({}));
  if (response.status === 401 && !["/login", "/register", "/me"].includes(path))
    session.user = null;
  if (response.status === 428 && session.user) session.user.termsRequired = true;
  if (response.status === 413) throw new Error(t('social.uploadTooLarge'));
  if (response.status === 401) await writeLocal('activeOwner', undefined).catch(() => {});
  if (!response.ok)
    throw new ApiError(
      typeof data === "object" && data && "error" in data
        ? String(data.error)
        : `HTTP ${response.status}`,
      response.status,
      typeof data === 'object' && data && 'code' in data && typeof data.code === 'string' ? data.code : undefined,
    );
  if (method === 'GET' && cacheable(path)) {
    const dataOwner = path === '/me' ? (data as { id?: number }).id : owner;
    if (dataOwner) {
      if (path === '/me') await writeLocal('activeOwner', dataOwner).catch(() => {});
      await writeLocal(`${dataOwner}:${path === "/me" ? "identity" : language.value}:${path}`, data).catch(() => {});
    }
  }
  return data as T;
}
export async function refreshSession() {
  session.user = await api<import("./types").User>("/me");
  if (session.user.language) language.value = session.user.language;
  session.config = await api<import("./types").AppConfig>("/config");
}

/** Read application progress separately from the final AI reply. */
export async function chatRequest(path: string, body: unknown, signal: AbortSignal, onStatus: (stage: string) => void): Promise<{ reply: string }> {
  const response = await fetch('api' + path, {
    method: 'POST', signal, credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'fetch', 'X-Language': language.value },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    if (response.status === 401) session.user = null;
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || `HTTP ${response.status}`);
  }
  if (!response.body) throw new Error(tMissingResponse());
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let pending = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      pending += decoder.decode(value, { stream: !done });
      const lines = pending.split('\n');pending = lines.pop() || '';
      for (const line of lines) {
        if (!line.trim()) continue;
        const event = JSON.parse(line);
        if (event.type === 'status' && typeof event.stage === 'string') onStatus(event.stage);
        else if (event.type === 'error') throw new Error(event.error);
        else if (event.type === 'done' && typeof event.reply === 'string') return { reply: event.reply };
      }
      if (done) throw new Error(tMissingResponse());
    }
  } finally { await reader.cancel().catch(() => {});reader.releaseLock(); }
}
function tMissingResponse() { return language.value === 'en' ? 'The AI response was interrupted. Please try again.' : 'Die KI-Antwort wurde unterbrochen. Bitte erneut versuchen.'; }

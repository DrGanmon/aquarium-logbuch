import { readWorkspace, enqueueWorkspace, localDiagnosis } from './offline-workspace';
import { readOfflineCatalog } from './offline-catalogs';
import { CatalogLookupError } from '../../src/shared/offline-catalog-query';
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
  networkOnly?: boolean;
}
export async function api<T>(
  path: string,
  { method = "GET", body, signal, networkOnly = false }: RequestOptions = {},
): Promise<T> {
  const requestOwner = session.user?.id;
  const storedOwner = await activeOwner().catch(() => session.user?.id);
  if (session.user && storedOwner !== session.user.id && !['/login', '/register'].includes(path)) {
    // Another tab may have signed out or switched accounts while this tab stayed open.
    session.user = null;session.config = null;
    throw new ApiError(t('offline.accountChanged'), 409);
  }
  const owner = session.user?.id ?? storedOwner;
  if (method === 'GET' && owner) {
    try {
      const local = await readOfflineCatalog(path, language.value, signal);
      if (local !== undefined) return local as T;
    } catch (error) {
      if (error instanceof CatalogLookupError) throw new ApiError(error.message, error.status);
      if (signal?.aborted) throw error;
      // A storage failure must not prevent ordinary online requests.
    }
  }
  if (owner && !networkOnly && !path.startsWith('/offline/')) {
    if (method !== 'GET') {
      const diagnosis = !navigator.onLine ? await localDiagnosis(Number(owner), language.value, path, body) : undefined;
      if (diagnosis !== undefined) return diagnosis as T;
      const queued = await enqueueWorkspace(Number(owner), language.value, path, method, body);
      if (queued) { window.dispatchEvent(new Event('aquarium-outbox-changed'));return queued.result as T; }
    } else if (path !== '/me' && (!path.startsWith('/notifications') || !navigator.onLine)) {
      const local = await readWorkspace(Number(owner), language.value, path);
      if (local !== undefined) return local as T;
    }
  }
  const cacheKey = `${owner}:${path === "/me" ? "identity" : language.value}:${path}`;
  let response: Response;
  const request = () => fetch("api" + path, {
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
  try {
    response = await request();
    offlineState.offline = false;
  } catch (error) {
    if (error instanceof TypeError && !signal?.aborted) {
      offlineState.offline = true;
      if (method === 'POST' && owner) {
        const diagnosis = await localDiagnosis(Number(owner), language.value, path, body);
        if (diagnosis !== undefined) return diagnosis as T;
      }
      if (method === 'GET' && owner) {
        const workspace = await readWorkspace(Number(owner), language.value, path);
        if (workspace !== undefined) return workspace as T;
        if (path === '/setup/status') return { required: false } as T;
        if (cacheable(path)) {
          const cached = await readLocal<T>(cacheKey).catch(() => undefined);
          if (cached !== undefined) return cached;
        }
      }
    }
    if (!(error instanceof TypeError) || signal?.aborted) throw error;
    if (networkOnly) throw new ApiError(language.value === 'en' ? 'The client is offline.' : 'Der Client ist gerade offline.', 0, 'OFFLINE');
    response = await (await import('./online-request')).retryOnlineRequest(request, signal, method !== 'GET', requestOwner);
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
    throw Object.assign(new ApiError(
      typeof data === "object" && data && "error" in data
        ? String(data.error)
        : `HTTP ${response.status}`,
      response.status,
      typeof data === 'object' && data && 'code' in data && typeof data.code === 'string' ? data.code : undefined,
    ), { conflict: typeof data === 'object' && data && 'conflict' in data ? data.conflict : undefined });
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

/** Streaming AI support is loaded only when a conversation is started. */
export async function chatRequest(path: string, body: unknown, signal: AbortSignal, onStatus: (stage: string) => void): Promise<{ reply: string }> {
  return (await import('./chat-request')).chatRequest(path, body, signal, onStatus);
}

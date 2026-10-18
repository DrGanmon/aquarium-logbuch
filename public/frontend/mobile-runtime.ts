/** Mobile-only bootstrap. This module is never imported by the web entry. */
export function normalizeServer(value: string): string {
  const url = new URL(value.trim());
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash)
    throw new Error('Bitte eine HTTPS-Serveradresse ohne Zugangsdaten, Query oder Fragment eingeben.');
  url.pathname = url.pathname.replace(/\/+$/, '') + '/';
  return url.href;
}

export function serverRequestUrl(input: string | URL | Request, server: string, localBase: string): string {
  const value = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  const url = new URL(value, localBase);
  const local = new URL(localBase);
  if (url.origin !== local.origin) return url.href;
  const basePath = new URL('.', local).pathname;
  if (!url.pathname.startsWith(basePath)) return url.href;
  const relative = url.pathname.slice(basePath.length);
  if (!/^(api(?:\/|$)|species-images\/|plants-images\/)/.test(relative)) return url.href;
  return new URL(relative + url.search, server).href;
}

export function installServerTransport(server: string) {
  const base = normalizeServer(server);
  if (document.documentElement.dataset.mobileServer)
    throw new Error('Zum Serverwechsel bitte die App neu laden.');
  document.documentElement.dataset.mobile = 'true';
  document.documentElement.dataset.mobileServer = base;
  // Capture Capacitor's patched fetch, retaining its native cookie jar. Do not
  // patch backend authentication, CORS or the web client's transport.
  const nativeFetch = window.fetch.bind(window);
  window.fetch = (input, init) => {
    const target = serverRequestUrl(input, base, document.baseURI);
    const original = typeof input === 'string' ? new URL(input, document.baseURI).href : input instanceof URL ? input.href : input.url;
    const targetUrl = new URL(target), serverUrl = new URL(base);
    const trusted = targetUrl.origin === serverUrl.origin && targetUrl.pathname.startsWith(serverUrl.pathname)
      && !targetUrl.username && !targetUrl.password
      && /^(api(?:\/|$)|species-images\/|plants-images\/)/.test(targetUrl.pathname.slice(serverUrl.pathname.length));
    if (target === original && !trusted) return nativeFetch(input, init);
    const signal = init?.signal ?? (input instanceof Request ? input.signal : undefined);
    signal?.throwIfAborted();
    const request = nativeFetch(input instanceof Request ? new Request(target, input) : target, { ...init, credentials: 'include' })
      .catch(error => {
        if (signal?.aborted) throw signal.reason;
        // Native network failures are ordinary Error objects. Match fetch's
        // TypeError contract so existing offline fallback and retries apply.
        throw error instanceof TypeError ? error : new TypeError('Native Serververbindung fehlgeschlagen.', { cause: error });
      });
    if (!signal) return request;
    // Native POST cannot currently be cancelled at the socket. Ignore late
    // results after abort; queued mutations retain their operation IDs.
    return new Promise<Response>((resolve, reject) => {
      const abort = () => reject(signal.reason);
      signal.addEventListener('abort', abort, { once: true });
      if (signal.aborted) abort();
      request.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
    });
  };
}

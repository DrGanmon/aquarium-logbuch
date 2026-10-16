/// <reference lib="webworker" />
export {};
const scope = self as unknown as ServiceWorkerGlobalScope;
interface Timer {
  type: string;
  timerId: string;
  testKey?: string;
  testName?: string;
  aquariumName?: string;
  waitSec?: number;
  endTime: number;
  url: string;
}
// Build-time values include all lazy chunks so previously unopened views work offline.
const offlineAssets: string[] = /* OFFLINE_ASSETS */ [];
const offlineRevisions: Record<string, string> = /* OFFLINE_REVISIONS */ {};
const offlineBuild: string = /* OFFLINE_BUILD */ 'dev';
const shellPrefix = `aquarium-shell:${scope.registration.scope}:`;
const shellCache = shellPrefix + offlineBuild;
const shellUrls = new Set(offlineAssets.map(asset => new URL(asset, scope.registration.scope).href));
const activeTimers = new Map<string, ReturnType<typeof setTimeout>>();
const revisionUrl = new URL('__frontend_revisions__', scope.registration.scope).href;
const clientsUrl = new URL('__frontend_clients__', scope.registration.scope).href;
let clientUpdates = Promise.resolve();
async function shellNames() { return (await caches.keys()).filter(name => name.startsWith(shellPrefix)); }
scope.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(shellCache);
    const previous = await Promise.all((await shellNames()).filter(name => name !== shellCache).reverse().map(async name => {
      const cache = await caches.open(name);
      const revisions = await cache.match(revisionUrl);
      return { cache, revisions: revisions ? await revisions.json() as Record<string, string> : {} };
    }));
    await Promise.all(offlineAssets.map(async asset => {
      const url = new URL(asset, scope.registration.scope).href;
      for (const old of previous) {
        if (offlineRevisions[asset] && old.revisions[asset] === offlineRevisions[asset]) {
          const response = await old.cache.match(url);
          if (response) { await cache.put(url, response);return; }
        }
      }
      await cache.add(new Request(url, { cache: 'no-cache' }));
    }));
    await cache.put(revisionUrl, new Response(JSON.stringify(offlineRevisions)));
    // Updates wait for user confirmation; first installation activates normally.
  })());
});
async function rememberClient(id: string, version: string, prune = true) {
  const cache = await caches.open(shellCache), saved = await cache.match(clientsUrl);
  const versions: Record<string, string> = saved ? await saved.json() : {};
  versions[id] = version;
  if (!prune) { await cache.put(clientsUrl, new Response(JSON.stringify(versions)));return; }
  const windows = (await scope.clients.matchAll({ type: 'window', includeUncontrolled: true })).filter(client => client.url.startsWith(scope.registration.scope));
  const active = new Set(windows.map(client => client.id));
  for (const key of Object.keys(versions)) if (!active.has(key)) delete versions[key];
  await cache.put(clientsUrl, new Response(JSON.stringify(versions)));
  // Unknown tabs may still use an old build. Keep their caches until they identify themselves.
  if (windows.some(client => !versions[client.id])) return;
  const keep = new Set([shellCache, ...Object.values(versions).map(version => shellPrefix + version)]);
  for (const name of await shellNames()) {
    // A different worker may already be preparing its cache or waiting for approval.
    if (scope.registration.installing || scope.registration.waiting) return;
    if (!keep.has(name)) await caches.delete(name);
  }
}
scope.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    if (!(await scope.clients.matchAll({ type: 'window', includeUncontrolled: true })).length) {
      for (const name of await shellNames()) if (name !== shellCache) await caches.delete(name);
    }
    await scope.clients.claim();
  })());
});
scope.addEventListener("message", (event: ExtendableMessageEvent) => {
  const data = event.data as Timer & { version?: string };
  if (!data?.type) return;
  if (data.type === 'GET_FRONTEND_VERSION') {
    event.source?.postMessage({ type: 'FRONTEND_VERSION', version: offlineBuild });
    return;
  }
  if (data.type === 'ACTIVATE_UPDATE') {
    if (data.version === offlineBuild) event.waitUntil(scope.skipWaiting());
    return;
  }
  if (data.type === 'CLIENT_VERSION') {
    if (data.version && /^[a-f0-9]{64}$/.test(data.version) && event.source && 'id' in event.source) {
      const id = event.source.id, version = data.version;
      clientUpdates = clientUpdates.catch(() => {}).then(() => rememberClient(id, version));
      event.waitUntil(clientUpdates);
    }
    return;
  }
  if (data.type === "SCHEDULE_TIMER") {
    clearTimeout(activeTimers.get(data.timerId));
    const timeout = setTimeout(
      () => {
        activeTimers.delete(data.timerId);
        const base = new URL("./", scope.location.href);
        void scope.registration
          .showNotification(
            `⏱️ ${data.testName || "Wassertest"}: Wartezeit abgelaufen!`,
            {
              body: `Die Wartezeit für „${data.aquariumName || "Aquarium"}“ ist vorbei. Bitte jetzt ablesen.`,
              icon: new URL("icon-192.png", base).href,
              badge: new URL("favicon-32x32.png", base).href,
              tag: `aquarium-timer-${data.timerId}`,
              requireInteraction: true,
              data: { url: data.url || base.href },
            },
          )
          .catch(() => {});
      },
      Math.max(0, data.endTime - Date.now()),
    );
    activeTimers.set(data.timerId, timeout);
  } else if (data.type === "CANCEL_TIMER") {
    clearTimeout(activeTimers.get(data.timerId));
    activeTimers.delete(data.timerId);
  } else if (data.type === "CLEAR_ALL_TIMERS") {
    for (const timer of activeTimers.values()) clearTimeout(timer);
    activeTimers.clear();
  }
});
scope.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url as string | undefined;
  event.waitUntil(
    (async () => {
      const clients = await scope.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      const client = clients.find((client) => client.url === url);
      if (client) {
        await (client as WindowClient).focus();
      } else if (url) {
        await scope.clients.openWindow(url);
      }
    })(),
  );
});

// User data is stored separately in IndexedDB, never in the shared shell cache.
scope.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== scope.location.origin) return;
  const privateBase = new URL('./', scope.registration.scope).pathname;
  const privatePath = url.pathname.startsWith(privateBase) ? url.pathname.slice(privateBase.length) : '';
  if (/^api\/(?:me\/avatar|aquariums\/-?\d+\/(?:image|images\/-?\d+|stock\/-?\d+\/image))$/.test(privatePath)) {
    event.respondWith((async () => {
      let database: IDBDatabase | undefined;
      const open = () => new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open(`aquarium-offline:${privateBase}`, 1);
        request.onupgradeneeded = () => {
          if (!request.result.objectStoreNames.contains('records')) request.result.createObjectStore('records');
          if (!request.result.objectStoreNames.contains('outbox')) request.result.createObjectStore('outbox', { keyPath: 'id' });
        };
        request.onsuccess = () => resolve(request.result);request.onerror = () => reject(request.error);
      });
      const read = (key: string) => new Promise<any>((resolve, reject) => {
        const request = database!.transaction('records').objectStore('records').get(key);
        request.onsuccess = () => resolve(request.result);request.onerror = () => reject(request.error);
      });
      try {
        database = await open();
        const owner = await read('activeOwner');
        const pendingId = owner ? await read(`private-image:${owner}:${privatePath.slice(4)}:pending`) : undefined;
        const pending = pendingId ? await new Promise<any>((resolve, reject) => {
          const request = database!.transaction('outbox').objectStore('outbox').get(pendingId);
          request.onsuccess = () => resolve(request.result);request.onerror = () => reject(request.error);
        }) : undefined;
        if (owner && pending?.owner === owner) {
          const local = await read(`private-image:${owner}:${privatePath.slice(4)}`);
          if (local instanceof Blob) { database.close();return new Response(local, { headers: { 'Content-Type': local.type, 'Cache-Control': 'no-store' } }); }
        }
        try {
          const response = await fetch(request);
          if (owner && response.ok && response.headers.get('X-Aquarium-User') === String(owner) && response.headers.get('Content-Type')?.startsWith('image/')) {
            const copy = response.clone();
            event.waitUntil((async () => {
              const blob = await copy.blob();
              if (await read('activeOwner') !== owner) return;
              await new Promise<void>((resolve, reject) => {
                const tx = database!.transaction('records', 'readwrite');
                tx.objectStore('records').put(blob, `private-image:${owner}:${privatePath.slice(4)}`);
                tx.oncomplete = () => resolve();tx.onabort = () => reject(tx.error);
              });
            })().catch(() => {}).finally(() => database?.close()));
          } else database?.close();
          return response;
        } catch {
          if (!owner) { database?.close();return Response.error(); }
          const blob = await read(`private-image:${owner}:${privatePath.slice(4)}`);
          database?.close();
          return blob instanceof Blob ? new Response(blob, { headers: { 'Content-Type': blob.type, 'Cache-Control': 'no-store' } }) : Response.error();
        }
      } catch { database?.close();return fetch(request); }
    })());
    return;
  }
  const basePath = new URL('./', scope.registration.scope).pathname;
  const imagePath = url.pathname.startsWith(basePath) ? url.pathname.slice(basePath.length) : '';
  if (/^(species-images|plants-images)\/[^/]+\.(webp|png|jpe?g|avif)$/i.test(imagePath)) {
    event.respondWith((async () => {
      const cache = await caches.open(`aquarium-catalog-images:${scope.registration.scope}`);
      try {
        const response = await fetch(request);
        if (response.ok && response.headers.get('Content-Type')?.startsWith('image/') && Number(response.headers.get('Content-Length') || 0) <= 2 * 1024 * 1024) {
          const copy = response.clone();
          event.waitUntil((async () => {
            await cache.put(request, copy);
            const keys = await cache.keys();
            for (const key of keys.slice(0, Math.max(0, keys.length - 200))) await cache.delete(key);
          })().catch(() => {}));
        }
        return response;
      } catch {
        return (await cache.match(request)) || Response.error();
      }
    })());
    return;
  }
  if (request.mode === 'navigate' && (url.pathname === new URL('./', scope.registration.scope).pathname || url.pathname === new URL('index.html', scope.registration.scope).pathname)) {
    event.respondWith((async () => {
      const id = event.resultingClientId || event.clientId;
      if (id) {
        clientUpdates = clientUpdates.catch(() => {}).then(() => rememberClient(id, offlineBuild, false));
        await clientUpdates;
      }
      const cached = await (await caches.open(shellCache)).match(scope.registration.scope);
      return cached || fetch(request);
    })());
  } else if (shellUrls.has(url.href) || (url.pathname.startsWith(basePath + 'dist/') && /\.(js|css)$/.test(url.pathname))) {
    event.respondWith((async () => {
      const cache = await caches.open(shellCache);
      const clients = event.clientId ? await cache.match(clientsUrl) : undefined;
      const version = clients ? (await clients.json())[event.clientId] : undefined;
      const current = await (version && /^[a-f0-9]{64}$/.test(version) ? await caches.open(shellPrefix + version) : cache).match(request);
      if (current) return current;
      // Lazy imports in other open tabs can still refer to their previous build's chunks.
      for (const name of await shellNames()) {
        const previous = await (await caches.open(name)).match(request);
        if (previous) return previous;
      }
      return fetch(request);
    })());
  }
});

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
const offlineBuild: string = /* OFFLINE_BUILD */ 'dev';
const shellPrefix = `aquarium-shell:${scope.registration.scope}:`;
const shellCache = shellPrefix + offlineBuild;
const shellUrls = new Set(offlineAssets.map(asset => new URL(asset, scope.registration.scope).href));
const activeTimers = new Map<string, ReturnType<typeof setTimeout>>();
scope.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(shellCache);
    await cache.addAll([...shellUrls].map(url => new Request(url, { cache: 'reload' })));
    await scope.skipWaiting();
  })());
});
scope.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    for (const name of await caches.keys()) if (name.startsWith(shellPrefix) && name !== shellCache) await caches.delete(name);
    await scope.clients.claim();
  })());
});
scope.addEventListener("message", (event: ExtendableMessageEvent) => {
  const data = event.data as Timer;
  if (!data?.type) return;
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
    event.respondWith(fetch(request).catch(async () => {
      const cached = await (await caches.open(shellCache)).match(scope.registration.scope);
      return cached || Response.error();
    }));
  } else if (shellUrls.has(url.href)) {
    event.respondWith((async () => (await (await caches.open(shellCache)).match(request)) || fetch(request))());
  }
});

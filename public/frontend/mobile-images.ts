import { watch } from 'vue';
import { session } from './state';
import { activeOwner, readLocal, pendingFor, writeCatalogImage } from './offline-store';
import { serverRequestUrl } from './mobile-runtime';

const privateImage = /^api\/(?:me\/avatar|aquariums\/-?\d+\/(?:image|images\/-?\d+|plant-images\/-?\d+|stock\/-?\d+\/image))$/;
const catalogImage = /^(species-images|plants-images)\/[^/]+\.(webp|png|jpe?g|avif)$/i;
const socialImage = /^api\/social\/(?:posts\/\d+\/image|authors\/\d+\/avatar)$/;

/** Restrict native authenticated image loads to known resources of this server. */
export function mobileImageResource(source: string): { path: string; request: string; kind: 'private' | 'catalog' | 'social' } | undefined {
  const server = document.documentElement.dataset.mobileServer;
  if (!server) return;
  const base = new URL(server);
  const url = new URL(serverRequestUrl(source, server, document.baseURI));
  if (url.origin !== base.origin || !url.pathname.startsWith(base.pathname) || url.username || url.password) return;
  const path = url.pathname.slice(base.pathname.length);
  const kind = privateImage.test(path) ? 'private' : catalogImage.test(path) ? 'catalog' : socialImage.test(path) ? 'social' : undefined;
  if (kind) return { path, request: path + url.search, kind };
}

export async function loadMobileImage(source: string, owner: number | undefined, signal: AbortSignal): Promise<Blob> {
  const resource = mobileImageResource(source);
  if (!resource) throw new Error('Unbekannter Bildpfad.');
  const isPrivate = resource.kind === 'private';
  const key = isPrivate ? `private-image:${owner}:${resource.path.slice(4)}` : `catalog-image:${resource.path}`;
  const owns = async () => !isPrivate || Boolean(owner && Number(session.user?.id) === owner && await activeOwner() === owner);
  const check = async () => {
    signal.throwIfAborted();
    if (!await owns()) throw new Error('Das aktive Konto hat sich geändert.');
  };
  await check();
  if (isPrivate) {
    const pendingId = await readLocal<string>(key + ':pending').catch(() => undefined);
    if (pendingId && (await pendingFor(owner!)).some(item => item.owner === owner && item.id === pendingId)) {
      const blob = await readLocal<Blob>(key);
      await check();
      if (blob instanceof Blob) return blob;
    }
  }
  let response: Response;
  try {
    response = await fetch(resource.request, { credentials: 'include', cache: 'no-store', signal });
  } catch (error) {
    await check();
    // Social remains online; HTTP errors below never fall back to old images.
    if (!(error instanceof TypeError) || resource.kind === 'social') throw error;
    const blob = await readLocal<Blob>(key).catch(() => undefined);
    await check();
    if (blob instanceof Blob) return blob;
    throw error;
  }
  await check();
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  if (isPrivate && response.headers.get('X-Aquarium-User') !== String(owner))
    throw new Error('Bild gehört nicht zum aktiven Konto.');
  if (!response.headers.get('Content-Type')?.startsWith('image/')) throw new Error('Ungültiges Bildformat.');
  const blob = await response.blob();
  await check();
  if (isPrivate) {
    // A local edit may have been queued while the network image was loading.
    const pendingId = await readLocal<string>(key + ':pending').catch(() => undefined);
    if (pendingId && (await pendingFor(owner!)).some(item => item.owner === owner && item.id === pendingId)) {
      const local = await readLocal<Blob>(key);
      await check();
      if (local instanceof Blob) return local;
    }
    // Private bytes are persisted by the existing workspace synchronization.
    // A display request must not overwrite an edit queued concurrently.
  } else if (resource.kind === 'catalog') {
    await writeCatalogImage(resource.path, blob).catch(() => {});
  }
  await check();
  return blob;
}

/** Each element owns its object URL and cancels/discards late work on changes. */
export function attachMobileImage(element: HTMLImageElement, source: string): () => void {
  let generation = 0;
  let controller: AbortController | undefined;
  let objectUrl: string | undefined;
  let disposed = false;
  const resource = mobileImageResource(source);
  function clear() {
    generation++;
    controller?.abort();
    element.removeAttribute('src');
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    objectUrl = undefined;
  }
  async function load() {
    clear();
    if (disposed) return;
    const current = generation;
    if (!resource) {
      // Local previews, packaged icons and external images keep their normal
      // element loading; no credentials or private cache entries are supplied.
      element.src = source;
      return;
    }
    controller = new AbortController();
    try {
      const blob = await loadMobileImage(source, Number(session.user?.id) || undefined, controller.signal);
      if (disposed || generation !== current) return;
      objectUrl = URL.createObjectURL(blob);
      element.src = objectUrl;
    } catch {
      if (!disposed && generation === current) element.dispatchEvent(new Event('error'));
    }
  }
  const stop = watch(() => session.user?.id, () => { void load(); }, { flush: 'sync' });
  const reload = () => { void load(); };
  window.addEventListener('online', reload);
  if (resource?.kind === 'private') {
    window.addEventListener('aquarium-synchronized', reload);
    window.addEventListener('aquarium-outbox-changed', reload);
  }
  void load();
  return () => {
    disposed = true;
    clear();stop();
    window.removeEventListener('online', reload);
    window.removeEventListener('aquarium-synchronized', reload);
    window.removeEventListener('aquarium-outbox-changed', reload);
  };
}

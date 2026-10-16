import { onMounted, onBeforeUnmount, ref } from "vue";

export const appVersion = ref(document.querySelector<HTMLMetaElement>('meta[name="aquarium-app-version"]')?.content || "");
const loadedVersion = document.querySelector<HTMLMetaElement>('meta[name="aquarium-frontend-version"]')?.content || '';
export const isFrontendVersion = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);

export function useFrontendUpdate() {
  const availableVersion = ref("");
  const ready = ref(false), applying = ref(false), failed = ref(false);
  let dismissedVersion = "";
  let candidate = "";
  let registration: ServiceWorkerRegistration | undefined;
  let request: AbortController | undefined;
  let interval: ReturnType<typeof setInterval> | undefined;
  let activationTimeout: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;
  const observed = new Set<ServiceWorker>();

  function reportVersion() {
    if (isFrontendVersion(loadedVersion)) navigator.serviceWorker?.controller?.postMessage({ type: 'CLIENT_VERSION', version: loadedVersion });
  }
  function updateReady() { ready.value = !('serviceWorker' in navigator) || Boolean(registration?.waiting); }
  function observe() {
    const worker = registration?.installing;
    if (worker && !observed.has(worker)) {
      observed.add(worker);worker.addEventListener('statechange', updateReady);
    }
    updateReady();
  }
  function controllerChanged() {
    reportVersion();
    if (applying.value) { clearTimeout(activationTimeout);window.location.reload(); }
  }
  async function check() {
    if (stopped || request || document.visibilityState === "hidden" || !navigator.onLine) return;
    const controller = new AbortController();request = controller;
    const timeout = setTimeout(() => controller.abort(), 10000);
    try {
      const response = await fetch(new URL("dist/version.json", document.baseURI), { cache: "no-store", signal: controller.signal });
      if (!response.ok) return;
      const data: unknown = await response.json();
      if (stopped || !data || typeof data !== 'object') return;
      if ('version' in data && typeof data.version === 'string') appVersion.value = data.version;
      candidate = 'frontendVersion' in data && isFrontendVersion(data.frontendVersion) && isFrontendVersion(loadedVersion) && data.frontendVersion !== loadedVersion ? data.frontendVersion : '';
      availableVersion.value = candidate === dismissedVersion ? '' : candidate;
      if (candidate && registration) { await registration.update();observe(); }
    } catch {
      // Offline and temporary server failures are retried on the next check.
    } finally { clearTimeout(timeout);request = undefined; }
  }
  async function register() {
    if (!('serviceWorker' in navigator)) { updateReady();return; }
    navigator.serviceWorker.addEventListener('controllerchange', controllerChanged);
    try {
      const result = await navigator.serviceWorker.register(new URL('sw.js', document.baseURI), { updateViaCache: 'none' });
      if (stopped) return;
      registration = result;registration.addEventListener('updatefound', observe);
      reportVersion();observe();
      if (candidate) await registration.update();
    } catch { /* The regular frontend remains usable if offline installation fails. */ }
  }
  onMounted(() => {
    if (import.meta.env.DEV) return;
    void register();void check();
    interval = setInterval(() => void check(), 5 * 60 * 1000);
    document.addEventListener("visibilitychange", check);window.addEventListener("online", check);
  });
  onBeforeUnmount(() => {
    stopped = true;clearInterval(interval);clearTimeout(activationTimeout);request?.abort();
    document.removeEventListener("visibilitychange", check);window.removeEventListener("online", check);
    navigator.serviceWorker?.removeEventListener('controllerchange', controllerChanged);
    registration?.removeEventListener('updatefound', observe);
    for (const worker of observed) worker.removeEventListener('statechange', updateReady);
  });
  function dismiss() { dismissedVersion = availableVersion.value;availableVersion.value = ''; }
  function reload() {
    failed.value = false;
    if (!('serviceWorker' in navigator)) { window.location.reload();return; }
    const worker = registration?.waiting;
    if (!worker || !ready.value) { void check();return; }
    applying.value = true;
    worker.postMessage({ type: 'ACTIVATE_UPDATE', version: availableVersion.value });
    activationTimeout = setTimeout(() => { applying.value = false;failed.value = true;void check(); }, 20000);
  }
  return { availableVersion, ready, applying, failed, dismiss, reload };
}

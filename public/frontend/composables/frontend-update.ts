import { onMounted, onBeforeUnmount, ref } from "vue";

export function isNewerVersion(candidate: unknown, current: string): candidate is string {
  const parse = (value: string) => {
    const match = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([1-9]\d*))?-ALPHA$/.exec(value);
    return match ? match.slice(1).map((part) => BigInt(part || "0")) : null;
  };
  if (typeof candidate !== "string") return false;
  const next = parse(candidate), previous = parse(current);
  if (!next || !previous) return false;
  for (let i = 0; i < next.length; i++) {
    if (next[i] !== previous[i]) return next[i] > previous[i];
  }
  return false;
}

export function useFrontendUpdate() {
  const availableVersion = ref("");
  let dismissedVersion = "";
  let request: AbortController | undefined;
  let interval: ReturnType<typeof setInterval> | undefined;
  let stopped = false;

  async function check() {
    if (stopped || request || document.visibilityState === "hidden" || !navigator.onLine) return;
    const controller = new AbortController();
    request = controller;
    const timeout = setTimeout(() => controller.abort(), 10000);
    try {
      const response = await fetch(new URL("dist/version.json", document.baseURI), {
        cache: "no-store", signal: controller.signal,
      });
      if (!response.ok) return;
      const data: unknown = await response.json();
      const version = data && typeof data === "object" && "version" in data ? data.version : undefined;
      if (!stopped && isNewerVersion(version, __APP_VERSION__)) {
        availableVersion.value = version === dismissedVersion ? "" : version;
      } else if (!stopped) {
        availableVersion.value = "";
      }
    } catch {
      // Offline and temporary server failures are retried on the next check.
    } finally {
      clearTimeout(timeout);
      request = undefined;
    }
  }

  onMounted(() => {
    if (import.meta.env.DEV) return;
    void check();
    interval = setInterval(() => void check(), 5 * 60 * 1000);
    document.addEventListener("visibilitychange", check);
    window.addEventListener("online", check);
  });
  onBeforeUnmount(() => {
    stopped = true;
    clearInterval(interval);
    request?.abort();
    document.removeEventListener("visibilitychange", check);
    window.removeEventListener("online", check);
  });

  function dismiss() {
    dismissedVersion = availableVersion.value;
    availableVersion.value = "";
  }

  return { availableVersion, dismiss, reload: () => window.location.reload() };
}

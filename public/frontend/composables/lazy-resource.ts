import { onBeforeUnmount, ref, shallowRef } from "vue";
import { errorMessage } from "../state";

export function useLazyResource<T>(initial: T, fetchData: (signal: AbortSignal) => Promise<T>) {
  const data = shallowRef<T>(initial);
  const active = ref(false);
  const loaded = ref(false);
  const loading = ref(false);
  const error = ref("");
  let controller: AbortController | undefined;
  let pending: Promise<void> | undefined;
  let disposed = false;
  async function load(force = false): Promise<void> {
    active.value = true;
    if (!force && loaded.value && !error.value) return;
    if (!force && pending) return pending;
    controller?.abort();
    const request = new AbortController();
    controller = request;
    loading.value = true;
    error.value = "";
    pending = (async () => {
      try {
        const result = await fetchData(request.signal);
        if (!disposed && controller === request) {
          data.value = result;
          loaded.value = true;
        }
      } catch (e) {
        if (!disposed && controller === request && !request.signal.aborted) error.value = errorMessage(e);
      } finally {
        if (controller === request) { loading.value = false; pending = undefined; }
      }
    })();
    return pending;
  }
  onBeforeUnmount(() => { disposed = true; controller?.abort(); });
  return { data, active, loaded, loading, error, load };
}

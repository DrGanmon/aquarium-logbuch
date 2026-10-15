import { useCatalogRevision } from './catalog-revision';
import { computed, onBeforeUnmount, ref, shallowRef, watch } from "vue";
import { api } from "../api";
import { errorMessage, language } from "../state";

interface CatalogPage<T> {
  species?: T[];
  plants?: T[];
  total: number;
  next: number | null;
  categories: string[];
}

/** Keep cards stable while typing; only completed pages enter the bounded cache. */
export function useCatalogSearch<T>(collection: "species" | "plants") {
  const revision = useCatalogRevision(collection);
  const shown = shallowRef<T[]>([]), total = ref(0), next = ref<number | null>(null);
  const search = ref(""), water = ref("all"), category = ref("all"), categories = shallowRef<string[]>([]);
  const pageError = ref(""), loading = ref(true), sentinel = ref<HTMLElement>();
  const criteria = computed(() => JSON.stringify([search.value.trim(), water.value, category.value, language.value, revision.value]));
  const pages = new Map<string, CatalogPage<T>>();
  watch(revision, () => pages.clear(), { flush: "sync" });
  let request: AbortController | undefined;
  let observer: IntersectionObserver | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let resetting = false, disposed = false;

  watch(language, () => { category.value = "all"; });
  watch(criteria, (key, previous) => {
    clearTimeout(timer);request?.abort();resetting = true;next.value = null;
    loading.value = true;pageError.value = "";
    const queryChanged = previous !== undefined && JSON.parse(key)[0] !== JSON.parse(previous)[0];
    timer = setTimeout(() => { timer = undefined;void load(); }, queryChanged ? 120 : 0);
  }, { immediate: true });
  watch(sentinel, element => {
    observer?.disconnect();
    if (!element || !("IntersectionObserver" in window)) return;
    observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting) && !pageError.value) void load(true);
    }, { rootMargin: "300px" });
    observer.observe(element);
  }, { flush: "post" });
  onBeforeUnmount(() => {
    disposed = true;clearTimeout(timer);request?.abort();observer?.disconnect();pages.clear();
  });

  async function load(more = false) {
    if (disposed || (more && (loading.value || resetting || next.value === null))) return;
    clearTimeout(timer);timer = undefined;
    request?.abort();const current = new AbortController();request = current;
    const criteriaKey = criteria.value;
    const query = new URLSearchParams({ limit: "24", offset: String(more ? next.value : 0), q: search.value.trim() });
    if (water.value !== "all") query.set("water_type", water.value);
    if (category.value !== "all") query.set("category", category.value);
    const key = `${language.value}:${query}`;
    loading.value = true;pageError.value = "";
    try {
      let result = pages.get(key);
      if (!result) result = await api<CatalogPage<T>>(`/${collection}?${query}`, { signal: current.signal });
      if (current.signal.aborted || disposed || criteria.value !== criteriaKey) return;
      pages.delete(key);pages.set(key, result);
      if (pages.size > 20) pages.delete(pages.keys().next().value!);
      const items = result[collection] || [];
      shown.value = more ? [...shown.value, ...items] : items;
      total.value = result.total;next.value = result.next;categories.value = result.categories;
      resetting = false;
    } catch (caught) {
      if (!current.signal.aborted && !disposed && criteria.value === criteriaKey) pageError.value = errorMessage(caught);
    } finally {
      if (request === current && !current.signal.aborted) loading.value = false;
    }
  }
  function retry() { void load(!resetting && shown.value.length > 0 && next.value !== null); }
  return { shown, total, next, search, water, category, categories, pageError, loading, sentinel, load, retry };
}

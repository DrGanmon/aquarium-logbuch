import { computed, onBeforeUnmount, ref, watch, type ComputedRef } from 'vue';

/** Render a small first page; filtering still searches the complete loaded catalog. */
export function useProgressiveList<T>(items: ComputedRef<T[]>, pageSize = 24) {
  const count = ref(pageSize);
  const sentinel = ref<HTMLElement>();
  const visible = computed(() => items.value.slice(0, count.value));
  const hasMore = computed(() => count.value < items.value.length);
  let observer: IntersectionObserver | undefined;
  function more() { count.value = Math.min(items.value.length, count.value + pageSize); }
  watch(items, () => { count.value = pageSize; }, { flush: 'sync' });
  watch(sentinel, element => {
    observer?.disconnect();
    if (!element || !("IntersectionObserver" in window)) return;
    observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting) && hasMore.value) more();
    }, { rootMargin: '200px' });
    observer.observe(element);
  }, { flush: 'post' });
  onBeforeUnmount(() => observer?.disconnect());
  return { visible, hasMore, sentinel, more };
}

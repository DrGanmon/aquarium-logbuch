import { computed, onBeforeUnmount, ref, watch, type Ref } from "vue";

/** Normalize each catalog entry once, and keep list work out of input events. */
export function useIndexedSearch<T>(items: Ref<T[]>, search: Ref<string>, text: (item: T) => string) {
  const query = ref(search.value.trim().toLocaleLowerCase());
  let timer: ReturnType<typeof setTimeout> | undefined;
  watch(search, value => {
    clearTimeout(timer);
    const normalized = value.trim().toLocaleLowerCase();
    if (!normalized) query.value = "";
    else if (normalized !== query.value) timer = setTimeout(() => { query.value = normalized; }, 120);
  });
  onBeforeUnmount(() => clearTimeout(timer));
  const index = computed(() => items.value.map(item => ({ item, text: text(item).toLocaleLowerCase() })));
  return computed(() => !query.value ? items.value : index.value.filter(row => row.text.includes(query.value)).map(row => row.item));
}

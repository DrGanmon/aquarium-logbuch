import { onBeforeUnmount, ref } from 'vue';
import { language } from '../state';
import type { CatalogName } from '../../../src/shared/offline-catalog';
/** Open lists and details refresh only after a complete snapshot has been committed. */
export function useCatalogRevision(kind: CatalogName) {
  const revision = ref(0);
  const update = (event: Event) => {
    const detail = (event as CustomEvent<{ kind: CatalogName; language: string }>).detail;
    if (detail?.kind === kind && detail.language === language.value) revision.value++;
  };
  window.addEventListener('aquarium-catalogs-updated', update);
  onBeforeUnmount(() => window.removeEventListener('aquarium-catalogs-updated', update));
  return revision;
}

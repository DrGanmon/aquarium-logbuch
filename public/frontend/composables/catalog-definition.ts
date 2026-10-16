import { shallowRef, watch, onBeforeUnmount } from 'vue';
import { api } from '../api';
import { useCatalogRevision } from './catalog-revision';
import type { VariantEntry } from '../../../src/shared/catalog-variants';

/** Keep an open selection current without resetting aquarium, quantity or chosen form. */
export function useCatalogDefinition<T extends VariantEntry>(kind: 'species' | 'plants', initial: T, reportError: (error: unknown) => void) {
  const definition = shallowRef(initial);
  const revision = useCatalogRevision(kind);
  let request: AbortController | undefined;
  onBeforeUnmount(() => request?.abort());
  async function refresh() {
    request?.abort();
    const current = new AbortController();request = current;
    const visited = new Set<string>();
    let id = initial.variantOf || initial.selectionOf || initial.id;
    try {
      while (!current.signal.aborted) {
        if (visited.has(id)) throw new Error('Invalid catalog selection.');
        visited.add(id);
        const result = await api<{ species: T; plant: T }>(`/${kind}/${encodeURIComponent(id)}`, { signal: current.signal });
        const entry = kind === 'species' ? result.species : result.plant;
        if (current.signal.aborted) return;
        const parent = entry.variantOf || entry.selectionOf;
        if (!parent) { definition.value = entry;return; }
        id = parent;
      }
    } catch (error) { if (!current.signal.aborted) throw error; }
  }
  watch(revision, () => { void refresh().catch(reportError); });
  return { definition, refresh };
}

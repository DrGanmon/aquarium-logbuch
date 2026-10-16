/** Stable variant IDs remain valid for saved residents and offline commands. */
export type VariantKind = 'subspecies' | 'variety' | 'cultivar' | 'color' | 'fin_form' | 'trade_form' | 'hybrid';
export interface CatalogVariant { id: string; name: string; scientificName?: string; kind: VariantKind | 'species' | 'unclassified'; description?: string; minGroupCount?: number }
export interface VariantEntry {
  id: string; name: string; scientificName?: string; description?: string; waterType: string;
  minGroupCount?: number; selectionOf?: string; selectionKind?: 'species' | 'unclassified'; variantOf?: string; name_de?: string; name_en?: string; variantKind?: VariantKind; aliases?: string[]; variants?: CatalogVariant[]; matchedVariants?: string[];
}
/** Group before pagination, including when only a child's name matched the search. */
export function groupCatalogMatches<T extends VariantEntry>(all: T[], matches: T[] = all, searching = false): T[] {
  const byId = new Map(all.map(item => [item.id, item]));
  const roots = new Map<string, string>();
  const rootFor = (item: T): string => {
    if (roots.has(item.id)) return roots.get(item.id)!;
    const seen = new Set<string>();let current = item;
    while (current.variantOf || current.selectionOf) {
      if (seen.has(current.id)) throw new Error('Cyclic catalog variant.');
      seen.add(current.id);
      const parent = byId.get((current.variantOf || current.selectionOf)!);
      if (!parent || parent.waterType !== item.waterType) throw new Error('Invalid catalog variant parent.');
      current = parent;
    }
    roots.set(item.id, current.id);return current.id;
  };
  const variants = new Map<string, CatalogVariant[]>();
  for (const item of all) {
    const root = rootFor(item);
    if (root !== item.id) {
      const items = variants.get(root) || [];
      items.push({ id: item.id, name: item.name, scientificName: item.scientificName, minGroupCount: item.minGroupCount, kind: item.selectionKind || item.variantKind || 'trade_form', description: item.description });
      variants.set(root, items);
    }
  }
  const result = new Map<string, T>();
  for (const item of matches) {
    const id = rootFor(item);
    if (!result.has(id)) result.set(id, { ...byId.get(id)!, ...(variants.has(id) ? { variants: variants.get(id) } : {}) });
  }
  if (searching) for (const item of matches) {
    const root = rootFor(item);
    if (root !== item.id) {
      const entry = result.get(root)!;
      entry.matchedVariants = [...(entry.matchedVariants || []), item.name];
    }
  }
  return [...result.values()];
}

/** Compact definitions inherit husbandry, never identity, from their catalog parent. */
export function inheritCatalogVariants<T extends VariantEntry>(items: T[]): T[] {
  const byId = new Map(items.map(item => [item.id, item]));
  const cache = new Map<string, T>();
  const resolve = (item: T, visited = new Set<string>()): T => {
    if (cache.has(item.id)) return cache.get(item.id)!;
    if (visited.has(item.id)) throw new Error('Cyclic catalog variant.');
    visited.add(item.id);
    let result = item;
    if (item.variantOf) {
      const parent = byId.get(item.variantOf);
      if (!parent) throw new Error('Invalid catalog variant parent.');
      const base = resolve(parent, visited);
      result = { ...base, ...item, name_de: item.name_de, name_en: item.name_en, aliases: item.aliases };
      if (result.waterType !== base.waterType) throw new Error('Invalid catalog variant water type.');
    }
    cache.set(item.id, result);return result;
  };
  return items.map(item => resolve(item));
}

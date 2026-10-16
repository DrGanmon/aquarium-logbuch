import { groupCatalogMatches } from './catalog-variants';
import type { VariantEntry } from './catalog-variants';
export interface SearchableSpecies extends VariantEntry {
  name: string;
  scientificName?: string;
  description?: string;
  category?: string;
  waterType: string;
  name_de?: string;
  name_en?: string;
  category_de?: string;
  category_en?: string;
  tags?: string[];
}
/** Search the complete catalog before paging; shared with the frontend worker. */
export function searchSpecies<T extends SearchableSpecies>(data: {
  species: T[]; query: string; waterType: string; category: string;
}): { filtered: T[]; total: number } {
  const words = data.query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  const category = data.category.toLowerCase();
  const filtered = data.species
    .filter(species => (data.waterType === 'all' || species.waterType === data.waterType)
      && (category === 'all' || [species.category, species.category_de, species.category_en]
        .some(value => value?.toLowerCase() === category)))
    .map(species => {
      const name = species.name.toLowerCase();
      const haystack = [name, species.name_de, species.name_en, species.scientificName,
        species.category, species.category_de, species.category_en, species.description, ...(species.tags || []), ...(species.aliases || [])]
        .filter(Boolean).join(' ').toLowerCase();
      const score = words.every(word => haystack.includes(word))
        ? words.reduce((sum, word) => sum + (name === word ? 20 : name.startsWith(word) ? 10 : name.includes(word) ? 5 : 1), 1)
        : 0;
      return { species, score };
    })
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score || a.species.name.localeCompare(b.species.name))
    .map(item => item.species);
  const grouped = groupCatalogMatches(data.species, filtered, words.length > 0);
  return { filtered: grouped, total: grouped.length };
}

import { groupCatalogMatches } from './catalog-variants';
import type { CatalogSnapshot } from './offline-catalog';
import { searchSpecies } from './species-search';
import { CatalogLookupError } from './catalog-routing';
export { CatalogLookupError, catalogForPath } from './catalog-routing';

function page(query: URLSearchParams) {
  const integer = (name: string, fallback: number) => !query.has(name) ? fallback : /^\d+$/.test(query.get(name)!) ? Number(query.get(name)) : NaN;
  const limit = integer('limit', 24), offset = integer('offset', 0);
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100 || !Number.isSafeInteger(offset) || offset < 0) throw new CatalogLookupError('Ungültige Seitenauswahl.', 400);
  return { limit, offset };
}
const canonical = (id: string) => id === 'symphysodon-spp' ? 'symphysodon-sp' : id;
/** Resolve existing read APIs from a complete local reference snapshot, including unseen search queries. */
export function queryCatalog(snapshot: CatalogSnapshot, path: string): unknown {
  const url = new URL(path, 'https://catalog.invalid');
  const query = url.searchParams;
  const parts = url.pathname.split('/').slice(1).map(decodeURIComponent);
  const q = (query.get('q') || '').trim().toLocaleLowerCase();
  if (snapshot.kind === 'species') {
    const data = snapshot.data;
    if (parts[1] === 'categories') return { categories: data.categories };
    if (parts[1]) {
      const id = canonical(parts[1].trim().toLowerCase());
      const names = (item: typeof data.species[number]) => [item.name, item.name_de, item.name_en].filter((value): value is string => Boolean(value)).map(value => value.toLowerCase());
      const species = data.species.find(item => item.id === id)
        || data.species.find(item => names(item).includes(id) || item.aliases?.some(alias => alias.toLowerCase() === id))
        || data.species.find(item => item.scientificName?.toLowerCase() === id)
        || data.species.find(item => names(item).some(name => name.includes(id)) || id.includes(item.name.toLowerCase()))
        || data.species.find(item => names(item).some(name => name.startsWith(id)) || item.scientificName?.toLowerCase().startsWith(id));
      if (!species) throw new CatalogLookupError('Art nicht gefunden.', 404);
      return { species: (species.variantOf || species.selectionOf) ? species : groupCatalogMatches(data.species).find(item => item.id === species.id) || species };
    }
    const water = query.get('water_type') || query.get('waterType') || 'all';
    const category = query.get('category') || 'all';
    if (!query.has('limit') && !query.has('offset')) {
      const rawWater = query.get('water_type') || query.get('waterType'), rawCategory = query.get('category');
      const filtered = data.species.filter(item => (!rawWater || item.waterType === rawWater)
        && (!rawCategory || [item.category, item.category_de, item.category_en].some(value => value?.toLowerCase() === category.toLowerCase()))
        && (!q || [item.name, item.name_de, item.name_en, item.scientificName, item.category, item.category_de, item.category_en].some(value => value?.toLowerCase().includes(q)) || item.tags?.some(tag => tag.includes(q)) || item.aliases?.some(alias => alias.toLowerCase().includes(q))));
      return { species: groupCatalogMatches(data.species, filtered, !!q), categories: data.categories };
    }
    const { filtered, total } = searchSpecies({ species: data.species, query: q, waterType: water, category });
    const { limit, offset } = page(query);
    const species = filtered.slice(offset, offset + limit).map(({ id, name, scientificName, category, profile, waterType, minVolumeL, minGroupCount, description, variants, matchedVariants }) =>
      ({ id, name, scientificName, category, profile, waterType, minVolumeL, minGroupCount, description, variants, matchedVariants }));
    return { species, total, next: offset + limit < total ? offset + limit : null, categories: data.categories };
  }
  if (snapshot.kind === 'plants') {
    const data = snapshot.data;
    if (parts[1]) {
      const plant = data.plants.find(item => item.id === parts[1]);
      if (!plant) throw new CatalogLookupError('Pflanze nicht gefunden.', 404);
      return { plant: plant.variantOf ? plant : groupCatalogMatches(data.plants).find(item => item.id === plant.id) || plant, fieldDefinitions: data.fieldDefinitions, notes: data.notes, sources: plant.sources.map(id => data.sources[id]).filter(Boolean) };
    }
    const { limit, offset } = page(query);
    const water = query.get('water_type') || query.get('waterType') || 'all', category = query.get('category') || 'all';
    const terms = q.split(/\s+/).filter(Boolean);
    const matches = data.plants.filter(plant => (water === 'all' || plant.waterType === water) && (category === 'all' || plant.category === category)
      && terms.every(term => data.searchText[plant.id]?.includes(term)));
    const filtered = groupCatalogMatches(data.plants, matches, terms.length > 0);
    const plants = filtered.slice(offset, offset + limit).map(({ id, name, scientificName, category, waterType, description, difficulty, light, growthRate, variants, matchedVariants }) =>
      ({ id, name, scientificName, category, waterType, description, difficulty, light, growthRate, variants, matchedVariants }));
    return { plants, total: filtered.length, next: offset + limit < filtered.length ? offset + limit : null,
      categories: [...new Set(data.plants.map(plant => plant.category))].sort((a, b) => a.localeCompare(b, snapshot.language)) };
  }
  const data = snapshot.data;
  const water = query.get('waterType') || 'all';
  const speciesId = canonical((query.get('speciesId') || '').slice(0, 120));
  if (parts[1] === 'diseases') {
    const disease = data.diseases.find(item => item.id === parts[2]);
    if (!disease) throw new CatalogLookupError('Krankheit nicht gefunden.', 404);
    const association = Object.hasOwn(data.associations[disease.waterType], speciesId) ? data.associations[disease.waterType][speciesId] : undefined;
    return { disease: { ...disease, speciesSigns: association?.diseases.find(item => item.diseaseId === disease.id)?.signs || [], treatmentCautions: association?.treatmentCautions || [] } };
  }
  if (parts[1] === 'medications' && parts[2]) {
    const medication = data.medicationDetails.find(item => item.id === parts[2]);
    if (!medication) throw new CatalogLookupError('Medikament nicht gefunden.', 404);
    return { medication };
  }
  if (!['all', 'fresh', 'salt'].includes(water)) throw new CatalogLookupError('Ungültiger Wassertyp.', 400);
  if (parts[1] === 'medications') {
    const legal = query.get('legalStatus') || '', diseaseId = (query.get('diseaseId') || '').slice(0, 120);
    if (!['', 'otc', 'rx', 'not_a_medicine'].includes(legal)) throw new CatalogLookupError('Ungültiger Medikamentenfilter.', 400);
    const items = data.medications.items.filter(item => (water === 'all' || item.waterTypes.includes(water as 'fresh' | 'salt'))
      && (!legal || item.legalStatus === legal) && (!diseaseId || item.indications.some(entry => entry.diseaseId === diseaseId))
      && (!q || [item.name, item.category, ...item.activeSubstances, ...item.productExamples.map(product => product.name)].join(' ').toLocaleLowerCase().includes(q.slice(0, 160))));
    return { ...data.medications, items, total: items.length };
  }
  const diseases = data.catalog.diseases.filter(item => {
    const detail = data.diseases.find(disease => disease.id === item.id)!;
    return (water === 'all' || item.waterType === water) && (!speciesId || detail.affectedSpecies.includes(speciesId))
      && (!q || [detail.name, detail.description, detail.pathogen.scientificName, ...detail.synonyms, ...detail.keySigns].join(' ').toLocaleLowerCase().includes(q.slice(0, 160)));
  }).map(item => {
    const association = Object.hasOwn(data.associations[item.waterType], speciesId) ? data.associations[item.waterType][speciesId]?.diseases.find(entry => entry.diseaseId === item.id) : undefined;
    return { ...item, speciesSigns: association?.signs || [], susceptibility: association?.susceptibility || null };
  });
  return { diseases, total: diseases.length, species: data.catalog.species.filter(item => water === 'all' || item.waterType === water) };
}

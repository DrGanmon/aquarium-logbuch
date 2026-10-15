import { createHash } from 'node:crypto';
import species = require('./species-service');
import { getPlantCatalog } from './plant-service';
import { healthService } from './health-service';
import { CATALOG_SCHEMA, type CatalogName, type CatalogSnapshot, type CatalogData } from '../shared/offline-catalog';
const snapshots = new Map<string, { body: string; version: string }>();

/** Catalogs are immutable during a process lifetime; hashing/serialization runs once per language. */
export function catalogSnapshot(kind: CatalogName, language: 'de' | 'en') {
  const key = `${kind}:${language}`;
  const cached = snapshots.get(key);
  if (cached) return cached;
  let data: CatalogData[CatalogName];
  if (kind === 'species') data = { species: species.getAllSpecies(language), categories: species.getCategories(language) } as CatalogData['species'];
  else if (kind === 'plants') {
    const catalog = getPlantCatalog(language);
    const other = new Map(getPlantCatalog(language === 'de' ? 'en' : 'de').plants.map(plant => [plant.id, plant]));
    data = { ...catalog, searchText: Object.fromEntries(catalog.plants.map(plant => [plant.id,
      [plant, other.get(plant.id)].filter(item => item !== undefined).map(item =>
        [item.name, item.scientificName, item.category, item.description, ...item.synonyms, ...item.tags].join(' ')).join(' ').toLocaleLowerCase(),
    ])) };
  } else data = healthService.offlineSnapshot(language);
  const version = createHash('sha256').update(JSON.stringify({ schema: CATALOG_SCHEMA, kind, language, data })).digest('hex');
  const snapshot = { schema: CATALOG_SCHEMA, kind, language, version, data } as CatalogSnapshot;
  const result = { body: JSON.stringify(snapshot), version };
  snapshots.set(key, result);
  return result;
}

import { groupCatalogMatches, inheritCatalogVariants } from '../shared/catalog-variants';
import fs = require('node:fs');
import path = require('node:path');
import { APP_ROOT } from '../utils/paths';
import type { CatalogImage } from '../shared/catalog-image';
import type { PlantCatalog } from '../shared/plants';

const images: Record<string, CatalogImage> = JSON.parse(fs.readFileSync(path.join(APP_ROOT, 'public/plants-images/manifest.json'), 'utf8'));

const catalogs = Object.fromEntries(['de', 'en'].map(lang => [lang,
  (() => {
    const catalog = JSON.parse(fs.readFileSync(path.join(__dirname, '../config/plants', lang === 'en' ? 'plants.en.json' : 'plants.json'), 'utf8')) as PlantCatalog;
    return { ...catalog, plants: inheritCatalogVariants(catalog.plants).map(plant => ({ ...plant, image: images[plant.id] || null })) };
  })(),
]));
const translations = new Map(catalogs.en.plants.map(plant => [plant.id, plant]));
const searchText = new Map(catalogs.de.plants.map(plant => [plant.id,
  [plant, translations.get(plant.id)].filter(Boolean).map(item =>
    [item!.name, item!.scientificName, item!.category, item!.description, ...item!.synonyms, ...item!.tags].join(' ')).join(' ').toLocaleLowerCase(),
]));
export function getPlantCatalog(lang = 'de'): PlantCatalog { return catalogs[lang === 'en' ? 'en' : 'de']; }
export function searchPlants(lang: string, query = '', water = 'all', category = 'all') {
  const catalog = getPlantCatalog(lang);
  const terms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  const plants = catalog.plants.filter(plant =>
    (water === 'all' || plant.waterType === water) && (category === 'all' || plant.category === category) &&
    terms.every(term => searchText.get(plant.id)?.includes(term)));
  return { plants: groupCatalogMatches(catalog.plants, plants), categories: [...new Set(catalog.plants.map(plant => plant.category))].sort((a, b) => a.localeCompare(b, lang === 'en' ? 'en' : 'de')) };
}

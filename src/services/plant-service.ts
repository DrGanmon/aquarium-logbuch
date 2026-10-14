import fs = require('node:fs');
import path = require('node:path');
import type { PlantCatalog } from '../shared/plants';

const catalogs = Object.fromEntries(['de', 'en'].map(lang => [lang,
  JSON.parse(fs.readFileSync(path.join(__dirname, '../config/plants', lang === 'en' ? 'plants.en.json' : 'plants.json'), 'utf8')) as PlantCatalog,
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
  return { plants, categories: [...new Set(catalog.plants.map(plant => plant.category))].sort((a, b) => a.localeCompare(b, lang === 'en' ? 'en' : 'de')) };
}

'use strict';
const fs = require('fs');
const path = require('path');

const BUILTIN_SPECIES_DIR = path.join(__dirname, '../config/species');
const CUSTOM_SPECIES_DIR = path.join(__dirname, '../../data/species');

let cache = null;

function ensureDirs() {
  if (!fs.existsSync(BUILTIN_SPECIES_DIR)) {
    fs.mkdirSync(BUILTIN_SPECIES_DIR, { recursive: true });
  }
}

function normalizeSpecies(s) {
  return {
    id: String(s.id || '').trim().toLowerCase(),
    name: String(s.name || s.id || '').trim(),
    scientificName: String(s.scientificName || '').trim(),
    category: String(s.category || 'Allgemein').trim(),
    waterType: s.waterType === 'salt' ? 'salt' : 'fresh',
    profile: String(s.profile || 'allgemein').trim().toLowerCase(),
    temp: {
      min: s.temp?.min != null ? Number(s.temp.min) : null,
      max: s.temp?.max != null ? Number(s.temp.max) : null,
      idealMin: s.temp?.idealMin != null ? Number(s.temp.idealMin) : null,
      idealMax: s.temp?.idealMax != null ? Number(s.temp.idealMax) : null,
    },
    ph: {
      min: s.ph?.min != null ? Number(s.ph.min) : null,
      max: s.ph?.max != null ? Number(s.ph.max) : null,
      idealMin: s.ph?.idealMin != null ? Number(s.ph.idealMin) : null,
      idealMax: s.ph?.idealMax != null ? Number(s.ph.idealMax) : null,
    },
    gh: {
      min: s.gh?.min != null ? Number(s.gh.min) : null,
      max: s.gh?.max != null ? Number(s.gh.max) : null,
      idealMin: s.gh?.idealMin != null ? Number(s.gh.idealMin) : null,
      idealMax: s.gh?.idealMax != null ? Number(s.gh.idealMax) : null,
    },
    kh: {
      min: s.kh?.min != null ? Number(s.kh.min) : null,
      max: s.kh?.max != null ? Number(s.kh.max) : null,
      idealMin: s.kh?.idealMin != null ? Number(s.kh.idealMin) : null,
      idealMax: s.kh?.idealMax != null ? Number(s.kh.idealMax) : null,
    },
    minVolumeL: s.minVolumeL != null ? Number(s.minVolumeL) : null,
    minTankLengthCm: s.minTankLengthCm != null ? Number(s.minTankLengthCm) : null,
    tankRegion: String(s.tankRegion || 'all').trim(),
    socialType: String(s.socialType || 'group').trim(), // solitary | pair | harem | school | group
    minGroupCount: s.minGroupCount != null ? Number(s.minGroupCount) : 1,
    territorial: String(s.territorial || 'none').trim(), // none | mild | breeding | territorial_bottom | strong | solitary_aggressive
    tags: Array.isArray(s.tags) ? s.tags.map((t) => String(t).trim().toLowerCase()) : [],
    diet: String(s.diet || 'omnivore').trim(),
    decorHints: String(s.decorHints || '').trim(),
    behaviorNotes: String(s.behaviorNotes || '').trim(),
    description: String(s.description || '').trim(),
  };
}

function loadSpecies(forceReload = false) {
  if (cache && !forceReload) {
    return cache;
  }

  ensureDirs();
  const speciesMap = new Map();
  const catalogList = [];

  const scanDir = (dir) => {
    if (!fs.existsSync(dir)) return;
    const files = fs.readdirSync(dir);
    for (const file of files) {
      if (!file.endsWith('.json')) continue;
      const fullPath = path.join(dir, file);
      try {
        const raw = fs.readFileSync(fullPath, 'utf8');
        const data = JSON.parse(raw);
        if (!data || !data.id || !Array.isArray(data.species)) continue;

        catalogList.push({
          id: String(data.id).trim(),
          name: String(data.name || data.id).trim(),
          description: String(data.description || '').trim(),
          count: data.species.length,
          file,
        });

        for (const rawItem of data.species) {
          const norm = normalizeSpecies(rawItem);
          if (norm.id && norm.name) {
            speciesMap.set(norm.id, norm);
          }
        }
      } catch (err) {
        console.error(`[SpeciesService] Fehler beim Laden von ${fullPath}:`, err.message);
      }
    }
  };

  scanDir(BUILTIN_SPECIES_DIR);
  scanDir(CUSTOM_SPECIES_DIR);

  cache = {
    speciesMap,
    catalogList,
  };
  return cache;
}

function getAllSpecies() {
  const { speciesMap } = loadSpecies();
  return Array.from(speciesMap.values());
}

function getSpeciesById(id) {
  if (!id) return null;
  const { speciesMap } = loadSpecies();
  return speciesMap.get(String(id).trim().toLowerCase()) || null;
}

function findSpeciesByName(name) {
  if (!name) return null;
  const q = String(name).trim().toLowerCase();
  const list = getAllSpecies();
  
  // 1. Exakter ID-Match
  let match = list.find((s) => s.id === q);
  if (match) return match;

  // 2. Exakter Name-Match (deutsch)
  match = list.find((s) => s.name.toLowerCase() === q);
  if (match) return match;

  // 3. Exakter Wissenschaftlicher Name Match
  match = list.find((s) => s.scientificName.toLowerCase() === q);
  if (match) return match;

  // 4. Teilstring Match im Namen
  match = list.find((s) => s.name.toLowerCase().includes(q) || q.includes(s.name.toLowerCase()));
  if (match) return match;

  // 5. Match nach Anfangswort (z. B. "Neon" -> "Neonsalmler" / "Roter Neon")
  match = list.find((s) => s.name.toLowerCase().startsWith(q) || s.scientificName.toLowerCase().startsWith(q));
  return match || null;
}

function getCategories() {
  const list = getAllSpecies();
  const set = new Set();
  for (const s of list) {
    if (s.category) set.add(s.category);
  }
  return Array.from(set).sort();
}

/**
 * Prüft den gesamten Besatz eines Aquariums auf Kompatibilität,
 * Wasserparameter-Überschneidungen, Beckengrößen, Mindestgruppengrößen,
 * Territorialverhalten und Vergesellschaftungskonflikte.
 */
function analyzeStockCompatibility(aquarium, stockItems = []) {
  const issues = [];
  const warnings = [];
  const infos = [];

  const aqWaterType = aquarium?.water_type === 'salt' ? 'salt' : 'fresh';
  const aqVolume = aquarium?.volume_l != null ? Number(aquarium.volume_l) : null;

  const aggregated = new Map();
  for (const item of stockItems) {
    const matched = findSpeciesByName(item.species) || (item.profile ? {
      id: item.species.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      name: item.species,
      scientificName: '',
      category: 'Benutzerdefiniert',
      waterType: aqWaterType,
      profile: item.profile,
      tags: [],
      minGroupCount: 1,
    } : null);

    const key = matched?.id || item.species.trim().toLowerCase();
    if (!aggregated.has(key)) {
      aggregated.set(key, {
        item,
        count: 0,
        species: matched,
        name: matched?.name || item.species,
      });
    }
    aggregated.get(key).count += Number(item.count) || 1;
  }

  const speciesDataList = Array.from(aggregated.values());

  // 1. Wassertyp-Konflikte (Süßwasser vs. Meerwasser)
  for (const entry of speciesDataList) {
    if (entry.species && entry.species.waterType && entry.species.waterType !== aqWaterType) {
      issues.push({
        type: 'water_type_mismatch',
        level: 'crit',
        title: 'Inkompatibler Wassertyp',
        message: `„${entry.name}“ ist ein ${entry.species.waterType === 'salt' ? 'Meerwasser' : 'Süßwasser'}bewohner, das Aquarium ist jedoch als ${aqWaterType === 'salt' ? 'Meerwasser' : 'Süßwasser'}becken eingerichtet.`,
        species: [entry.name],
      });
    }
  }

  // 2. Mindestbeckenvolumen prüfen
  if (aqVolume && aqVolume > 0) {
    for (const entry of speciesDataList) {
      if (entry.species?.minVolumeL && aqVolume < entry.species.minVolumeL) {
        warnings.push({
          type: 'tank_size_too_small',
          level: 'warn',
          title: 'Beckenvolumen zu gering',
          message: `„${entry.name}“ benötigt mindestens ${entry.species.minVolumeL} Liter (das Aquarium hat ${aqVolume} Liter).`,
          species: [entry.name],
          requiredVolumeL: entry.species.minVolumeL,
          currentVolumeL: aqVolume,
        });
      }
    }
  }

  // 3. Gruppengrößen & Einzelhaltungs-Prüfungen
  for (const entry of speciesDataList) {
    const sp = entry.species;
    if (!sp) continue;

    // A: Kampffisch (Betta splendens) & Solitäre Arten
    if (sp.tags.includes('solitary_betta') || sp.territorial === 'solitary_aggressive') {
      if (entry.count > 1) {
        issues.push({
          type: 'betta_multiple_solitary',
          level: 'crit',
          title: 'Unverträgliche Mehrfachhaltung bei Kampffischen',
          message: `„${entry.name}“ darf wegen tödlicher Revierkämpfe keinesfalls mehrfach im selben Becken gehalten werden (${entry.count} eingetragen, max. 1 erlaubt!).`,
          species: [entry.name],
        });
      }
    }

    // B: Schwarmfische in zu kleiner Gruppe
    if (sp.socialType === 'school' && sp.minGroupCount > 1 && entry.count < sp.minGroupCount) {
      warnings.push({
        type: 'school_too_small',
        level: 'warn',
        title: 'Schwarmgröße zu gering',
        message: `„${entry.name}“ ist ein Schwarmfisch und sollte in Gruppen ab mindestens ${sp.minGroupCount} Tieren gepflegt werden (aktuell: ${entry.count}).`,
        species: [entry.name],
        minGroupCount: sp.minGroupCount,
        currentCount: entry.count,
      });
    }

    // C: Gruppenfisch / Harem
    if ((sp.socialType === 'group' || sp.socialType === 'harem') && sp.minGroupCount > 1 && entry.count < sp.minGroupCount) {
      infos.push({
        type: 'group_too_small',
        level: 'info',
        title: 'Gruppenhaltung empfohlen',
        message: `„${entry.name}“ fühlt sich in einer Gruppe ab ${sp.minGroupCount} Tieren deutlich wohler (aktuell: ${entry.count}).`,
        species: [entry.name],
      });
    }
  }

  // 4. Vergesellschaftung & Verhaltens-Konflikte zwischen Artenpaaren
  for (let i = 0; i < speciesDataList.length; i++) {
    for (let j = i + 1; j < speciesDataList.length; j++) {
      const a = speciesDataList[i];
      const b = speciesDataList[j];
      const spA = a.species;
      const spB = b.species;
      if (!spA || !spB) continue;

      const tagsA = spA.tags || [];
      const tagsB = spB.tags || [];

      // A: Kampffisch + Flossenknabberer (z. B. Betta + Sumatrabarbe / Blutsalmler)
      if ((tagsA.includes('solitary_betta') && tagsB.includes('fin_nipper')) ||
          (tagsB.includes('solitary_betta') && tagsA.includes('fin_nipper'))) {
        const betta = tagsA.includes('solitary_betta') ? a.name : b.name;
        const nipper = tagsA.includes('fin_nipper') ? a.name : b.name;
        issues.push({
          type: 'betta_fin_nipper_conflict',
          level: 'crit',
          title: 'Flossenbeißer-Konflikt mit Kampffisch',
          message: `„${nipper}“ neigt zum Flossenbeißen und darf keinesfalls mit „${betta}“ vergesellschaftet werden, da dessen Schleierflossen attackiert werden.`,
          species: [a.name, b.name],
        });
      }

      // B: Kampffisch + Bunte Schleierfische / Guppy
      if ((tagsA.includes('solitary_betta') && tagsB.includes('livebearer') && tagsB.includes('long_fins')) ||
          (tagsB.includes('solitary_betta') && tagsA.includes('livebearer') && tagsA.includes('long_fins'))) {
        const betta = tagsA.includes('solitary_betta') ? a.name : b.name;
        const guppy = tagsA.includes('solitary_betta') ? b.name : a.name;
        warnings.push({
          type: 'betta_guppy_rivalry',
          level: 'warn',
          title: 'Rivalitätsgefahr für Kampffisch',
          message: `„${betta}“ kann bunte, langflossige Fische wie „${guppy}“ als angebliche Rivalen ansehen und attackieren oder durch deren Hektik Dauerstress erleiden.`,
          species: [a.name, b.name],
        });
      }

      // C: Flossenknabberer + Fische mit langen Flossen (Skalar, Fadenfisch)
      if ((tagsA.includes('fin_nipper') && tagsB.includes('long_fins') && !tagsB.includes('solitary_betta')) ||
          (tagsB.includes('fin_nipper') && tagsA.includes('long_fins') && !tagsA.includes('solitary_betta'))) {
        const nipper = tagsA.includes('fin_nipper') ? a.name : b.name;
        const longFin = tagsA.includes('long_fins') ? a.name : b.name;
        warnings.push({
          type: 'fin_nipper_general_conflict',
          level: 'warn',
          title: 'Flossenzupf-Gefahr',
          message: `„${nipper}“ neigt zum Zupfen an langen Flossen und Fäden von „${longFin}“.`,
          species: [a.name, b.name],
        });
      }

      // D: Raubfische (Skalare/Buntbarsche) + Zwerggarnelen
      if ((tagsA.includes('predator_small_prey') && tagsB.includes('dwarf_shrimp')) ||
          (tagsB.includes('predator_small_prey') && tagsA.includes('dwarf_shrimp'))) {
        const pred = tagsA.includes('predator_small_prey') ? a.name : b.name;
        const shrimp = tagsA.includes('dwarf_shrimp') ? a.name : b.name;
        warnings.push({
          type: 'predator_dwarf_shrimp',
          level: 'warn',
          title: 'Beutegreifer-Warnung',
          message: `„${pred}“ betrachtet Zwerggarnelen wie „${shrimp}“ als Lebendfutter. Eine Vergesellschaftung führt meist zum Verlust der Garnelen.`,
          species: [a.name, b.name],
        });
      }

      // E: Krebse (CPO) + Langflosser oder bodenschlafende Fische
      if ((tagsA.includes('crayfish_predator') && (tagsB.includes('long_fins') || tagsB.includes('bottom_dwelling'))) ||
          (tagsB.includes('crayfish_predator') && (tagsA.includes('long_fins') || tagsA.includes('bottom_dwelling')))) {
        const crab = tagsA.includes('crayfish_predator') ? a.name : b.name;
        const fish = tagsA.includes('crayfish_predator') ? b.name : a.name;
        warnings.push({
          type: 'crayfish_pinch_hazard',
          level: 'warn',
          title: 'Verletzungsgefahr durch Krebsscheren',
          message: `„${crab}“ kann nach schlafenden oder langflossigen Mitbewohnern wie „${fish}“ zwicken.`,
          species: [a.name, b.name],
        });
      }

      // F: Schneckenfresser (Helena / Prachtschmerle) + Zierschnecken
      if ((tagsA.includes('snail_eater') && tagsB.includes('snail') && !tagsB.includes('snail_eater')) ||
          (tagsB.includes('snail_eater') && tagsA.includes('snail') && !tagsA.includes('snail_eater'))) {
        const eater = tagsA.includes('snail_eater') ? a.name : b.name;
        const snail = tagsA.includes('snail') ? a.name : b.name;
        warnings.push({
          type: 'snail_eater_conflict',
          level: 'warn',
          title: 'Schneckenfresser erbeutet Zierschnecken',
          message: `„${eater}“ ernährt sich räuberisch von Schnecken und wird „${snail}“ erbeuten und fressen.`,
          species: [a.name, b.name],
        });
      }

      // G: Malawi/Tanganjika Cichliden + Südamerika / Weichwasser
      if (((tagsA.includes('malawi_cichlid') || tagsA.includes('tanganjika_cichlid')) && spB.profile === 'weichwasser') ||
          ((tagsB.includes('malawi_cichlid') || tagsB.includes('tanganjika_cichlid')) && spA.profile === 'weichwasser')) {
        const cichlid = (tagsA.includes('malawi_cichlid') || tagsA.includes('tanganjika_cichlid')) ? a.name : b.name;
        const softy = (tagsA.includes('malawi_cichlid') || tagsA.includes('tanganjika_cichlid')) ? b.name : a.name;
        issues.push({
          type: 'rift_lake_weichwasser_conflict',
          level: 'crit',
          title: 'Biotop- und Verhaltenskonflikt (Ostafrika vs. Weichwasser)',
          message: `Ostafrikanische Grabensee-Buntbarsche („${cichlid}“) sind extrem territorial, benötigen alkalisches Felsenwasser und sind unvereinbar mit Weichwasserfischen wie „${softy}“.`,
          species: [a.name, b.name],
        });
      }

      // H: Kaltwasserfisch vs. Wärmebedürftige Tropenfische
      if (spA.temp?.max != null && spB.temp?.min != null && spA.temp.max < spB.temp.min) {
        issues.push({
          type: 'temperature_range_conflict',
          level: 'crit',
          title: 'Temperatur-Inkompatibilität',
          message: `„${a.name}“ (max. ${spA.temp.max} °C) und „${b.name}“ (mind. ${spB.temp.min} °C) haben keine überlappenden Temperaturansprüche.`,
          species: [a.name, b.name],
        });
      } else if (spB.temp?.max != null && spA.temp?.min != null && spB.temp.max < spA.temp.min) {
        issues.push({
          type: 'temperature_range_conflict',
          level: 'crit',
          title: 'Temperatur-Inkompatibilität',
          message: `„${b.name}“ (max. ${spB.temp.max} °C) und „${a.name}“ (mind. ${spA.temp.min} °C) haben keine überlappenden Temperaturansprüche.`,
          species: [a.name, b.name],
        });
      }

      // I: pH-Wert Bereichs-Konflikt
      if (spA.ph?.max != null && spB.ph?.min != null && spA.ph.max < spB.ph.min) {
        issues.push({
          type: 'ph_range_conflict',
          level: 'crit',
          title: 'pH-Wert-Inkompatibilität',
          message: `„${a.name}“ (pH max. ${spA.ph.max}) und „${b.name}“ (pH mind. ${spB.ph.min}) haben unvereinbare pH-Wert-Anforderungen.`,
          species: [a.name, b.name],
        });
      } else if (spB.ph?.max != null && spA.ph?.min != null && spB.ph.max < spA.ph.min) {
        issues.push({
          type: 'ph_range_conflict',
          level: 'crit',
          title: 'pH-Wert-Inkompatibilität',
          message: `„${b.name}“ (pH max. ${spB.ph.max}) und „${a.name}“ (pH mind. ${spA.ph.min}) haben unvereinbare pH-Wert-Anforderungen.`,
          species: [a.name, b.name],
        });
      }
    }
  }

  // 5. Einrichtungs- und Dekorations-Hinweise generieren
  const specialDecorHints = [];
  for (const entry of speciesDataList) {
    const sp = entry.species;
    if (!sp) continue;

    if (sp.tags.includes('requires_sand')) {
      specialDecorHints.push(`„${entry.name}“ benötigt feinen, abgerundeten Sandboden (Schutz der empfindlichen Barteln und Grabbarkeit).`);
    }
    if (sp.tags.includes('requires_wood')) {
      specialDecorHints.push(`„${entry.name}“ benötigt zwingend echtes Wurzelholz (Moorkien, Mangrove) zur Verdauung von Holzfasern.`);
    }
    if (sp.tags.includes('requires_caves')) {
      specialDecorHints.push(`„${entry.name}“ benötigt ausreichend Höhlen (Kokosnussschalen, Tonröhren, Steinhöhlen) als Brut- und Rückzugsorte.`);
    }
    if (sp.tags.includes('requires_shells')) {
      specialDecorHints.push(`„${entry.name}“ benötigt leere Schneckenhäuser (mind. 3–5 Stück pro Fisch) als Revier- und Brutstätte.`);
    }
    if (sp.tags.includes('low_flow') || sp.tags.includes('bubble_nest_builder')) {
      specialDecorHints.push(`„${entry.name}“ schätzt eine geringe Strömung und Schwimmpflanzen an der Wasseroberfläche.`);
    }
    if (sp.tags.includes('high_tank_required')) {
      specialDecorHints.push(`„${entry.name}“ benötigt wegen seiner hohen Flossenform eine Beckenhöhe von mindestens 50–60 cm.`);
    }
  }

  return {
    isCompatible: issues.length === 0,
    issues,
    warnings,
    infos,
    decorHints: Array.from(new Set(specialDecorHints)),
    speciesCount: speciesDataList.length,
    totalSpecimens: speciesDataList.reduce((acc, s) => acc + s.count, 0),
  };
}

module.exports = {
  loadSpecies,
  getAllSpecies,
  getSpeciesById,
  findSpeciesByName,
  getCategories,
  analyzeStockCompatibility,
};

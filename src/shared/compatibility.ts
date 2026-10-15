const TAG_CARE_HINTS: Record<string, [string, string]> = {
  "eats_small_fish": ["Frisst kleine Fische; passende Größe der Mitbewohner beachten.", "Eats small fish; consider the size of tankmates."],
  "shrimp_predator": ["Erbeutet Garnelen; Vergesellschaftung sorgfältig prüfen.", "Preys on shrimp; assess tankmates carefully."],
  "aggressive_to_shrimp": ["Kann Garnelen angreifen.", "May attack shrimp."],
  "schooling": ["Schwarmhaltung und die angegebene Mindestgruppengröße beachten.", "Observe schooling requirements and the listed minimum group size."],
  "shell_dweller": ["Geeignete leere Schneckenhäuser als Rückzugsorte bereitstellen.", "Provide suitable empty snail shells as shelter."],
  "filter_feeder": [
    "Fächert Schwebfutter aus dem Wasser; gezielt mit geeignetem feinem Futter versorgen.",
    "Filters suspended food from the water; provide suitable fine food."
  ],
  "high_flow": [
    "Benötigt gut mit Sauerstoff versorgtes Wasser und kräftige Strömung.",
    "Requires oxygen-rich water and strong flow."
  ],
  "plant_eater": [
    "Kann Aquarienpflanzen anfressen.",
    "May eat aquarium plants."
  ],
  "escape_artist": [
    "Becken ausbruchsicher abdecken und Öffnungen sichern.",
    "Secure the tank cover and any openings against escape."
  ],
  "jumper": [
    "Becken sicher abdecken; Sprunggefahr.",
    "Use a secure tank cover; jumping risk."
  ],
  "no_freshwater_breeding": [
    "Vollständige Nachzucht ist in reinem Süßwasser nicht möglich.",
    "A complete breeding cycle is not possible in freshwater alone."
  ],
  "prolific_breeder": [
    "Vermehrt sich leicht; Nachwuchs und Besatzentwicklung berücksichtigen.",
    "Breeds readily; plan for offspring and increasing stock."
  ],
  "burrowing": [
    "Benötigt geeigneten Bodengrund zum Eingraben.",
    "Provide suitable substrate for burrowing."
  ],
  "digger": [
    "Gräbt im Bodengrund; Aufbauten standsicher platzieren.",
    "Digs in the substrate; secure rocks and decorations."
  ],
  "aufwuchs_eater": [
    "Aufwuchs und Biofilm als natürliche Futterquelle bereitstellen.",
    "Provide aufwuchs and biofilm as natural food sources."
  ],
  "species_tank_recommended": [
    "Artenbecken empfohlen; Vergesellschaftung sorgfältig prüfen.",
    "A species tank is recommended; assess tankmates carefully."
  ],
  "sulawesi_specialist": [
    "Spezialisierte Sulawesi-Haltung mit stabilen Wasserwerten erforderlich.",
    "Requires specialist Sulawesi care with stable water conditions."
  ],
  "high_temp": [
    "Hohe Temperaturansprüche beachten; siehe artspezifischen Temperaturbereich.",
    "Observe its warm-water requirements; see the species temperature range."
  ],
  "reef_safe": [
    "Im Katalog als riffverträglich eingestuft.",
    "Listed as reef safe in the catalog."
  ],
  "reef_safe_with_caution": [
    "Nur bedingt riffverträglich; Korallen und Wirbellose beobachten.",
    "Reef safe with caution; monitor corals and invertebrates."
  ],
  "mature_tank_required": [
    "Benötigt ein biologisch gut eingefahrenes Aquarium.",
    "Requires a biologically mature aquarium."
  ],
  "copepod_feeder": [
    "Benötigt geeignete Kleinkrebse als Futter; Futterversorgung sicherstellen.",
    "Requires suitable copepod food; ensure a reliable food supply."
  ],
  "frequent_feeding": [
    "Benötigt häufige, passende Futtergaben.",
    "Requires frequent suitable feedings."
  ],
  "sand_bed_required": [
    "Benötigt ein geeignetes Sandbett.",
    "Requires a suitable sand bed."
  ],
  "ich_prone": [
    "Im Katalog als anfällig für Weißpünktchenkrankheiten beschrieben.",
    "Listed as susceptible to white spot disease in the catalog."
  ],
  "nocturnal": [
    "Nachtaktiv; Rückzugsorte und passende Fütterungszeiten berücksichtigen.",
    "Nocturnal; provide shelter and suitable feeding times."
  ],
  "stinging": [
    "Nesselnde Tiere mit ausreichendem Abstand zu anderen Bewohnern platzieren.",
    "Keep stinging animals at sufficient distance from tankmates."
  ],
  "aiptasia_eater": [
    "Kann Glasrosen fressen; keine Garantie für deren vollständige Entfernung.",
    "May eat Aiptasia; complete removal is not guaranteed."
  ],
  "captive_bred_available": [
    "Nachzuchten sind verfügbar; Herkunft beim Kauf prüfen.",
    "Captive-bred specimens are available; check their origin."
  ],
  "mouthbrooder": [
    "Maulbrüter; Brutpflege bei der Haltung berücksichtigen.",
    "Mouthbrooder; account for parental care."
  ],
  "large_tank_required": [
    "Benötigt ein großes Aquarium; Mindestvolumen und Beckenlänge beachten.",
    "Requires a large aquarium; observe minimum volume and length."
  ],
  "very_large_tank_required": [
    "Benötigt ein sehr großes Aquarium; Mindestvolumen und Beckenlänge beachten.",
    "Requires a very large aquarium; observe minimum volume and length."
  ]
};

export interface CompatibilitySpecies { id: string; name: string; tags: string[]; minGroupCount: number; profile: string; waterType: string; minVolumeL?: number | null; socialType?: string | null; territorial?: string | null; temp?: { min: number | null; max: number | null }; ph?: { min: number | null; max: number | null } }
const SHRIMP_PREDATOR_TAGS = ['predator_small_prey', 'shrimp_predator', 'aggressive_to_shrimp'];
export function analyzeCompatibility(aquarium: { water_type?: string; volume_l?: number | null } | null | undefined, stockItems: { species: string; count?: number; profile?: string | null }[] = [], lang: string = 'de', findSpeciesByName: (name: string, language: string) => CompatibilitySpecies | null) {
  const isEn = String(lang).toLowerCase().startsWith('en');
  const issues = [];
  const warnings = [];
  const infos = [];

  const aqWaterType = aquarium?.water_type === 'salt' ? 'salt' : 'fresh';
  const aqVolume = aquarium?.volume_l != null ? Number(aquarium.volume_l) : null;

  const aggregated = new Map<string, { item: typeof stockItems[number]; count: number; species: CompatibilitySpecies | null; name: string }>();
  for (const item of stockItems) {
    const matched = findSpeciesByName(item.species, lang) || (item.profile ? {
      id: item.species.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      name: item.species,
      name_de: item.species,
      name_en: item.species,
      scientificName: '',
      category: isEn ? 'Custom' : 'Benutzerdefiniert',
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
    aggregated.get(key)!.count += Number(item.count) || 1;
  }

  const speciesDataList = Array.from(aggregated.values());

  // 1. Wassertyp-Konflikte (Süßwasser vs. Meerwasser)
  for (const entry of speciesDataList) {
    if (entry.species && entry.species.waterType && entry.species.waterType !== aqWaterType) {
      const spType = isEn
        ? (entry.species.waterType === 'salt' ? 'saltwater' : 'freshwater')
        : (entry.species.waterType === 'salt' ? 'Meerwasser' : 'Süßwasser');
      const tankType = isEn
        ? (aqWaterType === 'salt' ? 'saltwater' : 'freshwater')
        : (aqWaterType === 'salt' ? 'Meerwasser' : 'Süßwasser');

      issues.push({
        type: 'water_type_mismatch',
        level: 'crit',
        title: isEn ? 'Incompatible Water Type' : 'Inkompatibler Wassertyp',
        message: isEn
          ? `"${entry.name}" is a ${spType} species, but this aquarium is set up as a ${tankType} tank.`
          : `„${entry.name}“ ist ein ${spType}bewohner, das Aquarium ist jedoch als ${tankType}becken eingerichtet.`,
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
          title: isEn ? 'Tank Volume Too Small' : 'Beckenvolumen zu gering',
          message: isEn
            ? `"${entry.name}" requires at least ${entry.species.minVolumeL} litres (this aquarium has ${aqVolume} litres).`
            : `„${entry.name}“ benötigt mindestens ${entry.species.minVolumeL} Liter (das Aquarium hat ${aqVolume} Liter).`,
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
          title: isEn ? 'Multiple Solitary Fighting Fish Conflict' : 'Unverträgliche Mehrfachhaltung bei Kampffischen',
          message: isEn
            ? `"${entry.name}" must strictly be kept solitary due to deadly territorial fights (${entry.count} added, maximum 1 allowed!).`
            : `„${entry.name}“ darf wegen tödlicher Revierkämpfe keinesfalls mehrfach im selben Becken gehalten werden (${entry.count} eingetragen, max. 1 erlaubt!).`,
          species: [entry.name],
        });
      }
    }

    // B: Schwarmfische in zu kleiner Gruppe
    if (sp.socialType === 'school' && sp.minGroupCount > 1 && entry.count < sp.minGroupCount) {
      warnings.push({
        type: 'school_too_small',
        level: 'warn',
        title: isEn ? 'School Size Too Small' : 'Schwarmgröße zu gering',
        message: isEn
          ? `"${entry.name}" is a schooling fish and should be kept in groups of at least ${sp.minGroupCount} specimens (currently: ${entry.count}).`
          : `„${entry.name}“ ist ein Schwarmfisch und sollte in Gruppen ab mindestens ${sp.minGroupCount} Tieren gepflegt werden (aktuell: ${entry.count}).`,
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
        title: isEn ? 'Group Keeping Recommended' : 'Gruppenhaltung empfohlen',
        message: isEn
          ? `"${entry.name}" thrives best in a group of at least ${sp.minGroupCount} specimens (currently: ${entry.count}).`
          : `„${entry.name}“ fühlt sich in einer Gruppe ab ${sp.minGroupCount} Tieren deutlich wohler (aktuell: ${entry.count}).`,
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

      // A: Kampffisch + Flossenknabberer
      if ((tagsA.includes('solitary_betta') && tagsB.includes('fin_nipper')) ||
          (tagsB.includes('solitary_betta') && tagsA.includes('fin_nipper'))) {
        const betta = tagsA.includes('solitary_betta') ? a.name : b.name;
        const nipper = tagsA.includes('fin_nipper') ? a.name : b.name;
        issues.push({
          type: 'betta_fin_nipper_conflict',
          level: 'crit',
          title: isEn ? 'Fin-Nipper Conflict with Fighting Fish' : 'Flossenbeißer-Konflikt mit Kampffisch',
          message: isEn
            ? `"${nipper}" tends to nip at fins and must not be housed with "${betta}", as its veil fins will be attacked.`
            : `„${nipper}“ neigt zum Flossenbeißen und darf keinesfalls mit „${betta}“ vergesellschaftet werden, da dessen Schleierflossen attackiert werden.`,
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
          title: isEn ? 'Rivalry Risk for Fighting Fish' : 'Rivalitätsgefahr für Kampffisch',
          message: isEn
            ? `"${betta}" may perceive colorful, long-finned fish like "${guppy}" as rivals and attack them or suffer chronic stress.`
            : `„${betta}“ kann bunte, langflossige Fische wie „${guppy}“ als angebliche Rivalen ansehen und attackieren oder durch deren Hektik Dauerstress erleiden.`,
          species: [a.name, b.name],
        });
      }

      // C: Flossenknabberer + Fische mit langen Flossen
      if ((tagsA.includes('fin_nipper') && tagsB.includes('long_fins') && !tagsB.includes('solitary_betta')) ||
          (tagsB.includes('fin_nipper') && tagsA.includes('long_fins') && !tagsA.includes('solitary_betta'))) {
        const nipper = tagsA.includes('fin_nipper') ? a.name : b.name;
        const longFin = tagsA.includes('long_fins') ? a.name : b.name;
        warnings.push({
          type: 'fin_nipper_general_conflict',
          level: 'warn',
          title: isEn ? 'Fin Nipping Risk' : 'Flossenzupf-Gefahr',
          message: isEn
            ? `"${nipper}" is prone to nipping at the extended fins and feelers of "${longFin}".`
            : `„${nipper}“ neigt zum Zupfen an langen Flossen und Fäden von „${longFin}“.`,
          species: [a.name, b.name],
        });
      }

      // D: Raubfische + Zwerggarnelen
      if ((SHRIMP_PREDATOR_TAGS.some((tag: any) => tagsA.includes(tag)) && tagsB.includes('dwarf_shrimp')) ||
          (SHRIMP_PREDATOR_TAGS.some((tag: any) => tagsB.includes(tag)) && tagsA.includes('dwarf_shrimp'))) {
        const pred = SHRIMP_PREDATOR_TAGS.some((tag: any) => tagsA.includes(tag)) ? a.name : b.name;
        const shrimp = tagsA.includes('dwarf_shrimp') ? a.name : b.name;
        warnings.push({
          type: 'predator_dwarf_shrimp',
          level: 'warn',
          title: isEn ? 'Predator Warning' : 'Beutegreifer-Warnung',
          message: isEn
            ? `"${pred}" considers dwarf shrimp like "${shrimp}" as live prey. Cohabitation usually results in the loss of shrimp.`
            : `„${pred}“ betrachtet Zwerggarnelen wie „${shrimp}“ als Lebendfutter. Eine Vergesellschaftung führt meist zum Verlust der Garnelen.`,
          species: [a.name, b.name],
        });
      }

      // E: Krebse + Langflosser oder bodenschlafende Fische
      if ((tagsA.includes('crayfish_predator') && (tagsB.includes('long_fins') || tagsB.includes('bottom_dwelling'))) ||
          (tagsB.includes('crayfish_predator') && (tagsA.includes('long_fins') || tagsA.includes('bottom_dwelling')))) {
        const crab = tagsA.includes('crayfish_predator') ? a.name : b.name;
        const fish = tagsA.includes('crayfish_predator') ? b.name : a.name;
        warnings.push({
          type: 'crayfish_pinch_hazard',
          level: 'warn',
          title: isEn ? 'Pinch & Injury Risk from Crayfish Claws' : 'Verletzungsgefahr durch Krebsscheren',
          message: isEn
            ? `"${crab}" may pinch sleeping bottom fish or long-finned tankmates like "${fish}".`
            : `„${crab}“ kann nach schlafenden oder langflossigen Mitbewohnern wie „${fish}“ zwicken.`,
          species: [a.name, b.name],
        });
      }

      // F: Schneckenfresser + Zierschnecken
      if ((tagsA.includes('snail_eater') && tagsB.includes('snail') && !tagsB.includes('snail_eater')) ||
          (tagsB.includes('snail_eater') && tagsA.includes('snail') && !tagsA.includes('snail_eater'))) {
        const eater = tagsA.includes('snail_eater') ? a.name : b.name;
        const snail = tagsA.includes('snail') ? a.name : b.name;
        warnings.push({
          type: 'snail_eater_conflict',
          level: 'warn',
          title: isEn ? 'Snail Predator Conflict' : 'Schneckenfresser erbeutet Zierschnecken',
          message: isEn
            ? `"${eater}" feeds on snails and will hunt and consume ornamental snails like "${snail}".`
            : `„${eater}“ ernährt sich räuberisch von Schnecken und wird „${snail}“ erbeuten und fressen.`,
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
          title: isEn ? 'Biotope & Behavioral Conflict (Rift Lake vs. Soft Water)' : 'Biotop- und Verhaltenskonflikt (Ostafrika vs. Weichwasser)',
          message: isEn
            ? `East African Rift Lake cichlids ("${cichlid}") are highly territorial, require alkaline rocky water, and are incompatible with softwater species like "${softy}".`
            : `Ostafrikanische Grabensee-Buntbarsche („${cichlid}“) sind extrem territorial, benötigen alkalisches Felsenwasser und sind unvereinbar mit Weichwasserfischen wie „${softy}“.`,
          species: [a.name, b.name],
        });
      }

      // H: Kaltwasserfisch vs. Wärmebedürftige Tropenfische
      if (spA.temp?.max != null && spB.temp?.min != null && spA.temp.max < spB.temp.min) {
        issues.push({
          type: 'temperature_range_conflict',
          level: 'crit',
          title: isEn ? 'Temperature Incompatibility' : 'Temperatur-Inkompatibilität',
          message: isEn
            ? `"${a.name}" (max. ${spA.temp.max} °C) and "${b.name}" (min. ${spB.temp.min} °C) have non-overlapping temperature requirements.`
            : `„${a.name}“ (max. ${spA.temp.max} °C) und „${b.name}“ (mind. ${spB.temp.min} °C) haben keine überlappenden Temperaturansprüche.`,
          species: [a.name, b.name],
        });
      } else if (spB.temp?.max != null && spA.temp?.min != null && spB.temp.max < spA.temp.min) {
        issues.push({
          type: 'temperature_range_conflict',
          level: 'crit',
          title: isEn ? 'Temperature Incompatibility' : 'Temperatur-Inkompatibilität',
          message: isEn
            ? `"${b.name}" (max. ${spB.temp.max} °C) and "${a.name}" (min. ${spA.temp.min} °C) have non-overlapping temperature requirements.`
            : `„${b.name}“ (max. ${spB.temp.max} °C) und „${a.name}“ (mind. ${spA.temp.min} °C) haben keine überlappenden Temperaturansprüche.`,
          species: [a.name, b.name],
        });
      }

      // I: pH-Wert Bereichs-Konflikt
      if (spA.ph?.max != null && spB.ph?.min != null && spA.ph.max < spB.ph.min) {
        issues.push({
          type: 'ph_range_conflict',
          level: 'crit',
          title: isEn ? 'pH Range Incompatibility' : 'pH-Wert-Inkompatibilität',
          message: isEn
            ? `"${a.name}" (pH max. ${spA.ph.max}) and "${b.name}" (pH min. ${spB.ph.min}) have conflicting pH requirements.`
            : `„${a.name}“ (pH max. ${spA.ph.max}) und „${b.name}“ (pH mind. ${spB.ph.min}) haben unvereinbare pH-Wert-Anforderungen.`,
          species: [a.name, b.name],
        });
      } else if (spB.ph?.max != null && spA.ph?.min != null && spB.ph.max < spA.ph.min) {
        issues.push({
          type: 'ph_range_conflict',
          level: 'crit',
          title: isEn ? 'pH Range Incompatibility' : 'pH-Wert-Inkompatibilität',
          message: isEn
            ? `"${b.name}" (pH max. ${spB.ph.max}) and "${a.name}" (pH min. ${spA.ph.min}) have conflicting pH requirements.`
            : `„${b.name}“ (pH max. ${spB.ph.max}) und „${a.name}“ (pH mind. ${spA.ph.min}) haben unvereinbare pH-Wert-Anforderungen.`,
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

    for (const tag of sp.tags || []) {
      const hint = TAG_CARE_HINTS[tag];
      if (hint) specialDecorHints.push(`„${entry.name}“: ${hint[isEn ? 1 : 0]}`);
    }
    if (sp.tags.includes('requires_sand')) {
      specialDecorHints.push(isEn
        ? `"${entry.name}" requires fine, rounded sand substrate (protects sensitive barbels and allows digging).`
        : `„${entry.name}“ benötigt feinen, abgerundeten Sandboden (Schutz der empfindlichen Barteln und Grabbarkeit).`);
    }
    if (sp.tags.includes('requires_wood')) {
      specialDecorHints.push(isEn
        ? `"${entry.name}" strictly requires real driftwood (bogwood, mangrove) for wood fiber digestion.`
        : `„${entry.name}“ benötigt zwingend echtes Wurzelholz (Moorkien, Mangrove) zur Verdauung von Holzfasern.`);
    }
    if (sp.tags.includes('requires_caves')) {
      specialDecorHints.push(isEn
        ? `"${entry.name}" requires ample caves (coconut shells, clay tubes, rock caves) for breeding and shelter.`
        : `„${entry.name}“ benötigt ausreichend Höhlen (Kokosnussschalen, Tonröhren, Steinhöhlen) als Brut- und Rückzugsorte.`);
    }
    if (sp.tags.includes('requires_shells')) {
      specialDecorHints.push(isEn
        ? `"${entry.name}" requires empty snail shells (at least 3–5 per fish) as territories and breeding sites.`
        : `„${entry.name}“ benötigt leere Schneckenhäuser (mind. 3–5 Stück pro Fisch) als Revier- und Brutstätte.`);
    }
    if (sp.tags.includes('low_flow') || sp.tags.includes('bubble_nest_builder')) {
      specialDecorHints.push(isEn
        ? `"${entry.name}" appreciates gentle water flow and floating surface plants.`
        : `„${entry.name}“ schätzt eine geringe Strömung und Schwimmpflanzen an der Wasseroberfläche.`);
    }
    if (sp.tags.includes('high_tank_required')) {
      specialDecorHints.push(isEn
        ? `"${entry.name}" requires a tank height of at least 50–60 cm due to its tall fin shape.`
        : `„${entry.name}“ benötigt wegen seiner hohen Flossenform eine Beckenhöhe von mindestens 50–60 cm.`);
    }
  }

  return {
    isCompatible: issues.length === 0,
    issues,
    warnings,
    infos,
    decorHints: Array.from(new Set(specialDecorHints)),
    speciesCount: speciesDataList.length,
    totalSpecimens: speciesDataList.reduce((acc: number, s: typeof speciesDataList[number]) => acc + s.count, 0),
  };
}

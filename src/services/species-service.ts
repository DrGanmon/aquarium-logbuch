import { analyzeCompatibility } from '../shared/compatibility';
import type { SpeciesCatalogDescriptor } from '../types/catalog';
import { asRecord, isRecord } from '../utils/validation';
import { asError } from '../utils/app-error';
import { APP_ROOT } from '../utils/paths';
import fs = require('fs');
import path = require('path');

const BUILTIN_SPECIES_DIR = path.join(__dirname, '../config/species');
const CUSTOM_SPECIES_DIR = path.join(APP_ROOT, 'data/species');

const speciesImages = asRecord(JSON.parse(fs.readFileSync(path.join(APP_ROOT, 'public/species-images/manifest.json'), 'utf8')) as unknown);



const SPECIES_ID_ALIASES: Record<string, string> = { 'symphysodon-spp': 'symphysodon-sp' };

const CATEGORY_TRANSLATIONS_EN: Record<string, string> = {
  'Labyrinthfische': 'Labyrinth Fish',
  'Salmler': 'Tetras & Characins',
  'Bärblinge & Karpfenartige': 'Rasboras, Danios & Barbs',
  'Lebendgebärende': 'Livebearers',
  'Harnischwelse': 'Loricariid Catfish',
  'Panzerwelse': 'Corydoras Catfish',
  'Schmerlen': 'Loaches',
  'Südamerikanische Zwergbuntbarsche': 'South American Dwarf Cichlids',
  'Buntbarsche': 'Cichlids',
  'Ostafrikanische Grabenseebuntbarsche (Malawi)': 'Malawi Cichlids',
  'Ostafrikanische Grabenseebuntbarsche (Tanganjika)': 'Tanganyika Cichlids',
  'Zwerggarnelen': 'Dwarf Shrimp',
  'Fächergarnelen': 'Atyid / Filter Shrimp',
  'Zwergflusskrebse': 'Dwarf Crayfish',
  'Schnecken': 'Snails',
  'Meerwasser': 'Marine Fish & Invertebrates',
  'Meerwasserfische': 'Marine Fish',
  'Wirbellose Meerwasser': 'Marine Invertebrates',
  'Allgemein': 'General',
  'Benutzerdefiniert': 'Custom',
};

const SPECIES_TRANSLATIONS_EN: Record<string, Record<string, string>> = {
  'betta-splendens': {
    name: 'Siamese Fighting Fish',
    category: 'Labyrinth Fish',
    description: 'The Siamese fighting fish is one of the most popular aquarium fish. Thanks to its labyrinth organ, it can breathe atmospheric oxygen from the surface. Due to intense intraspecific aggression, males must strictly be kept solitary.',
    behaviorNotes: 'Strict solitary keeping required! Males fight each other to the death. Do not house with fin-nippers (e.g. Tiger Barbs) or fish with colorful flowing fins (e.g. male Guppies) as they will be attacked as rivals.',
    decorHints: 'Dense planting, floating plants (e.g. Frogbit, Hornwort), low water flow, aquarium hood strictly required.',
  },
  'trichogaster-lalius': {
    name: 'Dwarf Gourami',
    category: 'Labyrinth Fish',
    description: 'Colorful labyrinth fish from South Asia. Requires calm water and plenty of hiding spots for females.',
    behaviorNotes: 'Pair or harem keeping (1M/2F). Males build bubble nests at the surface and defend their territory during breeding.',
    decorHints: 'Floating plant cover, gentle current, dense border planting as visual cover for females.',
  },
  'trichopodus-leerii': {
    name: 'Pearl Gourami',
    category: 'Labyrinth Fish',
    description: 'One of the most graceful labyrinth fish with delicate mother-of-pearl patterns and extended pelvic fin feelers.',
    behaviorNotes: 'Very peaceful, calm large gourami. Males only become territorial when defending bubble nests.',
    decorHints: 'Large tanks with dense vegetation and floating plants.',
  },
  'trichogaster-chuna': {
    name: 'Honey Gourami',
    category: 'Labyrinth Fish',
    description: 'Small, peaceful labyrinth fish. Courting males show vibrant honey-yellow coloration with blue-black throats.',
    behaviorNotes: 'Very peaceful and slightly shy. Ideal for quiet community and nano aquariums.',
    decorHints: 'Fine-leaved plants, floating cover, gentle water current.',
  },
  'paracheirodon-innesi': {
    name: 'Neon Tetra',
    category: 'Tetras & Characins',
    description: 'World-famous schooling fish with glowing blue neon stripes and red tail section.',
    behaviorNotes: 'Schooling fish (at least 8–10 specimens). Prefers shaded lighting and softer water.',
    decorHints: 'Dark substrate, dense background planting, free swimming area in the center.',
  },
  'paracheirodon-axelrodi': {
    name: 'Cardinal Tetra',
    category: 'Tetras & Characins',
    description: 'Brilliant schooling fish from South America with continuous bright red lower body stripes.',
    behaviorNotes: 'True schooling fish (at least 10 specimens). Requires soft, warm, humic-rich water.',
    decorHints: 'Tannins/humic substances, driftwood, subdued lighting.',
  },
  'hemigrammus-bleheri': {
    name: 'Rummy-Nose Tetra',
    category: 'Tetras & Characins',
    description: 'Exemplary schooling fish with bright red head markings and black-and-white striped caudal fin.',
    behaviorNotes: 'Extremely cohesive schooling behavior. Reacts sensitively to poor water quality (head turns pale).',
    decorHints: 'Elongated tanks with open swimming path and fine plants.',
  },
  'hyphessobrycon-amandae': {
    name: 'Ember Tetra',
    category: 'Tetras & Characins',
    description: 'Tiny, glowing copper-red dwarf tetra from Brazil. Perfect for planted aquascapes.',
    behaviorNotes: 'Peaceful dwarf schooling fish (from 10 specimens). Very compatible with dwarf shrimp.',
    decorHints: 'Dense planting, mosses, dark background.',
  },
  'hyphessobrycon-eques': {
    name: 'Serpae Tetra',
    category: 'Tetras & Characins',
    description: 'Fiery red jewel tetra with dark shoulder spots.',
    behaviorNotes: 'Active schooling fish. Tends to nip at long fins in small groups. Keep in groups of 10+ without long-finned tankmates.',
    decorHints: 'Well-structured tank with plants and open space.',
  },
  'gymnocorymbus-ternetzi': {
    name: 'Black Skirt Tetra',
    category: 'Tetras & Characins',
    description: 'Robust, disc-shaped South American tetra with dark skirt-like anal fins.',
    behaviorNotes: 'Lively schooling fish. Can occasionally nip fins of long-finned fish.',
    decorHints: 'Roots, sturdy plants, swimming space.',
  },
  'puntigrus-tetrazona': {
    name: 'Tiger Barb',
    category: 'Rasboras, Danios & Barbs',
    description: 'Striking striped barb with high energy and bold behavior.',
    behaviorNotes: 'Lively schooling fish (from 8–10 specimens). Known fin-nipper! Never keep with Bettas, Gouramis, or Guppies.',
    decorHints: 'Good swimming space, sturdy planting, roots.',
  },
  'trigonostigma-heteromorpha': {
    name: 'Harlequin Rasbora',
    category: 'Rasboras, Danios & Barbs',
    description: 'Classic peaceful schooling fish with triangular black wedge markings.',
    behaviorNotes: 'Peaceful, enduring schooling fish (from 8–10 specimens). Ideal for community tanks.',
    decorHints: 'Cryptocorynes, driftwood, soft to medium-hard water.',
  },
  'danio-rerio': {
    name: 'Zebrafish (Zebra Danio)',
    category: 'Rasboras, Danios & Barbs',
    description: 'Extremely active, hardy surface-oriented schooling fish with horizontal stripes.',
    behaviorNotes: 'Fast swimmer that prefers cooler water (18–24 °C). Can stress slow-moving fish.',
    decorHints: 'Long aquarium with plenty of free swimming space and current.',
  },
  'danio-margaritatus': {
    name: 'Celestial Pearl Danio (Galaxy Rasbora)',
    category: 'Rasboras, Danios & Barbs',
    description: 'Dazzling nano fish with pearl-spotted sides and bright red fins from Myanmar.',
    behaviorNotes: 'Peaceful dwarf fish (from 10 specimens). Males display peaceful courtship rituals.',
    decorHints: 'Dense fine-leaved vegetation, moss, subdued lighting.',
  },
  'tanichthys-albonubes': {
    name: 'White Cloud Mountain Minnow',
    category: 'Rasboras, Danios & Barbs',
    description: 'Coldwater fish from southern China with metallic neon reflections. Tolerates temperatures down to 18 °C.',
    behaviorNotes: 'Hardy, peaceful schooling fish. Does not require a heater at normal room temperature.',
    decorHints: 'Clean, well-oxygenated water with gentle current.',
  },
  'poecilia-reticulata': {
    name: 'Guppy',
    category: 'Livebearers',
    description: 'The classic "millionfish" with immense color varieties and rapid reproduction.',
    behaviorNotes: 'Lively livebearer. Harem keeping (1M/2F) recommended. Long-finned males can be targeted by Bettas or fin-nippers.',
    decorHints: 'Dense planting for fry cover, open swimming area.',
  },
  'poecilia-sphenops': {
    name: 'Black Molly',
    category: 'Livebearers',
    description: 'Velvety black, energetic livebearer that likes slightly harder, warm water and algae grazing.',
    behaviorNotes: 'Peaceful and lively. Nibbles soft algae and biofilms.',
    decorHints: 'Plant cover, hard or brackish water preference.',
  },
  'xiphophorus-hellerii': {
    name: 'Swordtail',
    category: 'Livebearers',
    description: 'Active livebearer whose males possess an elongated lower caudal sword.',
    behaviorNotes: 'Fast swimmer requiring spacious tanks (from 100 cm length). Males can be competitive.',
    decorHints: 'Long tank with free swimming room and dense plant thickets.',
  },
  'xiphophorus-maculatus': {
    name: 'Platy',
    category: 'Livebearers',
    description: 'Compact, colorful and adaptable livebearer for planted community tanks.',
    behaviorNotes: 'Peaceful group fish. Very easy to breed.',
    decorHints: 'Versatile planting with hiding spots for juveniles.',
  },
  'ancistrus-sp': {
    name: 'Bristlenose Catfish',
    category: 'Loricariid Catfish',
    description: 'Popular algae-eating armored catfish with tentacle-like bristles on the snout.',
    behaviorNotes: 'Crepuscular and bottom-oriented. Strictly requires bogwood for digestion.',
    decorHints: 'Real driftwood (mopani/mangrove), caves, dark substrate.',
  },
  'otocinclus-affinis': {
    name: 'Otocinclus Catfish (Dwarf Sucker)',
    category: 'Loricariid Catfish',
    description: 'Tiny, peaceful armored catfish that diligently feeds on algae and Aufwuchs.',
    behaviorNotes: 'Group fish (from 6 specimens). Best added to mature tanks with established biofilms.',
    decorHints: 'Broad-leaved plants (Echinodorus), stones, driftwood.',
  },
  'corydoras-panda': {
    name: 'Panda Corydoras',
    category: 'Corydoras Catfish',
    description: 'Charming dwarf armored catfish with black eye mask and dorsal spot.',
    behaviorNotes: 'Peaceful bottom dweller (from 6 specimens). Sand substrate is mandatory to protect sensitive barbels.',
    decorHints: 'Fine rounded sand substrate, open bottom areas, sheltered caves.',
  },
  'corydoras-aeneus': {
    name: 'Bronze Corydoras',
    category: 'Corydoras Catfish',
    description: 'Hardy and active armored catfish for the bottom zone.',
    behaviorNotes: 'Social group fish (from 6–8 specimens). Forages in the sand substrate.',
    decorHints: 'Soft sand substrate, river stones, plant shade.',
  },
  'corydoras-pygmaeus': {
    name: 'Pygmy Corydoras',
    category: 'Corydoras Catfish',
    description: 'Miniature armored catfish that frequently schools in midwater levels.',
    behaviorNotes: 'Dwarf schooling fish (from 8–10 specimens). Very peaceful and nano-friendly.',
    decorHints: 'Fine sand, mosses, low current.',
  },
  'chromobotia-macracanthus': {
    name: 'Clown Loach',
    category: 'Loaches',
    description: 'Vibrantly colored loach that grows very large (up to 30 cm) and feeds on snails.',
    behaviorNotes: 'Group fish (from 5 specimens) for very large aquariums (from 400 L). Predates ornamental snails.',
    decorHints: 'Spacious caves, large driftwood, robust plants.',
  },
  'pangio-kuhlii': {
    name: 'Kuhli Loach',
    category: 'Loaches',
    description: 'Eel-like striped bottom dweller that loves squeezing into crevices and burrowing in sand.',
    behaviorNotes: 'Peaceful, twilight-active group fish (from 5–6 specimens). Harmless to other fish and shrimp.',
    decorHints: 'Fine sand, leaf litter, hiding crevices.',
  },
  'pterophyllum-scalare': {
    name: 'Angelfish',
    category: 'Cichlids',
    description: 'Majestic South American cichlid with tall disc-shaped body and elongated ventral fins.',
    behaviorNotes: 'Pair or small group fish. Requires tall aquariums (min. 50–60 cm). Will hunt dwarf shrimp and small fish.',
    decorHints: 'Tall plants (Vallisneria), vertical root wood structures.',
  },
  'symphysodon-aequifasciatus': {
    name: 'Discus Fish',
    category: 'Cichlids',
    description: 'The "King of the Aquarium", majestic round cichlid requiring warm, soft, pristine water.',
    behaviorNotes: 'School/group fish (from 5–6 specimens) for large, calm aquariums. Sensitive to water quality.',
    decorHints: 'Spacious tank (300 L+), smooth driftwood, warm water (28–30 °C).',
  },
  'mikrogeophagus-ramirezi': {
    name: 'Ram Cichlid (German Blue Ram)',
    category: 'South American Dwarf Cichlids',
    description: 'Colorful dwarf cichlid with brilliant blue iridescence and yellow head.',
    behaviorNotes: 'Pair-bonding territory builder. Sensitive to nitrate and hard water.',
    decorHints: 'Sandy bottom, flat stones, dense marginal planting.',
  },
  'apistogramma-cacatuoides': {
    name: 'Cockatoo Dwarf Cichlid',
    category: 'South American Dwarf Cichlids',
    description: 'Dwarf cichlid whose males sport a striking comb-like dorsal fin.',
    behaviorNotes: 'Harem spawner (1M/2–3F). Females guard caves fiercely during brooding.',
    decorHints: 'Coconut shell caves, clay pots, leaf litter, sandy ground.',
  },
  'labidochromis-caeruleus': {
    name: 'Yellow Lab Cichlid',
    category: 'Malawi Cichlids',
    description: 'Bright yellow rock-dwelling Mbuna cichlid from Lake Malawi with black fin borders.',
    behaviorNotes: 'Territorial rock dweller for alkaline hard water. Incompatible with softwater species.',
    decorHints: 'Extensive rockwork with caves reaching the surface, sand bottom.',
  },
  'pseudotropheus-saulosi': {
    name: 'Saulosi Cichlid',
    category: 'Malawi Cichlids',
    description: 'Dwarf Mbuna from Lake Malawi. Males turn blue-black striped while females remain bright yellow.',
    behaviorNotes: 'Polygamous Mbuna. Strongly territorial, requires hard alkaline water.',
    decorHints: 'Dense rock formations, caves, fine sand.',
  },
  'neolamprologus-multifasciatus': {
    name: 'Many-Banded Shell-Dweller',
    category: 'Tanganyika Cichlids',
    description: 'One of the smallest cichlids in the world, living and breeding inside empty snail shells.',
    behaviorNotes: 'Colony former. Strictly requires empty snail shells as territories and breeding sites.',
    decorHints: 'Neothauma or escargot shells (3–5 per fish), sandy substrate.',
  },
  'neolamprologus-brichardi': {
    name: 'Fairy Cichlid (Princess of Burundi)',
    category: 'Tanganyika Cichlids',
    description: 'Elegant cichlid with lyre-shaped caudal fin that forms multi-generational family colonies.',
    behaviorNotes: 'Forms extended family units. Extremely protective of breeding territory.',
    decorHints: 'Steep rock walls, deep caves, alkaline water.',
  },
  'neocaridina-davidi': {
    name: 'Neocaridina Cherry Shrimp',
    category: 'Dwarf Shrimp',
    description: 'Hardy and colorful dwarf shrimp for planted tanks and aquascapes.',
    behaviorNotes: 'Peaceful group animal (from 10+). Feeds on biofilms. Preyed upon by larger predatory fish.',
    decorHints: 'Mosses, fine-leaved plants, alder cones, leaves.',
  },
  'caridina-cantonensis': {
    name: 'Crystal Red / Bee Shrimp',
    category: 'Dwarf Shrimp',
    description: 'High-grade striped dwarf shrimp requiring clean, cool, acidic soft water.',
    behaviorNotes: 'Peaceful and delicate. Best kept in dedicated species shrimp tanks.',
    decorHints: 'Active soil substrate, humic substances, mineral rocks.',
  },
  'caridina-multidentata': {
    name: 'Amano Shrimp',
    category: 'Dwarf Shrimp',
    description: 'Legendary algae-eating shrimp popularized by Takashi Amano.',
    behaviorNotes: 'Active and peaceful group shrimp. Excellent cleaner that does not breed in freshwater.',
    decorHints: 'Plants, wood, moss, secure aquarium lid.',
  },
  'atya-gabonensis': {
    name: 'Vampire / Blue African Filter Shrimp',
    category: 'Atyid / Filter Shrimp',
    description: 'Fascinating peaceful giant shrimp with fan hands for filtering plankton from the current.',
    behaviorNotes: 'Gentle giant. Strictly requires directed water flow for filter feeding.',
    decorHints: 'High current zones, elevated roosting perches near filter outlet.',
  },
  'cambarellus-patzcuarensis': {
    name: 'Mexican Dwarf Orange Crayfish (CPO)',
    category: 'Dwarf Crayfish',
    description: 'Vibrant neon-orange dwarf crayfish from Lake Pátzcuaro in Mexico.',
    behaviorNotes: 'Territorial bottom dweller. May pinch slow or long-finned fish.',
    decorHints: 'Clay tubes, coconut shells, dense vegetation.',
  },
  'neritina-natalensis': {
    name: 'Zebra Nerite Snail',
    category: 'Snails',
    description: 'Decorative algae-eating snail with yellow-brown zebra stripes.',
    behaviorNotes: 'Peaceful biofilm grazer. Cannot reproduce in freshwater, leaving plants intact.',
    decorHints: 'Established tank with glass and rock biofilms.',
  },
  'clithon-corona': {
    name: 'Horned / Sun Nerite Snail',
    category: 'Snails',
    description: 'Small nerite snail with characteristic shell horns and excellent diatom algae consumption.',
    behaviorNotes: 'Harmless grazer. Does not harm live plants.',
    decorHints: 'Hard surfaces, stones, wood.',
  },
  'anentome-helena': {
    name: 'Assassin Snail',
    category: 'Snails',
    description: 'Yellow-and-black striped snail that preys on nuisance pest snails in the aquarium.',
    behaviorNotes: 'Predatory carnivore. Will hunt and consume other ornamental snails.',
    decorHints: 'Sand or fine gravel for burrowing.',
  },
  'tylomelania-sp': {
    name: 'Sulawesi Elephant Snail',
    category: 'Snails',
    description: 'Large, impressive freshwater snail from Lake Poso with colorful snout foot.',
    behaviorNotes: 'Peaceful giant snail requiring warm, clean water (26–30 °C).',
    decorHints: 'Warm water, open sandy areas, vegetables and sinking pellets.',
  },
  'amphiprion-ocellaris': {
    name: 'Ocellaris Clownfish (False Percula)',
    category: 'Marine Fish',
    description: 'The iconic orange-and-white clownfish that lives in symbiosis with sea anemones.',
    behaviorNotes: 'Pair keeping. Forms mutual symbiosis with host anemones (Entacmaea quadricolor).',
    decorHints: 'Host anemone, live rock reef structures.',
  },
  'amphiprion-percula': {
    name: 'Percula Clownfish (True Percula)',
    category: 'Marine Fish',
    description: 'True clownfish with pronounced thick black borders around white body bands.',
    behaviorNotes: 'Pair keeping with host anemone. Peaceful reef inhabitant.',
    decorHints: 'Live rock, host sea anemones.',
  },
  'chrysiptera-parasema': {
    name: 'Yellowtail Damselfish',
    category: 'Marine Fish',
    description: 'Vivid deep blue damselfish with contrasting yellow tail fin.',
    behaviorNotes: 'Hardy but territorial small damselfish. Needs cave hideaways.',
    decorHints: 'Reef rocks, caves, swim room.',
  },
  'nemateleotris-magnifica': {
    name: 'Firefish Goby',
    category: 'Marine Fish',
    description: 'Graceful dartfish with white-to-red gradient and erect dorsal banner fin.',
    behaviorNotes: 'Timid pair fish. Prone to jumping; tight tank lid is required.',
    decorHints: 'Fine sand, sleep burrows, tight cover.',
  },
  'pterapogon-kauderni': {
    name: 'Banggai Cardinalfish',
    category: 'Marine Fish',
    description: 'Elegant black-and-silver striped marine fish with pearl dots; paternal mouthbrooder.',
    behaviorNotes: 'Calm pair fish. Males brood eggs and fry inside their mouths.',
    decorHints: 'Long-spined sea urchins (Diadema) or artificial urchins for shelter.',
  },
  'gramma-loreto': {
    name: 'Royal Gramma',
    category: 'Marine Fish',
    description: 'Eye-catching purple-and-yellow basslet native to Caribbean coral reefs.',
    behaviorNotes: 'Peaceful cave dweller that defends its immediate shelter against intruders.',
    decorHints: 'Reef caves, overhangs, vertical crevices.',
  },
  'zebrasoma-flavescens': {
    name: 'Yellow Tang',
    category: 'Marine Fish',
    description: 'Iconic bright yellow surgeonfish with high algae grazing activity.',
    behaviorNotes: 'Active open-water swimmer requiring spacious tanks (from 400 L).',
    decorHints: 'Plenty of swimming room, live rock algae pastures.',
  },
  'paracanthurus-hepatus': {
    name: 'Blue Tang (Regal Tang)',
    category: 'Marine Fish',
    description: 'Vibrant blue surgeonfish with black palette markings and yellow tail.',
    behaviorNotes: 'Grows very large and requires huge swimming space (from 800–1000 L).',
    decorHints: 'Very large tanks with strong flow and hiding spots.',
  },
  'lysmata-amboinensis': {
    name: 'Pacific Cleaner Shrimp',
    category: 'Marine Invertebrates',
    description: 'Beneficial red-and-white striped reef shrimp that cleans parasites from fish.',
    behaviorNotes: 'Active and social cleaner shrimp (pair or small group).',
    decorHints: 'Reef structure, live rock overhangs.',
  },
  'paguristes-cadenati': {
    name: 'Scarlet Reef Hermit Crab',
    category: 'Marine Invertebrates',
    description: 'Bright red miniature hermit crab that diligently consumes nuisance algae.',
    behaviorNotes: 'Peaceful reef janitor. Requires spare empty shells of increasing sizes.',
    decorHints: 'Live rock, spare snail shells.',
  },
};

function normalizeRange(value: unknown) {
  const range = asRecord(value);
  const number = (key: string) => range[key] != null ? Number(range[key]) : null;
  return { min: number('min'), max: number('max'), idealMin: number('idealMin'), idealMax: number('idealMax') };
}
function normalizeSpecies(s: Record<string, unknown>, lang: string = 'de') {
  const isEn = String(lang).toLowerCase().startsWith('en');
  const id = String(s.id || '').trim().toLowerCase();
  const tr = SPECIES_TRANSLATIONS_EN[id] || {};

  const nameDe = String(s.name_de || s.name || s.id || '').trim();
  const nameEn = String(s.name_en || tr.name || s.name || s.id || '').trim();

  const categoryDe = String(s.category_de || s.category || 'Allgemein').trim();
  const categoryEn = String(s.category_en || tr.category || CATEGORY_TRANSLATIONS_EN[categoryDe] || categoryDe).trim();

  const descDe = String(s.description_de || s.description || '').trim();
  const descEn = String(s.description_en || tr.description || s.description || '').trim();

  const behaviorDe = String(s.behaviorNotes_de || s.behaviorNotes || '').trim();
  const behaviorEn = String(s.behaviorNotes_en || tr.behaviorNotes || s.behaviorNotes || '').trim();

  const decorDe = String(s.decorHints_de || s.decorHints || '').trim();
  const decorEn = String(s.decorHints_en || tr.decorHints || s.decorHints || '').trim();

  return {
    id,
    name: isEn ? nameEn : nameDe,
    name_de: nameDe,
    name_en: nameEn,
    image: speciesImages[id] || null,
    scientificName: String(s.scientificName || '').trim(),
    category: isEn ? categoryEn : categoryDe,
    category_de: categoryDe,
    category_en: categoryEn,
    waterType: s.waterType === 'salt' ? 'salt' : 'fresh',
    profile: String(s.profile || 'allgemein').trim().toLowerCase(),
    temp: normalizeRange(s.temp),
    ph: normalizeRange(s.ph),
    gh: normalizeRange(s.gh),
    kh: normalizeRange(s.kh),
    // Optional salinity range is always expressed in per mille, never specific gravity.
    salinity: s.salinity ? normalizeRange(s.salinity) : null,
    minVolumeL: s.minVolumeL != null ? Number(s.minVolumeL) : null,
    minTankLengthCm: s.minTankLengthCm != null ? Number(s.minTankLengthCm) : null,
    tankRegion: String(s.tankRegion || 'all').trim(),
    socialType: String(s.socialType || 'group').trim(), // solitary | pair | harem | school | group
    minGroupCount: s.minGroupCount != null ? Number(s.minGroupCount) : 1,
    territorial: String(s.territorial || 'none').trim(), // none | mild | breeding | territorial_bottom | strong | solitary_aggressive
    tags: Array.isArray(s.tags) ? s.tags.map((t: unknown) => String(t).trim().toLowerCase()) : [],
    diet: String(s.diet || 'omnivore').trim(),
    decorHints: isEn ? decorEn : decorDe,
    decorHints_de: decorDe,
    decorHints_en: decorEn,
    behaviorNotes: isEn ? behaviorEn : behaviorDe,
    behaviorNotes_de: behaviorDe,
    behaviorNotes_en: behaviorEn,
    description: isEn ? descEn : descDe,
    description_de: descDe,
    description_en: descEn,
  };
}

class SpeciesCatalog {
  private cache: { rawList: Record<string, unknown>[]; catalogList: SpeciesCatalogDescriptor[] } | null = null;
  private localized = new Map<string, {
    list: ReturnType<typeof normalizeSpecies>[];
    byId: Map<string, ReturnType<typeof normalizeSpecies>>;
    categories: string[];
  }>();
  private normalizedCount = -1;
  constructor(private readonly builtinDir = BUILTIN_SPECIES_DIR, private readonly customDir = CUSTOM_SPECIES_DIR) {}
  load(forceReload = false) {
    if (this.cache && !forceReload) {
      return this.cache;
    }

    this.localized.clear();
    this.normalizedCount = -1;
    fs.mkdirSync(this.builtinDir, { recursive: true });
    const rawList: Record<string, unknown>[] = [];
    const catalogList: SpeciesCatalogDescriptor[] = [];

    const scanDir = (dir: string) => {
      if (!fs.existsSync(dir)) return;
      const files = fs.readdirSync(dir);
      for (const file of files) {
        if (!file.endsWith('.json')) continue;
        const fullPath = path.join(dir, file);
        try {
          const raw = fs.readFileSync(fullPath, 'utf8');
          const data = asRecord(JSON.parse(raw) as unknown);
          if (!data || !data.id || !Array.isArray(data.species)) continue;

          catalogList.push({
            id: String(data.id).trim(),
            name: String(data.name || data.id).trim(),
            description: String(data.description || '').trim(),
            count: data.species.length,
            file,
          });

          for (const rawItem of data.species) {
            if (isRecord(rawItem)) rawList.push(rawItem);
          }
        } catch (caught: unknown) {
          const err = asError(caught);
          console.error(`[SpeciesService] Fehler beim Laden von ${fullPath}:`, err.message);
        }
      }
    };

    scanDir(this.builtinDir);
    scanDir(this.customDir);

    this.cache = {
      rawList,
      catalogList,
    };
    return this.cache;
  }

  private localizedCatalog(lang: string) {
    const { rawList } = this.load();
    // Also respect additions/removals made through the existing raw catalog API.
    if (this.normalizedCount !== rawList.length) {
      this.localized.clear();this.normalizedCount = rawList.length;
    }
    const key = lang === 'en' ? 'en' : 'de';
    const cached = this.localized.get(key);
    if (cached) return cached;
    const map = new Map<string, ReturnType<typeof normalizeSpecies>>();
    for (const item of rawList) {
      const s = normalizeSpecies(item, key);
      if (s.id && !map.has(s.id)) {
        map.set(s.id, s);
      }
    }
    const list = Array.from(map.values());
    const result = { list, byId: map, categories: [...new Set(list.map(item => item.category).filter(Boolean))].sort() };
    this.localized.set(key, result);
    return result;
  }

  getAllSpecies(lang: string = 'de') {
    return this.localizedCatalog(lang).list.slice();
  }

  getSpeciesById(id: unknown, lang: string = 'de') {
    if (!id) return null;
    const key = String(id).trim().toLowerCase();
    return this.localizedCatalog(lang).byId.get(SPECIES_ID_ALIASES[key] || key) || null;
  }

  findSpeciesByName(name: unknown, lang: string = 'de') {
    if (!name) return null;
    const q = String(name).trim().toLowerCase();
    const list = this.getAllSpecies(lang);

    // 1. Exakter ID-Match
    let match = list.find((s) => s.id === (SPECIES_ID_ALIASES[q] || q));
    if (match) return match;

    // 2. Exakter Name-Match (deutsch oder englisch)
    match = list.find((s) => s.name.toLowerCase() === q || s.name_de.toLowerCase() === q || s.name_en.toLowerCase() === q);
    if (match) return match;

    // 3. Exakter Wissenschaftlicher Name Match
    match = list.find((s) => s.scientificName.toLowerCase() === q);
    if (match) return match;

    // 4. Teilstring Match im Namen
    match = list.find((s) =>
      s.name.toLowerCase().includes(q) ||
      s.name_de.toLowerCase().includes(q) ||
      s.name_en.toLowerCase().includes(q) ||
      q.includes(s.name.toLowerCase())
    );
    if (match) return match;

    // 5. Match nach Anfangswort
    match = list.find((s) =>
      s.name.toLowerCase().startsWith(q) ||
      s.name_de.toLowerCase().startsWith(q) ||
      s.name_en.toLowerCase().startsWith(q) ||
      s.scientificName.toLowerCase().startsWith(q)
    );
    return match || null;
  }

  getCategories(lang: string = 'de') {
    return this.localizedCatalog(lang).categories.slice();
  }

}
const speciesCatalog = new SpeciesCatalog();
const loadSpecies = speciesCatalog.load.bind(speciesCatalog);
const getAllSpecies = speciesCatalog.getAllSpecies.bind(speciesCatalog);
const getSpeciesById = speciesCatalog.getSpeciesById.bind(speciesCatalog);
const findSpeciesByName = speciesCatalog.findSpeciesByName.bind(speciesCatalog);
const getCategories = speciesCatalog.getCategories.bind(speciesCatalog);


/**
 * Prüft den gesamten Besatz eines Aquariums auf Kompatibilität,
 * Wasserparameter-Überschneidungen, Beckengrößen, Mindestgruppengrößen,
 * Territorialverhalten und Vergesellschaftungskonflikte in Deutsch oder Englisch.
 */
const analyzeStockCompatibility = (aquarium: { water_type?: string; volume_l?: number | null } | null | undefined, stockItems: { species: string; count?: number; profile?: string | null }[] = [], lang = 'de') => analyzeCompatibility(aquarium, stockItems, lang, findSpeciesByName);

export = {
  SpeciesCatalog,
  speciesCatalog,
  loadSpecies,
  getAllSpecies,
  getSpeciesById,
  findSpeciesByName,
  getCategories,
  analyzeStockCompatibility,
};

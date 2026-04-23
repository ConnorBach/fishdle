#!/usr/bin/env node

/**
 * Build script: Fetches all PhyloPic images + Wikidata traits → animals.json
 *
 * Phases:
 *   1. Fetch all PhyloPic image pages (249 pages, 50 items each)
 *   2. Fetch image details (SVG URL, node UUID, attribution)
 *   3. Fetch taxonomic lineage for each image's node
 *   4. Fetch traits from Wikidata SPARQL (batched by class)
 *   5. Merge everything → data/animals.json
 *
 * All intermediate results are cached to tools/.cache/ for resumability.
 * Estimated runtime: ~45-90 min with polite rate limiting.
 *
 * Usage: node tools/build-animal-index.js
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

// ── Config ──────────────────────────────────────────────────────────
const PHYLOPIC_BASE = 'https://api.phylopic.org';
const PHYLOPIC_BUILD = 535;
const ITEMS_PER_PAGE = 50;
const PAGE_DELAY_MS = 150;
const DETAIL_DELAY_MS = 100;
const WIKIDATA_SPARQL = 'https://query.wikidata.org/sparql';

const ROOT = path.resolve(__dirname, '..');
const CACHE_DIR = path.join(__dirname, '.cache');
const PAGE_CACHE = path.join(CACHE_DIR, 'phylopic-pages');
const DETAIL_CACHE = path.join(CACHE_DIR, 'image-details');
const LINEAGE_CACHE = path.join(CACHE_DIR, 'lineages');
const WIKIDATA_CACHE = path.join(CACHE_DIR, 'wikidata');
const OUTPUT_FILE = path.join(ROOT, 'data', 'animals.json');

const KNOWN_RANKS = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'known-ranks.json'), 'utf8'));
const COMMON_ANIMALS = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'common-animals.json'), 'utf8'));
const TRAIT_INFERENCE = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'trait-inference.json'), 'utf8'));

// ── Helpers ─────────────────────────────────────────────────────────
function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function httpsGet(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const opts = {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Animaldle-Build/1.0 (https://github.com/connorbach/fishdle)',
        ...headers
      }
    };
    https.get(url, opts, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return httpsGet(res.headers.location, headers).then(resolve, reject);
      }
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode >= 400) {
          reject(new Error(`HTTP ${res.statusCode}: ${url}\n${data.slice(0, 200)}`));
        } else {
          resolve(data);
        }
      });
      res.on('error', reject);
    }).on('error', reject);
  });
}

async function fetchJSON(url) {
  const raw = await httpsGet(url);
  return JSON.parse(raw);
}

function readCache(filepath) {
  if (fs.existsSync(filepath)) {
    return JSON.parse(fs.readFileSync(filepath, 'utf8'));
  }
  return null;
}

function writeCache(filepath, data) {
  fs.writeFileSync(filepath, JSON.stringify(data, null, 2));
}

function progress(current, total, label) {
  const pct = ((current / total) * 100).toFixed(1);
  process.stdout.write(`\r  [${pct}%] ${label}: ${current}/${total}`);
  if (current === total) process.stdout.write('\n');
}

// ── Phase 1: Fetch PhyloPic image pages ─────────────────────────────
function extractItems(pageData) {
  // PhyloPic API puts items under _links.items as [{href, title}]
  return pageData._links?.items || pageData._embedded?.items || pageData.items || [];
}

async function fetchAllPages() {
  ensureDir(PAGE_CACHE);
  console.log('\n📄 Phase 1: Fetching PhyloPic image pages...');

  // Fetch pages until there's no "next" link
  // We already have cached pages from a prior run, so count them
  let totalPages = 249; // default estimate
  const allItems = [];
  let p = 0;

  while (p < 500) { // safety cap
    const cacheFile = path.join(PAGE_CACHE, `page-${p}.json`);
    let pageData = readCache(cacheFile);

    if (!pageData) {
      const url = `${PHYLOPIC_BASE}/images?build=${PHYLOPIC_BUILD}&page=${p}`;
      try {
        pageData = await fetchJSON(url);
        writeCache(cacheFile, pageData);
      } catch (err) {
        console.error(`\n  ⚠ Failed page ${p}: ${err.message}`);
        break;
      }
      if (p > 0) await sleep(PAGE_DELAY_MS);
    }

    const items = extractItems(pageData);
    allItems.push(...items);

    // Check if there's a next page
    const hasNext = pageData._links?.next != null;
    if (!hasNext) {
      totalPages = p + 1;
      progress(totalPages, totalPages, 'Pages fetched');
      break;
    }

    p++;
    if (p % 10 === 0) {
      progress(p, totalPages, 'Pages fetched');
    }
  }

  console.log(`  Total pages: ${totalPages}`);
  console.log(`  Total images found: ${allItems.length}`);
  return allItems;
}

// ── Phase 2: Fetch image details ────────────────────────────────────
async function fetchImageDetails(items) {
  ensureDir(DETAIL_CACHE);
  console.log('\n🔍 Phase 2: Fetching image details...');

  const results = [];
  const total = items.length;

  for (let i = 0; i < total; i++) {
    const item = items[i];
    // Extract UUID from href like "/images/{uuid}?build=535"
    const hrefMatch = (item.href || item._links?.self?.href || '').match(/\/images\/([a-f0-9-]+)/);
    if (!hrefMatch) continue;

    const uuid = hrefMatch[1];
    const cacheFile = path.join(DETAIL_CACHE, `${uuid}.json`);
    let detail = readCache(cacheFile);

    if (!detail) {
      const url = `${PHYLOPIC_BASE}/images/${uuid}?build=${PHYLOPIC_BUILD}&embed_specificNode=true`;
      try {
        detail = await fetchJSON(url);
        writeCache(cacheFile, detail);
      } catch (err) {
        console.error(`\n  ⚠ Failed ${uuid}: ${err.message}`);
        continue;
      }
      await sleep(DETAIL_DELAY_MS);
    }

    // Extract relevant fields from detail response
    // _links.vectorFile.href is the SVG URL
    // _links.specificNode has {href, title} where title is the scientific name
    // _links.contributor.title is the contributor name
    // _links.license.href is the license URL
    const svgLink = detail._links?.vectorFile?.href;
    const nodeLink = detail._links?.specificNode?.href;
    const nodeUuid = nodeLink ? nodeLink.match(/\/nodes\/([a-f0-9-]+)/)?.[1] : null;
    const title = item.title || detail._links?.specificNode?.title || '';

    const contributor = detail._links?.contributor?.title || detail.attribution || 'Unknown';
    const license = detail._links?.license?.href || '';

    // SVG URL construction
    let svgUrl = svgLink || `https://images.phylopic.org/images/${uuid}/vector.svg`;
    if (svgUrl.startsWith('//')) svgUrl = 'https:' + svgUrl;
    if (svgUrl.startsWith('/')) svgUrl = 'https://images.phylopic.org' + svgUrl;

    // Thumbnail URL
    const thumbnailUrl = `https://images.phylopic.org/images/${uuid}/raster/512x512.png`;

    results.push({
      uuid,
      title,
      svgUrl,
      thumbnailUrl,
      nodeUuid,
      contributor,
      license
    });

    if ((i + 1) % 100 === 0 || i === total - 1) {
      progress(i + 1, total, 'Details fetched');
    }
  }

  console.log(`  Details collected: ${results.length}`);
  return results;
}

// ── Phase 3: Fetch taxonomic lineage ────────────────────────────────
async function fetchLineages(images) {
  ensureDir(LINEAGE_CACHE);
  console.log('\n🌿 Phase 3: Fetching taxonomic lineages...');

  const total = images.length;
  let fetched = 0;

  for (const img of images) {
    if (!img.nodeUuid) {
      img.lineage = [];
      img.taxonomy = {};
      fetched++;
      continue;
    }

    const cacheFile = path.join(LINEAGE_CACHE, `${img.nodeUuid}.json`);
    let lineageData = readCache(cacheFile);

    if (!lineageData) {
      // Fetch first page of lineage (sufficient for major ranks)
      const url = `${PHYLOPIC_BASE}/nodes/${img.nodeUuid}/lineage?build=${PHYLOPIC_BUILD}&page=0`;
      try {
        lineageData = await fetchJSON(url);
        writeCache(cacheFile, lineageData);
      } catch (err) {
        console.error(`\n  ⚠ Failed lineage ${img.nodeUuid}: ${err.message}`);
        img.lineage = [];
        img.taxonomy = {};
        fetched++;
        continue;
      }
      await sleep(DETAIL_DELAY_MS);
    }

    // Parse lineage: _links.items is [{href, title}] where title is the taxon name
    const lineageItems = lineageData._links?.items || [];
    const lineageNames = [];
    const taxonomy = {};

    for (const node of lineageItems) {
      const nodeName = node.title;
      if (!nodeName) continue;

      lineageNames.push(nodeName);

      // Map to rank if known
      if (KNOWN_RANKS[nodeName]) {
        taxonomy[KNOWN_RANKS[nodeName]] = nodeName;
      }
    }

    img.lineage = lineageNames;
    img.taxonomy = taxonomy;

    fetched++;
    if (fetched % 100 === 0 || fetched === total) {
      progress(fetched, total, 'Lineages fetched');
    }
  }

  return images;
}

// ── Phase 4: Fetch Wikidata traits ──────────────────────────────────
async function fetchWikidataTraits(images) {
  ensureDir(WIKIDATA_CACHE);
  console.log('\n📊 Phase 4: Fetching Wikidata traits...');

  // Group images by class for batched queries
  const byClass = {};
  for (const img of images) {
    const cls = img.taxonomy?.class || 'Unknown';
    if (!byClass[cls]) byClass[cls] = [];
    byClass[cls].push(img);
  }

  const classes = Object.keys(byClass);
  console.log(`  Classes to query: ${classes.length}`);

  const traitMap = {}; // scientificName → traits

  for (let i = 0; i < classes.length; i++) {
    const cls = classes[i];
    if (cls === 'Unknown') continue;

    const cacheFile = path.join(WIKIDATA_CACHE, `${cls}.json`);
    let cached = readCache(cacheFile);

    if (!cached) {
      // Build SPARQL query for this class
      const names = byClass[cls]
        .map(img => img.title)
        .filter(Boolean)
        .slice(0, 200); // Limit batch size to avoid SPARQL timeouts

      if (names.length === 0) continue;

      const valuesStr = names.map(n => `"${n.replace(/"/g, '\\"')}"`).join(' ');

      const query = `
        SELECT ?item ?itemLabel ?taxonName ?mass ?habitatLabel ?dietLabel ?commonName WHERE {
          VALUES ?taxonName { ${valuesStr} }
          ?item wdt:P225 ?taxonName .
          OPTIONAL { ?item wdt:P2067 ?mass . }
          OPTIONAL { ?item wdt:P2974 ?habitat . }
          OPTIONAL { ?item wdt:P1034 ?diet . }
          OPTIONAL { ?item wdt:P1843 ?commonName . FILTER(LANG(?commonName) = "en") }
          SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
        }
      `;

      try {
        const encodedQuery = encodeURIComponent(query);
        const url = `${WIKIDATA_SPARQL}?query=${encodedQuery}&format=json`;
        const raw = await httpsGet(url, {
          'Accept': 'application/sparql-results+json',
          'User-Agent': 'Animaldle-Build/1.0 (https://github.com/connorbach/fishdle)'
        });
        cached = JSON.parse(raw);
        writeCache(cacheFile, cached);
      } catch (err) {
        console.error(`\n  ⚠ Wikidata failed for ${cls}: ${err.message}`);
        continue;
      }
      await sleep(2000); // Be extra polite with Wikidata
    }

    // Parse results
    const bindings = cached?.results?.bindings || [];
    for (const b of bindings) {
      const name = b.taxonName?.value;
      if (!name) continue;

      const traits = {};
      if (b.mass?.value) {
        const massKg = parseFloat(b.mass.value);
        traits.mass = massKg;
        traits.size = massToSize(massKg);
      }
      if (b.habitatLabel?.value) {
        traits.habitat = normalizeHabitat(b.habitatLabel.value);
      }
      if (b.dietLabel?.value) {
        traits.diet = normalizeDiet(b.dietLabel.value);
      }
      if (b.commonName?.value) {
        traits.commonName = b.commonName.value;
      } else if (b.itemLabel?.value && b.itemLabel.value !== b.taxonName?.value) {
        traits.commonName = b.itemLabel.value;
      }

      traitMap[name] = { ...traitMap[name], ...traits };
    }

    progress(i + 1, classes.length, 'Wikidata classes');
  }

  // Apply traits to images
  for (const img of images) {
    img.wikidataTraits = traitMap[img.title] || {};
  }

  console.log(`  Traits found for: ${Object.keys(traitMap).length} species`);
  return images;
}

function massToSize(kg) {
  if (kg < 0.1) return 'tiny';
  if (kg < 5) return 'small';
  if (kg < 50) return 'medium';
  if (kg < 500) return 'large';
  return 'giant';
}

function normalizeHabitat(raw) {
  const lower = raw.toLowerCase();
  if (lower.includes('marine') || lower.includes('ocean') || lower.includes('sea')) return 'marine';
  if (lower.includes('freshwater') || lower.includes('river') || lower.includes('lake')) return 'freshwater';
  if (lower.includes('aerial') || lower.includes('flying')) return 'aerial';
  if (lower.includes('terrestrial') || lower.includes('land') || lower.includes('forest') ||
      lower.includes('desert') || lower.includes('grassland') || lower.includes('mountain')) return 'terrestrial';
  return 'terrestrial';
}

function normalizeDiet(raw) {
  const lower = raw.toLowerCase();
  if (lower.includes('carniv') || lower.includes('predator') || lower.includes('pisciv')) return 'carnivore';
  if (lower.includes('herbiv') || lower.includes('graminiv') || lower.includes('folivore') ||
      lower.includes('frugivore') || lower.includes('nectariv')) return 'herbivore';
  if (lower.includes('omniv')) return 'omnivore';
  if (lower.includes('insectiv') || lower.includes('invertiv')) return 'insectivore';
  if (lower.includes('photosynth') || lower.includes('autotroph')) return 'photosynthetic';
  if (lower.includes('decompos') || lower.includes('saprotroph') || lower.includes('detritivore')) return 'decomposer';
  return 'omnivore';
}

// ── Phase 4b: Fetch Wikipedia summaries ─────────────────────────────
const WIKIPEDIA_CACHE = path.join(CACHE_DIR, 'wikipedia');

async function fetchWikipediaSummaries(images) {
  ensureDir(WIKIPEDIA_CACHE);
  console.log('\n📖 Phase 4b: Fetching Wikipedia summaries...');

  for (let i = 0; i < images.length; i++) {
    const img = images[i];
    const title = img.title;
    if (!title) { img.wikipediaSummary = ''; continue; }

    const cacheFile = path.join(WIKIPEDIA_CACHE, `${title.replace(/\//g, '_')}.json`);
    let cached = readCache(cacheFile);

    if (!cached) {
      // Try scientific name first, then common name
      const queryNames = [title, img.wikidataTraits?.commonName].filter(Boolean);
      for (const queryName of queryNames) {
        try {
          const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(queryName)}`;
          const raw = await httpsGet(url);
          cached = JSON.parse(raw);
          if (cached.extract) break;
        } catch (e) { /* try next */ }
      }
      if (cached) writeCache(cacheFile, cached);
      await sleep(100);
    }

    img.wikipediaSummary = cached?.extract || '';
    if ((i + 1) % 200 === 0 || i === images.length - 1) {
      progress(i + 1, images.length, 'Wikipedia summaries');
    }
  }

  console.log(`  Summaries found: ${images.filter(i => i.wikipediaSummary).length}`);
  return images;
}

// ── Phase 5: Merge + generate animals.json ──────────────────────────
function mergeAndGenerate(images) {
  console.log('\n📦 Phase 5: Merging data and generating animals.json...');

  const animals = [];

  for (const img of images) {
    const scientificName = img.title || '';
    if (!scientificName) continue;

    // Determine common name
    let name = img.wikidataTraits?.commonName ||
               COMMON_ANIMALS.common_names[scientificName] ||
               scientificName;

    // Check prehistoric exceptions (use genus as display name)
    const genus = scientificName.split(' ')[0];
    const prehistoric = COMMON_ANIMALS.prehistoric_exceptions || {};
    if (name === scientificName && prehistoric[genus]) {
      name = prehistoric[genus];
    }

    // Skip bad names (Wikidata IDs, lab codes)
    if (/^Q\d+/.test(name) || /^L\d+-S\d+/.test(name)) continue;

    // Determine class — fix Sarcopterygii for non-fish tetrapods
    let classRaw = img.taxonomy?.class || '';
    const inferredClass = inferClassFromOrder(img.taxonomy);
    if (inferredClass && (classRaw === 'Sarcopterygii' || classRaw === '')) {
      classRaw = inferredClass;
      img.taxonomy.class = inferredClass;
    }
    const className = getClassDisplayName(classRaw);

    // Skip plants
    if (className === 'Plant') continue;

    // Skip Latin-only names (no common name and no prehistoric exception)
    if (name === scientificName) continue;

    // Determine traits with fallback inference
    const habitat = img.wikidataTraits?.habitat ||
                    inferTrait(img.taxonomy, 'habitat') ||
                    'terrestrial';

    const diet = img.wikidataTraits?.diet ||
                 inferTrait(img.taxonomy, 'diet') ||
                 'omnivore';

    const size = img.wikidataTraits?.size ||
                 inferTrait(img.taxonomy, 'size') ||
                 'medium';

    // Build lineage array (top-level taxa only)
    const lineage = buildLineageArray(img);

    // Determine difficulty
    const difficulty = getDifficulty(name, scientificName, className);

    animals.push({
      id: img.uuid,
      name,
      scientificName,
      svgUrl: img.svgUrl,
      thumbnailUrl: img.thumbnailUrl,
      attributes: {
        class: className,
        habitat,
        diet,
        size
      },
      lineage,
      difficulty,
      funFact: img.wikipediaSummary || '',
      attribution: img.contributor,
      license: img.license
    });
  }

  // Sort by UUID for deterministic seeded random
  animals.sort((a, b) => a.id.localeCompare(b.id));

  // Deduplicate by name (keep entry with best funFact)
  const seen = new Map();
  for (const animal of animals) {
    const key = animal.name.toLowerCase();
    if (!seen.has(key)) {
      seen.set(key, animal);
    } else {
      const existing = seen.get(key);
      if (!existing.funFact && animal.funFact) {
        seen.set(key, animal);
      } else if (animal.funFact && existing.funFact && animal.funFact.length > existing.funFact.length) {
        seen.set(key, animal);
      }
    }
  }
  const dedupedAnimals = Array.from(seen.values());
  dedupedAnimals.sort((a, b) => a.id.localeCompare(b.id));

  console.log(`  Before dedup: ${animals.length}`);
  console.log(`  Total animals: ${dedupedAnimals.length}`);
  console.log(`  Easy: ${dedupedAnimals.filter(a => a.difficulty === 'easy').length}`);
  console.log(`  Medium: ${dedupedAnimals.filter(a => a.difficulty === 'medium').length}`);
  console.log(`  Hard: ${dedupedAnimals.filter(a => a.difficulty === 'hard').length}`);

  // Count by class
  const classCounts = {};
  for (const a of dedupedAnimals) {
    classCounts[a.attributes.class] = (classCounts[a.attributes.class] || 0) + 1;
  }
  console.log('  Classes:', JSON.stringify(classCounts, null, 2));

  return dedupedAnimals;
}

// Orders that map to a more specific class when lineage gives Sarcopterygii
const ORDER_TO_CLASS = {
  // Reptilia
  'Squamata': 'Reptilia', 'Testudines': 'Reptilia', 'Crocodylia': 'Reptilia', 'Rhynchocephalia': 'Reptilia',
  // Amphibia
  'Anura': 'Amphibia', 'Caudata': 'Amphibia', 'Gymnophiona': 'Amphibia',
  // Mammalia
  'Carnivora': 'Mammalia', 'Primates': 'Mammalia', 'Rodentia': 'Mammalia', 'Chiroptera': 'Mammalia',
  'Cetacea': 'Mammalia', 'Artiodactyla': 'Mammalia', 'Perissodactyla': 'Mammalia', 'Proboscidea': 'Mammalia',
  'Lagomorpha': 'Mammalia', 'Sirenia': 'Mammalia', 'Pilosa': 'Mammalia', 'Cingulata': 'Mammalia',
  'Monotremata': 'Mammalia', 'Diprotodontia': 'Mammalia', 'Dasyuromorphia': 'Mammalia',
  'Eulipotyphla': 'Mammalia', 'Pholidota': 'Mammalia', 'Dermoptera': 'Mammalia',
  'Scandentia': 'Mammalia', 'Tubulidentata': 'Mammalia', 'Hyracoidea': 'Mammalia',
  'Macroscelidea': 'Mammalia', 'Afrosoricida': 'Mammalia', 'Didelphimorphia': 'Mammalia',
  // Aves
  'Passeriformes': 'Aves', 'Accipitriformes': 'Aves', 'Falconiformes': 'Aves',
  'Strigiformes': 'Aves', 'Psittaciformes': 'Aves', 'Columbiformes': 'Aves',
  'Galliformes': 'Aves', 'Anseriformes': 'Aves', 'Charadriiformes': 'Aves',
  'Pelecaniformes': 'Aves', 'Procellariiformes': 'Aves', 'Sphenisciformes': 'Aves',
  'Coraciiformes': 'Aves', 'Piciformes': 'Aves', 'Apodiformes': 'Aves',
  'Cuculiformes': 'Aves', 'Gruiformes': 'Aves', 'Caprimulgiformes': 'Aves',
  'Trogoniformes': 'Aves', 'Bucerotiformes': 'Aves', 'Casuariiformes': 'Aves',
  'Struthioniformes': 'Aves', 'Rheiformes': 'Aves', 'Tinamiformes': 'Aves', 'Apterygiformes': 'Aves'
};

function inferClassFromOrder(taxonomy) {
  const order = taxonomy?.order;
  if (!order) return null;
  return ORDER_TO_CLASS[order] || null;
}

function getClassDisplayName(raw) {
  const map = {
    'Mammalia': 'Mammal',
    'Aves': 'Bird',
    'Reptilia': 'Reptile',
    'Amphibia': 'Amphibian',
    'Actinopterygii': 'Fish',
    'Chondrichthyes': 'Fish',
    'Sarcopterygii': 'Fish',
    'Myxini': 'Fish',
    'Petromyzonti': 'Fish',
    'Insecta': 'Insect',
    'Arachnida': 'Arachnid',
    'Malacostraca': 'Crustacean',
    'Maxillopoda': 'Crustacean',
    'Branchiopoda': 'Crustacean',
    'Gastropoda': 'Mollusk',
    'Bivalvia': 'Mollusk',
    'Cephalopoda': 'Mollusk',
    'Anthozoa': 'Cnidarian',
    'Scyphozoa': 'Cnidarian',
    'Hydrozoa': 'Cnidarian',
    'Cubozoa': 'Cnidarian',
    'Asteroidea': 'Echinoderm',
    'Echinoidea': 'Echinoderm',
    'Holothuroidea': 'Echinoderm',
    'Ophiuroidea': 'Echinoderm',
    'Crinoidea': 'Echinoderm',
    'Polychaeta': 'Worm',
    'Clitellata': 'Worm',
    'Chilopoda': 'Myriapod',
    'Diplopoda': 'Myriapod',
    'Demospongiae': 'Sponge',
    'Calcarea': 'Sponge',
    'Hexactinellida': 'Sponge',
    'Magnoliopsida': 'Plant',
    'Liliopsida': 'Plant',
    'Pinopsida': 'Plant',
    'Polypodiopsida': 'Plant',
    'Lycopodiopsida': 'Plant',
    'Agaricomycetes': 'Fungus',
    'Sordariomycetes': 'Fungus',
    'Eurotiomycetes': 'Fungus',
    'Lecanoromycetes': 'Fungus',
    'Collembola': 'Insect',
    'Merostomata': 'Arachnid',
    'Pycnogonida': 'Arachnid'
  };
  return map[raw] || raw || 'Unknown';
}

function inferTrait(taxonomy, traitName) {
  // Try family → order → class
  if (taxonomy?.family && TRAIT_INFERENCE.family[taxonomy.family]?.[traitName]) {
    return TRAIT_INFERENCE.family[taxonomy.family][traitName];
  }
  if (taxonomy?.order && TRAIT_INFERENCE.order[taxonomy.order]?.[traitName]) {
    return TRAIT_INFERENCE.order[taxonomy.order][traitName];
  }
  if (taxonomy?.class && TRAIT_INFERENCE.class[taxonomy.class]?.[traitName]) {
    return TRAIT_INFERENCE.class[taxonomy.class][traitName];
  }
  return null;
}

function buildLineageArray(img) {
  const lineage = [];
  // Add known taxonomy in order: Family, Order, Class, Phylum, Kingdom
  if (img.taxonomy?.family) lineage.push(img.taxonomy.family);
  if (img.taxonomy?.order) lineage.push(img.taxonomy.order);
  if (img.taxonomy?.class) lineage.push(img.taxonomy.class);
  if (img.taxonomy?.phylum) lineage.push(img.taxonomy.phylum);
  if (img.taxonomy?.kingdom) lineage.push(img.taxonomy.kingdom);
  return lineage;
}

function getDifficulty(name, scientificName, className) {
  const easyList = COMMON_ANIMALS.easy_list;

  // Easy: whole-word match against curated easy_list
  for (const easy of easyList) {
    const escaped = easy.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp('\\b' + escaped + '\\b', 'i');
    if (regex.test(name)) {
      return 'easy';
    }
  }

  // Hard: obscure animals only enthusiasts would know
  if (isHardAnimal(name, className)) {
    return 'hard';
  }

  // Medium: recognizable animals with common names
  return 'medium';
}

const HARD_CLASSES = new Set([
  'Arachnid', 'Myriapod', 'Echinoderm', 'Cnidarian',
  'Mollusk', 'Crustacean', 'Fungus', 'Sponge', 'Worm',
  'Ostracoda', 'Remipedia', 'Scaphopoda', 'Polyplacophora'
]);

function isHardAnimal(name, className) {
  const words = name.split(/[\s,;]+/).filter(Boolean).length;

  // Latin-looking names or taxonomic notes
  if (/^[A-Z][a-z]+\s[a-z]+(us|is|ae|ii|ei|um|a|orum|arum)$/.test(name)) return true;
  if (/[()]/.test(name)) return true;

  // Obscure classes
  if (HARD_CLASSES.has(className)) return true;

  // 3+ word names (very specific species)
  if (words >= 3) return true;

  return false;
}

// ── Main ────────────────────────────────────────────────────────────
async function main() {
  console.log('🐾 Animaldle Build Script');
  console.log('========================');
  console.log(`Output: ${OUTPUT_FILE}`);

  ensureDir(CACHE_DIR);
  ensureDir(path.join(ROOT, 'data'));

  try {
    // Phase 1: Fetch all pages
    const allItems = await fetchAllPages();

    // Phase 2: Fetch image details
    const images = await fetchImageDetails(allItems);

    // Phase 3: Fetch lineages
    await fetchLineages(images);

    // Phase 4: Fetch Wikidata traits
    await fetchWikidataTraits(images);

    // Phase 4b: Fetch Wikipedia summaries
    await fetchWikipediaSummaries(images);

    // Phase 5: Merge and generate
    const animals = mergeAndGenerate(images);

    // Write output
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(animals, null, 2));
    console.log(`\n✅ Generated ${OUTPUT_FILE}`);
    console.log(`   File size: ${(fs.statSync(OUTPUT_FILE).size / 1024 / 1024).toFixed(2)} MB`);
    console.log(`   Total entries: ${animals.length}`);

  } catch (err) {
    console.error('\n❌ Build failed:', err);
    process.exit(1);
  }
}

main();

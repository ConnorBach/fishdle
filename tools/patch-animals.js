#!/usr/bin/env node

/**
 * One-time patch script to fix animal trait data quality issues:
 * 1. Reptiles/amphibians incorrectly classified as "Fish" (Sarcopterygii)
 * 2. Cetaceans/pinnipeds/sea turtles incorrectly listed as terrestrial
 *
 * Usage: node tools/patch-animals.js
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const ANIMALS_FILE = path.join(ROOT, 'data', 'animals.json');
const TRAIT_INFERENCE = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'trait-inference.json'), 'utf8'));

// ── Order → correct class mapping ──────────────────────────────────
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

// ── Class display name mapping ─────────────────────────────────────
const CLASS_DISPLAY = {
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

// ── Sarcopterygii genera that are actually fish ──────────────────
const SARCOPTERYGII_FISH_GENERA = new Set([
  'Latimeria', 'Neoceratodus', 'Protopterus', 'Lepidosiren',
  'Holoptychius', 'Chinlea', 'Macropoma', 'Eusthenopteron',
  'Panderichthys', 'Tiktaalik'
]);

// ── Helpers ────────────────────────────────────────────────────────

function getOrder(animal) {
  // lineage is [family, order, class, phylum, kingdom] — order is at index 1
  // But we need to identify which element is an order
  for (const taxon of animal.lineage || []) {
    if (ORDER_TO_CLASS[taxon]) return taxon;
    // Also check trait-inference order keys
    if (TRAIT_INFERENCE.order[taxon]) return taxon;
  }
  return null;
}

function getFamily(animal) {
  for (const taxon of animal.lineage || []) {
    if (TRAIT_INFERENCE.family[taxon]) return taxon;
  }
  return null;
}

function getClassFromLineage(animal) {
  // The class in the lineage (raw taxonomic class, not display name)
  for (const taxon of animal.lineage || []) {
    if (TRAIT_INFERENCE.class[taxon]) return taxon;
  }
  return null;
}

function inferTrait(traitName, family, order, cls) {
  if (family && TRAIT_INFERENCE.family[family]?.[traitName]) {
    return TRAIT_INFERENCE.family[family][traitName];
  }
  if (order && TRAIT_INFERENCE.order[order]?.[traitName]) {
    return TRAIT_INFERENCE.order[order][traitName];
  }
  if (cls && TRAIT_INFERENCE.class[cls]?.[traitName]) {
    return TRAIT_INFERENCE.class[cls][traitName];
  }
  return null;
}

// ── Main ───────────────────────────────────────────────────────────

console.log('🔧 Patching animals.json...\n');

const animals = JSON.parse(fs.readFileSync(ANIMALS_FILE, 'utf8'));
console.log(`Loaded ${animals.length} animals`);

const changes = {
  classFixed: [],
  habitatFixed: [],
  dietFixed: [],
  sizeFixed: [],
  lineageFixed: []
};

for (const animal of animals) {
  const order = getOrder(animal);
  const family = getFamily(animal);
  const lineageClass = getClassFromLineage(animal);

  // ── Fix 1: Class correction ──────────────────────────────────
  // If class display is "Fish" but order maps to a non-fish class, fix it
  if (order && ORDER_TO_CLASS[order]) {
    const correctClass = ORDER_TO_CLASS[order];
    const correctDisplay = CLASS_DISPLAY[correctClass];

    if (animal.attributes.class !== correctDisplay) {
      const oldClass = animal.attributes.class;
      animal.attributes.class = correctDisplay;

      // Also fix the lineage array — replace wrong class with correct one
      const wrongClasses = ['Sarcopterygii'];
      const lineageIdx = animal.lineage.findIndex(t => wrongClasses.includes(t));
      if (lineageIdx !== -1) {
        animal.lineage[lineageIdx] = correctClass;
        changes.lineageFixed.push(`${animal.scientificName}: ${wrongClasses[0]} → ${correctClass}`);
      }

      changes.classFixed.push(`${animal.scientificName}: ${oldClass} → ${correctDisplay}`);
    }
  }

  // ── Fix 1b: Sarcopterygii without recognized order ─────────────
  // If class is "Fish", lineage includes Sarcopterygii, no recognized order,
  // and genus is NOT in the fish allowlist → reclassify as Reptile/terrestrial
  let fixedBySarco = false;
  if (!order && animal.attributes.class === 'Fish' &&
      (animal.lineage || []).includes('Sarcopterygii')) {
    const genus = animal.scientificName ? animal.scientificName.split(' ')[0] : '';
    if (!SARCOPTERYGII_FISH_GENERA.has(genus)) {
      fixedBySarco = true;
      const oldClass = animal.attributes.class;
      animal.attributes.class = 'Reptile';

      // Fix lineage array
      const lineageIdx = (animal.lineage || []).indexOf('Sarcopterygii');
      if (lineageIdx !== -1) {
        animal.lineage[lineageIdx] = 'Reptilia';
        changes.lineageFixed.push(`${animal.scientificName}: Sarcopterygii → Reptilia`);
      }

      changes.classFixed.push(`${animal.scientificName}: ${oldClass} → Reptile`);

      // Also set habitat to terrestrial
      if (animal.attributes.habitat !== 'terrestrial') {
        const oldHabitat = animal.attributes.habitat;
        animal.attributes.habitat = 'terrestrial';
        changes.habitatFixed.push(`${animal.scientificName}: ${oldHabitat} → terrestrial`);
      }
    }
  }

  // ── Fix 2: Re-infer traits using updated trait-inference.json ──
  // Re-derive the correct class for trait inference
  const effectiveClass = order && ORDER_TO_CLASS[order] ? ORDER_TO_CLASS[order] : lineageClass;

  // Re-infer habitat (skip if Fix 1b already set it to terrestrial)
  const newHabitat = fixedBySarco ? null : inferTrait('habitat', family, order, effectiveClass);
  if (newHabitat && animal.attributes.habitat !== newHabitat) {
    const oldHabitat = animal.attributes.habitat;
    animal.attributes.habitat = newHabitat;
    changes.habitatFixed.push(`${animal.scientificName}: ${oldHabitat} → ${newHabitat}`);
  }

  // Re-infer diet (skip if Fix 1b already handled this animal)
  const newDiet = fixedBySarco ? null : inferTrait('diet', family, order, effectiveClass);
  if (newDiet && animal.attributes.diet !== newDiet) {
    const oldDiet = animal.attributes.diet;
    animal.attributes.diet = newDiet;
    changes.dietFixed.push(`${animal.scientificName}: ${oldDiet} → ${newDiet}`);
  }

  // Re-infer size (skip if Fix 1b already handled this animal)
  const newSize = fixedBySarco ? null : inferTrait('size', family, order, effectiveClass);
  if (newSize && animal.attributes.size !== newSize) {
    const oldSize = animal.attributes.size;
    animal.attributes.size = newSize;
    changes.sizeFixed.push(`${animal.scientificName}: ${oldSize} → ${newSize}`);
  }
}

// Write patched file
fs.writeFileSync(ANIMALS_FILE, JSON.stringify(animals, null, 2));

// ── Summary ────────────────────────────────────────────────────────
console.log('\n═══ Patch Summary ═══');
console.log(`Class fixes:   ${changes.classFixed.length}`);
console.log(`Habitat fixes: ${changes.habitatFixed.length}`);
console.log(`Diet fixes:    ${changes.dietFixed.length}`);
console.log(`Size fixes:    ${changes.sizeFixed.length}`);
console.log(`Lineage fixes: ${changes.lineageFixed.length}`);

if (changes.classFixed.length > 0) {
  console.log('\n── Class Changes ──');
  for (const c of changes.classFixed.slice(0, 30)) console.log(`  ${c}`);
  if (changes.classFixed.length > 30) console.log(`  ... and ${changes.classFixed.length - 30} more`);
}

if (changes.habitatFixed.length > 0) {
  console.log('\n── Habitat Changes ──');
  for (const c of changes.habitatFixed.slice(0, 30)) console.log(`  ${c}`);
  if (changes.habitatFixed.length > 30) console.log(`  ... and ${changes.habitatFixed.length - 30} more`);
}

if (changes.dietFixed.length > 0) {
  console.log('\n── Diet Changes ──');
  for (const c of changes.dietFixed.slice(0, 30)) console.log(`  ${c}`);
  if (changes.dietFixed.length > 30) console.log(`  ... and ${changes.dietFixed.length - 30} more`);
}

if (changes.sizeFixed.length > 0) {
  console.log('\n── Size Changes ──');
  for (const c of changes.sizeFixed.slice(0, 30)) console.log(`  ${c}`);
  if (changes.sizeFixed.length > 30) console.log(`  ... and ${changes.sizeFixed.length - 30} more`);
}

const totalChanges = changes.classFixed.length + changes.habitatFixed.length +
                     changes.dietFixed.length + changes.sizeFixed.length;
console.log(`\n✅ Patched ${totalChanges} total attribute values across ${animals.length} animals`);
console.log(`   Written to ${ANIMALS_FILE}`);

#!/usr/bin/env node

/**
 * Filter animals.json:
 *   - Remove plants
 *   - Remove Latin-only names (keep common names only)
 *   - Keep curated prehistoric exceptions (use genus as display name)
 *   - Remove bad names (Q-prefixed Wikidata IDs, lab codes)
 *   - Deduplicate by name (keep entry with best funFact)
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const ANIMALS_FILE = path.join(ROOT, 'data', 'animals.json');
const COMMON_ANIMALS = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'data', 'common-animals.json'), 'utf8')
);

const prehistoric = COMMON_ANIMALS.prehistoric_exceptions || {};
const easyList = (COMMON_ANIMALS.easy_list || []).map(e => e.toLowerCase());

const animals = JSON.parse(fs.readFileSync(ANIMALS_FILE, 'utf8'));
console.log(`Loaded ${animals.length} animals`);

let removed = { plant: 0, badName: 0, latinOnly: 0, dedup: 0 };
let prehistoricKept = 0;

// Phase 1: Filter
const filtered = [];
for (const animal of animals) {
  // Remove plants
  if (animal.attributes.class === 'Plant') {
    removed.plant++;
    continue;
  }

  // Remove bad names (Q-prefixed Wikidata IDs, lab codes)
  if (/^Q\d+/.test(animal.name) || /^L\d+-S\d+/.test(animal.name)) {
    removed.badName++;
    continue;
  }

  // Check if it has a common name
  if (animal.name !== animal.scientificName) {
    filtered.push(animal);
    continue;
  }

  // Check prehistoric exceptions (match genus)
  const genus = animal.scientificName.split(' ')[0];
  if (prehistoric[genus]) {
    animal.name = prehistoric[genus];
    // Set difficulty to easy if in easy_list
    if (easyList.includes(animal.name.toLowerCase())) {
      animal.difficulty = 'easy';
    }
    filtered.push(animal);
    prehistoricKept++;
    continue;
  }

  // Latin-only, no exception — remove
  removed.latinOnly++;
}

console.log(`\nFiltering results:`);
console.log(`  Removed plants: ${removed.plant}`);
console.log(`  Removed bad names: ${removed.badName}`);
console.log(`  Removed Latin-only: ${removed.latinOnly}`);
console.log(`  Kept prehistoric exceptions: ${prehistoricKept}`);
console.log(`  After filtering: ${filtered.length}`);

// Phase 2: Deduplicate by name (keep entry with longest funFact)
filtered.sort((a, b) => a.id.localeCompare(b.id));

const seen = new Map();
for (const animal of filtered) {
  const key = animal.name.toLowerCase();
  if (!seen.has(key)) {
    seen.set(key, animal);
  } else {
    const existing = seen.get(key);
    // Prefer entry with funFact
    if (!existing.funFact && animal.funFact) {
      seen.set(key, animal);
    } else if (animal.funFact && existing.funFact && animal.funFact.length > existing.funFact.length) {
      seen.set(key, animal);
    }
    removed.dedup++;
  }
}

const deduped = Array.from(seen.values());
deduped.sort((a, b) => a.id.localeCompare(b.id));

console.log(`  Removed duplicates: ${removed.dedup}`);
console.log(`  Final count: ${deduped.length}`);

// Stats
const easy = deduped.filter(a => a.difficulty === 'easy').length;
const medium = deduped.filter(a => a.difficulty === 'medium').length;
const hard = deduped.filter(a => a.difficulty === 'hard').length;
console.log(`\nDifficulty breakdown:`);
console.log(`  Easy: ${easy}`);
console.log(`  Medium: ${medium}`);
console.log(`  Hard: ${hard}`);

// Write output
fs.writeFileSync(ANIMALS_FILE, JSON.stringify(deduped, null, 2));
console.log(`\nWrote ${deduped.length} animals to ${ANIMALS_FILE}`);

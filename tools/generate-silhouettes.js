#!/usr/bin/env node

/**
 * Silhouette Generation Tool for Fishdle
 *
 * This script converts fish images to silhouettes.
 *
 * Prerequisites:
 *   npm install sharp potrace
 *
 * Usage:
 *   node generate-silhouettes.js <input-dir> <output-dir>
 *   node generate-silhouettes.js ./source-images ./images/silhouettes
 *
 * Supported input formats: PNG, JPG, JPEG, WebP
 * Output format: SVG
 */

const fs = require('fs');
const path = require('path');

// Check for required modules
let sharp, potrace;
try {
  sharp = require('sharp');
  potrace = require('potrace');
} catch (err) {
  console.error('Missing required dependencies. Please run:');
  console.error('  npm install sharp potrace');
  process.exit(1);
}

const SUPPORTED_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.webp'];

/**
 * Process a single image to create a silhouette
 */
async function processImage(inputPath, outputPath) {
  const filename = path.basename(inputPath, path.extname(inputPath));
  const outputFile = path.join(outputPath, `${filename}.svg`);

  console.log(`Processing: ${filename}`);

  try {
    // Step 1: Load and preprocess image with sharp
    // - Resize to reasonable size for tracing (smaller = simpler SVG)
    // - Convert to grayscale
    // - Apply threshold to create binary image
    const processedBuffer = await sharp(inputPath)
      .resize(400, 400, { fit: 'inside', withoutEnlargement: true })
      .grayscale()
      .normalize()
      .threshold(128)
      .png()
      .toBuffer();

    // Step 2: Trace the image to create SVG
    // Using higher turdSize and optTolerance for simpler, smaller SVGs
    return new Promise((resolve, reject) => {
      potrace.trace(processedBuffer, {
        color: '#1a1a2e',
        threshold: 128,
        turdSize: 500,      // Ignore small details
        optTolerance: 1.5,  // Simplify curves more
        alphaMax: 1.0       // Smoother corners
      }, (err, svg) => {
        if (err) {
          reject(err);
          return;
        }

        // Step 3: Write SVG to output
        fs.writeFileSync(outputFile, svg);
        console.log(`  Created: ${outputFile}`);
        resolve(outputFile);
      });
    });
  } catch (err) {
    console.error(`  Error processing ${filename}:`, err.message);
    return null;
  }
}

/**
 * Process all images in a directory
 */
async function processDirectory(inputDir, outputDir) {
  // Ensure output directory exists
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Get all image files
  const files = fs.readdirSync(inputDir).filter(file => {
    const ext = path.extname(file).toLowerCase();
    return SUPPORTED_EXTENSIONS.includes(ext);
  });

  if (files.length === 0) {
    console.log('No supported image files found in input directory.');
    console.log(`Supported formats: ${SUPPORTED_EXTENSIONS.join(', ')}`);
    return;
  }

  console.log(`Found ${files.length} images to process.\n`);

  let processed = 0;
  let failed = 0;

  for (const file of files) {
    const inputPath = path.join(inputDir, file);
    const result = await processImage(inputPath, outputDir);

    if (result) {
      processed++;
    } else {
      failed++;
    }
  }

  console.log(`\nComplete! Processed: ${processed}, Failed: ${failed}`);
}

/**
 * Generate placeholder silhouettes for fish.json entries
 */
async function generatePlaceholders(fishJsonPath, outputDir) {
  const fishData = JSON.parse(fs.readFileSync(fishJsonPath, 'utf8'));

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  console.log(`Generating ${fishData.length} placeholder silhouettes...\n`);

  for (const fish of fishData) {
    const filename = `${fish.id}.svg`;
    const outputPath = path.join(outputDir, filename);

    // Generate a simple fish silhouette SVG
    const svg = generateFishSVG(fish);
    fs.writeFileSync(outputPath, svg);
    console.log(`Created: ${filename}`);
  }

  console.log('\nPlaceholder silhouettes generated!');
}

/**
 * Generate a procedural fish silhouette SVG
 */
function generateFishSVG(fish) {
  const name = fish.name.toLowerCase();

  // Select shape based on fish type
  let path;
  if (name.includes('shark')) {
    path = 'M10,50 Q25,35 50,38 L75,28 L72,42 Q82,46 72,50 Q82,54 72,58 L75,72 L50,62 Q25,65 10,50 Z';
  } else if (name.includes('ray') || name.includes('manta')) {
    path = 'M50,15 Q85,35 95,50 Q85,65 50,85 Q15,65 5,50 Q15,35 50,15 Z M50,45 L50,55';
  } else if (name.includes('flounder')) {
    path = 'M10,48 Q25,35 50,32 Q75,35 90,50 Q75,65 50,68 Q25,65 10,52 Z';
  } else if (name.includes('puffer')) {
    path = 'M25,50 Q25,25 50,22 Q75,25 78,50 Q75,75 50,78 Q25,75 25,50 Z M82,45 L90,42 M82,55 L90,58';
  } else if (name.includes('sunfish') || name.includes('mola')) {
    path = 'M30,50 Q30,20 55,18 Q80,20 82,50 Q80,80 55,82 Q30,80 30,50 Z M20,35 L10,30 M20,65 L10,70';
  } else if (name.includes('marlin') || name.includes('sword')) {
    path = 'M5,50 L30,48 Q50,40 65,42 L90,35 L85,45 Q95,48 85,50 Q95,52 85,55 L90,65 L65,58 Q50,60 30,52 L5,50 Z';
  } else if (name.includes('tuna')) {
    path = 'M8,50 Q20,35 45,33 Q70,30 85,42 L95,38 L92,48 L95,52 L92,62 L95,58 L85,58 Q70,70 45,67 Q20,65 8,50 Z';
  } else if (name.includes('bass') || name.includes('perch')) {
    path = 'M10,50 Q20,32 45,30 L45,22 L55,30 Q80,32 90,48 L95,45 L92,50 L95,55 L90,52 Q80,68 55,70 L45,78 L45,70 Q20,68 10,50 Z';
  } else if (name.includes('catfish')) {
    path = 'M15,50 Q25,35 50,33 Q75,35 88,48 L95,45 L92,50 L95,55 L88,52 Q75,65 50,67 Q25,65 15,50 Z M18,45 L5,35 M18,48 L5,45 M18,52 L5,55 M18,55 L5,65';
  } else if (name.includes('angel')) {
    path = 'M50,10 L55,30 Q75,35 80,50 Q75,65 55,70 L50,90 L45,70 Q25,65 20,50 Q25,35 45,30 L50,10 Z';
  } else if (name.includes('betta')) {
    path = 'M35,50 Q35,40 50,38 Q65,40 68,50 Q65,60 50,62 Q35,60 35,50 Z M68,35 Q85,20 88,35 Q85,45 68,48 M68,52 Q85,55 88,65 Q85,80 68,65 M32,45 L25,40 M32,55 L25,60';
  } else if (name.includes('goldfish')) {
    path = 'M30,50 Q30,35 50,33 Q70,35 72,50 Q70,65 50,67 Q30,65 30,50 Z M72,42 L82,38 L78,50 L82,62 L72,58 M28,45 L22,42 M28,55 L22,58';
  } else if (name.includes('clown')) {
    path = 'M25,50 Q25,38 45,35 Q65,38 68,50 Q65,62 45,65 Q25,62 25,50 Z M68,45 L78,42 L75,50 L78,58 L68,55';
  } else if (name.includes('pike')) {
    path = 'M5,50 Q15,42 40,40 Q70,38 90,48 L98,48 L95,50 L98,52 L90,52 Q70,62 40,60 Q15,58 5,50 Z';
  } else if (name.includes('cod')) {
    path = 'M12,50 Q22,35 50,33 Q78,35 88,48 L95,45 L92,50 L95,55 L88,52 Q78,65 50,67 Q22,65 12,50 Z M15,48 L8,45 M15,52 L8,55';
  } else if (name.includes('trout') || name.includes('salmon')) {
    path = 'M8,50 Q18,35 45,32 Q72,35 85,45 L95,40 L90,48 L95,52 L90,60 L95,55 L85,55 Q72,65 45,68 Q18,65 8,50 Z';
  } else if (name.includes('hammer')) {
    path = 'M50,25 L30,25 L30,35 L50,35 L50,25 M50,25 L70,25 L70,35 L50,35 M50,35 Q60,40 65,50 Q60,70 50,75 Q40,70 35,50 Q40,40 50,35 Z';
  } else {
    // Default fish shape
    path = 'M10,50 Q22,32 48,30 Q74,32 86,45 L95,40 L90,50 L95,60 L86,55 Q74,68 48,70 Q22,68 10,50 Z';
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
  <path d="${path}" fill="#1a1a2e"/>
</svg>`;
}

// Main execution
const args = process.argv.slice(2);

if (args.length === 0) {
  // Generate placeholders for existing fish.json
  const fishJsonPath = path.join(__dirname, '..', 'data', 'fish.json');
  const outputDir = path.join(__dirname, '..', 'images', 'silhouettes');

  if (fs.existsSync(fishJsonPath)) {
    generatePlaceholders(fishJsonPath, outputDir);
  } else {
    console.log('Usage:');
    console.log('  Generate placeholders: node generate-silhouettes.js');
    console.log('  Process images:        node generate-silhouettes.js <input-dir> <output-dir>');
  }
} else if (args.length === 2) {
  const [inputDir, outputDir] = args;

  if (!fs.existsSync(inputDir)) {
    console.error(`Input directory not found: ${inputDir}`);
    process.exit(1);
  }

  processDirectory(inputDir, outputDir);
} else {
  console.log('Usage:');
  console.log('  Generate placeholders: node generate-silhouettes.js');
  console.log('  Process images:        node generate-silhouettes.js <input-dir> <output-dir>');
  process.exit(1);
}

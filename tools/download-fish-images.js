#!/usr/bin/env node

/**
 * Download Fish Images from Wikipedia Commons
 *
 * This script fetches fish images from Wikipedia for use with the silhouette generator.
 *
 * Usage:
 *   node download-fish-images.js [output-dir]
 *   node download-fish-images.js ./source-images
 *
 * Then run:
 *   node generate-silhouettes.js ./source-images ./images/silhouettes
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

const FISH_JSON_PATH = path.join(__dirname, '..', 'data', 'fish.json');
const DEFAULT_OUTPUT_DIR = path.join(__dirname, '..', 'source-images');

// Rate limiting - be nice to Wikipedia
const DELAY_MS = 1500;

/**
 * Sleep for a given number of milliseconds
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Make an HTTPS GET request and return JSON
 */
function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;
    protocol.get(url, { headers: { 'User-Agent': 'Fishdle/1.0 (Educational Game)' } }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error(`Failed to parse JSON from ${url}`));
        }
      });
    }).on('error', reject);
  });
}

/**
 * Download a file from URL to local path
 */
function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;
    const file = fs.createWriteStream(destPath);

    protocol.get(url, { headers: { 'User-Agent': 'Fishdle/1.0 (Educational Game)' } }, (response) => {
      // Handle redirects
      if (response.statusCode === 301 || response.statusCode === 302) {
        file.close();
        fs.unlinkSync(destPath);
        return downloadFile(response.headers.location, destPath).then(resolve).catch(reject);
      }

      if (response.statusCode !== 200) {
        file.close();
        fs.unlinkSync(destPath);
        reject(new Error(`HTTP ${response.statusCode} for ${url}`));
        return;
      }

      response.pipe(file);
      file.on('finish', () => {
        file.close();
        resolve(destPath);
      });
    }).on('error', (err) => {
      file.close();
      if (fs.existsSync(destPath)) fs.unlinkSync(destPath);
      reject(err);
    });
  });
}

/**
 * Get Wikipedia page image URL for a fish
 */
async function getWikipediaImage(fishName, scientificName) {
  // Try multiple search strategies
  const searchTerms = [
    fishName.replace(/ /g, '_'),
    scientificName.replace(/ /g, '_'),
    `${fishName.replace(/ /g, '_')}_(fish)`,
  ];

  for (const term of searchTerms) {
    try {
      // Use Wikipedia REST API to get page summary with image
      const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(term)}`;
      const data = await fetchJSON(url);

      if (data.originalimage && data.originalimage.source) {
        return {
          url: data.originalimage.source,
          title: data.title
        };
      }

      if (data.thumbnail && data.thumbnail.source) {
        // Get higher resolution version
        const thumbUrl = data.thumbnail.source;
        // Convert thumbnail URL to larger size
        const largeUrl = thumbUrl.replace(/\/\d+px-/, '/800px-');
        return {
          url: largeUrl,
          title: data.title
        };
      }
    } catch (e) {
      // Try next search term
      continue;
    }
  }

  return null;
}

/**
 * Get image from Wikimedia Commons directly
 */
async function getCommonsImage(searchTerm) {
  try {
    const url = `https://commons.wikimedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(searchTerm + ' fish')}&srnamespace=6&format=json&srlimit=5`;
    const data = await fetchJSON(url);

    if (data.query && data.query.search && data.query.search.length > 0) {
      // Get the first image result
      const title = data.query.search[0].title;

      // Get image URL
      const infoUrl = `https://commons.wikimedia.org/w/api.php?action=query&titles=${encodeURIComponent(title)}&prop=imageinfo&iiprop=url&format=json`;
      const infoData = await fetchJSON(infoUrl);

      const pages = infoData.query.pages;
      const pageId = Object.keys(pages)[0];
      if (pages[pageId].imageinfo && pages[pageId].imageinfo[0]) {
        return {
          url: pages[pageId].imageinfo[0].url,
          title: title
        };
      }
    }
  } catch (e) {
    // Silently fail
  }

  return null;
}

/**
 * Main function to download all fish images
 */
async function main() {
  const outputDir = process.argv[2] || DEFAULT_OUTPUT_DIR;

  // Create output directory
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Load fish data
  const fishData = JSON.parse(fs.readFileSync(FISH_JSON_PATH, 'utf8'));

  console.log(`Downloading images for ${fishData.length} fish species...`);
  console.log(`Output directory: ${outputDir}\n`);

  let downloaded = 0;
  let failed = 0;
  const failedFish = [];

  for (const fish of fishData) {
    const filename = `${fish.id}.jpg`;
    const destPath = path.join(outputDir, filename);

    // Skip if already downloaded
    if (fs.existsSync(destPath)) {
      const stats = fs.statSync(destPath);
      if (stats.size > 1000) { // At least 1KB
        console.log(`[SKIP] ${fish.name} - already exists`);
        downloaded++;
        continue;
      }
    }

    console.log(`[FETCH] ${fish.name} (${fish.scientificName})...`);

    // Try Wikipedia first
    let imageInfo = await getWikipediaImage(fish.name, fish.scientificName);

    // Fall back to Commons search
    if (!imageInfo) {
      imageInfo = await getCommonsImage(fish.scientificName);
    }
    if (!imageInfo) {
      imageInfo = await getCommonsImage(fish.name);
    }

    if (imageInfo) {
      try {
        // Determine file extension from URL
        const urlExt = path.extname(imageInfo.url.split('?')[0]).toLowerCase();
        const actualFilename = `${fish.id}${urlExt || '.jpg'}`;
        const actualDestPath = path.join(outputDir, actualFilename);

        await downloadFile(imageInfo.url, actualDestPath);
        console.log(`  [OK] Downloaded: ${actualFilename}`);
        downloaded++;
      } catch (e) {
        console.log(`  [FAIL] Download error: ${e.message}`);
        failed++;
        failedFish.push(fish.name);
      }
    } else {
      console.log(`  [FAIL] No image found`);
      failed++;
      failedFish.push(fish.name);
    }

    // Rate limiting
    await sleep(DELAY_MS);
  }

  console.log(`\n${'='.repeat(50)}`);
  console.log(`Download complete!`);
  console.log(`  Downloaded: ${downloaded}`);
  console.log(`  Failed: ${failed}`);

  if (failedFish.length > 0) {
    console.log(`\nFailed fish (may need manual download):`);
    failedFish.forEach(f => console.log(`  - ${f}`));
  }

  console.log(`\nNext step: Run the silhouette generator:`);
  console.log(`  node tools/generate-silhouettes.js ${outputDir} images/silhouettes`);
}

main().catch(console.error);

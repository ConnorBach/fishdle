/**
 * Main game logic for Animaldle
 */

const Game = (function() {
  // Constants
  const BASE_SCORE = 100;
  const GUESS_PENALTY = 5;
  const MIN_SCORE = 10;

  const SIZE_ORDER = ['tiny', 'small', 'medium', 'large', 'giant'];

  // Aquatic group for "close" habitat matches
  const AQUATIC_GROUP = ['freshwater', 'marine'];

  // Phylum groupings for "close" class matches (same broad group)
  const CLASS_PHYLUM_MAP = {
    'Mammal': 'Chordata',
    'Bird': 'Chordata',
    'Reptile': 'Chordata',
    'Amphibian': 'Chordata',
    'Fish': 'Chordata',
    'Insect': 'Arthropoda',
    'Arachnid': 'Arthropoda',
    'Crustacean': 'Arthropoda',
    'Myriapod': 'Arthropoda',
    'Mollusk': 'Mollusca',
    'Cnidarian': 'Cnidaria',
    'Echinoderm': 'Echinodermata',
    'Worm': 'Annelida',
    'Sponge': 'Porifera',
    'Plant': 'Plantae',
    'Fungus': 'Fungi'
  };

  // Diet adjacency for "close" matches
  const DIET_CLOSE = {
    'omnivore': ['carnivore', 'herbivore', 'insectivore'],
    'carnivore': ['omnivore', 'insectivore'],
    'herbivore': ['omnivore'],
    'insectivore': ['carnivore', 'omnivore']
  };

  // Game state
  let animalDatabase = [];
  let targetAnimal = null;
  let gameNumber = 0;
  let guesses = [];
  let gameOver = false;
  let won = false;
  let difficulty = 'normal';

  // DOM elements
  let elements = {};

  // Player stats
  let stats = {
    gamesPlayed: 0,
    wins: 0,
    currentStreak: 0,
    maxStreak: 0
  };

  /**
   * Initialize the game
   */
  async function init() {
    cacheElements();
    loadDifficulty();
    await loadAnimalDatabase();

    // Migrate old Fishdle stats if present
    migrateFromFishdle();

    loadStats();

    const todayKey = Daily.getTodayKey();
    const savedGame = loadGameState(todayKey);

    const dailyData = Daily.getDailyAnimal(animalDatabase, difficulty);
    targetAnimal = dailyData.animal;
    gameNumber = dailyData.gameNumber;

    elements.gameNumber.textContent = `#${gameNumber}`;

    // Initialize hints
    Hints.init(targetAnimal, updateHintsDisplay);

    // Restore saved state if exists
    if (savedGame) {
      await restoreGameState(savedGame);
    } else {
      await renderSilhouette();
      updateNameBlanks();
      updateScore();
    }

    bindEvents();
    renderGuessHistory();
    updateHintsDisplay();
    updateDifficultyUI();

    if (gameOver) {
      disableInput();
    }
  }

  /**
   * Cache DOM elements
   */
  function cacheElements() {
    elements = {
      gameNumber: document.getElementById('gameNumber'),
      silhouette: document.getElementById('silhouette'),
      attribution: document.getElementById('attribution'),
      nameBlanks: document.getElementById('nameBlanks'),
      currentScore: document.getElementById('currentScore'),
      letterHintBtn: document.getElementById('letterHintBtn'),
      attributeHintBtn: document.getElementById('attributeHintBtn'),
      revealedAttributes: document.getElementById('revealedAttributes'),
      attributesList: document.getElementById('attributesList'),
      guessInput: document.getElementById('guessInput'),
      guessMessage: document.getElementById('guessMessage'),
      submitGuess: document.getElementById('submitGuess'),
      guessHistory: document.getElementById('guessHistory'),
      resultModal: document.getElementById('resultModal'),
      modalTitle: document.getElementById('modalTitle'),
      animalReveal: document.getElementById('animalReveal'),
      taxonomyTree: document.getElementById('taxonomyTree'),
      funFacts: document.getElementById('funFacts'),
      finalScore: document.getElementById('finalScore'),
      totalGuesses: document.getElementById('totalGuesses'),
      gamesPlayed: document.getElementById('gamesPlayed'),
      winPercent: document.getElementById('winPercent'),
      currentStreak: document.getElementById('currentStreak'),
      maxStreak: document.getElementById('maxStreak'),
      shareResult: document.getElementById('shareResult'),
      shareBtn: document.getElementById('shareBtn'),
      shareConfirm: document.getElementById('shareConfirm'),
      settingsBtn: document.getElementById('settingsBtn'),
      settingsModal: document.getElementById('settingsModal'),
      difficultyBeginner: document.getElementById('difficultyBeginner'),
      difficultyNormal: document.getElementById('difficultyNormal'),
      difficultyExpert: document.getElementById('difficultyExpert'),
      closeSettings: document.getElementById('closeSettings')
    };
  }

  /**
   * Load animal database from JSON
   */
  async function loadAnimalDatabase() {
    try {
      const response = await fetch('data/animals.json');
      animalDatabase = await response.json();
    } catch (err) {
      console.error('Failed to load animal database:', err);
      animalDatabase = [];
    }
  }

  /**
   * Bind event listeners
   */
  function bindEvents() {
    elements.submitGuess.addEventListener('click', submitGuess);
    elements.guessInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        submitGuess();
      }
    });
    elements.letterHintBtn.addEventListener('click', useLetterHint);
    elements.attributeHintBtn.addEventListener('click', useAttributeHint);
    elements.shareBtn.addEventListener('click', handleShare);

    // Settings
    elements.settingsBtn.addEventListener('click', () => {
      elements.settingsModal.classList.remove('hidden');
    });
    elements.closeSettings.addEventListener('click', () => {
      elements.settingsModal.classList.add('hidden');
    });
    elements.settingsModal.addEventListener('click', (e) => {
      if (e.target === elements.settingsModal) {
        elements.settingsModal.classList.add('hidden');
      }
    });
    elements.difficultyBeginner.addEventListener('click', () => setDifficulty('beginner'));
    elements.difficultyNormal.addEventListener('click', () => setDifficulty('normal'));
    elements.difficultyExpert.addEventListener('click', () => setDifficulty('expert'));

    // Close result modal when clicking overlay
    elements.resultModal.addEventListener('click', (e) => {
      if (e.target === elements.resultModal) {
        elements.resultModal.classList.add('hidden');
      }
    });

    // Clear guess message on input
    elements.guessInput.addEventListener('input', () => {
      elements.guessMessage.classList.add('hidden');
    });
  }

  /**
   * Render animal silhouette from PhyloPic CDN using <img> tag (avoids CORS)
   */
  async function renderSilhouette() {
    if (!targetAnimal || !targetAnimal.svgUrl) {
      elements.silhouette.innerHTML = generateFallbackSilhouette();
      return;
    }

    const img = document.createElement('img');
    img.src = targetAnimal.svgUrl;
    img.alt = 'Animal silhouette';
    img.className = 'silhouette-img';
    img.onerror = () => {
      // Try thumbnail as fallback, then question mark
      if (targetAnimal.thumbnailUrl) {
        img.onerror = () => {
          elements.silhouette.innerHTML = generateFallbackSilhouette();
        };
        img.src = targetAnimal.thumbnailUrl;
      } else {
        elements.silhouette.innerHTML = generateFallbackSilhouette();
      }
    };

    elements.silhouette.innerHTML = '';
    elements.silhouette.appendChild(img);
  }

  /**
   * Generate a fallback silhouette SVG
   */
  function generateFallbackSilhouette() {
    return `
      <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" width="200" height="200">
        <text x="50" y="60" text-anchor="middle" font-size="50" fill="#1a1a2e">?</text>
      </svg>
    `;
  }

  /**
   * Update name blanks display
   */
  function updateNameBlanks() {
    const display = Hints.getNameDisplay();

    // Group letters into words (split on space items)
    const words = [];
    let currentWord = [];
    for (const item of display) {
      if (item.type === 'space') {
        if (currentWord.length > 0) {
          words.push(currentWord);
          currentWord = [];
        }
      } else {
        currentWord.push(item);
      }
    }
    if (currentWord.length > 0) words.push(currentWord);

    elements.nameBlanks.innerHTML = words.map(word => {
      const letters = word.map(item => {
        if (item.type === 'revealed') {
          return `<span class="letter-blank revealed">${item.letter}</span>`;
        }
        return '<span class="letter-blank">_</span>';
      }).join('');
      return `<span class="word-group">${letters}</span>`;
    }).join('');
  }

  /**
   * Update score display
   */
  function updateScore() {
    const score = calculateScore();
    elements.currentScore.textContent = score;
  }

  /**
   * Calculate current potential score
   */
  function calculateScore() {
    const guessPenalty = guesses.length * GUESS_PENALTY;
    const hintPenalty = Hints.getHintPenalty();
    const score = BASE_SCORE - guessPenalty - hintPenalty;
    return Math.max(MIN_SCORE, score);
  }

  /**
   * Submit a guess (free text + fuzzy match)
   */
  function submitGuess() {
    if (gameOver) return;

    const inputValue = elements.guessInput.value.trim();
    if (!inputValue) return;

    // Find animal by fuzzy match
    const matchResult = fuzzyMatchAnimal(inputValue);

    if (!matchResult) {
      // Not found — show message, no penalty
      showGuessMessage('Animal not found. Try a different name.', 'not-found');
      return;
    }

    let guessedAnimal = matchResult;

    // If fuzzy match returned a duplicate entry, swap to the target if same species
    if (guessedAnimal.id !== targetAnimal.id &&
        (guessedAnimal.scientificName === targetAnimal.scientificName ||
         guessedAnimal.name.toLowerCase() === targetAnimal.name.toLowerCase())) {
      guessedAnimal = targetAnimal;
    }

    // Check if already guessed
    if (guesses.some(g => g.animal.id === guessedAnimal.id)) {
      showGuessMessage('Already guessed!', 'not-found');
      elements.guessInput.value = '';
      return;
    }

    // Show matched name if fuzzy
    if (guessedAnimal.name.toLowerCase() !== inputValue.toLowerCase() &&
        guessedAnimal.scientificName.toLowerCase() !== inputValue.toLowerCase()) {
      showGuessMessage(`Matched: ${guessedAnimal.name}`, 'matched');
    } else {
      elements.guessMessage.classList.add('hidden');
    }

    // Record guess
    const comparison = compareAttributes(guessedAnimal, targetAnimal);
    const taxoDistance = calculateTaxonomicDistance(guessedAnimal, targetAnimal);
    const guess = {
      animal: guessedAnimal,
      comparison,
      taxoDistance,
      correct: guessedAnimal.id === targetAnimal.id
    };

    guesses.push(guess);

    // Clear input
    elements.guessInput.value = '';

    // Update display
    renderGuessHistory();
    updateScore();

    // Check win condition
    if (guess.correct) {
      handleWin();
    }

    // Save state
    saveGameState();
  }

  /**
   * Fuzzy match input against animal database
   * Priority: exact name → exact scientific → startsWith → Levenshtein ≤ 2
   */
  function fuzzyMatchAnimal(input) {
    const normalized = input.toLowerCase().trim();

    // 1. Exact match on name
    const exactName = animalDatabase.find(a => a.name.toLowerCase() === normalized);
    if (exactName) return exactName;

    // 2. Exact match on scientific name
    const exactSci = animalDatabase.find(a => a.scientificName.toLowerCase() === normalized);
    if (exactSci) return exactSci;

    // 3. StartsWith on name (min 3 chars)
    if (normalized.length >= 3) {
      const sw = animalDatabase.find(a => a.name.toLowerCase().startsWith(normalized));
      if (sw) return sw;
    }

    // 4. Levenshtein ≤ 2 on name
    let bestMatch = null, bestDist = 3;
    for (const animal of animalDatabase) {
      const dist = levenshteinDistance(normalized, animal.name.toLowerCase());
      if (dist < bestDist) {
        bestDist = dist;
        bestMatch = animal;
      }
    }
    return bestMatch;
  }

  /**
   * Levenshtein distance between two strings
   */
  function levenshteinDistance(a, b) {
    if (a.length === 0) return b.length;
    if (b.length === 0) return a.length;

    // Short circuit for very different lengths
    if (Math.abs(a.length - b.length) > 2) return 3;

    const matrix = [];
    for (let i = 0; i <= b.length; i++) {
      matrix[i] = [i];
    }
    for (let j = 0; j <= a.length; j++) {
      matrix[0][j] = j;
    }

    for (let i = 1; i <= b.length; i++) {
      for (let j = 1; j <= a.length; j++) {
        if (b[i - 1] === a[j - 1]) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }

    return matrix[b.length][a.length];
  }

  /**
   * Show a temporary message below the guess input
   */
  function showGuessMessage(text, type) {
    elements.guessMessage.textContent = text;
    elements.guessMessage.className = `guess-message ${type}`;
    elements.guessMessage.classList.remove('hidden');

    setTimeout(() => {
      elements.guessMessage.classList.add('hidden');
    }, 3000);
  }

  /**
   * Compare attributes between guessed animal and target
   * Attributes: class, habitat, diet, size
   */
  function compareAttributes(guessed, target) {
    const comparison = {};

    // Class comparison
    const guessedClass = guessed.attributes.class;
    const targetClass = target.attributes.class;
    let classMatch = 'wrong';
    if (guessedClass === targetClass) {
      classMatch = 'exact';
    } else if (CLASS_PHYLUM_MAP[guessedClass] && CLASS_PHYLUM_MAP[guessedClass] === CLASS_PHYLUM_MAP[targetClass]) {
      classMatch = 'close';
    }
    comparison.class = { value: guessedClass, match: classMatch };

    // Habitat comparison
    const guessedHabitat = guessed.attributes.habitat;
    const targetHabitat = target.attributes.habitat;
    let habitatMatch = 'wrong';
    if (guessedHabitat === targetHabitat) {
      habitatMatch = 'exact';
    } else if (AQUATIC_GROUP.includes(guessedHabitat) && AQUATIC_GROUP.includes(targetHabitat)) {
      habitatMatch = 'close';
    }
    comparison.habitat = { value: guessedHabitat, match: habitatMatch };

    // Diet comparison
    const guessedDiet = guessed.attributes.diet;
    const targetDiet = target.attributes.diet;
    let dietMatch = 'wrong';
    if (guessedDiet === targetDiet) {
      dietMatch = 'exact';
    } else if (DIET_CLOSE[guessedDiet] && DIET_CLOSE[guessedDiet].includes(targetDiet)) {
      dietMatch = 'close';
    }
    comparison.diet = { value: guessedDiet, match: dietMatch };

    // Size comparison (with direction arrows)
    const guessedSizeIndex = SIZE_ORDER.indexOf(guessed.attributes.size);
    const targetSizeIndex = SIZE_ORDER.indexOf(target.attributes.size);
    const sizeDiff = guessedSizeIndex - targetSizeIndex;

    comparison.size = {
      value: guessed.attributes.size,
      match: sizeDiff === 0 ? 'exact' : Math.abs(sizeDiff) === 1 ? 'close' : 'wrong',
      direction: sizeDiff > 0 ? 'down' : sizeDiff < 0 ? 'up' : null
    };

    return comparison;
  }

  /**
   * Calculate taxonomic distance between two animals
   * Returns { shared, total, percent }
   */
  function calculateTaxonomicDistance(guessed, target) {
    const guessedLineage = new Set(guessed.lineage || []);
    const targetLineage = new Set(target.lineage || []);

    const allTaxa = new Set([...guessedLineage, ...targetLineage]);
    const shared = [...guessedLineage].filter(x => targetLineage.has(x));

    const total = allTaxa.size || 1;
    const percent = Math.round((shared.length / total) * 100);

    return { shared: shared.length, total, percent };
  }

  /**
   * Render guess history with taxonomic distance bar
   */
  function renderGuessHistory() {
    if (guesses.length === 0) {
      elements.guessHistory.innerHTML = '<div class="history-empty">No guesses yet</div>';
      return;
    }

    elements.guessHistory.innerHTML = guesses.map((guess) => {
      const { animal, comparison, taxoDistance, correct } = guess;

      // Taxonomic distance bar color
      const pct = taxoDistance?.percent || 0;
      const barColor = pct > 70 ? '#2d6a4f' : pct > 40 ? '#f9c74f' : '#e63946';

      return `
        <div class="guess-entry">
          <div class="guess-name ${correct ? 'correct' : ''}">
            <span>${animal.name}</span>
            <span class="taxo-distance">
              <span class="taxo-bar"><span class="taxo-bar-fill" style="width:${pct}%;background:${barColor}"></span></span>
              <span>${pct}%</span>
            </span>
          </div>
          <div class="attribute-grid">
            <div class="attribute-header">Class</div>
            <div class="attribute-header">Habitat</div>
            <div class="attribute-header">Diet</div>
            <div class="attribute-header">Size</div>
            ${renderAttributeCell('class', comparison.class)}
            ${renderAttributeCell('habitat', comparison.habitat)}
            ${renderAttributeCell('diet', comparison.diet)}
            ${renderAttributeCell('size', comparison.size)}
          </div>
        </div>
      `;
    }).reverse().join('');
  }

  /**
   * Render single attribute cell
   */
  function renderAttributeCell(attr, data) {
    const emoji = data.match === 'exact' ? '\u{1F7E9}' :
                  data.match === 'close' ? '\u{1F7E8}' : '\u{2B1C}';

    let arrow = '';
    if (data.direction === 'up') arrow = '\u2191';
    if (data.direction === 'down') arrow = '\u2193';

    return `
      <div class="attribute-cell">
        <span class="emoji">${emoji}</span>
        <span class="value">${data.value}</span>
        ${arrow ? `<span class="arrow">${arrow}</span>` : ''}
      </div>
    `;
  }

  /**
   * Use letter hint
   */
  function useLetterHint() {
    if (gameOver || !Hints.canRevealLetter()) return;

    const result = Hints.revealLetter();
    if (result) {
      updateNameBlanks();
      updateScore();
      saveGameState();
    }
  }

  /**
   * Use attribute hint
   */
  function useAttributeHint() {
    if (gameOver || !Hints.canRevealAttribute()) return;

    const result = Hints.revealAttribute();
    if (result) {
      updateHintsDisplay();
      updateScore();
      saveGameState();
    }
  }

  /**
   * Update hints display
   */
  function updateHintsDisplay() {
    elements.letterHintBtn.disabled = gameOver || !Hints.canRevealLetter();
    elements.attributeHintBtn.disabled = gameOver || !Hints.canRevealAttribute();

    const revealedList = Hints.getRevealedAttributesList();

    if (revealedList.length > 0) {
      elements.revealedAttributes.classList.remove('hidden');
      elements.attributesList.innerHTML = revealedList.map(attr =>
        `<span class="attribute-tag"><span class="label">${attr.label}:</span> ${attr.value}</span>`
      ).join('');
    } else {
      elements.revealedAttributes.classList.add('hidden');
    }
  }

  /**
   * Handle win
   */
  function handleWin() {
    gameOver = true;
    won = true;

    stats.gamesPlayed++;
    stats.wins++;
    stats.currentStreak++;
    stats.maxStreak = Math.max(stats.maxStreak, stats.currentStreak);
    saveStats();

    // Reveal silhouette
    elements.silhouette.classList.add('revealed');

    // Show attribution
    showAttribution();

    disableInput();
    showResultModal();
  }

  /**
   * Show PhyloPic attribution
   */
  function showAttribution() {
    if (targetAnimal.attribution) {
      const licenseText = targetAnimal.license && targetAnimal.license.includes('publicdomain')
        ? 'Public Domain'
        : 'CC Licensed';
      elements.attribution.innerHTML =
        `Silhouette by ${targetAnimal.attribution} via <a href="https://www.phylopic.org" target="_blank" rel="noopener">PhyloPic</a> (${licenseText})`;
      elements.attribution.classList.remove('hidden');
    }
  }

  /**
   * Disable input
   */
  function disableInput() {
    elements.guessInput.disabled = true;
    elements.submitGuess.disabled = true;
    elements.letterHintBtn.disabled = true;
    elements.attributeHintBtn.disabled = true;
  }

  /**
   * Show result modal with taxonomy tree
   */
  function showResultModal() {
    elements.modalTitle.textContent = won ? '\u{1F3C6} You Got It!' : '\u{1F43E} Better Luck Tomorrow!';

    elements.animalReveal.innerHTML = `
      <div class="animal-name">${targetAnimal.name}</div>
      <div class="scientific-name">${targetAnimal.scientificName}</div>
    `;

    const score = calculateScore();
    elements.finalScore.textContent = `${score}/100`;
    elements.totalGuesses.textContent = guesses.length;

    // Update stats display
    elements.gamesPlayed.textContent = stats.gamesPlayed;
    elements.winPercent.textContent = stats.gamesPlayed > 0
      ? `${Math.round((stats.wins / stats.gamesPlayed) * 100)}%`
      : '0%';
    elements.currentStreak.textContent = stats.currentStreak;
    elements.maxStreak.textContent = stats.maxStreak;

    // Render taxonomy tree
    renderTaxonomyTree();

    // Show fun facts on win
    if (won) {
      const facts = generateFunFacts(targetAnimal);
      if (facts.length > 0) {
        elements.funFacts.innerHTML =
          '<strong>Fun Facts</strong>' +
          '<ul class="facts-list">' +
          facts.map(f => `<li>${f}</li>`).join('') +
          '</ul>';
        elements.funFacts.classList.remove('hidden');
      }
    } else {
      elements.funFacts.classList.add('hidden');
    }

    // Generate share display
    const gameResult = {
      gameNumber,
      score,
      guessHistory: guesses,
      hintCounts: Hints.getHintCounts(),
      won
    };

    elements.shareResult.innerHTML = Sharing.generateShareText(gameResult).replace(/\n/g, '<br>');

    elements.resultModal.classList.remove('hidden');
  }

  /**
   * Render taxonomy tree showing divergence between target and guesses
   */
  function renderTaxonomyTree() {
    if (!targetAnimal.lineage || targetAnimal.lineage.length === 0) {
      elements.taxonomyTree.classList.add('hidden');
      return;
    }

    const targetLineage = [...targetAnimal.lineage].reverse(); // Kingdom → Family
    const guessLineages = guesses.map(g => ({
      name: g.animal.name,
      lineage: [...(g.animal.lineage || [])].reverse(),
      correct: g.correct
    }));

    // Build tree HTML
    let html = '<strong>Taxonomy</strong><br>';

    // Show target path highlighted
    const targetPath = targetLineage.concat([targetAnimal.name]);
    html += targetPath.map((taxon, i) => {
      const indent = '&nbsp;'.repeat(i * 3);
      const connector = i > 0 ? '└─ ' : '';
      const isAnimalName = i === targetPath.length - 1;
      const cls = isAnimalName ? 'target' : 'shared';
      return `${indent}${connector}<span class="taxo-label ${cls}">${taxon}${isAnimalName ? ' ✓' : ''}</span>`;
    }).join('<br>');

    // Show where guesses diverged
    if (guesses.length > 0 && !guesses[guesses.length - 1].correct) {
      html += '<br><br><strong>Your guesses diverged at:</strong><br>';
      const shown = new Set();
      for (const g of guesses.slice(-3)) {
        if (g.correct || shown.has(g.animal.name)) continue;
        shown.add(g.animal.name);

        // Find divergence point
        const gLineage = [...(g.animal.lineage || [])].reverse();
        let divergeIdx = 0;
        while (divergeIdx < targetLineage.length && divergeIdx < gLineage.length &&
               targetLineage[divergeIdx] === gLineage[divergeIdx]) {
          divergeIdx++;
        }

        const sharedPart = targetLineage.slice(0, divergeIdx).join(' → ');
        html += `<span class="taxo-label guess">${g.animal.name}</span>`;
        if (sharedPart) {
          html += ` <span style="color:#999;font-size:0.7rem">(shared: ${sharedPart})</span>`;
        }
        html += '<br>';
      }
    }

    elements.taxonomyTree.innerHTML = html;
    elements.taxonomyTree.classList.remove('hidden');
  }

  /**
   * Generate fun facts from animal data
   */
  function generateFunFacts(animal) {
    const facts = [];

    // Primary: Wikipedia summary (species-specific, interesting)
    if (animal.funFact) {
      facts.push(animal.funFact);
    }

    // Fallback: basic template facts if no Wikipedia data
    if (facts.length === 0) {
      const attrs = animal.attributes || {};
      if (attrs.class && attrs.habitat) {
        const hab = { marine: 'the ocean', freshwater: 'freshwater habitats',
                      terrestrial: 'land', arboreal: 'trees' }[attrs.habitat] || attrs.habitat;
        facts.push(`This ${attrs.class.toLowerCase()} lives in ${hab}.`);
      }
      if (animal.name !== animal.scientificName) {
        facts.push(`Its scientific name is ${animal.scientificName}.`);
      }
    }

    return facts;
  }

  /**
   * Handle share button click
   */
  async function handleShare() {
    const gameResult = {
      gameNumber,
      score: calculateScore(),
      guessHistory: guesses,
      hintCounts: Hints.getHintCounts(),
      won
    };

    const success = await Sharing.shareResult(gameResult);

    if (success) {
      elements.shareConfirm.classList.remove('hidden');
      setTimeout(() => {
        elements.shareConfirm.classList.add('hidden');
      }, 2000);
    }
  }

  /**
   * Difficulty management
   */
  function loadDifficulty() {
    difficulty = localStorage.getItem('animaldle-difficulty') || 'normal';
  }

  function setDifficulty(newDifficulty) {
    if (newDifficulty === difficulty) return;

    difficulty = newDifficulty;
    localStorage.setItem('animaldle-difficulty', difficulty);
    updateDifficultyUI();

    // Reload the game with new difficulty (different daily animal)
    window.location.reload();
  }

  function updateDifficultyUI() {
    elements.difficultyBeginner.classList.toggle('active', difficulty === 'beginner');
    elements.difficultyNormal.classList.toggle('active', difficulty === 'normal');
    elements.difficultyExpert.classList.toggle('active', difficulty === 'expert');
  }

  /**
   * Save game state to localStorage
   */
  function saveGameState() {
    const todayKey = Daily.getTodayKey();
    const state = {
      guesses: guesses.map(g => ({
        animalId: g.animal.id,
        comparison: g.comparison,
        taxoDistance: g.taxoDistance,
        correct: g.correct
      })),
      hints: Hints.getState(),
      gameOver,
      won,
      difficulty
    };

    localStorage.setItem(`animaldle-${todayKey}`, JSON.stringify(state));
  }

  /**
   * Load game state from localStorage
   */
  function loadGameState(todayKey) {
    const saved = localStorage.getItem(`animaldle-${todayKey}`);
    if (!saved) return null;

    try {
      const state = JSON.parse(saved);
      // Only restore if same difficulty
      if (state.difficulty && state.difficulty !== difficulty) return null;
      return state;
    } catch {
      return null;
    }
  }

  /**
   * Restore saved game state
   */
  async function restoreGameState(savedState) {
    guesses = savedState.guesses.map(g => {
      const animal = animalDatabase.find(a => a.id === g.animalId);
      if (!animal) return null;
      return {
        animal,
        comparison: g.comparison,
        taxoDistance: g.taxoDistance || calculateTaxonomicDistance(animal, targetAnimal),
        correct: g.correct
      };
    }).filter(Boolean);

    // Restore hints
    Hints.loadState(savedState.hints);

    // Restore game state
    gameOver = savedState.gameOver;
    won = savedState.won;

    // Update displays
    await renderSilhouette();
    updateNameBlanks();
    updateScore();

    if (won) {
      elements.silhouette.classList.add('revealed');
      showAttribution();
    }

    if (gameOver) {
      setTimeout(showResultModal, 500);
    }
  }

  /**
   * Save player stats
   */
  function saveStats() {
    localStorage.setItem('animaldle-stats', JSON.stringify(stats));
  }

  /**
   * Load player stats
   */
  function loadStats() {
    const saved = localStorage.getItem('animaldle-stats');
    if (saved) {
      try {
        stats = { ...stats, ...JSON.parse(saved) };
      } catch {
        // Use default stats
      }
    }
  }

  /**
   * Migrate Fishdle localStorage data to Animaldle
   */
  function migrateFromFishdle() {
    // Only migrate once
    if (localStorage.getItem('animaldle-migrated')) return;

    const fishStats = localStorage.getItem('fishdle-stats');
    if (fishStats) {
      try {
        const oldStats = JSON.parse(fishStats);
        // Carry over stats
        localStorage.setItem('animaldle-stats', JSON.stringify(oldStats));
      } catch {
        // ignore
      }
    }

    localStorage.setItem('animaldle-migrated', 'true');
  }

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  return {
    init
  };
})();

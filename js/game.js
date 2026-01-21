/**
 * Main game logic for Fishdle
 */

const Game = (function() {
  // Constants
  const BASE_SCORE = 100;
  const GUESS_PENALTY = 5;
  const MIN_SCORE = 10;

  const SIZE_ORDER = ['tiny', 'small', 'medium', 'large', 'giant'];
  const OCEAN_GROUPS = {
    'Atlantic': ['Atlantic', 'Arctic'],
    'Pacific': ['Pacific', 'Indian'],
    'Arctic': ['Atlantic', 'Arctic'],
    'Indian': ['Pacific', 'Indian'],
    'Freshwater Americas': ['Freshwater Americas'],
    'Freshwater Europe/Asia': ['Freshwater Europe/Asia']
  };

  // Game state
  let fishDatabase = [];
  let targetFish = null;
  let gameNumber = 0;
  let guesses = [];
  let gameOver = false;
  let won = false;
  let selectedFish = null;

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
    await loadFishDatabase();
    loadStats();

    const todayKey = Daily.getTodayKey();
    const savedGame = loadGameState(todayKey);

    const dailyData = Daily.getDailyFish(fishDatabase);
    targetFish = dailyData.fish;
    gameNumber = dailyData.gameNumber;

    elements.gameNumber.textContent = `#${gameNumber}`;

    // Initialize hints
    Hints.init(targetFish, updateHintsDisplay);

    // Initialize autocomplete
    Autocomplete.init(
      elements.guessInput,
      elements.autocompleteList,
      fishDatabase,
      handleFishSelect
    );

    // Restore saved state if exists
    if (savedGame) {
      await restoreGameState(savedGame);
    } else {
      // Fresh game
      await renderSilhouette();
      updateNameBlanks();
      updateScore();
    }

    bindEvents();
    renderGuessHistory();
    updateHintsDisplay();

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
      nameBlanks: document.getElementById('nameBlanks'),
      currentScore: document.getElementById('currentScore'),
      letterHintBtn: document.getElementById('letterHintBtn'),
      attributeHintBtn: document.getElementById('attributeHintBtn'),
      revealedAttributes: document.getElementById('revealedAttributes'),
      attributesList: document.getElementById('attributesList'),
      guessInput: document.getElementById('guessInput'),
      autocompleteList: document.getElementById('autocompleteList'),
      submitGuess: document.getElementById('submitGuess'),
      guessHistory: document.getElementById('guessHistory'),
      resultModal: document.getElementById('resultModal'),
      modalTitle: document.getElementById('modalTitle'),
      fishReveal: document.getElementById('fishReveal'),
      finalScore: document.getElementById('finalScore'),
      totalGuesses: document.getElementById('totalGuesses'),
      gamesPlayed: document.getElementById('gamesPlayed'),
      winPercent: document.getElementById('winPercent'),
      currentStreak: document.getElementById('currentStreak'),
      maxStreak: document.getElementById('maxStreak'),
      shareResult: document.getElementById('shareResult'),
      shareBtn: document.getElementById('shareBtn'),
      shareConfirm: document.getElementById('shareConfirm')
    };
  }

  /**
   * Load fish database from JSON
   */
  async function loadFishDatabase() {
    try {
      const response = await fetch('data/fish.json');
      fishDatabase = await response.json();
    } catch (err) {
      console.error('Failed to load fish database:', err);
      fishDatabase = [];
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
  }

  /**
   * Render fish silhouette
   */
  async function renderSilhouette() {
    try {
      // Load the SVG file for the target fish
      const response = await fetch(targetFish.silhouette);
      if (response.ok) {
        let svgContent = await response.text();
        // Add width/height attributes for proper sizing
        svgContent = svgContent.replace(/<svg/, '<svg width="200" height="200"');
        elements.silhouette.innerHTML = svgContent;
      } else {
        // Fallback to generated silhouette
        elements.silhouette.innerHTML = generateFallbackSilhouette(targetFish);
      }
    } catch (err) {
      console.warn('Failed to load silhouette, using fallback:', err);
      elements.silhouette.innerHTML = generateFallbackSilhouette(targetFish);
    }
  }

  /**
   * Generate a fallback fish silhouette SVG
   */
  function generateFallbackSilhouette(fish) {
    const name = fish.name.toLowerCase();
    let path;

    if (name.includes('shark')) {
      path = 'M10,50 Q30,30 60,35 L90,25 L85,40 Q95,45 85,50 Q95,55 85,60 L90,75 L60,65 Q30,70 10,50 Z';
    } else if (name.includes('ray')) {
      path = 'M50,20 Q80,40 90,50 Q80,60 50,80 Q20,60 10,50 Q20,40 50,20 Z';
    } else if (name.includes('flounder')) {
      path = 'M10,45 Q20,35 50,30 Q80,35 90,50 Q80,65 50,70 Q20,65 10,55 Z';
    } else if (name.includes('puffer') || name.includes('sunfish')) {
      path = 'M15,50 Q15,30 40,25 Q70,20 85,45 L95,40 L92,50 L95,60 L85,55 Q70,80 40,75 Q15,70 15,50 Z';
    } else {
      path = 'M10,50 Q20,30 45,28 Q70,25 80,40 L95,35 L90,50 L95,65 L80,60 Q70,75 45,72 Q20,70 10,50 Z';
    }

    return `
      <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" width="200" height="200">
        <path d="${path}" fill="#1a1a2e"/>
      </svg>
    `;
  }

  /**
   * Update name blanks display
   */
  function updateNameBlanks() {
    const display = Hints.getNameDisplay();
    elements.nameBlanks.innerHTML = display.map(item => {
      if (item.type === 'space') {
        return '<span class="letter-blank space"></span>';
      } else if (item.type === 'revealed') {
        return `<span class="letter-blank revealed">${item.letter}</span>`;
      } else {
        return '<span class="letter-blank">_</span>';
      }
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
   * Handle fish selection from autocomplete
   */
  function handleFishSelect(fish) {
    selectedFish = fish;
    submitGuess();
  }

  /**
   * Submit a guess
   */
  function submitGuess() {
    if (gameOver) return;

    const inputValue = elements.guessInput.value.trim();
    if (!inputValue) return;

    // Find the fish by name
    const guessedFish = selectedFish ||
      fishDatabase.find(f => f.name.toLowerCase() === inputValue.toLowerCase());

    if (!guessedFish) {
      // Invalid fish name
      elements.guessInput.classList.add('error');
      setTimeout(() => elements.guessInput.classList.remove('error'), 500);
      return;
    }

    // Check if already guessed
    if (guesses.some(g => g.fish.id === guessedFish.id)) {
      Autocomplete.clear();
      selectedFish = null;
      return;
    }

    // Record guess
    const comparison = compareAttributes(guessedFish, targetFish);
    const guess = {
      fish: guessedFish,
      comparison,
      correct: guessedFish.id === targetFish.id
    };

    guesses.push(guess);
    Autocomplete.setGuessedFish(guesses.map(g => g.fish.id));

    // Clear input
    Autocomplete.clear();
    selectedFish = null;

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
   * Compare attributes between guessed fish and target
   */
  function compareAttributes(guessed, target) {
    const comparison = {};

    // Habitat comparison
    comparison.habitat = {
      value: guessed.attributes.habitat,
      match: guessed.attributes.habitat === target.attributes.habitat ? 'exact' : 'wrong'
    };

    // Size comparison
    const guessedSizeIndex = SIZE_ORDER.indexOf(guessed.attributes.size);
    const targetSizeIndex = SIZE_ORDER.indexOf(target.attributes.size);
    const sizeDiff = guessedSizeIndex - targetSizeIndex;

    comparison.size = {
      value: guessed.attributes.size,
      match: sizeDiff === 0 ? 'exact' : Math.abs(sizeDiff) === 1 ? 'close' : 'wrong',
      direction: sizeDiff > 0 ? 'down' : sizeDiff < 0 ? 'up' : null
    };

    // Family comparison
    comparison.family = {
      value: guessed.attributes.family,
      match: guessed.attributes.family === target.attributes.family ? 'exact' : 'wrong'
    };

    // Region comparison
    const guessedOceanGroup = OCEAN_GROUPS[guessed.attributes.region] || [];
    const isCloseRegion = guessedOceanGroup.includes(target.attributes.region);

    comparison.region = {
      value: guessed.attributes.region,
      match: guessed.attributes.region === target.attributes.region ? 'exact' :
             isCloseRegion ? 'close' : 'wrong'
    };

    return comparison;
  }

  /**
   * Render guess history
   */
  function renderGuessHistory() {
    if (guesses.length === 0) {
      elements.guessHistory.innerHTML = '<div class="history-empty">No guesses yet</div>';
      return;
    }

    elements.guessHistory.innerHTML = guesses.map((guess, index) => {
      const { fish, comparison, correct } = guess;

      return `
        <div class="guess-entry">
          <div class="guess-name ${correct ? 'correct' : ''}">${fish.name}</div>
          <div class="attribute-grid">
            <div class="attribute-header">Habitat</div>
            <div class="attribute-header">Size</div>
            <div class="attribute-header">Family</div>
            <div class="attribute-header">Region</div>
            ${renderAttributeCell('habitat', comparison.habitat)}
            ${renderAttributeCell('size', comparison.size)}
            ${renderAttributeCell('family', comparison.family)}
            ${renderAttributeCell('region', comparison.region)}
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
    // Update hint buttons
    elements.letterHintBtn.disabled = gameOver || !Hints.canRevealLetter();
    elements.attributeHintBtn.disabled = gameOver || !Hints.canRevealAttribute();

    // Update revealed attributes
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

    // Update stats
    stats.gamesPlayed++;
    stats.wins++;
    stats.currentStreak++;
    stats.maxStreak = Math.max(stats.maxStreak, stats.currentStreak);
    saveStats();

    // Reveal silhouette
    elements.silhouette.classList.add('revealed');

    // Disable input
    disableInput();

    // Show modal
    showResultModal();
  }

  /**
   * Disable input
   */
  function disableInput() {
    Autocomplete.disable();
    elements.submitGuess.disabled = true;
    elements.letterHintBtn.disabled = true;
    elements.attributeHintBtn.disabled = true;
  }

  /**
   * Show result modal
   */
  function showResultModal() {
    elements.modalTitle.textContent = won ? '\u{1F3C6} You Got It!' : '\u{1F41F} Better Luck Tomorrow!';

    elements.fishReveal.innerHTML = `
      <div class="fish-name">${targetFish.name}</div>
      <div class="scientific-name">${targetFish.scientificName}</div>
    `;

    const score = calculateScore();
    elements.finalScore.textContent = `${score}/100`;
    elements.totalGuesses.textContent = guesses.length;

    // Update stats display
    elements.gamesPlayed.textContent = stats.gamesPlayed;
    elements.winPercent.textContent = `${Math.round((stats.wins / stats.gamesPlayed) * 100)}%`;
    elements.currentStreak.textContent = stats.currentStreak;
    elements.maxStreak.textContent = stats.maxStreak;

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
   * Save game state to localStorage
   */
  function saveGameState() {
    const todayKey = Daily.getTodayKey();
    const state = {
      guesses: guesses.map(g => ({
        fishId: g.fish.id,
        comparison: g.comparison,
        correct: g.correct
      })),
      hints: Hints.getState(),
      gameOver,
      won
    };

    localStorage.setItem(`fishdle-${todayKey}`, JSON.stringify(state));
  }

  /**
   * Load game state from localStorage
   */
  function loadGameState(todayKey) {
    const saved = localStorage.getItem(`fishdle-${todayKey}`);
    if (!saved) return null;

    try {
      return JSON.parse(saved);
    } catch {
      return null;
    }
  }

  /**
   * Restore saved game state
   */
  async function restoreGameState(savedState) {
    // Restore guesses
    guesses = savedState.guesses.map(g => {
      const fish = fishDatabase.find(f => f.id === g.fishId);
      return {
        fish,
        comparison: g.comparison,
        correct: g.correct
      };
    });

    Autocomplete.setGuessedFish(guesses.map(g => g.fish.id));

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
    }

    if (gameOver) {
      setTimeout(showResultModal, 500);
    }
  }

  /**
   * Save player stats
   */
  function saveStats() {
    localStorage.setItem('fishdle-stats', JSON.stringify(stats));
  }

  /**
   * Load player stats
   */
  function loadStats() {
    const saved = localStorage.getItem('fishdle-stats');
    if (saved) {
      try {
        stats = { ...stats, ...JSON.parse(saved) };
      } catch {
        // Use default stats
      }
    }
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

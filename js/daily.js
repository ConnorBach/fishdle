/**
 * Daily animal selection module
 * Uses seeded random to ensure same animal for everyone worldwide on the same day
 */

const Daily = (function() {
  // Simple seeded random number generator (mulberry32)
  function seededRandom(seed) {
    return function() {
      let t = seed += 0x6D2B79F5;
      t = Math.imul(t ^ t >>> 15, t | 1);
      t ^= t + Math.imul(t ^ t >>> 7, t | 61);
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  // Convert date to numeric seed (YYYYMMDD format)
  function dateToSeed(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return parseInt(`${year}${month}${day}`, 10);
  }

  // Get today's date in UTC to ensure consistency across timezones
  function getTodayUTC() {
    const now = new Date();
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  }

  // Calculate game number (days since Animaldle launch)
  function getGameNumber(date) {
    const launchDate = new Date(Date.UTC(2025, 0, 1)); // January 1, 2025
    const diffTime = date.getTime() - launchDate.getTime();
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    return diffDays + 1;
  }

  /**
   * Get the daily animal from the database
   * @param {Array} animalDatabase - Full animal database
   * @param {string} difficulty - 'normal' or 'expert'
   * @param {Date} date - Optional date override
   */
  function getDailyAnimal(animalDatabase, difficulty = 'normal', date = null) {
    if (!date) {
      date = getTodayUTC();
    }

    // Filter by difficulty
    let pool;
    if (difficulty === 'expert') {
      pool = animalDatabase;
    } else if (difficulty === 'beginner') {
      // Beginner: easy only
      pool = animalDatabase.filter(a => a.difficulty === 'easy');
    } else {
      // Normal: easy + medium only
      pool = animalDatabase.filter(a => a.difficulty === 'easy' || a.difficulty === 'medium');
    }

    if (pool.length === 0) pool = animalDatabase;

    // Use different seed offset for different difficulty modes so they get different animals
    const baseSeed = dateToSeed(date);
    const seed = difficulty === 'expert' ? baseSeed + 7919 :
                 difficulty === 'beginner' ? baseSeed + 13397 : baseSeed;
    const rng = seededRandom(seed);
    const index = Math.floor(rng() * pool.length);

    return {
      animal: pool[index],
      gameNumber: getGameNumber(date),
      date: date.toISOString().split('T')[0]
    };
  }

  // Get a consistent date string for storage keys
  function getTodayKey() {
    return getTodayUTC().toISOString().split('T')[0];
  }

  return {
    getDailyAnimal,
    getGameNumber,
    getTodayKey,
    getTodayUTC
  };
})();

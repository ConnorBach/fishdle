/**
 * Daily fish selection module
 * Uses seeded random to ensure same fish for everyone worldwide on the same day
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

  // Calculate game number (days since launch)
  function getGameNumber(date) {
    const launchDate = new Date(Date.UTC(2024, 0, 1)); // January 1, 2024
    const diffTime = date.getTime() - launchDate.getTime();
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    return diffDays + 1;
  }

  // Get the daily fish from the database
  function getDailyFish(fishDatabase, date = null) {
    if (!date) {
      date = getTodayUTC();
    }

    const seed = dateToSeed(date);
    const rng = seededRandom(seed);
    const index = Math.floor(rng() * fishDatabase.length);

    return {
      fish: fishDatabase[index],
      gameNumber: getGameNumber(date),
      date: date.toISOString().split('T')[0]
    };
  }

  // Get a consistent date string for storage keys
  function getTodayKey() {
    return getTodayUTC().toISOString().split('T')[0];
  }

  return {
    getDailyFish,
    getGameNumber,
    getTodayKey,
    getTodayUTC
  };
})();

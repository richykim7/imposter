/**
 * Application Configuration
 * Single source of truth for all configurable constants.
 */

module.exports = {
  // Game bounds
  MIN_PLAYERS: 3,
  MAX_PLAYERS: 15,
  DEFAULT_PLAYERS: 3,

  // Category validation
  MIN_CATEGORY_LENGTH: 2,
  MAX_CATEGORY_LENGTH: 60,

  // LLM call timeout (URL + model live in lib/llm.js per provider)
  API_TIMEOUT_MS: 10000,

  // Chaos mode (1 in CHAOS_PROBABILITY_DENOM rounds, when enabled)
  CHAOS_PROBABILITY_DENOM: 20,
  CHAOS_DEFAULT_ENABLED: false, // OPT-IN. Used to be a silent surprise; default now off.

  // Reveal UX
  REVEAL_AUTO_HIDE_SECONDS: 10,

  // Round/word history
  MAX_PREVIOUS_WORDS: 50,

  // Rate limiting (env-overridable for testing)
  NEW_GAME_RATE_LIMIT_WINDOW_MS: Number(process.env.NEW_GAME_RATE_LIMIT_WINDOW_MS) || 60 * 1000,
  NEW_GAME_RATE_LIMIT_MAX: Number(process.env.NEW_GAME_RATE_LIMIT_MAX) || 20, // per IP per window
};

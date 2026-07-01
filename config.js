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

  // Rate limiting (env-overridable for testing). Window is per IP.
  // NOTE: limits are sized for a whole shared network (household/venue NAT can
  // put ~15 legit players on one IP), so only the abusable/costly endpoints are
  // tight. Counters are in-memory — fine for a single Render instance; they
  // reset on restart and are not shared across instances.
  RATE_LIMIT_WINDOW_MS: Number(process.env.RATE_LIMIT_WINDOW_MS) || 60 * 1000,
  // Game/round creation both trigger paid LLM calls — keep these tight.
  NEW_GAME_RATE_LIMIT_WINDOW_MS: Number(process.env.NEW_GAME_RATE_LIMIT_WINDOW_MS) || 60 * 1000,
  NEW_GAME_RATE_LIMIT_MAX: Number(process.env.NEW_GAME_RATE_LIMIT_MAX) || 20,
  SAME_CODE_RATE_LIMIT_MAX: Number(process.env.SAME_CODE_RATE_LIMIT_MAX) || 12,
  // Slot claim — only FAILED attempts count, to stop game-code brute-forcing
  // without punishing a room of legit players joining at once.
  JOIN_RATE_LIMIT_MAX: Number(process.env.JOIN_RATE_LIMIT_MAX) || 30,
  // Loose catch-all safety net; /api/status polling is exempted from it.
  GLOBAL_RATE_LIMIT_MAX: Number(process.env.GLOBAL_RATE_LIMIT_MAX) || 600,
};

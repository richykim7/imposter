/**
 * Application Configuration
 * Single source of truth for all configurable constants
 */

module.exports = {
  // GROQ Model Configuration - CHANGE ONLY HERE
  MODEL_NAME: 'llama-3.3-70b-versatile',
  
  // Game Configuration
  MIN_PLAYERS: 3,
  MAX_PLAYERS: 12,
  DEFAULT_PLAYERS: 3,
  
  // Category Validation
  MIN_CATEGORY_LENGTH: 2,
  MAX_CATEGORY_LENGTH: 60,
  
  // API Configuration
  GROQ_API_URL: 'https://api.groq.com/openai/v1/chat/completions',
  API_TIMEOUT_MS: 10000,
  
  // Fallback words (used if API fails after retries)
  FALLBACK_WORDS: [
    'Sunflower',
    'Barcelona',
    'Telescope',
    'Orchestra',
    'Lightning',
    'Compass',
    'Mountain',
    'Rainbow'
  ],
  
  // Reveal Configuration
  REVEAL_AUTO_HIDE_SECONDS: 10
};


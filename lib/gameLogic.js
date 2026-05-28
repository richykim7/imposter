/**
 * Pure game logic — no I/O, no Express. Testable in isolation.
 */

const crypto = require('crypto');
const { pickPackForCategory } = require('./words');

const GAME_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no confusing chars

function generateGameCode() {
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += GAME_CODE_ALPHABET.charAt(crypto.randomInt(0, GAME_CODE_ALPHABET.length));
  }
  return code;
}

function generateToken() {
  return crypto.randomUUID();
}

/**
 * Fisher-Yates shuffle using crypto.randomInt — uniform.
 */
function fisherYatesShuffle(array) {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = crypto.randomInt(0, i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Uniformly select `numImposters` distinct indices from [0, numPlayers).
 */
function selectImpostorIndices(numPlayers, numImposters) {
  const all = Array.from({ length: numPlayers }, (_, i) => i);
  return fisherYatesShuffle(all).slice(0, numImposters);
}

function maxImposters(numPlayers) {
  return Math.max(1, Math.floor((numPlayers - 1) / 2));
}

function validateCategory(category, { min = 2, max = 60 } = {}) {
  if (typeof category !== 'string') return 'Category must be a string';
  const t = category.trim();
  if (t.length < min) return `Category must be at least ${min} characters`;
  if (t.length > max) return `Category must be at most ${max} characters`;
  return null;
}

function validateNumPlayers(numPlayers, { min = 3, max = 12 } = {}) {
  if (!Number.isInteger(numPlayers)) return 'Number of players must be an integer';
  if (numPlayers < min) return `Minimum ${min} players required`;
  if (numPlayers > max) return `Maximum ${max} players allowed`;
  return null;
}

function validateNumImposters(numPlayers, numImposters) {
  const m = maxImposters(numPlayers);
  if (!Number.isInteger(numImposters) || numImposters < 1 || numImposters > m) {
    return `Number of imposters must be between 1 and ${m} for ${numPlayers} players`;
  }
  return null;
}

function sanitizeWords(words, cap = 500) {
  if (!Array.isArray(words)) return [];
  return words.filter(w => typeof w === 'string' && w.length > 0).slice(0, cap);
}

/**
 * Parse the Groq word-list response (one word/phrase per line, with various
 * stray punctuation and numbering the model sometimes emits).
 * Extracted from server.js so it can be unit-tested.
 */
function parseGroqWords(content) {
  if (!content) return [];
  let words = String(content)
    .split(/\n|;|•/)
    .map(w => w.trim())
    .map(w => w.replace(/^[-–—]\s*/, ''))
    .map(w => w.replace(/^\d+[\.\):\-]\s*/, ''))
    .map(w => w.replace(/^["']|["']$/g, '').replace(/[.!?,;:]+$/, '').trim())
    .filter(w => w.length > 0);

  if (words.length < 3) {
    // Fallback: model returned everything on one line — break on whitespace.
    words = String(content)
      .split(/\s+/)
      .map(w => w.replace(/^["']|["']$/g, '').replace(/[.!?,;:]+$/, '').trim())
      .filter(w => w.length >= 2 && w.length <= 30)
      .filter(w => !/^\d+\.?$/.test(w));
  }
  return words;
}

/**
 * Word similarity check — used to deduplicate impostor-vs-insider words and
 * across rounds.
 */
function levenshtein(a, b) {
  const m = [];
  for (let i = 0; i <= b.length; i++) m[i] = [i];
  for (let j = 0; j <= a.length; j++) m[0][j] = j;
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) m[i][j] = m[i - 1][j - 1];
      else m[i][j] = Math.min(m[i - 1][j - 1] + 1, m[i][j - 1] + 1, m[i - 1][j] + 1);
    }
  }
  return m[b.length][a.length];
}

function areWordsTooSimilar(w1, w2) {
  if (!w1 || !w2) return false;
  const a = w1.toLowerCase().trim();
  const b = w2.toLowerCase().trim();
  if (a === b) return true;
  if (a.includes(b) && b.length > 3) return true;
  if (b.includes(a) && a.length > 3) return true;
  const wa = a.split(/\s+/);
  const wb = b.split(/\s+/);
  if (wa.length === 1 && wb.length === 1 && a.length <= 10 && b.length <= 10) {
    const d = levenshtein(a, b);
    const maxLen = Math.max(a.length, b.length);
    if (maxLen > 0 && (maxLen - d) / maxLen > 0.8) return true;
  }
  if (wa.length > 1 || wb.length > 1) {
    const common = wa.filter(w => w.length > 3 && wb.includes(w));
    if (common.length > 0 && common.length >= Math.min(wa.length, wb.length) * 0.7) return true;
  }
  return false;
}

/**
 * Pick a word from an offline pack, avoiding `avoid` words when possible.
 */
function pickOfflineWord(category, avoid = []) {
  const pack = pickPackForCategory(category);
  const usable = pack.filter(w => !avoid.some(a => areWordsTooSimilar(w, a)));
  const pool = usable.length > 0 ? usable : pack;
  return pool[crypto.randomInt(0, pool.length)];
}

module.exports = {
  generateGameCode,
  generateToken,
  fisherYatesShuffle,
  selectImpostorIndices,
  maxImposters,
  validateCategory,
  validateNumPlayers,
  validateNumImposters,
  sanitizeWords,
  parseGroqWords,
  areWordsTooSimilar,
  pickOfflineWord,
};

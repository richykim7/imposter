require('dotenv').config();

const express = require('express');
const path = require('path');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');

const config = require('./config');
const {
  generateGameCode,
  generateToken,
  selectImpostorIndices,
  validateCategory,
  validateNumPlayers,
  validateNumImposters,
  sanitizeWords,
  parseGroqWords,
  areWordsTooSimilar,
  pickOfflineWord,
} = require('./lib/gameLogic');

const app = express();
const PORT = process.env.PORT || 3000;
const GROQ_API_KEY = process.env.GROQ_API_KEY;

app.set('trust proxy', 1); // for express-rate-limit behind a proxy (Render etc)
app.use(express.json({ limit: '64kb' }));
app.use(express.static('public'));

// In-memory game state — keyed by game code
const games = new Map();

// ============================================================
// Cleanup loop
// ============================================================

function cleanupOldGames() {
  const now = Date.now();
  const maxAge = 24 * 60 * 60 * 1000;
  for (const [code, game] of games) {
    if (now - new Date(game.createdAt).getTime() > maxAge) {
      games.delete(code);
      console.log(`Cleaned up expired game: ${code}`);
    }
  }
}
const cleanupTimer = setInterval(cleanupOldGames, 60 * 60 * 1000);
cleanupTimer.unref();

// ============================================================
// Authorization helpers
// ============================================================

/**
 * Reveal authorization: a slot's playerToken can reveal it; otherwise the
 * host token can reveal it (pass-and-play mode). This makes single-device
 * play "just work" while preventing peeking in multi-device games.
 */
function canRevealSlot(gameState, playerIndex, token) {
  if (!token) return false;
  const assignment = gameState.playerAssignments[playerIndex + 1];
  if (assignment && assignment.playerToken) {
    return assignment.playerToken === token;
  }
  return gameState.hostToken === token;
}

function isHost(gameState, token) {
  return !!token && gameState.hostToken === token;
}

function getGameState(code) {
  if (!code) return null;
  return games.get(String(code).toUpperCase()) || null;
}

// ============================================================
// Word generation
// ============================================================

async function generateWordFromGroq(category, previousWords = [], retry = 0, difficulty = 'medium') {
  // Offline fallback when no key
  if (!GROQ_API_KEY) {
    return pickOfflineWord(category, previousWords);
  }

  const cLower = category.toLowerCase();
  const isProperNoun =
    cLower.includes('movie') || cLower.includes('film') ||
    cLower.includes('country') || cLower.includes('nation') ||
    cLower.includes('city') || cLower.includes('capital') ||
    cLower.includes('book') || cLower.includes('novel') ||
    cLower.includes('song') || cLower.includes('band') ||
    cLower.includes('artist') || cLower.includes('actor') ||
    cLower.includes('celebrity') || cLower.includes('brand') ||
    cLower.includes('company') || cLower.includes('game') ||
    cLower.includes('sport') || cLower.includes('team');

  const difficultyLine = {
    easy: '- Generate only very well-known, mainstream, household-name items that virtually EVERYONE would recognize.',
    medium: '- Generate a mix of common and moderately known items.',
    hard: '- Generate lesser-known, surprising items that are still real and recognizable.',
  }[difficulty] || '- Generate a mix of common and moderately known items.';

  const systemPrompt = `You are a word generator for a party game. Given a category, output EXACTLY 10 different words or short phrases (2-3 words max each) that belong to that category. Rules:
- Output ONLY the words/phrases, one per line
- NO quotes, NO punctuation at the end of each word
- NO explanations, NO extra text, NO numbering
${difficultyLine}
- Keep them appropriate for all ages
${isProperNoun ? '- Use ACTUAL proper nouns/names, NOT descriptions.' : '- Use concrete, specific examples.'}`;

  const userPrompt = `Category: ${category}\n\nGenerate 10 different words or short phrases (one per line):`;

  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), config.API_TIMEOUT_MS);

    const response = await fetch(config.GROQ_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GROQ_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: config.MODEL_NAME,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.9,
        max_tokens: 200,
      }),
      signal: controller.signal,
    });
    clearTimeout(t);

    if (!response.ok) {
      throw new Error(`Groq API error: ${response.status}`);
    }
    const data = await response.json();
    const content = data.choices?.[0]?.message?.content?.trim() || '';

    const words = parseGroqWords(content);
    if (words.length === 0) throw new Error('No words extracted from API');

    let available = words;
    if (previousWords.length > 0) {
      const filtered = words.filter(w => !previousWords.some(p => areWordsTooSimilar(w, p)));
      if (filtered.length > 0) available = filtered;
    }
    return available[crypto.randomInt(0, available.length)];
  } catch (e) {
    console.error(`Groq attempt ${retry + 1} failed:`, e.message);
    if (retry < 1) {
      await new Promise(r => setTimeout(r, 1000));
      return generateWordFromGroq(category, previousWords, retry + 1, difficulty);
    }
    console.warn('Falling back to offline word pack');
    return pickOfflineWord(category, previousWords);
  }
}

async function generateHintFromGroq(word, category, retry = 0) {
  if (!GROQ_API_KEY) return null; // hints are optional

  const systemPrompt = `You are a hint generator for a party game. Output a VERY SHORT, ABSTRACT 1-2 word hint that could apply to MANY items in the category. NO quotes, NO punctuation. NO explanations.`;
  const userPrompt = `Word: ${word}\nCategory: ${category}\n\nGenerate a vague 1-2 word hint:`;

  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), config.API_TIMEOUT_MS);
    const response = await fetch(config.GROQ_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GROQ_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: config.MODEL_NAME,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 1.2,
        max_tokens: 10,
      }),
      signal: controller.signal,
    });
    clearTimeout(t);
    if (!response.ok) throw new Error(`Groq error ${response.status}`);
    const data = await response.json();
    let hint = data.choices?.[0]?.message?.content?.trim() || '';
    hint = hint.replace(/^["']|["']$/g, '').replace(/[.!?,;:]+$/, '').trim();
    const parts = hint.split(/\s+/).filter(w => w.length > 0);
    if (parts.length > 2) hint = parts.slice(0, 2).join(' ');
    return hint || null;
  } catch (e) {
    if (retry < 1) {
      await new Promise(r => setTimeout(r, 1000));
      return generateHintFromGroq(word, category, retry + 1);
    }
    return null;
  }
}

// ============================================================
// Core game state creation — single source of truth
// ============================================================

async function createGameState({
  category,
  numPlayers,
  numImposters,
  everyoneGetsWord,
  imposterGetsHint,
  difficulty,
  chaosModeEnabled,
  usedWords,
}) {
  const trimmed = category.trim();

  // Only roll chaos if the host opted in (default: off)
  const chaosMode =
    !!chaosModeEnabled &&
    crypto.randomInt(0, config.CHAOS_PROBABILITY_DENOM) === 0;

  let word = null;
  let impostorWord = null;
  let impostorHint = null;
  let impostorIndices;
  let combined = [...usedWords];

  if (chaosMode) {
    impostorIndices = Array.from({ length: numPlayers }, (_, i) => i);
  } else {
    word = await generateWordFromGroq(trimmed, combined, 0, difficulty);
    impostorIndices = selectImpostorIndices(numPlayers, numImposters);

    const roundWords = [word];

    if (everyoneGetsWord) {
      impostorWord = await generateWordFromGroq(trimmed, [...combined, ...roundWords], 0, difficulty);
      let attempts = 0;
      while (
        (impostorWord === word || areWordsTooSimilar(impostorWord, word)) &&
        attempts < 5
      ) {
        impostorWord = await generateWordFromGroq(trimmed, [...combined, ...roundWords], 0, difficulty);
        attempts++;
      }
      if (!impostorWord) throw new Error('Failed to generate impostor word');
      roundWords.push(impostorWord);

      if (imposterGetsHint) {
        impostorHint = await generateHintFromGroq(impostorWord, trimmed);
      }
    } else if (imposterGetsHint) {
      impostorHint = await generateHintFromGroq(word, trimmed);
    }

    combined = [...combined, ...roundWords];
    if (combined.length > config.MAX_PREVIOUS_WORDS) {
      combined = combined.slice(-config.MAX_PREVIOUS_WORDS);
    }
  }

  return {
    category: trimmed,
    word,
    impostorWord,
    impostorHint,
    numPlayers,
    numImposters,            // INTENDED count (fixes chaos-cascade bug)
    impostorIndices,         // ACTUAL indices for this round
    chaosMode,               // did this round actually roll chaos?
    chaosModeEnabled,        // is chaos enabled for the game?
    everyoneGetsWord,
    imposterGetsHint,
    difficulty,
    revealedFlags: new Array(numPlayers).fill(false),
    allRevealed: false,
    createdAt: new Date().toISOString(),
  };
}

function generateUniqueGameCode() {
  for (let i = 0; i < 12; i++) {
    const code = generateGameCode();
    if (!games.has(code)) return code;
  }
  return 'GAME_' + crypto.randomBytes(4).toString('hex').toUpperCase();
}

// ============================================================
// Rate limiter for expensive endpoint
// ============================================================

const newGameLimiter = rateLimit({
  windowMs: config.NEW_GAME_RATE_LIMIT_WINDOW_MS,
  max: config.NEW_GAME_RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many new games — please slow down.' },
});

// ============================================================
// Endpoints
// ============================================================

/**
 * POST /api/new-game
 */
app.post('/api/new-game', newGameLimiter, async (req, res) => {
  try {
    const {
      category,
      numPlayers,
      numImposters = 1,
      everyoneGetsWord = false,
      imposterGetsHint = false,
      difficulty = 'medium',
      chaosModeEnabled = config.CHAOS_DEFAULT_ENABLED,
      usedWords = [],
    } = req.body || {};

    const errs = [
      validateCategory(category, { min: config.MIN_CATEGORY_LENGTH, max: config.MAX_CATEGORY_LENGTH }),
      validateNumPlayers(numPlayers, { min: config.MIN_PLAYERS, max: config.MAX_PLAYERS }),
      validateNumImposters(numPlayers, numImposters),
    ].filter(Boolean);
    if (errs.length) return res.status(400).json({ error: errs[0] });

    const gameState = await createGameState({
      category,
      numPlayers,
      numImposters,
      everyoneGetsWord: !!everyoneGetsWord,
      imposterGetsHint: !!imposterGetsHint,
      difficulty,
      chaosModeEnabled: !!chaosModeEnabled,
      usedWords: sanitizeWords(usedWords),
    });

    const hostToken = generateToken();
    gameState.hostToken = hostToken;
    gameState.roundId = 1;
    gameState.playerAssignments = {
      1: { name: 'Host (Player 1)', joinedAt: new Date().toISOString(), playerToken: hostToken },
    };

    const gameCode = generateUniqueGameCode();
    games.set(gameCode, gameState);
    console.log(`Game ${gameCode} created (${numPlayers} players, ${numImposters} impostors, chaos=${gameState.chaosMode})`);

    res.json({
      success: true,
      gameCode,
      hostToken,
      roundId: 1,
      numPlayers,
      numImposters,
      category: gameState.category,
    });
  } catch (e) {
    console.error('Error creating game:', e);
    res.status(500).json({ error: 'Failed to create game', details: e.message });
  }
});

/**
 * POST /api/reveal
 * Requires `token` matching the slot's playerToken (or hostToken if slot
 * is unassigned). Re-reveal of the same slot by the same token is allowed.
 */
app.post('/api/reveal', (req, res) => {
  try {
    const { playerIndex, gameCode, token } = req.body || {};
    const gameState = getGameState(gameCode);
    if (!gameState) return res.status(404).json({ error: 'No active game. Create a game first.' });

    if (!Number.isInteger(playerIndex) || playerIndex < 0 || playerIndex >= gameState.numPlayers) {
      return res.status(400).json({
        error: `Invalid player index. Must be between 0 and ${gameState.numPlayers - 1}`,
      });
    }

    if (!canRevealSlot(gameState, playerIndex, token)) {
      return res.status(403).json({ error: 'Not authorized to reveal this player' });
    }

    // Track reveal for host UI (not used as a block — re-reveal is allowed)
    gameState.revealedFlags[playerIndex] = true;

    const isImpostor = gameState.impostorIndices.includes(playerIndex);
    const role = isImpostor ? 'IMPOSTOR' : 'INSIDER';

    let word;
    if (isImpostor) {
      word = gameState.everyoneGetsWord ? (gameState.impostorWord || gameState.word) : null;
    } else {
      word = gameState.word;
    }

    const hint = (isImpostor && gameState.imposterGetsHint) ? gameState.impostorHint : null;

    res.json({
      role: gameState.everyoneGetsWord ? null : role,
      word,
      hint,
      category: gameState.category,
      playerIndex,
      everyoneGetsWord: gameState.everyoneGetsWord,
      roundId: gameState.roundId,
    });
  } catch (e) {
    console.error('Error revealing:', e);
    res.status(500).json({ error: 'Failed to reveal' });
  }
});

/**
 * POST /api/reveal-all
 * Host-only to set allRevealed; once set, any participant can fetch results.
 */
app.post('/api/reveal-all', (req, res) => {
  const { gameCode, token } = req.body || {};
  const gameState = getGameState(gameCode);
  if (!gameState) return res.status(404).json({ error: 'No active game found' });

  if (!gameState.allRevealed) {
    if (!isHost(gameState, token)) {
      return res.status(403).json({ error: 'Only the host can end the round' });
    }
    gameState.allRevealed = true;
  }

  const results = [];
  for (let i = 0; i < gameState.numPlayers; i++) {
    const isImpostor = gameState.impostorIndices.includes(i);
    let word = gameState.word || 'N/A';
    if (gameState.chaosMode) word = 'No word (Chaos Mode)';
    else if (gameState.everyoneGetsWord && isImpostor && gameState.impostorWord) {
      word = gameState.impostorWord;
    }
    results.push({
      playerNumber: i + 1,
      role: isImpostor ? 'Impostor' : 'Insider',
      word,
      hint: (isImpostor && gameState.imposterGetsHint) ? (gameState.impostorHint || null) : null,
    });
  }

  res.json({
    success: true,
    results,
    category: gameState.category,
    chaosMode: !!gameState.chaosMode,
    everyoneGetsWord: !!gameState.everyoneGetsWord,
    roundId: gameState.roundId,
    numImposters: gameState.numImposters,
  });
});

/**
 * POST /api/new-game-same-code
 * Host-only. KEY FIX: uses stored `numImposters` (intent), not
 * impostorIndices.length, so a chaos round can't poison subsequent rounds.
 */
app.post('/api/new-game-same-code', async (req, res) => {
  const {
    gameCode,
    token,
    category,
    difficulty,
    chaosModeEnabled,
    usedWords = [],
  } = req.body || {};

  if (!gameCode) return res.status(400).json({ error: 'Game code is required' });

  const existingGame = getGameState(gameCode);
  if (!existingGame) return res.status(404).json({ error: 'Game not found' });
  if (!isHost(existingGame, token)) {
    return res.status(403).json({ error: 'Only the host can start a new round' });
  }

  try {
    const finalCategory = category || existingGame.category;
    const categoryError = validateCategory(finalCategory, {
      min: config.MIN_CATEGORY_LENGTH, max: config.MAX_CATEGORY_LENGTH,
    });
    if (categoryError) return res.status(400).json({ error: categoryError });

    // FIX: intended numImposters comes from stored state, NEVER from
    //      impostorIndices.length (which could be polluted by chaos).
    const finalNumPlayers = existingGame.numPlayers;
    const finalNumImposters = existingGame.numImposters;
    const finalEveryone = existingGame.everyoneGetsWord;
    const finalHint = existingGame.imposterGetsHint;
    const finalDifficulty = difficulty || existingGame.difficulty || 'medium';
    const finalChaosEnabled =
      chaosModeEnabled !== undefined ? !!chaosModeEnabled : !!existingGame.chaosModeEnabled;

    const newGameState = await createGameState({
      category: finalCategory,
      numPlayers: finalNumPlayers,
      numImposters: finalNumImposters,
      everyoneGetsWord: finalEveryone,
      imposterGetsHint: finalHint,
      difficulty: finalDifficulty,
      chaosModeEnabled: finalChaosEnabled,
      usedWords: sanitizeWords(usedWords),
    });

    // Preserve identity across rounds
    newGameState.hostToken = existingGame.hostToken;
    newGameState.playerAssignments = existingGame.playerAssignments;
    newGameState.roundId = (existingGame.roundId || 1) + 1;

    games.set(gameCode, newGameState);
    console.log(
      `New round ${newGameState.roundId} for ${gameCode} (numImposters=${finalNumImposters}, chaos=${newGameState.chaosMode})`
    );

    res.json({
      success: true,
      gameCode,
      category: newGameState.category,
      numPlayers: finalNumPlayers,
      numImposters: finalNumImposters,
      roundId: newGameState.roundId,
    });
  } catch (e) {
    console.error('Error creating new round:', e);
    res.status(500).json({ error: e.message || 'Failed to create new round' });
  }
});

/**
 * POST /api/reset
 * Host-only (if a game exists for that code).
 */
app.post('/api/reset', (req, res) => {
  const { gameCode, token } = req.body || {};
  if (gameCode) {
    const existing = getGameState(gameCode);
    if (existing && !isHost(existing, token)) {
      return res.status(403).json({ error: 'Only the host can reset the game' });
    }
    games.delete(String(gameCode).toUpperCase());
  }
  res.json({ success: true });
});

/**
 * GET /api/status
 * Public — no tokens revealed.
 */
app.get('/api/status', (req, res) => {
  const { gameCode } = req.query;
  const gameState = getGameState(gameCode);
  if (!gameState) return res.json({ active: false });

  const safeAssignments = {};
  for (const [k, v] of Object.entries(gameState.playerAssignments || {})) {
    safeAssignments[k] = { name: v.name, joinedAt: v.joinedAt };
  }

  res.json({
    active: true,
    category: gameState.category,
    numPlayers: gameState.numPlayers,
    numImposters: gameState.numImposters,
    revealedCount: gameState.revealedFlags.filter(Boolean).length,
    revealedFlags: gameState.revealedFlags,
    createdAt: gameState.createdAt,
    roundId: gameState.roundId,
    playerAssignments: safeAssignments,
    allRevealed: !!gameState.allRevealed,
    chaosModeEnabled: !!gameState.chaosModeEnabled,
  });
});

/**
 * POST /api/game/:code/join
 * Claim a player slot. Returns a per-player token.
 */
app.post('/api/game/:code/join', (req, res) => {
  try {
    const code = String(req.params.code || '').toUpperCase();
    const { playerNumber, playerName = '' } = req.body || {};
    const gameState = getGameState(code);
    if (!gameState) return res.status(404).json({ error: 'Game not found' });

    if (!Number.isInteger(playerNumber) || playerNumber < 1 || playerNumber > gameState.numPlayers) {
      return res.status(400).json({
        error: `Invalid player number. Must be between 1 and ${gameState.numPlayers}`,
      });
    }
    if (playerNumber === 1) {
      return res.status(403).json({ error: 'Player 1 is the host slot' });
    }
    if (gameState.playerAssignments[playerNumber]) {
      return res.status(409).json({ error: `Player ${playerNumber} is already taken` });
    }

    const playerToken = generateToken();
    gameState.playerAssignments[playerNumber] = {
      name: (typeof playerName === 'string' && playerName.trim()) || `Player ${playerNumber}`,
      joinedAt: new Date().toISOString(),
      playerToken,
    };

    res.json({
      success: true,
      playerNumber,
      playerIndex: playerNumber - 1,
      playerToken,
      roundId: gameState.roundId,
      category: gameState.category,
      numPlayers: gameState.numPlayers,
    });
  } catch (e) {
    console.error('Error joining:', e);
    res.status(500).json({ error: 'Failed to join game' });
  }
});

/**
 * GET /api/config
 */
app.get('/api/config', (req, res) => {
  res.json({
    minPlayers: config.MIN_PLAYERS,
    maxPlayers: config.MAX_PLAYERS,
    defaultPlayers: config.DEFAULT_PLAYERS,
    revealAutoHideSeconds: config.REVEAL_AUTO_HIDE_SECONDS,
    chaosDefaultEnabled: config.CHAOS_DEFAULT_ENABLED,
    chaosProbabilityDenom: config.CHAOS_PROBABILITY_DENOM,
    offlineMode: !GROQ_API_KEY,
  });
});

// Frontend
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`🎭 Impostor game server running on port ${PORT}`);
    console.log(`🔑 Groq API key: ${GROQ_API_KEY ? 'configured' : 'NOT SET — using offline word packs'}`);
    console.log(`🤖 Model: ${config.MODEL_NAME}`);
  });
}

module.exports = { app, games }; // exported for testing

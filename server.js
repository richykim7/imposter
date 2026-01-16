const express = require('express');
const path = require('path');
const crypto = require('crypto');
const config = require('./config');

const app = express();
const PORT = process.env.PORT || 3000;
const GROQ_API_KEY = process.env.GROQ_API_KEY;

// Middleware
app.use(express.json());
app.use(express.static('public'));

// In-memory game state
let gameState = null;

/**
 * Validates category string
 */
function validateCategory(category) {
  if (typeof category !== 'string') {
    return 'Category must be a string';
  }
  const trimmed = category.trim();
  if (trimmed.length < config.MIN_CATEGORY_LENGTH) {
    return `Category must be at least ${config.MIN_CATEGORY_LENGTH} characters`;
  }
  if (trimmed.length > config.MAX_CATEGORY_LENGTH) {
    return `Category must be at most ${config.MAX_CATEGORY_LENGTH} characters`;
  }
  return null;
}

/**
 * Validates number of players
 */
function validateNumPlayers(numPlayers) {
  if (!Number.isInteger(numPlayers)) {
    return 'Number of players must be an integer';
  }
  if (numPlayers < config.MIN_PLAYERS) {
    return `Minimum ${config.MIN_PLAYERS} players required`;
  }
  if (numPlayers > config.MAX_PLAYERS) {
    return `Maximum ${config.MAX_PLAYERS} players allowed`;
  }
  return null;
}

/**
 * Calls Groq API to generate a single word/phrase from category
 */
async function generateWordFromGroq(category, retryCount = 0) {
  if (!GROQ_API_KEY) {
    throw new Error('GROQ_API_KEY environment variable not set');
  }

  const systemPrompt = `You are a word generator for a party game. Given a category, output EXACTLY ONE word or short phrase (2-3 words max) that belongs to that category. Rules:
- Output ONLY the word or phrase
- NO quotes, NO punctuation at the end
- NO explanations, NO extra text
- Make it specific and concrete
- Keep it appropriate for all ages`;

  const userPrompt = `Category: ${category}\n\nGenerate one word or short phrase:`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), config.API_TIMEOUT_MS);

    const response = await fetch(config.GROQ_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GROQ_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: config.MODEL_NAME,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.8,
        max_tokens: 20
      }),
      signal: controller.signal
    });

    clearTimeout(timeout);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Groq API error: ${response.status} ${errorText}`);
    }

    const data = await response.json();
    let word = data.choices?.[0]?.message?.content?.trim();

    if (!word) {
      throw new Error('No word generated from API');
    }

    // Clean up the word - remove quotes and trailing punctuation
    word = word.replace(/^["']|["']$/g, '').replace(/[.!?,;]+$/, '').trim();

    // Validate the word is not empty after cleaning
    if (!word || word.length === 0) {
      throw new Error('Generated word is empty after cleaning');
    }

    return word;

  } catch (error) {
    console.error(`Groq API attempt ${retryCount + 1} failed:`, error.message);

    // Retry once on failure
    if (retryCount < 1) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      return generateWordFromGroq(category, retryCount + 1);
    }

    // After 2 failures, use fallback
    console.warn('Using fallback word after API failures');
    const fallbackWord = config.FALLBACK_WORDS[
      crypto.randomInt(0, config.FALLBACK_WORDS.length)
    ];
    return fallbackWord;
  }
}

/**
 * POST /api/new-game
 * Creates a new game with specified category and number of players
 */
app.post('/api/new-game', async (req, res) => {
  try {
    const { category, numPlayers } = req.body;

    // Validate inputs
    const categoryError = validateCategory(category);
    if (categoryError) {
      return res.status(400).json({ error: categoryError });
    }

    const numPlayersError = validateNumPlayers(numPlayers);
    if (numPlayersError) {
      return res.status(400).json({ error: numPlayersError });
    }

    const trimmedCategory = category.trim();

    // Generate word from Groq
    const word = await generateWordFromGroq(trimmedCategory);

    // Crypto-secure random impostor selection
    const impostorIndex = crypto.randomInt(0, numPlayers);

    // Initialize game state
    gameState = {
      category: trimmedCategory,
      word,
      numPlayers,
      impostorIndex,
      revealedFlags: new Array(numPlayers).fill(false),
      createdAt: new Date().toISOString()
    };

    console.log(`New game created: ${numPlayers} players, impostor at index ${impostorIndex}`);

    res.json({
      success: true,
      numPlayers,
      category: trimmedCategory
    });

  } catch (error) {
    console.error('Error creating game:', error);
    res.status(500).json({
      error: 'Failed to create game',
      details: error.message
    });
  }
});

/**
 * POST /api/reveal
 * Reveals the role and word (if applicable) for a specific player
 */
app.post('/api/reveal', (req, res) => {
  try {
    const { playerIndex } = req.body;

    // Check if game exists
    if (!gameState) {
      return res.status(404).json({ error: 'No active game. Create a game first.' });
    }

    // Validate playerIndex
    if (!Number.isInteger(playerIndex) || playerIndex < 0 || playerIndex >= gameState.numPlayers) {
      return res.status(400).json({
        error: `Invalid player index. Must be between 0 and ${gameState.numPlayers - 1}`
      });
    }

    // Check if already revealed
    if (gameState.revealedFlags[playerIndex]) {
      return res.status(403).json({
        error: 'Already revealed',
        message: `Player ${playerIndex + 1} has already been revealed`
      });
    }

    // Mark as revealed
    gameState.revealedFlags[playerIndex] = true;

    // Determine role and word
    const isImpostor = playerIndex === gameState.impostorIndex;
    const role = isImpostor ? 'IMPOSTOR' : 'INSIDER';
    const word = isImpostor ? null : gameState.word;

    res.json({
      role,
      word,
      category: gameState.category,
      playerIndex
    });

  } catch (error) {
    console.error('Error revealing player:', error);
    res.status(500).json({
      error: 'Failed to reveal player',
      details: error.message
    });
  }
});

/**
 * POST /api/reset
 * Clears the current game state
 */
app.post('/api/reset', (req, res) => {
  gameState = null;
  console.log('Game state reset');
  res.json({ success: true, message: 'Game reset successfully' });
});

/**
 * GET /api/status
 * Returns current game status (without revealing sensitive info)
 */
app.get('/api/status', (req, res) => {
  if (!gameState) {
    return res.json({ active: false });
  }

  res.json({
    active: true,
    category: gameState.category,
    numPlayers: gameState.numPlayers,
    revealedCount: gameState.revealedFlags.filter(Boolean).length,
    createdAt: gameState.createdAt
  });
});

/**
 * GET /api/config
 * Returns public configuration constants
 */
app.get('/api/config', (req, res) => {
  res.json({
    minPlayers: config.MIN_PLAYERS,
    maxPlayers: config.MAX_PLAYERS,
    defaultPlayers: config.DEFAULT_PLAYERS,
    revealAutoHideSeconds: config.REVEAL_AUTO_HIDE_SECONDS
  });
});

// Serve frontend
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start server
app.listen(PORT, () => {
  console.log(`🎭 Impostor game server running on port ${PORT}`);
  console.log(`🔑 Groq API key: ${GROQ_API_KEY ? 'configured' : 'MISSING'}`);
  console.log(`🤖 Using model: ${config.MODEL_NAME}`);
});


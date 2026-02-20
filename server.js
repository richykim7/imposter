require('dotenv').config();

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

// In-memory game state - keyed by game code
let games = new Map(); // Map<gameCode, gameState>

/**
 * Generate a random game code
 */
function generateGameCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Removed confusing chars
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(crypto.randomInt(0, chars.length));
  }
  return code;
}

/**
 * Get game state by code
 */
function getGameState(gameCode) {
  if (!gameCode) return null;
  return games.get(gameCode) || null;
}

/**
 * Fisher-Yates shuffle — uniform random, unlike Array.sort(() => 0.5 - Math.random())
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
 * Clean up games older than 24 hours
 */
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
 * Calls Groq API to generate a hint for a specific word
 */
async function generateHintFromGroq(word, category, retryCount = 0) {
  if (!GROQ_API_KEY) {
    return null; // Return null if no API key, hint is optional
  }

  const systemPrompt = `You are a hint generator for a party game. Given a specific word and its category, generate a VERY SHORT, ABSTRACT hint (1-2 words only) that is extremely vague and indirect. Rules:
- Output ONLY 1-2 words (no more!)
- NO quotes, NO punctuation
- NO explanations, NO extra text
- The hint must be SO ABSTRACT that it could apply to MULTIPLE items in the category, never narrowing it down to one specific item
- NEVER reference famous quotes, lines, catchphrases, or direct associations with the word
- NEVER use anything that would make someone immediately think of this specific word
- Use only VERY GENERAL characteristics: abstract concepts, broad themes, or vague associations
- Think of the most indirect, abstract connection possible - something that gives a general direction but could fit many things
- Examples of GOOD hints: "nostalgic" (very general feeling), "warm" (abstract quality), "distant" (vague concept)
- Examples of BAD hints: "boxed chocolates" (too specific, references famous quote), "red door" (too direct)
- The hint should be so vague that guessing the exact word from it alone would be nearly impossible
- Keep it appropriate for all ages`;

  const userPrompt = `Word: ${word}\nCategory: ${category}\n\nGenerate an extremely abstract, vague 1-2 word hint that could apply to many items in this category (never specific to this word):`;

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
        temperature: 1.2,
        max_tokens: 10
      }),
      signal: controller.signal
    });

    clearTimeout(timeout);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Groq API error: ${response.status} ${errorText}`);
    }

    const data = await response.json();
    let hint = data.choices?.[0]?.message?.content?.trim();

    if (!hint) {
      throw new Error('No hint generated from API');
    }

    // Clean up the hint
    hint = hint.replace(/^["']|["']$/g, '').replace(/[.!?,;:]+$/g, '').trim();
    
    // Ensure we only have 1-2 words (take first two words if more)
    const words = hint.split(/\s+/).filter(w => w.length > 0);
    if (words.length > 2) {
      hint = words.slice(0, 2).join(' ');
    }

    if (!hint || hint.length === 0) {
      throw new Error('Generated hint is empty after cleaning');
    }

    return hint;

  } catch (error) {
    console.error(`Hint generation attempt ${retryCount + 1} failed:`, error.message);

    // Retry once on failure
    if (retryCount < 1) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      return generateHintFromGroq(word, category, retryCount + 1);
    }

    // After 2 failures, return null (hint is optional)
    console.warn('Hint generation failed, continuing without hint');
    return null;
  }
}

/**
 * Check if two words are too similar (case-insensitive, ignoring common words)
 */
function areWordsTooSimilar(word1, word2) {
  const w1 = word1.toLowerCase().trim();
  const w2 = word2.toLowerCase().trim();
  
  // Exact match
  if (w1 === w2) return true;
  
  // Check if one contains the other (for phrases)
  if (w1.includes(w2) && w2.length > 3) return true;
  if (w2.includes(w1) && w1.length > 3) return true;
  
  // Check word-by-word similarity for multi-word phrases
  const words1 = w1.split(/\s+/);
  const words2 = w2.split(/\s+/);
  
  // If both are single words, check if they're very close
  if (words1.length === 1 && words2.length === 1) {
    // Check Levenshtein distance for short words
    if (w1.length <= 10 && w2.length <= 10) {
      const distance = levenshteinDistance(w1, w2);
      const maxLen = Math.max(w1.length, w2.length);
      // If more than 80% similar, consider too similar
      if (maxLen > 0 && (maxLen - distance) / maxLen > 0.8) {
        return true;
      }
    }
  }
  
  // For multi-word phrases, check if they share significant words
  if (words1.length > 1 || words2.length > 1) {
    const commonWords = words1.filter(w => w.length > 3 && words2.includes(w));
    if (commonWords.length > 0 && commonWords.length >= Math.min(words1.length, words2.length) * 0.7) {
      return true;
    }
  }
  
  return false;
}

/**
 * Simple Levenshtein distance calculation
 */
function levenshteinDistance(str1, str2) {
  const matrix = [];
  for (let i = 0; i <= str2.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= str1.length; j++) {
    matrix[0][j] = j;
  }
  for (let i = 1; i <= str2.length; i++) {
    for (let j = 1; j <= str1.length; j++) {
      if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
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
  return matrix[str2.length][str1.length];
}

/**
 * Calls Groq API to generate multiple words/phrases from category, then randomly selects one
 * @param {string} category - The category to generate words from
 * @param {string[]} previousWords - Array of previously used words to avoid
 * @param {number} retryCount - Internal retry counter
 * @param {string} difficulty - 'easy', 'medium', or 'hard'
 */
async function generateWordFromGroq(category, previousWords = [], retryCount = 0, difficulty = 'medium') {
  if (!GROQ_API_KEY) {
    throw new Error('GROQ_API_KEY environment variable not set');
  }

  // Detect if category implies specific proper nouns (movies, countries, cities, etc.)
  const categoryLower = category.toLowerCase().trim();
  const isProperNounCategory = 
    categoryLower.includes('movie') || categoryLower.includes('film') ||
    categoryLower.includes('country') || categoryLower.includes('nation') ||
    categoryLower.includes('city') || categoryLower.includes('capital') ||
    categoryLower.includes('book') || categoryLower.includes('novel') ||
    categoryLower.includes('song') || categoryLower.includes('track') ||
    categoryLower.includes('band') || categoryLower.includes('artist') ||
    categoryLower.includes('actor') || categoryLower.includes('actress') ||
    categoryLower.includes('person') || categoryLower.includes('celebrity') ||
    categoryLower.includes('brand') || categoryLower.includes('company') ||
    categoryLower.includes('game') || categoryLower.includes('video game') ||
    categoryLower.includes('sport') || categoryLower.includes('team');

  const difficultyInstructions = {
    easy: '- IMPORTANT: Generate only very well-known, mainstream, household-name items that virtually EVERYONE would recognize. Think top-of-mind, iconic examples.',
    medium: '- Generate a mix of common and moderately known items. Most people would recognize most of them, but include a couple slightly less obvious ones.',
    hard: '- IMPORTANT: Generate lesser-known, surprising, or unexpected items that go beyond the most obvious examples. Avoid the most mainstream/iconic picks, but they should still be real and recognizable to someone familiar with the category.'
  };
  const difficultyLine = difficultyInstructions[difficulty] || difficultyInstructions.medium;

  const systemPrompt = `You are a word generator for a party game. Given a category, output EXACTLY 10 different words or short phrases (2-3 words max each) that belong to that category. Rules:
- Output ONLY the words/phrases, one per line
- NO quotes, NO punctuation at the end of each word
- NO explanations, NO extra text, NO numbering
${difficultyLine}
- Keep them appropriate for all ages
- Each word/phrase should be on its own line
${isProperNounCategory ? '\nCRITICAL: If the category clearly refers to specific named items (like "movies" = movie titles, "countries" = country names), generate ACTUAL proper nouns/names, NOT generic descriptive phrases. Examples:\n- "movies" → "The Matrix", "Titanic", "Inception" (NOT "blockbuster hit", "action film")\n- "countries" → "France", "Japan", "Brazil" (NOT "European nation", "island country")\n- "cities" → "Paris", "Tokyo", "New York" (NOT "metropolitan area", "coastal city")' : '- Use concrete, specific examples rather than abstract descriptions'}`;

  const userPrompt = `Category: ${category}\n\nGenerate 10 different ${isProperNounCategory ? 'specific named items (actual titles/names, not descriptions)' : 'words or short phrases'} (one per line):`;

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
        temperature: 0.9,
        max_tokens: 200
      }),
      signal: controller.signal
    });

    clearTimeout(timeout);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Groq API error: ${response.status} ${errorText}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content?.trim();

    if (!content) {
      throw new Error('No words generated from API');
    }

    // Parse the response to extract all words
    // Split by newlines, commas, or other separators
    let words = content
      .split(/\n|;|•/)
      .map(word => word.trim())
      .map(word => word.replace(/^[-–—]\s*/, ''))
      .map(word => word.replace(/^\d+[\.\):\-]\s*/, ''))
      .map(word => word.replace(/^["']|["']$/g, '').replace(/[.!?,;:]+$/, '').trim())
      .filter(word => word.length > 0);

    // If we didn't get enough words from splitting, try to extract from the text more carefully
    if (words.length < 3) {
      // Try splitting by any whitespace and filtering for reasonable length words
      words = content
        .split(/\s+/)
        .map(word => word.trim())
        .map(word => word.replace(/^["']|["']$/g, '').replace(/[.!?,;:]+$/, '').trim())
        .filter(word => word.length >= 2 && word.length <= 30)
        .filter(word => !/^\d+\.?$/.test(word));
    }

    if (words.length === 0) {
      throw new Error('No valid words extracted from API response');
    }

    // Filter out words that are too similar to previous words
    let availableWords = words;
    if (previousWords.length > 0) {
      availableWords = words.filter(word => {
        return !previousWords.some(prevWord => areWordsTooSimilar(word, prevWord));
      });
      
      // If all words are too similar, log warning but allow one anyway
      if (availableWords.length === 0) {
        console.warn('All generated words are too similar to previous words, using one anyway');
        availableWords = words; // Fallback to original list
      } else {
        console.log(`Filtered ${words.length - availableWords.length} words that were too similar to previous words`);
      }
    }

    // Randomly select one word from the filtered list
    const selectedWord = availableWords[crypto.randomInt(0, availableWords.length)];
    
    console.log(`Generated ${words.length} words, ${availableWords.length} available after filtering, selected: "${selectedWord}"`);

    return selectedWord;

  } catch (error) {
    console.error(`Groq API attempt ${retryCount + 1} failed:`, error.message);

    // Retry once on failure
    if (retryCount < 1) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      return generateWordFromGroq(category, previousWords, retryCount + 1, difficulty);
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
    const { category, numPlayers, numImposters = 1, everyoneGetsWord = false, imposterGetsHint = false, difficulty = 'medium', usedWords = [] } = req.body;

    // Validate inputs
    const categoryError = validateCategory(category);
    if (categoryError) {
      return res.status(400).json({ error: categoryError });
    }

    const numPlayersError = validateNumPlayers(numPlayers);
    if (numPlayersError) {
      return res.status(400).json({ error: numPlayersError });
    }

    // Validate number of imposters
    const maxImposters = Math.floor((numPlayers - 1) / 2);
    if (!Number.isInteger(numImposters) || numImposters < 1 || numImposters > maxImposters) {
      return res.status(400).json({ 
        error: `Number of imposters must be between 1 and ${maxImposters} for ${numPlayers} players` 
      });
    }

    const trimmedCategory = category.trim();
    const clientUsedWords = (Array.isArray(usedWords) ? usedWords.filter(w => typeof w === 'string') : []).slice(0, 500);

    // SECRET CHAOS MODE: 1 in 20 chance everyone is impostor!
    const chaosMode = crypto.randomInt(0, 20) === 0;
    
    let word;
    let impostorWord = null;
    let impostorHint = null;
    let impostorIndices;
    let gamePreviousWords = [...clientUsedWords];
    
    if (chaosMode) {
      // CHAOS MODE: Everyone is impostor, no word needed
      word = null;
      impostorIndices = Array.from({ length: numPlayers }, (_, i) => i);
      console.log(`🎭 CHAOS MODE ACTIVATED! All ${numPlayers} players are impostors!`);
    } else {
      
      word = await generateWordFromGroq(trimmedCategory, gamePreviousWords, 0, difficulty);
      
      // Select random imposters using Fisher-Yates shuffle
      const allIndices = Array.from({ length: numPlayers }, (_, i) => i);
      const shuffled = fisherYatesShuffle(allIndices);
      impostorIndices = shuffled.slice(0, numImposters);
      
      // Track words used in this game
      const usedWords = [word];
      
      // If everyone gets word mode, generate a different word for imposters
      if (everyoneGetsWord) {
        impostorWord = await generateWordFromGroq(trimmedCategory, [...gamePreviousWords, ...usedWords], 0, difficulty);
        // Make sure impostor word is different from the main word
        let attempts = 0;
        while ((impostorWord === word || areWordsTooSimilar(impostorWord, word)) && attempts < 5) {
          impostorWord = await generateWordFromGroq(trimmedCategory, [...gamePreviousWords, ...usedWords], 0, difficulty);
          attempts++;
        }
        // Validate that we got a word
        if (!impostorWord) {
          throw new Error('Failed to generate word for impostor in everyone-gets-word mode');
        }
        usedWords.push(impostorWord);
        console.log(`New game created: ${numPlayers} players, ${numImposters} imposters at indices [${impostorIndices.join(', ')}] with different word: "${impostorWord}"`);
        
        // If imposter gets hint mode, generate a hint for the impostor word
        if (imposterGetsHint) {
          impostorHint = await generateHintFromGroq(impostorWord, trimmedCategory);
          console.log(`Imposter hint generated for word "${impostorWord}": "${impostorHint}"`);
        }
      } else {
        console.log(`New game created: ${numPlayers} players, ${numImposters} imposters at indices [${impostorIndices.join(', ')}]`);
        
        // If imposter gets hint mode, generate a hint for the main word (to help impostor guess it)
        if (imposterGetsHint) {
          impostorHint = await generateHintFromGroq(word, trimmedCategory);
          console.log(`Imposter hint generated for word "${word}": "${impostorHint}"`);
        }
      }
      
      gamePreviousWords = [...gamePreviousWords, ...usedWords];
      if (gamePreviousWords.length > 50) {
        gamePreviousWords = gamePreviousWords.slice(-50);
      }
    }

    const gameState = {
      category: trimmedCategory,
      word,
      impostorWord,
      impostorHint,
      numPlayers,
      impostorIndices,
      chaosMode,
      everyoneGetsWord,
      imposterGetsHint,
      difficulty,
      revealedFlags: new Array(numPlayers).fill(false),
      playerAssignments: { 1: { name: 'Host (Player 1)', joinedAt: new Date().toISOString() } },
      previousWords: gamePreviousWords,
      allRevealed: false,
      gameEnded: false,
      createdAt: new Date().toISOString()
    };

    // Always generate a unique game code (for game isolation)
    let gameCode = null;
    let attempts = 0;
    do {
      gameCode = generateGameCode();
      attempts++;
      if (attempts > 10) {
        console.error('Failed to generate unique game code after 10 attempts');
        break;
      }
    } while (games.has(gameCode));
    
    if (gameCode) {
      games.set(gameCode, gameState);
      console.log(`✅ Game created with code: ${gameCode}`);
    } else {
      // Fallback: use a random string if code generation fails
      gameCode = 'game_' + crypto.randomBytes(4).toString('hex');
      games.set(gameCode, gameState);
      console.log(`⚠️ Game created with fallback code: ${gameCode}`);
    }

    res.json({
      success: true,
      numPlayers,
      category: trimmedCategory,
      gameCode
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
    const { playerIndex, gameCode = null } = req.body;
    const gameState = getGameState(gameCode);

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

    // Determine role and word (check if player is in impostor indices array)
    const isImpostor = gameState.impostorIndices.includes(playerIndex);
    const role = isImpostor ? 'IMPOSTOR' : 'INSIDER';
    
    // Determine word based on game mode
    let word;
    if (isImpostor) {
      // Impostor gets word only if everyoneGetsWord mode is enabled
      if (gameState.everyoneGetsWord) {
        word = gameState.impostorWord || gameState.word; // Fallback to main word if impostor word failed
      } else {
        word = null;
      }
    } else {
      // Insider always gets the main word
      word = gameState.word;
    }
    
    // Get hint if imposter and hint mode is enabled
    const hint = (isImpostor && gameState.imposterGetsHint) ? gameState.impostorHint : null;

    res.json({
      role: gameState.everyoneGetsWord ? null : role, // Hide role if everyone gets word
      word,
      hint,
      category: gameState.category,
      playerIndex,
      everyoneGetsWord: gameState.everyoneGetsWord
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
 * POST /api/reveal-all
 * Reveals all roles and words to all players (host triggers end of game)
 */
app.post('/api/reveal-all', (req, res) => {
  const { gameCode = null } = req.body;
  const gameState = getGameState(gameCode);
  
  if (!gameState) {
    return res.status(404).json({ error: 'No active game found' });
  }

  gameState.allRevealed = true;
  gameState.gameEnded = true;
  
  // Compile results for all players
  const results = [];
  for (let i = 0; i < gameState.numPlayers; i++) {
    const isImpostor = gameState.impostorIndices.includes(i);
    let playerWord = gameState.word || 'N/A';
    
    if (gameState.chaosMode) {
      playerWord = 'No word (Chaos Mode)';
    } else if (gameState.everyoneGetsWord && isImpostor && gameState.impostorWord) {
      playerWord = gameState.impostorWord;
    }
    
    results.push({
      playerNumber: i + 1,
      role: isImpostor ? 'Impostor' : 'Insider',
      word: playerWord,
      hint: (isImpostor && gameState.imposterGetsHint) ? (gameState.impostorHint || null) : null
    });
  }
  
  console.log('Host revealed all roles for game:', gameCode);
  
  res.json({
    success: true,
    results,
    category: gameState.category || 'Unknown',
    chaosMode: gameState.chaosMode || false,
    everyoneGetsWord: gameState.everyoneGetsWord || false
  });
});

/**
 * POST /api/new-game-same-code
 * Creates a new game with the same game code (for continuing with same players)
 */
app.post('/api/new-game-same-code', async (req, res) => {
  const { gameCode, category, numPlayers, numImposters = 1, everyoneGetsWord = false, imposterGetsHint = false, difficulty, usedWords = [] } = req.body;
  
  if (!gameCode) {
    return res.status(400).json({ error: 'Game code is required' });
  }
  
  const existingGame = getGameState(gameCode);
  if (!existingGame) {
    return res.status(404).json({ error: 'Game not found' });
  }
  
  try {
    const finalCategory = category || existingGame.category;
    const finalNumPlayers = numPlayers || existingGame.numPlayers;
    const finalNumImposters = numImposters || (existingGame.impostorIndices?.length || 1);
    const finalEveryoneGetsWord = everyoneGetsWord !== undefined ? everyoneGetsWord : existingGame.everyoneGetsWord;
    const finalImposterGetsHint = imposterGetsHint !== undefined ? imposterGetsHint : existingGame.imposterGetsHint;
    const finalDifficulty = difficulty || existingGame.difficulty || 'medium';
    const clientUsedWords = (Array.isArray(usedWords) ? usedWords.filter(w => typeof w === 'string') : []).slice(0, 500);
    
    // Validate
    const categoryError = validateCategory(finalCategory);
    if (categoryError) {
      return res.status(400).json({ error: categoryError });
    }
    
    const trimmedCategory = finalCategory.trim();
    
    // Keep the player assignments from the previous game
    const previousPlayerAssignments = existingGame.playerAssignments || {};
    
    const previousWords = [...clientUsedWords];
    
    // Generate new game (similar to /api/new-game logic)
    const chaosMode = crypto.randomInt(0, 20) === 0;
    
    let word;
    let impostorWord = null;
    let impostorHint = null;
    let impostorIndices;
    let gamePreviousWords = [...previousWords];
    
    if (chaosMode) {
      word = null;
      impostorIndices = Array.from({ length: finalNumPlayers }, (_, i) => i);
      console.log(`🎭 CHAOS MODE ACTIVATED! All ${finalNumPlayers} players are impostors!`);
    } else {
      word = await generateWordFromGroq(trimmedCategory, gamePreviousWords, 0, finalDifficulty);
      
      const allIndices = Array.from({ length: finalNumPlayers }, (_, i) => i);
      const shuffled = fisherYatesShuffle(allIndices);
      impostorIndices = shuffled.slice(0, finalNumImposters);
      
      const usedWords = [word];
      
      if (finalEveryoneGetsWord) {
        impostorWord = await generateWordFromGroq(trimmedCategory, [...gamePreviousWords, ...usedWords], 0, finalDifficulty);
        let attempts = 0;
        while ((impostorWord === word || areWordsTooSimilar(impostorWord, word)) && attempts < 5) {
          impostorWord = await generateWordFromGroq(trimmedCategory, [...gamePreviousWords, ...usedWords], 0, finalDifficulty);
          attempts++;
        }
        if (!impostorWord) {
          throw new Error('Failed to generate word for impostor');
        }
        usedWords.push(impostorWord);
        
        if (finalImposterGetsHint) {
          impostorHint = await generateHintFromGroq(impostorWord, trimmedCategory);
        }
      } else if (finalImposterGetsHint) {
        impostorHint = await generateHintFromGroq(word, trimmedCategory);
      }
      
      gamePreviousWords = [...gamePreviousWords, ...usedWords];
      if (gamePreviousWords.length > 50) {
        gamePreviousWords = gamePreviousWords.slice(-50);
      }
    }
    
    const newGameState = {
      category: trimmedCategory,
      word,
      impostorWord,
      impostorHint,
      numPlayers: finalNumPlayers,
      impostorIndices,
      chaosMode,
      everyoneGetsWord: finalEveryoneGetsWord,
      imposterGetsHint: finalImposterGetsHint,
      difficulty: finalDifficulty,
      revealedFlags: new Array(finalNumPlayers).fill(false),
      playerAssignments: previousPlayerAssignments,
      previousWords: gamePreviousWords,
      allRevealed: false,
      gameEnded: false,
      createdAt: new Date().toISOString()
    };
    
    // Replace the game state with new one
    games.set(gameCode, newGameState);
    
    console.log(`New game created with existing code ${gameCode}, category: ${trimmedCategory}`);
    
    res.json({
      success: true,
      gameCode,
      category: trimmedCategory,
      numPlayers: finalNumPlayers
    });
    
  } catch (error) {
    console.error('Error creating new game with same code:', error);
    res.status(500).json({ error: error.message || 'Failed to create new game' });
  }
});

/**
 * POST /api/reset
 * Clears the current game state
 */
app.post('/api/reset', (req, res) => {
  const { gameCode = null } = req.body;
  if (gameCode) {
    games.delete(gameCode);
    console.log(`Game state reset for code: ${gameCode}`);
  }
  res.json({ success: true, message: 'Game reset successfully' });
});

/**
 * GET /api/status
 * Returns current game status (without revealing sensitive info)
 */
app.get('/api/status', (req, res) => {
  const { gameCode = null } = req.query;
  const gameState = getGameState(gameCode);
  
  if (!gameState) {
    return res.json({ active: false });
  }

  res.json({
    active: true,
    category: gameState.category,
    numPlayers: gameState.numPlayers,
    revealedCount: gameState.revealedFlags.filter(Boolean).length,
    createdAt: gameState.createdAt,
    playerAssignments: gameState.playerAssignments,
    allRevealed: gameState.allRevealed,
    gameEnded: gameState.gameEnded
  });
});

/**
 * GET /api/game/:code
 * Get game info by code (for joining)
 */
app.get('/api/game/:code', (req, res) => {
  const { code } = req.params;
  const gameState = getGameState(code.toUpperCase());
  
  if (!gameState) {
    return res.status(404).json({ error: 'Game not found' });
  }

  res.json({
    active: true,
    category: gameState.category,
    numPlayers: gameState.numPlayers,
    playerAssignments: gameState.playerAssignments,
    createdAt: gameState.createdAt
  });
});

/**
 * POST /api/game/:code/join
 * Join a game with a player number
 */
app.post('/api/game/:code/join', (req, res) => {
  try {
    const { code } = req.params;
    const { playerNumber, playerName = '' } = req.body;
    const gameState = getGameState(code.toUpperCase());
    
    if (!gameState) {
      return res.status(404).json({ error: 'Game not found' });
    }

    // Validate player number
    if (!Number.isInteger(playerNumber) || playerNumber < 1 || playerNumber > gameState.numPlayers) {
      return res.status(400).json({
        error: `Invalid player number. Must be between 1 and ${gameState.numPlayers}`
      });
    }

    const playerIndex = playerNumber - 1; // Convert to 0-based index

    // Check if player number is already taken
    if (gameState.playerAssignments[playerNumber]) {
      return res.status(409).json({
        error: `Player ${playerNumber} is already taken`
      });
    }

    // Assign player
    gameState.playerAssignments[playerNumber] = {
      name: playerName || `Player ${playerNumber}`,
      joinedAt: new Date().toISOString()
    };

    res.json({
      success: true,
      playerNumber,
      playerIndex
    });

  } catch (error) {
    console.error('Error joining game:', error);
    res.status(500).json({
      error: 'Failed to join game',
      details: error.message
    });
  }
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


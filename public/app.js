/**
 * Impostor Game - Frontend Logic
 */

// DOM Elements
const setupSection = document.getElementById('setupSection');
const gameSection = document.getElementById('gameSection');
const statusLine = document.getElementById('statusLine');
const categoryInput = document.getElementById('categoryInput');
const numPlayersInput = document.getElementById('numPlayersInput');
const customPlayersInput = document.getElementById('customPlayersInput');
const customPlayersBtn = document.getElementById('customPlayersBtn');
const playerButtons = document.querySelectorAll('.player-btn');
const impostersGroup = document.getElementById('impostersGroup');
const imposterButtons = document.querySelectorAll('.imposter-btn');
const createGameBtn = document.getElementById('createGameBtn');
const resetBtn = document.getElementById('resetBtn');
const revealAllBtn = document.getElementById('revealAllBtn');
const gameCategoryDisplay = document.getElementById('gameCategoryDisplay');
const gamePlayersDisplay = document.getElementById('gamePlayersDisplay');
const gameCodeDisplay = document.getElementById('gameCodeDisplay');
const gameCodeValue = document.getElementById('gameCodeValue');
const playersList = document.getElementById('playersList');
const revealModal = document.getElementById('revealModal');
const revealAllModal = document.getElementById('revealAllModal');
const revealAllContent = document.getElementById('revealAllContent');
const startNewGameFromModalBtn = document.getElementById('startNewGameFromModalBtn');
const closeRevealAllModalBtn = document.getElementById('closeRevealAllModalBtn');
const modalPlayerTitle = document.getElementById('modalPlayerTitle');
const modalRole = document.getElementById('modalRole');
const modalWord = document.getElementById('modalWord');
const modalCountdown = document.getElementById('modalCountdown');
const hideModalBtn = document.getElementById('hideModalBtn');
const settingsToggle = document.getElementById('settingsToggle');
const settingsContent = document.getElementById('settingsContent');
const everyoneGetsWordToggle = document.getElementById('everyoneGetsWordToggle');
const imposterGetsHintToggle = document.getElementById('imposterGetsHintToggle');
const joinSection = document.getElementById('joinSection');
const gameCodeInput = document.getElementById('gameCodeInput');
const joinGameBtn = document.getElementById('joinGameBtn');
const switchToJoinBtn = document.getElementById('switchToJoinBtn');
const backToSetupBtn = document.getElementById('backToSetupBtn');
const playerSelectionSection = document.getElementById('playerSelectionSection');
const playerSelectionInfo = document.getElementById('playerSelectionInfo');
const playerSelectionButtons = document.getElementById('playerSelectionButtons');
const confirmPlayerBtn = document.getElementById('confirmPlayerBtn');
const newRoundSection = document.getElementById('newRoundSection');
const newRoundCodeDisplay = document.getElementById('newRoundCodeDisplay');
const newRoundCodeValue = document.getElementById('newRoundCodeValue');
const newRoundCategoryInput = document.getElementById('newRoundCategoryInput');
const startNewRoundBtn = document.getElementById('startNewRoundBtn');
const revealAllHostButtons = document.getElementById('revealAllHostButtons');
const difficultyButtons = document.querySelectorAll('.difficulty-btn:not(.new-round-difficulty-btn)');
const difficultyHint = document.getElementById('difficultyHint');
const newRoundDifficultyButtons = document.querySelectorAll('.new-round-difficulty-btn');
const newRoundDifficultyHint = document.getElementById('newRoundDifficultyHint');

// Used words persistence (localStorage)
const USED_WORDS_KEY = 'imposter_used_words';

function getUsedWords() {
  try {
    const stored = localStorage.getItem(USED_WORDS_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

function addUsedWord(word) {
  try {
    if (!word || typeof word !== 'string') return;
    const words = getUsedWords();
    const normalized = word.toLowerCase().trim();
    if (words.some(w => w.toLowerCase().trim() === normalized)) return;
    words.push(word.trim());
    // Cap at 500 to avoid unbounded growth
    if (words.length > 500) words.splice(0, words.length - 500);
    localStorage.setItem(USED_WORDS_KEY, JSON.stringify(words));
  } catch {
    // localStorage may be unavailable (private browsing, quota exceeded)
  }
}

function clearUsedWords() {
  localStorage.removeItem(USED_WORDS_KEY);
}

// App State
let appConfig = null;
let currentGame = null;
let hideTimer = null;
let countdownInterval = null;
let selectedPlayers = 3;
let selectedImposters = 1;
let selectedDifficulty = 'medium';
let newRoundDifficulty = 'medium';
let customInputActive = false;
let currentGameCode = null;
let myPlayerNumber = null;
let pollingInterval = null;
let isHost = false;
let revealedPlayerIndices = new Set();
let lastKnownAssignments = null;

function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * Initialize the app
 */
async function init() {
  try {
    const response = await fetch('/api/config');
    appConfig = await response.json();
    
    // Check if user has localStorage data (proof they belong to a game)
    const urlParams = new URLSearchParams(window.location.search);
    const urlGameCode = urlParams.get('code');
    const storedGameCode = localStorage.getItem('gameCode');
    const storedPlayerNumber = localStorage.getItem('playerNumber');
    
    if (urlGameCode || storedGameCode) {
      const gameCodeToCheck = urlGameCode || storedGameCode;
      
      const statusResponse = await fetch(`/api/status?gameCode=${gameCodeToCheck}`);
      const status = await statusResponse.json();
    
      if (status.active) {
        currentGame = {
          category: status.category,
          numPlayers: status.numPlayers,
          revealedCount: status.revealedCount,
          playerAssignments: status.playerAssignments || {}
        };
        
        currentGameCode = gameCodeToCheck;
        myPlayerNumber = storedPlayerNumber ? parseInt(storedPlayerNumber, 10) : 1;
        isHost = (myPlayerNumber === 1);
        
        localStorage.setItem('gameCode', gameCodeToCheck);
        
        showGameSection();
        startPolling();
      } else {
        localStorage.removeItem('gameCode');
        localStorage.removeItem('playerNumber');
        showSetupSection();
      }
    } else {
      showSetupSection();
    }
  } catch (error) {
    console.error('Init error:', error);
    showStatus('Failed to initialize app', 'error');
  }
}

/**
 * Show status message
 */
function showStatus(message, type = 'info') {
  statusLine.textContent = message;
  statusLine.className = `status-line ${type}`;
}

/**
 * Show setup section
 */
function showSetupSection() {
  setupSection.classList.remove('hidden');
  gameSection.classList.add('hidden');
  joinSection.classList.add('hidden');
  playerSelectionSection.classList.add('hidden');
  if (newRoundSection) newRoundSection.classList.add('hidden');
  currentGame = null;
  currentGameCode = null;
  myPlayerNumber = null;
  isHost = false;
  revealedPlayerIndices = new Set();
  lastKnownAssignments = null;
  stopPolling();
  localStorage.removeItem('gameCode');
  localStorage.removeItem('playerNumber');
  selectPlayerCount(3);
  selectImposterCount(1);
  selectDifficulty('medium');
  customInputActive = false;
  customPlayersInput.classList.add('hidden');
  numPlayersInput.value = '';
}

/**
 * Show game section
 */
function showGameSection() {
  setupSection.classList.add('hidden');
  gameSection.classList.remove('hidden');
  joinSection.classList.add('hidden');
  playerSelectionSection.classList.add('hidden');
  if (newRoundSection) newRoundSection.classList.add('hidden');
  
  gameCategoryDisplay.textContent = currentGame.category;
  gamePlayersDisplay.textContent = currentGame.numPlayers;
  
  // Always show game code
  if (currentGameCode && gameCodeDisplay && gameCodeValue) {
    gameCodeValue.textContent = currentGameCode;
    gameCodeDisplay.classList.remove('hidden');
  }
  
  // Reveal All: only host (Player 1) can see this
  const isPlayer1 = myPlayerNumber === 1;
  if (revealAllBtn) revealAllBtn.style.display = isPlayer1 ? 'block' : 'none';
  
  // Reset: always visible as fallback
  if (resetBtn) resetBtn.style.display = 'block';
  
  renderPlayersList();
}

/**
 * Show join section
 */
function showJoinSection() {
  setupSection.classList.add('hidden');
  joinSection.classList.remove('hidden');
  gameCodeInput.value = '';
  gameCodeInput.focus();
}

/**
 * Show create section
 */
function showCreateSection() {
  joinSection.classList.add('hidden');
  playerSelectionSection.classList.add('hidden');
  setupSection.classList.remove('hidden');
}

/**
 * Render players list
 */
function renderPlayersList() {
  playersList.innerHTML = '';
  
  const isPlayer1 = myPlayerNumber === 1;
  
  // Non-host joined player view - show only their reveal button
  if (!isPlayer1 && myPlayerNumber) {
    const playerDiv = document.createElement('div');
    playerDiv.className = 'player-item';
    playerDiv.style.justifyContent = 'center';
    
    const playerLabel = document.createElement('span');
    playerLabel.className = 'player-label';
    playerLabel.textContent = `You are Player ${myPlayerNumber}`;
    playerLabel.style.marginRight = '1rem';
    
    const revealBtn = document.createElement('button');
    revealBtn.className = 'btn btn-reveal';
    revealBtn.id = 'myRevealBtn';
    revealBtn.textContent = 'Reveal My Role';
    revealBtn.onclick = () => revealMyRole();
    
    playerDiv.appendChild(playerLabel);
    playerDiv.appendChild(revealBtn);
    playersList.appendChild(playerDiv);
    return;
  }
  
  // Host (Player 1) view - show all players
  const playerAssignments = currentGame.playerAssignments || {};
  
  for (let i = 0; i < currentGame.numPlayers; i++) {
    const playerDiv = document.createElement('div');
    playerDiv.className = 'player-item';
    
    const playerLabel = document.createElement('span');
    const playerNum = i + 1;
    const isAssigned = playerAssignments[playerNum];
    
    // Mark Player 1 as "You (Host)"
    if (playerNum === 1 && isPlayer1) {
      playerLabel.textContent = 'Player 1 (You - Host)';
      playerLabel.style.color = 'var(--accent-primary)';
    } else {
      playerLabel.textContent = `Player ${playerNum}`;
      if (isAssigned) {
        playerLabel.textContent += ' ✓';
        playerLabel.style.color = 'var(--accent-insider)';
      }
    }
    playerLabel.className = 'player-label';
    
    const revealBtn = document.createElement('button');
    revealBtn.className = 'btn btn-reveal';
    revealBtn.dataset.playerIndex = i;
    
    if (revealedPlayerIndices.has(i)) {
      revealBtn.disabled = true;
      revealBtn.textContent = 'Revealed ✓';
      revealBtn.classList.add('revealed');
    } else {
      revealBtn.textContent = 'Reveal';
      revealBtn.onclick = () => revealPlayer(i);
    }
    
    playerDiv.appendChild(playerLabel);
    playerDiv.appendChild(revealBtn);
    playersList.appendChild(playerDiv);
  }
}

/**
 * Select player count
 */
function selectPlayerCount(count) {
  selectedPlayers = count;
  customInputActive = false;
  
  playerButtons.forEach(btn => {
    const btnCount = btn.dataset.players ? parseInt(btn.dataset.players, 10) : null;
    if (btnCount === count) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });
  
  if (count === null) {
    customInputActive = true;
    customPlayersInput.classList.remove('hidden');
    numPlayersInput.focus();
  } else {
    customPlayersInput.classList.add('hidden');
    numPlayersInput.value = '';
  }
  
  // Show/hide imposters group
  if (count && count >= 4) {
    impostersGroup.style.display = 'block';
    updateImposterButtons(count);
  } else {
    impostersGroup.style.display = 'none';
    selectedImposters = 1;
  }
}

/**
 * Select imposter count
 */
function selectImposterCount(count) {
  selectedImposters = count;
  
  imposterButtons.forEach(btn => {
    const btnCount = parseInt(btn.dataset.imposters, 10);
    if (btnCount === count) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });
}

/**
 * Update imposter buttons based on player count
 */
function updateImposterButtons(playerCount) {
  const maxImposters = Math.floor((playerCount - 1) / 2);
  
  imposterButtons.forEach(btn => {
    const imposterCount = parseInt(btn.dataset.imposters, 10);
    if (imposterCount <= maxImposters) {
      btn.style.display = 'flex';
    } else {
      btn.style.display = 'none';
    }
  });
  
  if (selectedImposters > maxImposters) {
    selectImposterCount(1);
  }
}

/**
 * Create a new game
 */
async function createGame() {
  const category = categoryInput.value.trim();
  
  let numPlayers;
  if (customInputActive) {
    numPlayers = parseInt(numPlayersInput.value, 10);
    if (isNaN(numPlayers) || numPlayers < 3 || numPlayers > 20) {
      showStatus('Please enter a valid number of players (3-20)', 'error');
      return;
    }
  } else {
    numPlayers = selectedPlayers;
  }
  
  if (!category) {
    showStatus('Please enter a category', 'error');
    return;
  }
  
  try {
    showStatus('Generating word...', 'loading');
    createGameBtn.disabled = true;
    
    const everyoneGetsWord = everyoneGetsWordToggle.checked;
    const imposterGetsHint = imposterGetsHintToggle.checked;
    const numImposters = numPlayers >= 4 ? selectedImposters : 1;
    
    const response = await fetch('/api/new-game', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        category, 
        numPlayers,
        numImposters,
        everyoneGetsWord,
        imposterGetsHint,
        difficulty: selectedDifficulty,
        usedWords: getUsedWords()
      })
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.error || 'Failed to create game');
    }
    
    currentGameCode = data.gameCode;
    myPlayerNumber = 1;
    isHost = true;
    
    currentGame = {
      category: data.category,
      numPlayers: data.numPlayers,
      revealedCount: 0,
      playerAssignments: { 1: { name: 'Host (Player 1)', joinedAt: new Date().toISOString() } }
    };
    
    localStorage.setItem('gameCode', currentGameCode);
    localStorage.setItem('playerNumber', '1');
    
    showStatus(`Game created! Code: ${currentGameCode}`, 'success');
    startPolling();
    showGameSection();
    
  } catch (error) {
    console.error('Create game error:', error);
    showStatus(error.message || 'Failed to create game', 'error');
  } finally {
    createGameBtn.disabled = false;
  }
}

/**
 * Join a game
 */
async function joinGame() {
  const code = gameCodeInput.value.trim().toUpperCase();
  
  if (code.length !== 6) {
    showStatus('Please enter a valid 6-character game code', 'error');
    return;
  }
  
  try {
    showStatus('Joining game...', 'loading');
    
    const response = await fetch(`/api/game/${code}`);
    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.error || 'Game not found');
    }
    
    currentGame = {
      category: data.category,
      numPlayers: data.numPlayers,
      playerAssignments: data.playerAssignments || {}
    };
    
    currentGameCode = code;
    isHost = false;
    
    showPlayerSelectionSection();
    
  } catch (error) {
    console.error('Join error:', error);
    showStatus(error.message || 'Failed to join game', 'error');
  }
}

/**
 * Show player selection section
 */
function showPlayerSelectionSection() {
  joinSection.classList.add('hidden');
  playerSelectionSection.classList.remove('hidden');
  
  playerSelectionInfo.textContent = `Category: ${currentGame.category} | Players: ${currentGame.numPlayers}`;
  
  playerSelectionButtons.innerHTML = '';
  for (let i = 1; i <= currentGame.numPlayers; i++) {
    const btn = document.createElement('button');
    btn.className = 'player-btn';
    btn.textContent = `Player ${i}`;
    btn.dataset.playerNumber = i;
    
    // Player 1 is always the host
    if (i === 1) {
      btn.disabled = true;
      btn.textContent = 'Player 1 (Host)';
      btn.classList.add('revealed');
    } else if (currentGame.playerAssignments && currentGame.playerAssignments[i]) {
      btn.disabled = true;
      btn.textContent += ' (Taken)';
      btn.classList.add('revealed');
    }
    
    btn.onclick = () => selectMyPlayerNumber(i);
    playerSelectionButtons.appendChild(btn);
  }
  
  confirmPlayerBtn.style.display = 'none';
}

/**
 * Select my player number
 */
function selectMyPlayerNumber(playerNumber) {
  playerSelectionButtons.querySelectorAll('.player-btn').forEach(btn => {
    const btnNum = parseInt(btn.dataset.playerNumber, 10);
    if (btnNum === playerNumber && !btn.disabled) {
      btn.classList.add('active');
      myPlayerNumber = playerNumber;
      confirmPlayerBtn.style.display = 'block';
    } else {
      btn.classList.remove('active');
    }
  });
}

/**
 * Confirm player join
 */
async function confirmPlayerJoin() {
  if (!myPlayerNumber || !currentGameCode) {
    showStatus('Please select a player number', 'error');
    return;
  }
  
  try {
    showStatus('Joining...', 'loading');
    
    const response = await fetch(`/api/game/${currentGameCode}/join`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playerNumber: myPlayerNumber })
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.error || 'Failed to join');
    }
    
    showStatus('Joined successfully!', 'success');
    isHost = false;
    // Store in localStorage for persistence
    if (currentGameCode) {
      localStorage.setItem('gameCode', currentGameCode);
      localStorage.setItem('playerNumber', myPlayerNumber.toString());
    }
    startPolling();
    showGameSection();
    
  } catch (error) {
    console.error('Confirm join error:', error);
    showStatus(error.message || 'Failed to join', 'error');
  }
}

/**
 * Reveal player role (host clicking for individual player)
 */
async function revealPlayer(playerIndex) {
  try {
    const response = await fetch('/api/reveal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        playerIndex,
        gameCode: currentGameCode
      })
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      showStatus(data.error || 'Failed to reveal', 'error');
      return;
    }
    
    showRevealModal(data);
    revealedPlayerIndices.add(playerIndex);
    
    const btn = playersList.querySelector(`[data-player-index="${playerIndex}"]`);
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Revealed ✓';
      btn.classList.add('revealed');
    }
    
  } catch (error) {
    console.error('Reveal error:', error);
    showStatus('Failed to reveal', 'error');
  }
}

/**
 * Reveal my role (joined player)
 */
async function revealMyRole() {
  if (!myPlayerNumber) {
    showStatus('Player number not set', 'error');
    return;
  }
  
  try {
    const response = await fetch('/api/reveal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        playerIndex: myPlayerNumber - 1,
        gameCode: currentGameCode
      })
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      showStatus(data.error || 'Failed to reveal', 'error');
      return;
    }
    
    showRevealModal(data);
    
    // Update the reveal button
    const btn = document.getElementById('myRevealBtn') || playersList.querySelector('.btn-reveal');
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Revealed';
      btn.classList.add('revealed');
    }
    
  } catch (error) {
    console.error('Reveal error:', error);
    showStatus('Failed to reveal', 'error');
  }
}

/**
 * Show reveal modal
 */
function showRevealModal(data) {
  if (countdownInterval) {
    clearInterval(countdownInterval);
    countdownInterval = null;
  }
  
  modalPlayerTitle.textContent = `Player ${data.playerIndex + 1}`;
  
  // Display role (only if not in everyoneGetsWord mode)
  if (data.role) {
    modalRole.textContent = data.role;
    modalRole.className = `role-display ${data.role.toLowerCase()}`;
    modalRole.style.display = 'block';
  } else {
    // In everyoneGetsWord mode, hide the role display
    modalRole.textContent = '';
    modalRole.className = 'role-display';
    modalRole.style.display = 'none';
  }
  
  // Display word
  if (data.word) {
    modalWord.innerHTML = `
      <div class="word-label">Your word is:</div>
      <div class="word-text">${escapeHtml(data.word)}</div>
    `;
    modalWord.className = 'word-display has-word';
  } else if (data.chaosMode) {
    modalWord.innerHTML = '<span class="no-word-text">🎭 No word - Chaos Mode! 🎭</span>';
    modalWord.className = 'word-display no-word';
  } else {
    // Impostor with no word (not in everyoneGetsWord mode)
    modalWord.innerHTML = '<span class="no-word-text">You do not get a word.<br>Try to blend in!</span>';
    modalWord.className = 'word-display no-word';
  }
  
  // Display hint (if provided)
  const existingHint = document.querySelector('.hint-display');
  if (existingHint) existingHint.remove();
  
  if (data.hint) {
    const hintDiv = document.createElement('div');
    hintDiv.className = 'hint-display';
    hintDiv.innerHTML = `
      <div class="hint-label">Hint:</div>
      <div class="hint-text">${escapeHtml(data.hint)}</div>
    `;
    modalWord.after(hintDiv);
  }
  
  if (data.word) addUsedWord(data.word);

  revealModal.classList.remove('hidden');
  revealModal.classList.add('show');
  
  // Auto-hide countdown
  let countdown = 10;
  modalCountdown.textContent = `Auto-hiding in ${countdown}s`;
  
  countdownInterval = setInterval(() => {
    countdown--;
    if (countdown > 0) {
      modalCountdown.textContent = `Auto-hiding in ${countdown}s`;
    } else {
      hideRevealModal();
    }
  }, 1000);
}

/**
 * Hide reveal modal
 */
function hideRevealModal() {
  if (countdownInterval) {
    clearInterval(countdownInterval);
    countdownInterval = null;
  }
  
  // Remove hint if it was added
  const existingHint = document.querySelector('.hint-display');
  if (existingHint) existingHint.remove();
  
  revealModal.classList.remove('show');
  revealModal.classList.add('hidden');
}

/**
 * Reset game
 */
async function resetGame() {
  if (!confirm('Are you sure you want to reset the game? This will end the current game for all players.')) {
    return;
  }
  
  stopPolling();
  
  // Save game code before clearing state
  const gameCodeToReset = currentGameCode;
  
  // Always clear local state first (so user can get unstuck even if server fails)
  localStorage.removeItem('gameCode');
  localStorage.removeItem('playerNumber');
  currentGameCode = null;
  myPlayerNumber = null;
  isHost = false;
  
  try {
    // Try to reset on server, but don't block if it fails
    await fetch('/api/reset', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gameCode: gameCodeToReset })
    });
    
    showStatus('Game reset successfully', 'success');
  } catch (error) {
    console.error('Reset error:', error);
    // Still show success since we cleared local state
    showStatus('Game reset (local state cleared)', 'success');
  }
  
  showSetupSection();
}

/**
 * Reveal all (host only)
 */
async function revealAll() {
  if (!currentGame) {
    showStatus('No active game', 'error');
    return;
  }

  if (!confirm('Reveal all roles and words? This will end the current game.')) {
    return;
  }
  
  try {
    showStatus('Revealing...', 'loading');
    
    const response = await fetch('/api/reveal-all', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gameCode: currentGameCode })
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.error || 'Failed to reveal all');
    }

    displayRevealAllModal(data);
    showStatus('All roles revealed!', 'success');
    
  } catch (error) {
    console.error('Reveal all error:', error);
    showStatus(error.message || 'Failed to reveal all', 'error');
  }
}

/**
 * Display reveal all modal
 */
function displayRevealAllModal(data) {
  const { results, chaosMode, category } = data;
  
  if (!revealAllContent) {
    console.error('revealAllContent element not found');
    return;
  }
  
  revealAllContent.innerHTML = '';
  
  // Show category at the top
  if (category) {
    const categoryDiv = document.createElement('div');
    categoryDiv.style.cssText = 'text-align: center; margin-bottom: 1rem; color: var(--text-secondary);';
    categoryDiv.innerHTML = `<strong>Category:</strong> ${escapeHtml(category)}`;
    revealAllContent.appendChild(categoryDiv);
  }
  
  if (chaosMode) {
    const chaosMsg = document.createElement('div');
    chaosMsg.className = 'reveal-all-item';
    chaosMsg.innerHTML = `
      <div style="text-align: center; padding: 1rem;">
        <h3 style="color: #ef4444; margin: 0;">🎭 CHAOS MODE! 🎭</h3>
        <p style="margin-top: 0.5rem;">Everyone was an impostor!</p>
      </div>
    `;
    revealAllContent.appendChild(chaosMsg);
  }
  
  if (results && results.length) {
    results.forEach(result => {
      if (result.word && result.word !== 'N/A' && !result.word.includes('Chaos Mode')) {
        addUsedWord(result.word);
      }
      const resultItem = document.createElement('div');
      resultItem.className = 'reveal-all-item';
      
      const roleClass = result.role === 'Impostor' ? 'impostor' : 'insider';
      
      resultItem.innerHTML = `
        <div class="reveal-all-item-header">
          <span class="reveal-all-player-name">Player ${result.playerNumber}</span>
          <span class="reveal-all-role ${roleClass}">${escapeHtml(result.role)}</span>
        </div>
        <div class="reveal-all-word">Word: ${escapeHtml(result.word) || 'N/A'}</div>
        ${result.hint ? `<div class="reveal-all-hint">Hint: ${escapeHtml(result.hint)}</div>` : ''}
      `;
      
      revealAllContent.appendChild(resultItem);
    });
  } else {
    const noResults = document.createElement('div');
    noResults.style.cssText = 'text-align: center; color: var(--text-secondary);';
    noResults.textContent = 'No player results available.';
    revealAllContent.appendChild(noResults);
  }
  
  // Only show "Start New Round" button for Player 1 (host)
  if (revealAllHostButtons) {
    if (myPlayerNumber === 1) {
      revealAllHostButtons.style.display = 'block';
    } else {
      revealAllHostButtons.style.display = 'none';
    }
  }
  
  if (revealAllModal) {
    revealAllModal.classList.remove('hidden');
    revealAllModal.classList.add('show');
    console.log('Reveal all modal displayed, myPlayerNumber:', myPlayerNumber);
  } else {
    console.error('revealAllModal element not found');
  }
}

/**
 * Close reveal all modal
 */
function closeRevealAllModal() {
  if (revealAllModal) {
    revealAllModal.classList.remove('show');
    revealAllModal.classList.add('hidden');
  }
}

/**
 * Show new round setup UI (for host/Player 1)
 */
function showNewRoundSetup() {
  if (!currentGameCode) {
    showStatus('No game code found', 'error');
    return;
  }
  
  closeRevealAllModal();
  
  // Hide other sections
  setupSection.classList.add('hidden');
  gameSection.classList.add('hidden');
  joinSection.classList.add('hidden');
  playerSelectionSection.classList.add('hidden');
  
  // Show new round section
  if (newRoundSection) {
    newRoundSection.classList.remove('hidden');
  }
  
  // Set the game code display
  if (newRoundCodeValue) {
    newRoundCodeValue.textContent = currentGameCode;
  }
  
  if (newRoundCategoryInput) {
    newRoundCategoryInput.value = '';
    newRoundCategoryInput.focus();
  }
  
  selectNewRoundDifficulty('medium');
  
  showStatus('Enter a category for the next round', 'info');
}

/**
 * Start new round with same code and new category
 */
async function startNewRound() {
  if (!currentGameCode) {
    showStatus('No game code found', 'error');
    return;
  }
  
  const category = newRoundCategoryInput ? newRoundCategoryInput.value.trim() : '';
  
  if (!category || category.length < 2) {
    showStatus('Please enter a valid category (at least 2 characters)', 'error');
    return;
  }

  try {
    showStatus('Creating new round...', 'loading');
    if (startNewRoundBtn) startNewRoundBtn.disabled = true;
    
    const response = await fetch('/api/new-game-same-code', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        gameCode: currentGameCode,
        category: category,
        difficulty: newRoundDifficulty,
        usedWords: getUsedWords()
      })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Failed to create new round');
    }

    currentGame = {
      category: data.category,
      numPlayers: data.numPlayers,
      revealedCount: 0,
      playerAssignments: { 1: { name: 'Host (Player 1)', joinedAt: new Date().toISOString() } }
    };

    myPlayerNumber = 1;
    isHost = true;
    revealedPlayerIndices = new Set();
    lastKnownAssignments = null;
    
    showStatus('New round started!', 'success');
    showGameSection();
    
  } catch (error) {
    console.error('New round error:', error);
    showStatus(error.message || 'Failed to create new round', 'error');
  } finally {
    if (startNewRoundBtn) startNewRoundBtn.disabled = false;
  }
}

/**
 * Difficulty descriptions for hint text
 */
const difficultyDescriptions = {
  easy: 'Well-known, mainstream items everyone would recognize',
  medium: 'A balanced mix of common and moderately known items',
  hard: 'Obscure, niche items only enthusiasts would know'
};

/**
 * Select difficulty level (setup screen)
 */
function selectDifficulty(level) {
  selectedDifficulty = level;
  difficultyButtons.forEach(btn => {
    if (btn.dataset.difficulty === level) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });
  if (difficultyHint) {
    difficultyHint.textContent = difficultyDescriptions[level] || difficultyDescriptions.medium;
  }
}

/**
 * Select difficulty level (new round screen)
 */
function selectNewRoundDifficulty(level) {
  newRoundDifficulty = level;
  newRoundDifficultyButtons.forEach(btn => {
    if (btn.dataset.difficulty === level) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });
  if (newRoundDifficultyHint) {
    newRoundDifficultyHint.textContent = difficultyDescriptions[level] || difficultyDescriptions.medium;
  }
}

/**
 * Toggle settings section
 */
function toggleSettings() {
  const isHidden = settingsContent.classList.contains('hidden');
  if (isHidden) {
    settingsContent.classList.remove('hidden');
    settingsToggle.classList.add('open');
  } else {
    settingsContent.classList.add('hidden');
    settingsToggle.classList.remove('open');
  }
}

/**
 * Handle everyone gets word toggle
 */
function handleEveryoneGetsWordToggle() {
  const isChecked = everyoneGetsWordToggle.checked;
  
  if (isChecked) {
    imposterGetsHintToggle.disabled = true;
    imposterGetsHintToggle.checked = false;
    const hintSettingItem = imposterGetsHintToggle.closest('.setting-item');
    if (hintSettingItem) {
      hintSettingItem.classList.add('disabled');
    }
  } else {
    imposterGetsHintToggle.disabled = false;
    const hintSettingItem = imposterGetsHintToggle.closest('.setting-item');
    if (hintSettingItem) {
      hintSettingItem.classList.remove('disabled');
    }
  }
}

/**
 * Start polling for game updates (all players with game code)
 */
function startPolling() {
  if (pollingInterval) {
    clearInterval(pollingInterval);
  }
  
  let lastAllRevealed = false;
  
  pollingInterval = setInterval(async () => {
    if (!currentGameCode) return;
    
    try {
      const response = await fetch(`/api/status?gameCode=${currentGameCode}`);
      const status = await response.json();
      
      if (!status.active) {
        stopPolling();
        showStatus('Game has ended', 'info');
        return;
      }
      
      const isPlayer1 = myPlayerNumber === 1;
      
      // Check if game revealed all (for non-host players)
      if (status.allRevealed && !lastAllRevealed && !isPlayer1) {
        lastAllRevealed = true;
        // Fetch and show results for players
        const revealResponse = await fetch('/api/reveal-all', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ gameCode: currentGameCode })
        });
        
        if (revealResponse.ok) {
          const revealData = await revealResponse.json();
          displayRevealAllModal(revealData);
          showStatus('Host revealed all roles!', 'info');
        }
        return;
      }
      
      if (isPlayer1 && status.playerAssignments) {
        const newAssignmentsJson = JSON.stringify(status.playerAssignments);
        if (newAssignmentsJson !== lastKnownAssignments) {
          lastKnownAssignments = newAssignmentsJson;
          currentGame.playerAssignments = status.playerAssignments;
          renderPlayersList();
        }
      }
      
      // Check for new game (category changed) - for all players
      if (currentGame && status.category !== currentGame.category) {
        currentGame.category = status.category;
        currentGame.numPlayers = status.numPlayers;
        gameCategoryDisplay.textContent = status.category;
        gamePlayersDisplay.textContent = status.numPlayers;
        
        lastAllRevealed = false;
        revealedPlayerIndices = new Set();
        lastKnownAssignments = null;
        closeRevealAllModal();
        
        // Reset the reveal button for non-host players
        if (!isPlayer1) {
          const btn = playersList.querySelector('#myRevealBtn');
          if (btn) {
            btn.disabled = false;
            btn.textContent = 'Reveal My Role';
            btn.classList.remove('revealed');
          }
        }
        
        showStatus('New round started!', 'success');
        showGameSection();
      }
      
    } catch (error) {
      console.error('Polling error:', error);
    }
  }, 2000);
}

/**
 * Stop polling
 */
function stopPolling() {
  if (pollingInterval) {
    clearInterval(pollingInterval);
    pollingInterval = null;
  }
}

// Event Listeners
createGameBtn.addEventListener('click', createGame);
if (resetBtn) resetBtn.addEventListener('click', resetGame);
if (revealAllBtn) revealAllBtn.addEventListener('click', revealAll);
if (startNewGameFromModalBtn) startNewGameFromModalBtn.addEventListener('click', showNewRoundSetup);
if (closeRevealAllModalBtn) closeRevealAllModalBtn.addEventListener('click', closeRevealAllModal);
if (switchToJoinBtn) switchToJoinBtn.addEventListener('click', showJoinSection);
if (backToSetupBtn) backToSetupBtn.addEventListener('click', showCreateSection);
if (joinGameBtn) joinGameBtn.addEventListener('click', joinGame);
if (confirmPlayerBtn) confirmPlayerBtn.addEventListener('click', confirmPlayerJoin);
if (hideModalBtn) hideModalBtn.addEventListener('click', hideRevealModal);
if (settingsToggle) settingsToggle.addEventListener('click', toggleSettings);
if (everyoneGetsWordToggle) everyoneGetsWordToggle.addEventListener('change', handleEveryoneGetsWordToggle);
if (startNewRoundBtn) startNewRoundBtn.addEventListener('click', startNewRound);

// Allow Enter key in new round category input
if (newRoundCategoryInput) {
  newRoundCategoryInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') startNewRound();
  });
}

// Difficulty selection buttons
difficultyButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    selectDifficulty(btn.dataset.difficulty);
  });
});

newRoundDifficultyButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    selectNewRoundDifficulty(btn.dataset.difficulty);
  });
});

// Player selection buttons
playerButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    const count = btn.dataset.players ? parseInt(btn.dataset.players, 10) : null;
    selectPlayerCount(count);
  });
});

// Imposter selection buttons
imposterButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    const count = parseInt(btn.dataset.imposters, 10);
    selectImposterCount(count);
  });
});

// Input handlers
if (numPlayersInput) {
  numPlayersInput.addEventListener('input', (e) => {
    const value = parseInt(e.target.value, 10);
    if (value >= 4) {
      impostersGroup.style.display = 'block';
      updateImposterButtons(value);
    } else {
      impostersGroup.style.display = 'none';
      selectedImposters = 1;
    }
  });
  
  numPlayersInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') createGame();
  });
}

if (categoryInput) {
  categoryInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') createGame();
  });
}

if (gameCodeInput) {
  gameCodeInput.addEventListener('input', (e) => {
    e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
  });
  
  gameCodeInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') joinGame();
  });
}

if (revealModal) {
  revealModal.addEventListener('click', (e) => {
    if (e.target === revealModal) hideRevealModal();
  });
}

if (revealAllModal) {
  revealAllModal.addEventListener('click', (e) => {
    if (e.target === revealAllModal) closeRevealAllModal();
  });
}

// Initialize
init();

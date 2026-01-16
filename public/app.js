/**
 * Impostor Game - Frontend Logic
 */

// DOM Elements
const setupSection = document.getElementById('setupSection');
const gameSection = document.getElementById('gameSection');
const statusLine = document.getElementById('statusLine');
const categoryInput = document.getElementById('categoryInput');
const numPlayersInput = document.getElementById('numPlayersInput');
const createGameBtn = document.getElementById('createGameBtn');
const resetBtn = document.getElementById('resetBtn');
const gameCategoryDisplay = document.getElementById('gameCategoryDisplay');
const gamePlayersDisplay = document.getElementById('gamePlayersDisplay');
const playersList = document.getElementById('playersList');
const revealModal = document.getElementById('revealModal');
const modalPlayerTitle = document.getElementById('modalPlayerTitle');
const modalRole = document.getElementById('modalRole');
const modalWord = document.getElementById('modalWord');
const modalCountdown = document.getElementById('modalCountdown');
const hideModalBtn = document.getElementById('hideModalBtn');

// App State
let appConfig = null;
let currentGame = null;
let hideTimer = null;
let countdownInterval = null;

/**
 * Initialize app
 */
async function init() {
  try {
    // Fetch app configuration
    const response = await fetch('/api/config');
    appConfig = await response.json();
    
    // Set input constraints
    numPlayersInput.min = appConfig.minPlayers;
    numPlayersInput.max = appConfig.maxPlayers;
    numPlayersInput.value = appConfig.defaultPlayers;
    
    // Update hint text
    const hint = document.querySelector('#numPlayersInput + .hint');
    hint.textContent = `${appConfig.minPlayers}-${appConfig.maxPlayers} players`;
    
    // Check if there's an active game
    await checkGameStatus();
    
  } catch (error) {
    showStatus('Failed to initialize app', 'error');
    console.error('Init error:', error);
  }
}

/**
 * Check if there's an active game on server
 */
async function checkGameStatus() {
  try {
    const response = await fetch('/api/status');
    const status = await response.json();
    
    if (status.active) {
      currentGame = {
        category: status.category,
        numPlayers: status.numPlayers,
        revealedCount: status.revealedCount
      };
      showGameSection();
    } else {
      showSetupSection();
    }
  } catch (error) {
    console.error('Status check error:', error);
  }
}

/**
 * Show status message
 */
function showStatus(message, type = 'info') {
  statusLine.textContent = message;
  statusLine.className = `status-line ${type}`;
  statusLine.classList.remove('hidden');
  
  if (type !== 'loading') {
    setTimeout(() => {
      statusLine.classList.add('hidden');
    }, 5000);
  }
}

/**
 * Show setup section
 */
function showSetupSection() {
  setupSection.classList.remove('hidden');
  gameSection.classList.add('hidden');
  currentGame = null;
}

/**
 * Show game section
 */
function showGameSection() {
  setupSection.classList.add('hidden');
  gameSection.classList.remove('hidden');
  
  gameCategoryDisplay.textContent = currentGame.category;
  gamePlayersDisplay.textContent = currentGame.numPlayers;
  
  renderPlayersList();
}

/**
 * Render players list
 */
function renderPlayersList() {
  playersList.innerHTML = '';
  
  for (let i = 0; i < currentGame.numPlayers; i++) {
    const playerDiv = document.createElement('div');
    playerDiv.className = 'player-item';
    
    const playerLabel = document.createElement('span');
    playerLabel.textContent = `Player ${i + 1}`;
    playerLabel.className = 'player-label';
    
    const revealBtn = document.createElement('button');
    revealBtn.className = 'btn btn-reveal';
    revealBtn.dataset.playerIndex = i;
    revealBtn.textContent = 'Reveal';
    revealBtn.onclick = () => revealPlayer(i);
    
    playerDiv.appendChild(playerLabel);
    playerDiv.appendChild(revealBtn);
    playersList.appendChild(playerDiv);
  }
}

/**
 * Create new game
 */
async function createGame() {
  const category = categoryInput.value.trim();
  const numPlayers = parseInt(numPlayersInput.value, 10);
  
  if (!category) {
    showStatus('Please enter a category', 'error');
    return;
  }
  
  if (!numPlayers || numPlayers < appConfig.minPlayers || numPlayers > appConfig.maxPlayers) {
    showStatus(`Players must be between ${appConfig.minPlayers} and ${appConfig.maxPlayers}`, 'error');
    return;
  }
  
  try {
    showStatus('Generating word...', 'loading');
    createGameBtn.disabled = true;
    
    const response = await fetch('/api/new-game', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ category, numPlayers })
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.error || 'Failed to create game');
    }
    
    currentGame = {
      category: data.category,
      numPlayers: data.numPlayers,
      revealedCount: 0
    };
    
    showStatus('Game created successfully!', 'success');
    showGameSection();
    
    // Clear inputs
    categoryInput.value = '';
    
  } catch (error) {
    showStatus(error.message, 'error');
    console.error('Create game error:', error);
  } finally {
    createGameBtn.disabled = false;
  }
}

/**
 * Reveal a player's role
 */
async function revealPlayer(playerIndex) {
  try {
    const response = await fetch('/api/reveal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playerIndex })
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      showStatus(data.error || 'Failed to reveal player', 'error');
      return;
    }
    
    // Show modal with reveal
    showRevealModal(data);
    
    // Mark button as revealed
    const btn = document.querySelector(`[data-player-index="${playerIndex}"]`);
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Revealed';
      btn.classList.add('revealed');
    }
    
  } catch (error) {
    showStatus('Failed to reveal player', 'error');
    console.error('Reveal error:', error);
  }
}

/**
 * Show reveal modal with player info
 */
function showRevealModal(data) {
  const { role, word, category, playerIndex } = data;
  
  // Set content
  modalPlayerTitle.textContent = `Player ${playerIndex + 1}`;
  
  if (role === 'IMPOSTOR') {
    modalRole.textContent = '🎭 IMPOSTOR';
    modalRole.className = 'role-display impostor';
    modalWord.textContent = 'You do not know the word.';
    modalWord.className = 'word-display no-word';
  } else {
    modalRole.textContent = '🕵️ INSIDER';
    modalRole.className = 'role-display insider';
    modalWord.innerHTML = `<div class="word-label">The word is:</div><div class="word-text">${word}</div>`;
    modalWord.className = 'word-display has-word';
  }
  
  // Show modal
  revealModal.classList.remove('hidden');
  setTimeout(() => {
    revealModal.classList.add('show');
  }, 10);
  
  // Start countdown
  startHideCountdown();
}

/**
 * Start countdown to auto-hide
 */
function startHideCountdown() {
  let seconds = appConfig.revealAutoHideSeconds;
  
  modalCountdown.textContent = `Hiding in ${seconds} seconds...`;
  
  countdownInterval = setInterval(() => {
    seconds--;
    if (seconds > 0) {
      modalCountdown.textContent = `Hiding in ${seconds} seconds...`;
    } else {
      hideRevealModal();
    }
  }, 1000);
  
  hideTimer = setTimeout(() => {
    hideRevealModal();
  }, appConfig.revealAutoHideSeconds * 1000);
}

/**
 * Hide reveal modal
 */
function hideRevealModal() {
  // Clear timers
  if (hideTimer) {
    clearTimeout(hideTimer);
    hideTimer = null;
  }
  if (countdownInterval) {
    clearInterval(countdownInterval);
    countdownInterval = null;
  }
  
  // Hide modal
  revealModal.classList.remove('show');
  setTimeout(() => {
    revealModal.classList.add('hidden');
    // Clear content
    modalRole.textContent = '';
    modalWord.textContent = '';
    modalCountdown.textContent = '';
  }, 300);
}

/**
 * Reset game
 */
async function resetGame() {
  if (!confirm('Are you sure you want to reset the game?')) {
    return;
  }
  
  try {
    const response = await fetch('/api/reset', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.error || 'Failed to reset game');
    }
    
    showStatus('Game reset successfully', 'success');
    showSetupSection();
    
  } catch (error) {
    showStatus('Failed to reset game', 'error');
    console.error('Reset error:', error);
  }
}

// Event Listeners
createGameBtn.addEventListener('click', createGame);
resetBtn.addEventListener('click', resetGame);
hideModalBtn.addEventListener('click', hideRevealModal);

// Allow Enter key to create game
categoryInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    createGame();
  }
});

numPlayersInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    createGame();
  }
});

// Close modal on background click
revealModal.addEventListener('click', (e) => {
  if (e.target === revealModal) {
    hideRevealModal();
  }
});

// Initialize on load
init();


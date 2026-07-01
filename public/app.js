/**
 * Impostor Game — Frontend
 *
 * Token-based authorization: each game has a hostToken (held by the
 * creator) and per-player playerTokens (issued on /join). The same token
 * authorizes re-revealing your own role — missing the 10s auto-hide is
 * not fatal.
 */

// ============================================================
// DOM — grouped by screen / region
// ============================================================

const $ = id => document.getElementById(id);

const dom = {
  status: $('statusLine'),
  offlineBanner: $('offlineBanner'),

  setup: {
    section: $('setupSection'),
    category: $('categoryInput'),
    numPlayers: $('numPlayersInput'),
    stepperBtns: document.querySelectorAll('.stepper-btn'),
    impostersGroup: $('impostersGroup'),
    imposterBtns: document.querySelectorAll('.imposter-btn'),
    difficultyBtns: document.querySelectorAll('.difficulty-btn:not(.new-round-difficulty-btn)'),
    difficultyHint: $('difficultyHint'),
    settingsToggle: $('settingsToggle'),
    settingsContent: $('settingsContent'),
    everyoneGetsWordToggle: $('everyoneGetsWordToggle'),
    imposterGetsHintToggle: $('imposterGetsHintToggle'),
    chaosModeToggle: $('chaosModeToggle'),
    createBtn: $('createGameBtn'),
    switchToJoinBtn: $('switchToJoinBtn'),
  },

  join: {
    section: $('joinSection'),
    code: $('gameCodeInput'),
    joinBtn: $('joinGameBtn'),
    backToSetupBtn: $('backToSetupBtn'),
  },

  pickSlot: {
    section: $('playerSelectionSection'),
    info: $('playerSelectionInfo'),
    buttons: $('playerSelectionButtons'),
    confirmBtn: $('confirmPlayerBtn'),
  },

  game: {
    section: $('gameSection'),
    category: $('gameCategoryDisplay'),
    players: $('gamePlayersDisplay'),
    round: $('gameRoundDisplay'),
    code: $('gameCodeDisplay'),
    codeValue: $('gameCodeValue'),
    shareLink: $('gameShareLink'),
    copyShareLinkBtn: $('copyShareLinkBtn'),
    list: $('playersList'),
    revealAllBtn: $('revealAllBtn'),
    resetBtn: $('resetBtn'),
  },

  newRound: {
    section: $('newRoundSection'),
    codeValue: $('newRoundCodeValue'),
    categoryInput: $('newRoundCategoryInput'),
    sameCategoryBtn: $('sameCategoryBtn'),
    sameCategoryName: $('sameCategoryName'),
    startBtn: $('startNewRoundBtn'),
    difficultyBtns: document.querySelectorAll('.new-round-difficulty-btn'),
    difficultyHint: $('newRoundDifficultyHint'),
  },

  revealModal: {
    root: $('revealModal'),
    flipCard: $('flipCard'),
    title: $('modalPlayerTitle'),
    role: $('modalRole'),
    word: $('modalWord'),
    cornerTL: $('cardCornerTL'),
    cornerBR: $('cardCornerBR'),
    countdown: $('modalCountdown'),
    hideBtn: $('hideModalBtn'),
  },

  revealAllModal: {
    root: $('revealAllModal'),
    content: $('revealAllContent'),
    hostButtons: $('revealAllHostButtons'),
    startNewBtn: $('startNewGameFromModalBtn'),
    closeBtn: $('closeRevealAllModalBtn'),
  },
};

// ============================================================
// Storage
// ============================================================

const USED_WORDS_KEY = 'imposter_used_words';
const SESSION_KEY = 'imposter_session';
const PREFS_KEY = 'imposter_prefs'; // user preferences persisted across games

function safeJSON(s, fallback) { try { return s ? JSON.parse(s) : fallback; } catch { return fallback; } }

function getUsedWords() {
  return safeJSON(localStorage.getItem(USED_WORDS_KEY), []);
}
function addUsedWord(word) {
  if (!word || typeof word !== 'string') return;
  try {
    const words = getUsedWords();
    const n = word.toLowerCase().trim();
    if (words.some(w => w.toLowerCase().trim() === n)) return;
    words.push(word.trim());
    if (words.length > 500) words.splice(0, words.length - 500);
    localStorage.setItem(USED_WORDS_KEY, JSON.stringify(words));
  } catch {}
}

function saveSession(s) { try { localStorage.setItem(SESSION_KEY, JSON.stringify(s)); } catch {} }
function loadSession() { return safeJSON(localStorage.getItem(SESSION_KEY), null); }
function clearSession() { try { localStorage.removeItem(SESSION_KEY); } catch {} }

function loadPrefs() {
  return safeJSON(localStorage.getItem(PREFS_KEY), {
    numPlayers: 3,
    numImposters: 1,
    difficulty: 'medium',
    chaosModeEnabled: false,
    everyoneGetsWord: false,
    imposterGetsHint: false,
    lastCategory: '',
  });
}
function savePrefs(p) {
  try { localStorage.setItem(PREFS_KEY, JSON.stringify(p)); } catch {}
}
function updatePref(patch) {
  const p = { ...loadPrefs(), ...patch };
  savePrefs(p);
}

// ============================================================
// State
// ============================================================

let appConfig = null;
let currentGame = null;
let countdownInterval = null;
let selectedPlayers = 3;
let selectedImposters = 1;
let selectedDifficulty = 'medium';
let newRoundDifficulty = 'medium';

let currentGameCode = null;
let myPlayerNumber = null;
let myToken = null;
let isHost = false;
let currentRoundId = null;

let pollingInterval = null;
let revealedPlayerIndices = new Set();
let lastKnownAssignments = null;
let lastAllRevealed = false;

// ============================================================
// Utilities
// ============================================================

function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function showStatus(message, type = 'info') {
  if (!dom.status) return;
  dom.status.textContent = message;
  dom.status.className = `status-line ${type}`;
  dom.status.classList.remove('hidden');
}

function getShareUrl(code) {
  const base = window.location.origin + window.location.pathname;
  return `${base}?code=${encodeURIComponent(code)}`;
}

// ============================================================
// Section visibility
// ============================================================

const allSections = [
  dom.setup.section, dom.game.section, dom.join.section,
  dom.pickSlot.section, dom.newRound.section,
];

function hideAllSections() { allSections.forEach(s => s && s.classList.add('hidden')); }

function showSetupSection() {
  hideAllSections();
  dom.setup.section.classList.remove('hidden');
  currentGame = null;
  currentGameCode = null;
  myPlayerNumber = null;
  myToken = null;
  isHost = false;
  currentRoundId = null;
  revealedPlayerIndices = new Set();
  lastKnownAssignments = null;
  lastAllRevealed = false;
  stopPolling();
  clearSession();
  applyPrefsToSetupUI();
}

function showJoinSection(prefillCode = '') {
  hideAllSections();
  dom.join.section.classList.remove('hidden');
  if (dom.join.code) {
    dom.join.code.value = (prefillCode || '').toUpperCase();
    dom.join.code.focus();
  }
}

function showCreateSection() {
  hideAllSections();
  dom.setup.section.classList.remove('hidden');
}

function showGameSection() {
  hideAllSections();
  dom.game.section.classList.remove('hidden');
  if (currentGame) {
    dom.game.category.textContent = currentGame.category;
    dom.game.players.textContent = currentGame.numPlayers;
    if (dom.game.round) dom.game.round.textContent = `Round ${currentRoundId || 1}`;
  }
  if (currentGameCode && dom.game.code && dom.game.codeValue) {
    dom.game.codeValue.textContent = currentGameCode;
    dom.game.code.classList.remove('hidden');
    if (dom.game.shareLink) dom.game.shareLink.value = getShareUrl(currentGameCode);
  }
  if (dom.game.revealAllBtn) dom.game.revealAllBtn.style.display = isHost ? 'block' : 'none';
  if (dom.game.resetBtn) dom.game.resetBtn.style.display = isHost ? 'block' : 'none';
  renderPlayersList();
}

// ============================================================
// Players list — split into host vs joined-player views
// ============================================================

function renderPlayersList() {
  if (!dom.game.list || !currentGame) return;
  dom.game.list.innerHTML = '';
  dom.game.list.classList.remove('solo');
  if (!isHost && myPlayerNumber) renderJoinedPlayerView();
  else renderHostPlayersList();
}

function makeMiniCard(playerNum, { host = false, joined = false, revealed = false } = {}) {
  const card = document.createElement('button');
  card.type = 'button';
  card.className = 'mini-card';
  card.dataset.playerIndex = playerNum - 1;
  card.setAttribute('aria-label',
    `Player ${playerNum}${host ? ' (host)' : ''}${revealed ? ' — already flipped' : ''}`);
  if (host)     card.classList.add('is-host');
  if (joined)   card.classList.add('joined');
  if (revealed) card.classList.add('revealed');
  card.innerHTML = `
    <span class="mini-card__corner mini-card__corner--tl">${playerNum}</span>
    <span class="mini-card__number">${playerNum}</span>
    <span class="mini-card__suit">♣ ♥ ♠ ♦</span>
    <span class="mini-card__corner mini-card__corner--br">${playerNum}</span>
  `;
  card.onclick = () => revealPlayer(playerNum - 1);
  return card;
}

function renderJoinedPlayerView() {
  dom.game.list.classList.add('solo');
  const card = makeMiniCard(myPlayerNumber, {
    revealed: revealedPlayerIndices.has(myPlayerNumber - 1),
  });
  card.id = 'myRevealBtn';
  dom.game.list.appendChild(card);
}

function renderHostPlayersList() {
  const assignments = currentGame.playerAssignments || {};
  for (let i = 0; i < currentGame.numPlayers; i++) {
    const playerNum = i + 1;
    const card = makeMiniCard(playerNum, {
      host:     playerNum === 1 && isHost,
      joined:   !!assignments[playerNum] && !(playerNum === 1 && isHost),
      revealed: revealedPlayerIndices.has(i),
    });
    dom.game.list.appendChild(card);
  }
}

// ============================================================
// Stepper — number-of-players picker
// ============================================================

function setNumPlayers(n) {
  const min = Number(dom.setup.numPlayers.min) || (appConfig?.minPlayers || 3);
  const max = Number(dom.setup.numPlayers.max) || (appConfig?.maxPlayers || 15);
  const clamped = Math.max(min, Math.min(max, n));
  dom.setup.numPlayers.value = String(clamped);
  selectedPlayers = clamped;
  updatePref({ numPlayers: clamped });

  // Update -/+ buttons disabled state
  dom.setup.stepperBtns.forEach(btn => {
    const step = parseInt(btn.dataset.step, 10);
    const next = clamped + step;
    btn.disabled = next < min || next > max;
  });

  // Show/hide impostor group based on count
  if (clamped >= 4) {
    dom.setup.impostersGroup.classList.remove('hidden');
    updateImposterButtons(clamped);
  } else {
    dom.setup.impostersGroup.classList.add('hidden');
    selectedImposters = 1;
    updatePref({ numImposters: 1 });
  }
}

function selectImposterCount(count) {
  selectedImposters = count;
  dom.setup.imposterBtns.forEach(btn => {
    const c = parseInt(btn.dataset.imposters, 10);
    btn.classList.toggle('active', c === count);
  });
  updatePref({ numImposters: count });
}

function updateImposterButtons(playerCount) {
  const max = Math.max(1, Math.floor((playerCount - 1) / 2));
  dom.setup.imposterBtns.forEach(btn => {
    const c = parseInt(btn.dataset.imposters, 10);
    btn.style.display = c <= max ? 'flex' : 'none';
  });
  if (selectedImposters > max) selectImposterCount(1);
  else selectImposterCount(selectedImposters);
}

// ============================================================
// Difficulty (data-hint driven; no const map in JS)
// ============================================================

function getDifficultyHint(btnList, level) {
  for (const btn of btnList) {
    if (btn.dataset.difficulty === level && btn.dataset.hint) return btn.dataset.hint;
  }
  return '';
}

function selectDifficulty(level) {
  selectedDifficulty = level;
  dom.setup.difficultyBtns.forEach(btn => btn.classList.toggle('active', btn.dataset.difficulty === level));
  if (dom.setup.difficultyHint) {
    dom.setup.difficultyHint.textContent = getDifficultyHint(dom.setup.difficultyBtns, level);
  }
  updatePref({ difficulty: level });
}
function selectNewRoundDifficulty(level) {
  newRoundDifficulty = level;
  dom.newRound.difficultyBtns.forEach(btn => btn.classList.toggle('active', btn.dataset.difficulty === level));
  if (dom.newRound.difficultyHint) {
    dom.newRound.difficultyHint.textContent = getDifficultyHint(dom.newRound.difficultyBtns, level);
  }
}

// ============================================================
// Apply persisted prefs to UI
// ============================================================

function applyPrefsToSetupUI() {
  const p = loadPrefs();
  if (dom.setup.category && p.lastCategory) dom.setup.category.value = p.lastCategory;
  setNumPlayers(p.numPlayers || 3);
  selectImposterCount(p.numImposters || 1);
  selectDifficulty(p.difficulty || 'medium');
  if (dom.setup.everyoneGetsWordToggle) dom.setup.everyoneGetsWordToggle.checked = !!p.everyoneGetsWord;
  if (dom.setup.imposterGetsHintToggle) dom.setup.imposterGetsHintToggle.checked = !!p.imposterGetsHint;
  if (dom.setup.chaosModeToggle) dom.setup.chaosModeToggle.checked = !!p.chaosModeEnabled;
  handleEveryoneGetsWordToggle();
}

// ============================================================
// Settings handlers
// ============================================================

function toggleSettings() {
  const hidden = dom.setup.settingsContent.classList.contains('hidden');
  dom.setup.settingsContent.classList.toggle('hidden', !hidden);
  dom.setup.settingsToggle.classList.toggle('open', hidden);
}

function handleEveryoneGetsWordToggle() {
  const checked = dom.setup.everyoneGetsWordToggle.checked;
  dom.setup.imposterGetsHintToggle.disabled = checked;
  if (checked) dom.setup.imposterGetsHintToggle.checked = false;
  const item = dom.setup.imposterGetsHintToggle.closest('.setting-item');
  if (item) item.classList.toggle('disabled', checked);
  updatePref({
    everyoneGetsWord: checked,
    imposterGetsHint: !!dom.setup.imposterGetsHintToggle.checked,
  });
}

// ============================================================
// Game creation / joining
// ============================================================

async function createGame() {
  const category = (dom.setup.category.value || '').trim();
  const numPlayers = parseInt(dom.setup.numPlayers.value, 10);
  if (!category) { showStatus('Please enter a category', 'error'); return; }
  if (isNaN(numPlayers) || numPlayers < (appConfig?.minPlayers || 3) || numPlayers > (appConfig?.maxPlayers || 15)) {
    showStatus(`Please pick a valid number of players (${appConfig?.minPlayers || 3}-${appConfig?.maxPlayers || 15})`, 'error');
    return;
  }

  updatePref({ lastCategory: category });

  try {
    showStatus('Generating word...', 'loading');
    dom.setup.createBtn.disabled = true;
    const body = {
      category,
      numPlayers,
      numImposters: numPlayers >= 4 ? selectedImposters : 1,
      everyoneGetsWord: !!dom.setup.everyoneGetsWordToggle.checked,
      imposterGetsHint: !!dom.setup.imposterGetsHintToggle.checked,
      chaosModeEnabled: !!(dom.setup.chaosModeToggle && dom.setup.chaosModeToggle.checked),
      difficulty: selectedDifficulty,
      usedWords: getUsedWords(),
    };
    const r = await fetch('/api/new-game', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || 'Failed to create game');

    currentGameCode = data.gameCode;
    myPlayerNumber = 1;
    myToken = data.hostToken;
    isHost = true;
    currentRoundId = data.roundId;
    currentGame = {
      category: data.category,
      numPlayers: data.numPlayers,
      numImposters: data.numImposters,
      playerAssignments: { 1: { name: 'Host (Player 1)', joinedAt: new Date().toISOString() } },
    };
    saveSession({ gameCode: currentGameCode, playerNumber: 1, token: myToken, isHost: true, roundId: currentRoundId });

    showStatus(`Game created! Code: ${currentGameCode}`, 'success');
    startPolling();
    showGameSection();
  } catch (e) {
    console.error('Create error:', e);
    showStatus(e.message || 'Failed to create game', 'error');
  } finally {
    dom.setup.createBtn.disabled = false;
  }
}

async function joinGame() {
  const code = (dom.join.code.value || '').trim().toUpperCase();
  if (code.length !== 6) {
    showStatus('Please enter a valid 6-character game code', 'error');
    return;
  }
  try {
    showStatus('Looking up game...', 'loading');
    // Consolidated lookup via /api/status (no /api/game/:code anymore).
    const r = await fetch(`/api/status?gameCode=${encodeURIComponent(code)}`);
    const data = await r.json();
    if (!r.ok || !data.active) throw new Error('Game not found');

    currentGameCode = code;
    isHost = false;
    currentGame = {
      category: data.category,
      numPlayers: data.numPlayers,
      playerAssignments: data.playerAssignments || {},
    };
    currentRoundId = data.roundId || 1;
    showPlayerSelectionSection();
  } catch (e) {
    console.error('Join lookup error:', e);
    showStatus(e.message || 'Failed to join game', 'error');
  }
}

function showPlayerSelectionSection() {
  hideAllSections();
  dom.pickSlot.section.classList.remove('hidden');
  dom.pickSlot.info.textContent = `Category: ${currentGame.category} | Players: ${currentGame.numPlayers}`;
  dom.pickSlot.buttons.innerHTML = '';
  for (let i = 1; i <= currentGame.numPlayers; i++) {
    const btn = document.createElement('button');
    btn.className = 'player-btn';
    btn.textContent = `Player ${i}`;
    btn.dataset.playerNumber = i;
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
    dom.pickSlot.buttons.appendChild(btn);
  }
  dom.pickSlot.confirmBtn.classList.add('hidden');
}

function selectMyPlayerNumber(playerNumber) {
  dom.pickSlot.buttons.querySelectorAll('.player-btn').forEach(btn => {
    const n = parseInt(btn.dataset.playerNumber, 10);
    if (n === playerNumber && !btn.disabled) {
      btn.classList.add('active');
      myPlayerNumber = playerNumber;
      dom.pickSlot.confirmBtn.classList.remove('hidden');
    } else {
      btn.classList.remove('active');
    }
  });
}

async function confirmPlayerJoin() {
  if (!myPlayerNumber || !currentGameCode) {
    showStatus('Please select a player number', 'error');
    return;
  }
  try {
    showStatus('Joining...', 'loading');
    const r = await fetch(`/api/game/${encodeURIComponent(currentGameCode)}/join`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playerNumber: myPlayerNumber }),
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || 'Failed to join');

    myToken = data.playerToken;
    currentRoundId = data.roundId || currentRoundId || 1;
    isHost = false;
    saveSession({ gameCode: currentGameCode, playerNumber: myPlayerNumber, token: myToken, isHost: false, roundId: currentRoundId });

    showStatus('Joined successfully!', 'success');
    startPolling();
    showGameSection();
  } catch (e) {
    console.error('Join confirm error:', e);
    showStatus(e.message || 'Failed to join', 'error');
  }
}

// ============================================================
// Reveal
// ============================================================

async function revealPlayer(playerIndex) {
  try {
    const r = await fetch('/api/reveal', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playerIndex, gameCode: currentGameCode, token: myToken }),
    });
    const data = await r.json();
    if (!r.ok) {
      if (r.status === 403 || r.status === 404) {
        showStatus(data.error || 'Session expired — please rejoin', 'error');
        clearSession();
        showSetupSection();
        return;
      }
      showStatus(data.error || 'Failed to reveal', 'error');
      return;
    }
    showRevealModal(data);
    revealedPlayerIndices.add(playerIndex);
    renderPlayersList();
  } catch (e) {
    console.error('Reveal error:', e);
    showStatus('Failed to reveal', 'error');
  }
}

function setSuit(node, role) {
  // ♥ = impostor (red), ♠ = insider (black), blank = hidden role
  if (!node) return;
  if (role === 'IMPOSTOR' || role === 'Impostor') {
    node.innerHTML = '<span class="suit">♥</span>';
    node.className = node.className.replace(/\s*(impostor|insider)/g, '') + ' impostor';
  } else if (role === 'INSIDER' || role === 'Insider') {
    node.innerHTML = '<span class="suit">♠</span>';
    node.className = node.className.replace(/\s*(impostor|insider)/g, '') + ' insider';
  } else {
    node.innerHTML = '';
    node.className = node.className.replace(/\s*(impostor|insider)/g, '');
  }
}

function showRevealModal(data) {
  if (countdownInterval) {
    clearInterval(countdownInterval);
    countdownInterval = null;
  }

  // Always reset the card to "face-down" before showing — even if this is a
  // re-reveal in the same session. The two-rAF dance below guarantees the
  // browser commits the back-facing state before we trigger the flip.
  if (dom.revealModal.flipCard) {
    dom.revealModal.flipCard.setAttribute('data-revealed', 'false');
  }

  dom.revealModal.title.textContent = `Player ${data.playerIndex + 1}`;

  // Suit corners + role label
  setSuit(dom.revealModal.cornerTL, data.role);
  setSuit(dom.revealModal.cornerBR, data.role);
  if (data.role) {
    dom.revealModal.role.textContent = data.role;
    dom.revealModal.role.className = `role-display ${data.role.toLowerCase()}`;
    dom.revealModal.role.style.display = 'block';
  } else {
    dom.revealModal.role.textContent = '';
    dom.revealModal.role.className = 'role-display';
    dom.revealModal.role.style.display = 'none';
  }

  if (data.word) {
    dom.revealModal.word.innerHTML = `
      <div class="word-label">Your word</div>
      <div class="word-text">${escapeHtml(data.word)}</div>
    `;
    dom.revealModal.word.className = 'word-display has-word';
  } else {
    dom.revealModal.word.innerHTML =
      '<span class="no-word-text">You do not get a word.<br>Try to blend in.</span>';
    dom.revealModal.word.className = 'word-display no-word';
  }

  const existingHint = document.querySelector('.hint-display');
  if (existingHint) existingHint.remove();
  if (data.hint) {
    const hintDiv = document.createElement('div');
    hintDiv.className = 'hint-display';
    hintDiv.innerHTML = `
      <div class="hint-label">Hint</div>
      <div class="hint-text">${escapeHtml(data.hint)}</div>
    `;
    dom.revealModal.word.after(hintDiv);
  }

  if (data.word) addUsedWord(data.word);

  dom.revealModal.root.classList.remove('hidden');
  dom.revealModal.root.classList.add('show');

  // Two requestAnimationFrames — guarantees the "back-facing" state is
  // committed before we flip, so the transition fires reliably even on
  // a re-tap that immediately re-opens the modal.
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      setTimeout(() => {
        if (dom.revealModal.flipCard) {
          dom.revealModal.flipCard.setAttribute('data-revealed', 'true');
        }
      }, 600);
    });
  });

  // Countdown to auto-hide — generous enough that the 900ms flip completes first
  let countdown = appConfig?.revealAutoHideSeconds || 10;
  dom.revealModal.countdown.textContent = `${countdown}s`;
  countdownInterval = setInterval(() => {
    countdown--;
    if (countdown > 0) dom.revealModal.countdown.textContent = `${countdown}s`;
    else hideRevealModal();
  }, 1000);
}

function hideRevealModal() {
  if (countdownInterval) {
    clearInterval(countdownInterval);
    countdownInterval = null;
  }
  const existingHint = document.querySelector('.hint-display');
  if (existingHint) existingHint.remove();
  // Reset the flip state so the next reveal starts face-down.
  if (dom.revealModal.flipCard) {
    dom.revealModal.flipCard.setAttribute('data-revealed', 'false');
  }
  dom.revealModal.root.classList.remove('show');
  dom.revealModal.root.classList.add('hidden');
}

// ============================================================
// Reset / Reveal-all
// ============================================================

async function resetGame() {
  if (!confirm('Reset the game? This ends the round for everyone.')) return;
  stopPolling();
  const gc = currentGameCode;
  const tok = myToken;
  clearSession();
  currentGameCode = null;
  myPlayerNumber = null;
  myToken = null;
  isHost = false;
  try {
    await fetch('/api/reset', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gameCode: gc, token: tok }),
    });
    showStatus('Game reset', 'success');
  } catch (e) {
    console.error('Reset error:', e);
    showStatus('Game reset (local only)', 'success');
  }
  showSetupSection();
}

async function revealAll() {
  if (!currentGame) { showStatus('No active game', 'error'); return; }
  if (!confirm('Reveal all roles? This ends the current round.')) return;
  try {
    showStatus('Revealing...', 'loading');
    const r = await fetch('/api/reveal-all', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gameCode: currentGameCode, token: myToken }),
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || 'Failed');
    displayRevealAllModal(data);
    showStatus('All roles revealed', 'success');
  } catch (e) {
    console.error('Reveal-all error:', e);
    showStatus(e.message || 'Failed to reveal all', 'error');
  }
}

function displayRevealAllModal(data) {
  const { results, chaosMode, category } = data;
  if (!dom.revealAllModal.content) return;
  dom.revealAllModal.content.innerHTML = '';

  if (category) {
    const div = document.createElement('div');
    div.className = 'reveal-all-category';
    div.innerHTML = `<strong>Category:</strong> ${escapeHtml(category)}`;
    dom.revealAllModal.content.appendChild(div);
  }

  if (chaosMode) {
    const m = document.createElement('div');
    m.className = 'reveal-all-item reveal-all-chaos';
    m.innerHTML = `
      <h3>🎭 CHAOS MODE! 🎭</h3>
      <p>Everyone was an impostor!</p>`;
    dom.revealAllModal.content.appendChild(m);
  }

  if (results && results.length) {
    results.forEach(result => {
      if (result.word && result.word !== 'N/A' && !String(result.word).includes('Chaos Mode')) {
        addUsedWord(result.word);
      }
      const item = document.createElement('div');
      item.className = 'reveal-all-item';
      const roleClass = result.role === 'Impostor' ? 'impostor' : 'insider';
      item.innerHTML = `
        <div class="reveal-all-item-header">
          <span class="reveal-all-player-name">Player ${result.playerNumber}</span>
          <span class="reveal-all-role ${roleClass}">${escapeHtml(result.role)}</span>
        </div>
        <div class="reveal-all-word">Word: ${escapeHtml(result.word) || 'N/A'}</div>
        ${result.hint ? `<div class="reveal-all-hint">Hint: ${escapeHtml(result.hint)}</div>` : ''}
      `;
      dom.revealAllModal.content.appendChild(item);
    });
  }

  if (dom.revealAllModal.hostButtons) {
    dom.revealAllModal.hostButtons.style.display = isHost ? 'block' : 'none';
  }
  dom.revealAllModal.root.classList.remove('hidden');
  dom.revealAllModal.root.classList.add('show');

  // 🎉 Celebrate the deal — single 1-shot burst from the center.
  fireConfetti();
}

function fireConfetti() {
  if (typeof window.confetti !== 'function') return;
  // Honor reduced-motion users.
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const colors = ['#c8a04a', '#d9b76b', '#f4ecdc', '#a03030', '#0c3023'];
  // Fire from two slightly offset origins for a wider fan.
  setTimeout(() => {
    window.confetti({
      particleCount: 80, spread: 70, origin: { x: 0.3, y: 0.4 },
      colors, scalar: 0.9, ticks: 200, gravity: 1,
    });
    window.confetti({
      particleCount: 80, spread: 70, origin: { x: 0.7, y: 0.4 },
      colors, scalar: 0.9, ticks: 200, gravity: 1,
    });
  }, 250);
}

function closeRevealAllModal() {
  dom.revealAllModal.root.classList.remove('show');
  dom.revealAllModal.root.classList.add('hidden');
  // Clear any in-flight confetti so it doesn't bleed into the next screen.
  if (window.confetti && typeof window.confetti.reset === 'function') {
    try { window.confetti.reset(); } catch {}
  }
}

// ============================================================
// New round (host)
// ============================================================

function showNewRoundSetup() {
  if (!currentGameCode) { showStatus('No game code', 'error'); return; }
  closeRevealAllModal();
  hideAllSections();
  dom.newRound.section.classList.remove('hidden');
  if (dom.newRound.codeValue) dom.newRound.codeValue.textContent = currentGameCode;
  if (dom.newRound.sameCategoryName && currentGame) dom.newRound.sameCategoryName.textContent = currentGame.category;
  if (dom.newRound.categoryInput) dom.newRound.categoryInput.value = '';
  selectNewRoundDifficulty('medium');
  showStatus('Pick same category or enter a new one', 'info');
}

function startNewRoundSameCategory() {
  if (!currentGame || !currentGame.category) {
    showStatus('No category found', 'error');
    return;
  }
  startNewRound(currentGame.category);
}

async function startNewRound(overrideCategory) {
  if (!currentGameCode) { showStatus('No game code', 'error'); return; }
  const category = overrideCategory || (dom.newRound.categoryInput ? dom.newRound.categoryInput.value.trim() : '');
  if (!category || category.length < 2) {
    showStatus('Please enter a valid category (at least 2 characters)', 'error');
    return;
  }
  try {
    showStatus('Creating new round...', 'loading');
    if (dom.newRound.startBtn) dom.newRound.startBtn.disabled = true;
    if (dom.newRound.sameCategoryBtn) dom.newRound.sameCategoryBtn.disabled = true;

    const r = await fetch('/api/new-game-same-code', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        gameCode: currentGameCode,
        token: myToken,
        category,
        difficulty: newRoundDifficulty,
        usedWords: getUsedWords(),
      }),
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || 'Failed');

    currentGame.category = data.category;
    currentGame.numPlayers = data.numPlayers;
    currentRoundId = data.roundId;
    revealedPlayerIndices = new Set();
    lastKnownAssignments = null;
    lastAllRevealed = false;
    saveSession({ gameCode: currentGameCode, playerNumber: 1, token: myToken, isHost: true, roundId: currentRoundId });

    showStatus(`New round ${currentRoundId} started!`, 'success');
    showGameSection();
  } catch (e) {
    console.error('New round error:', e);
    showStatus(e.message || 'Failed to create new round', 'error');
  } finally {
    if (dom.newRound.startBtn) dom.newRound.startBtn.disabled = false;
    if (dom.newRound.sameCategoryBtn) dom.newRound.sameCategoryBtn.disabled = false;
  }
}

// ============================================================
// Polling
// ============================================================

function startPolling() {
  if (pollingInterval) clearInterval(pollingInterval);
  pollingInterval = setInterval(pollOnce, 2000);
  pollOnce();
}

async function pollOnce() {
  if (!currentGameCode) return;
  try {
    const r = await fetch(`/api/status?gameCode=${encodeURIComponent(currentGameCode)}`);
    const status = await r.json();
    if (!status.active) {
      stopPolling();
      showStatus('Game has ended', 'info');
      clearSession();
      showSetupSection();
      return;
    }

    // New-round detection via roundId (works even when category is unchanged)
    if (currentRoundId !== null && status.roundId !== currentRoundId) {
      currentRoundId = status.roundId;
      currentGame.category = status.category;
      currentGame.numPlayers = status.numPlayers;
      if (dom.game.category) dom.game.category.textContent = status.category;
      if (dom.game.players) dom.game.players.textContent = status.numPlayers;
      if (dom.game.round) dom.game.round.textContent = `Round ${currentRoundId}`;
      revealedPlayerIndices = new Set();
      lastAllRevealed = false;
      closeRevealAllModal();
      hideRevealModal();
      saveSession({ gameCode: currentGameCode, playerNumber: myPlayerNumber, token: myToken, isHost, roundId: currentRoundId });
      showStatus(`New round ${currentRoundId} started!`, 'success');
      showGameSection();
      return;
    }
    if (currentRoundId === null) currentRoundId = status.roundId;

    if (isHost && status.playerAssignments) {
      const json = JSON.stringify(status.playerAssignments);
      if (json !== lastKnownAssignments) {
        lastKnownAssignments = json;
        currentGame.playerAssignments = status.playerAssignments;
        renderPlayersList();
      }
    }

    if (Array.isArray(status.revealedFlags)) {
      let changed = false;
      for (let i = 0; i < status.revealedFlags.length; i++) {
        if (status.revealedFlags[i] && !revealedPlayerIndices.has(i)) {
          revealedPlayerIndices.add(i);
          changed = true;
        }
      }
      if (changed && isHost) renderPlayersList();
    }

    if (status.allRevealed && !lastAllRevealed && !isHost) {
      lastAllRevealed = true;
      const r2 = await fetch('/api/reveal-all', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameCode: currentGameCode, token: myToken }),
      });
      if (r2.ok) {
        const data = await r2.json();
        displayRevealAllModal(data);
      }
    }
  } catch (e) {
    console.error('Polling error:', e);
  }
}

function stopPolling() {
  if (pollingInterval) {
    clearInterval(pollingInterval);
    pollingInterval = null;
  }
}

// ============================================================
// Init
// ============================================================

async function init() {
  try {
    const r = await fetch('/api/config');
    appConfig = await r.json();
    if (appConfig?.offlineMode && dom.offlineBanner) dom.offlineBanner.classList.remove('hidden');

    const urlParams = new URLSearchParams(window.location.search);
    const urlGameCode = (urlParams.get('code') || '').toUpperCase();
    const session = loadSession();

    if (urlGameCode) {
      // URL has a code. Resume only if session matches.
      if (session && session.gameCode === urlGameCode && session.token) {
        if (await tryResume(session)) return;
      }
      // Else show JOIN with the code pre-filled (do NOT default to host).
      const status = await checkActive(urlGameCode);
      if (status && status.active) {
        showJoinSection(urlGameCode);
        joinGame();
        return;
      }
      clearSession();
      showSetupSection();
      showStatus('That game code is not active', 'info');
      return;
    }

    if (session && session.gameCode && session.token) {
      if (await tryResume(session)) return;
    }

    showSetupSection();
  } catch (e) {
    console.error('Init error:', e);
    showStatus('Failed to initialize app', 'error');
    showSetupSection();
  }
}

async function checkActive(code) {
  try {
    const r = await fetch(`/api/status?gameCode=${encodeURIComponent(code)}`);
    return await r.json();
  } catch { return null; }
}

async function tryResume(session) {
  const status = await checkActive(session.gameCode);
  if (!status || !status.active) {
    clearSession();
    return false;
  }
  currentGameCode = session.gameCode;
  myPlayerNumber = session.playerNumber;
  myToken = session.token;
  isHost = !!session.isHost;
  currentRoundId = status.roundId;
  currentGame = {
    category: status.category,
    numPlayers: status.numPlayers,
    playerAssignments: status.playerAssignments || {},
  };
  showGameSection();
  startPolling();
  return true;
}

// ============================================================
// Event wiring
// ============================================================

dom.setup.createBtn.addEventListener('click', createGame);
if (dom.game.resetBtn) dom.game.resetBtn.addEventListener('click', resetGame);
if (dom.game.revealAllBtn) dom.game.revealAllBtn.addEventListener('click', revealAll);
if (dom.revealAllModal.startNewBtn) dom.revealAllModal.startNewBtn.addEventListener('click', showNewRoundSetup);
if (dom.revealAllModal.closeBtn) dom.revealAllModal.closeBtn.addEventListener('click', closeRevealAllModal);
if (dom.setup.switchToJoinBtn) dom.setup.switchToJoinBtn.addEventListener('click', () => showJoinSection());
if (dom.join.backToSetupBtn) dom.join.backToSetupBtn.addEventListener('click', showCreateSection);
if (dom.join.joinBtn) dom.join.joinBtn.addEventListener('click', joinGame);
if (dom.pickSlot.confirmBtn) dom.pickSlot.confirmBtn.addEventListener('click', confirmPlayerJoin);
if (dom.revealModal.hideBtn) dom.revealModal.hideBtn.addEventListener('click', hideRevealModal);
if (dom.setup.settingsToggle) dom.setup.settingsToggle.addEventListener('click', toggleSettings);
if (dom.setup.everyoneGetsWordToggle) dom.setup.everyoneGetsWordToggle.addEventListener('change', handleEveryoneGetsWordToggle);
if (dom.setup.imposterGetsHintToggle) dom.setup.imposterGetsHintToggle.addEventListener('change', () => {
  updatePref({ imposterGetsHint: !!dom.setup.imposterGetsHintToggle.checked });
});
if (dom.setup.chaosModeToggle) dom.setup.chaosModeToggle.addEventListener('change', () => {
  updatePref({ chaosModeEnabled: !!dom.setup.chaosModeToggle.checked });
});
if (dom.newRound.sameCategoryBtn) dom.newRound.sameCategoryBtn.addEventListener('click', startNewRoundSameCategory);
if (dom.newRound.startBtn) dom.newRound.startBtn.addEventListener('click', () => startNewRound());

if (dom.game.copyShareLinkBtn) {
  dom.game.copyShareLinkBtn.addEventListener('click', async () => {
    if (!dom.game.shareLink) return;
    try {
      await navigator.clipboard.writeText(dom.game.shareLink.value);
      showStatus('Share link copied!', 'success');
    } catch {
      dom.game.shareLink.select();
      document.execCommand('copy');
      showStatus('Share link copied!', 'success');
    }
  });
}

if (dom.newRound.categoryInput) {
  dom.newRound.categoryInput.addEventListener('keypress', e => { if (e.key === 'Enter') startNewRound(); });
}

// Stepper wiring
dom.setup.stepperBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    const step = parseInt(btn.dataset.step, 10);
    const current = parseInt(dom.setup.numPlayers.value, 10) || 3;
    setNumPlayers(current + step);
  });
});

dom.setup.difficultyBtns.forEach(btn =>
  btn.addEventListener('click', () => selectDifficulty(btn.dataset.difficulty))
);
dom.newRound.difficultyBtns.forEach(btn =>
  btn.addEventListener('click', () => selectNewRoundDifficulty(btn.dataset.difficulty))
);

dom.setup.imposterBtns.forEach(btn =>
  btn.addEventListener('click', () => selectImposterCount(parseInt(btn.dataset.imposters, 10)))
);

if (dom.setup.category) {
  dom.setup.category.addEventListener('keypress', e => { if (e.key === 'Enter') createGame(); });
  dom.setup.category.addEventListener('change', () => updatePref({ lastCategory: dom.setup.category.value }));
}

if (dom.join.code) {
  dom.join.code.addEventListener('input', e => {
    e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
  });
  dom.join.code.addEventListener('keypress', e => { if (e.key === 'Enter') joinGame(); });
}

if (dom.revealModal.root) dom.revealModal.root.addEventListener('click', e => {
  if (e.target === dom.revealModal.root) hideRevealModal();
});
if (dom.revealAllModal.root) dom.revealAllModal.root.addEventListener('click', e => {
  if (e.target === dom.revealAllModal.root) closeRevealAllModal();
});

// Boot
init();

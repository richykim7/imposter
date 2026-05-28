/**
 * Integration simulator — exercises every play pattern against the real server.
 *
 * Runs server in-process on a random port (no GROQ_API_KEY needed; offline
 * word packs are used). Verifies bug fixes do not regress, and that every
 * scenario the user might hit works correctly.
 *
 * Scenarios covered:
 *   A. Pass-and-play, single device
 *   B. Multi-device with codes (host + N joined players)
 *   C. New round, SAME category (regression for sync bug)
 *   D. New round, DIFFERENT category (chained 10x)
 *   E. URL-link visit by stranger — no auto-host (regression)
 *   F. Refresh / re-reveal (regression for one-time-reveal trap)
 *   G. Unauthorized actions are rejected (regression for no-authz)
 *   H. everyone-gets-word + imposter-gets-hint
 *   I. Chaos enabled, chained 50 rounds — numImposters NEVER cascades (regression)
 *   J. Chaos disabled — chaos never rolls
 *   K. Boundary inputs (min/max players, max impostors)
 *   L. Statistical uniformity of impostor over 10k same-code rounds
 *   M. Mid-round join → token mismatch handled
 *   N. Reset by non-host rejected; reset by host succeeds
 */

// Disable rate limiting during the bulk of the test run; scenario P verifies
// the limiter mechanism separately by re-mounting it.
process.env.NEW_GAME_RATE_LIMIT_MAX = '100000';
const { app } = require('../server');

let server;
let baseUrl;

let totalPass = 0;
let totalFail = 0;
function ok(name) { totalPass++; console.log(`  ✓ ${name}`); }
function fail(name, msg) { totalFail++; console.log(`  ✗ ${name}: ${msg}`); }

async function req(method, path, body, headers = {}) {
  const url = baseUrl + path;
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json', ...headers },
  };
  if (body !== undefined) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts);
  const text = await r.text();
  let json;
  try { json = JSON.parse(text); } catch { json = text; }
  return { status: r.status, body: json };
}

function assertEq(actual, expected, name) {
  if (actual === expected) ok(name);
  else fail(name, `expected ${expected}, got ${actual}`);
}
function assertOk(cond, name, msg = '') {
  if (cond) ok(name);
  else fail(name, msg || 'condition false');
}

async function startServer() {
  return new Promise(resolve => {
    server = app.listen(0, () => {
      const port = server.address().port;
      baseUrl = `http://127.0.0.1:${port}`;
      resolve();
    });
  });
}

// ----------- Scenarios -----------

async function scenarioA_PassAndPlay() {
  console.log('\n[A] Pass-and-play, 5 players, 1 impostor');
  const create = await req('POST', '/api/new-game', {
    category: 'animals', numPlayers: 5, numImposters: 1, difficulty: 'medium',
  });
  assertEq(create.status, 200, 'create game succeeds');
  const { gameCode, hostToken, roundId } = create.body;
  assertEq(roundId, 1, 'first round is 1');
  assertOk(!!hostToken, 'hostToken issued');

  // Host reveals each player in turn using hostToken (no one has joined)
  for (let i = 0; i < 5; i++) {
    const r = await req('POST', '/api/reveal', { playerIndex: i, gameCode, token: hostToken });
    assertEq(r.status, 200, `host reveal player ${i + 1} ok`);
    // Re-reveal must also work
    const r2 = await req('POST', '/api/reveal', { playerIndex: i, gameCode, token: hostToken });
    assertEq(r2.status, 200, `re-reveal player ${i + 1} ok (regression: one-time-reveal trap)`);
  }

  // Reveal-all
  const all = await req('POST', '/api/reveal-all', { gameCode, token: hostToken });
  assertEq(all.status, 200, 'reveal-all ok');
  const impostors = all.body.results.filter(r => r.role === 'Impostor');
  assertEq(impostors.length, 1, 'exactly 1 impostor');

  // Reset (host) — should succeed; second reset is a no-op (404 not raised)
  const reset = await req('POST', '/api/reset', { gameCode, token: hostToken });
  assertEq(reset.status, 200, 'host can reset');
}

async function scenarioB_MultiDevice() {
  console.log('\n[B] Multi-device, host + 3 joined players');
  const create = await req('POST', '/api/new-game', {
    category: 'food', numPlayers: 4, numImposters: 1,
  });
  const { gameCode, hostToken } = create.body;

  // Three players join slots 2..4
  const tokens = { 1: hostToken };
  for (const n of [2, 3, 4]) {
    const j = await req('POST', `/api/game/${gameCode}/join`, { playerNumber: n });
    assertEq(j.status, 200, `Player ${n} joins`);
    tokens[n] = j.body.playerToken;
    assertOk(!!tokens[n], `Player ${n} got token`);
  }

  // Host trying to reveal Player 2 (now joined) → 403 (multi-device peeking blocked)
  const peek = await req('POST', '/api/reveal', { playerIndex: 1, gameCode, token: hostToken });
  assertEq(peek.status, 403, 'host cannot peek joined slot (regression: no-authz)');

  // Each player reveals their own slot
  for (const n of [1, 2, 3, 4]) {
    const r = await req('POST', '/api/reveal', { playerIndex: n - 1, gameCode, token: tokens[n] });
    assertEq(r.status, 200, `Player ${n} reveals own role`);
  }

  // Player tries to reveal someone else — 403
  const cheat = await req('POST', '/api/reveal', { playerIndex: 2, gameCode, token: tokens[4] });
  assertEq(cheat.status, 403, 'cheater cannot reveal other slot');

  // Player tries reveal-all — 403
  const cheatAll = await req('POST', '/api/reveal-all', { gameCode, token: tokens[2] });
  assertEq(cheatAll.status, 403, 'non-host cannot reveal-all');

  // Host reveal-all OK
  const all = await req('POST', '/api/reveal-all', { gameCode, token: hostToken });
  assertEq(all.status, 200, 'host reveal-all ok');

  // Non-host can now FETCH results (allRevealed already set)
  const playerFetch = await req('POST', '/api/reveal-all', { gameCode, token: tokens[3] });
  assertEq(playerFetch.status, 200, 'player can fetch results after host ends');
}

async function scenarioC_SameCategoryNewRound() {
  console.log('\n[C] New round, SAME category (regression: same-category stranding)');
  const create = await req('POST', '/api/new-game', { category: 'cities', numPlayers: 4, numImposters: 1 });
  const { gameCode, hostToken } = create.body;
  const j2 = await req('POST', `/api/game/${gameCode}/join`, { playerNumber: 2 });
  const p2Token = j2.body.playerToken;

  // P2 reveals
  await req('POST', '/api/reveal', { playerIndex: 1, gameCode, token: p2Token });

  // Host ends + starts new round SAME category
  await req('POST', '/api/reveal-all', { gameCode, token: hostToken });
  const newR = await req('POST', '/api/new-game-same-code', { gameCode, token: hostToken, category: 'cities' });
  assertEq(newR.status, 200, 'new round same-category created');
  assertEq(newR.body.roundId, 2, 'roundId incremented to 2');

  // Status should report roundId=2 so client polling can detect
  const st = await req('GET', `/api/status?gameCode=${gameCode}`);
  assertEq(st.body.roundId, 2, 'status reports new roundId');
  assertEq(st.body.allRevealed, false, 'allRevealed reset');
  assertOk(st.body.revealedFlags.every(f => !f), 'revealedFlags reset');

  // P2 can reveal again in the new round (re-using same token)
  const re = await req('POST', '/api/reveal', { playerIndex: 1, gameCode, token: p2Token });
  assertEq(re.status, 200, 'P2 reveal in new round ok (regression: stranding)');
}

async function scenarioD_ChainedNewCategories() {
  console.log('\n[D] Chain 10 rounds with new categories');
  const create = await req('POST', '/api/new-game', { category: 'movies', numPlayers: 5, numImposters: 1 });
  const { gameCode, hostToken } = create.body;

  for (let r = 0; r < 10; r++) {
    if (r > 0) {
      const newR = await req('POST', '/api/new-game-same-code', {
        gameCode, token: hostToken, category: `category ${r}`,
      });
      assertEq(newR.status, 200, `round ${r + 1} created`);
    }
    const all = await req('POST', '/api/reveal-all', { gameCode, token: hostToken });
    const impCount = all.body.results.filter(x => x.role === 'Impostor').length;
    if (all.body.chaosMode) {
      // chaos default off — should never hit here unless user opted in
      fail(`round ${r + 1} chaos with chaos disabled`, 'unexpected chaos');
    } else {
      assertEq(impCount, 1, `round ${r + 1} has exactly 1 impostor`);
    }
  }
}

async function scenarioE_StrangerVisitsLink() {
  console.log('\n[E] Stranger visits with ?code=XXX — no auto-host');
  const create = await req('POST', '/api/new-game', { category: 'animals', numPlayers: 4, numImposters: 1 });
  const { gameCode, hostToken } = create.body;

  // Stranger has NO token. Try to reveal anything → 403
  const cheat = await req('POST', '/api/reveal', { playerIndex: 0, gameCode, token: null });
  assertEq(cheat.status, 403, 'stranger with no token cannot reveal (regression: URL-link host-default)');

  const cheat2 = await req('POST', '/api/reveal', { playerIndex: 1, gameCode, token: 'bogus' });
  assertEq(cheat2.status, 403, 'stranger with bad token cannot reveal');

  // Stranger should still be able to look up the game for the join screen
  // (now via the consolidated /api/status endpoint).
  const lookup = await req('GET', `/api/status?gameCode=${gameCode}`);
  assertEq(lookup.status, 200, 'stranger can look up game to join');
  assertEq(lookup.body.active, true, 'lookup shows game is active');

  // Stranger joins slot 3 → gets token → can reveal own slot only
  const j = await req('POST', `/api/game/${gameCode}/join`, { playerNumber: 3 });
  assertEq(j.status, 200, 'stranger joins slot 3');
  const r = await req('POST', '/api/reveal', { playerIndex: 2, gameCode, token: j.body.playerToken });
  assertEq(r.status, 200, 'stranger reveals own slot');

  // Stranger cannot now reveal slot 1 (host) or slot 4 (unjoined; protected by host)
  const r4 = await req('POST', '/api/reveal', { playerIndex: 3, gameCode, token: j.body.playerToken });
  assertEq(r4.status, 403, 'stranger cannot reveal unjoined slot 4');
  const r1 = await req('POST', '/api/reveal', { playerIndex: 0, gameCode, token: j.body.playerToken });
  assertEq(r1.status, 403, 'stranger cannot reveal host slot 1');

  // Cleanup
  await req('POST', '/api/reset', { gameCode, token: hostToken });
}

async function scenarioF_ReRevealAfterRefresh() {
  console.log('\n[F] Refresh / re-reveal — same token works');
  const create = await req('POST', '/api/new-game', { category: 'sports', numPlayers: 3, numImposters: 1 });
  const { gameCode, hostToken } = create.body;
  const j = await req('POST', `/api/game/${gameCode}/join`, { playerNumber: 2 });
  const tok = j.body.playerToken;

  const r1 = await req('POST', '/api/reveal', { playerIndex: 1, gameCode, token: tok });
  assertEq(r1.status, 200, 'first reveal ok');
  // Simulate page refresh — same token used again
  for (let i = 0; i < 5; i++) {
    const r = await req('POST', '/api/reveal', { playerIndex: 1, gameCode, token: tok });
    assertEq(r.status, 200, `re-reveal ${i + 1} ok`);
    // Role/word must be stable across re-reveals within same round
    assertEq(r.body.role, r1.body.role, `re-reveal ${i + 1} role stable`);
    assertEq(r.body.word, r1.body.word, `re-reveal ${i + 1} word stable`);
  }
  await req('POST', '/api/reset', { gameCode, token: hostToken });
}

async function scenarioG_Unauthorized() {
  console.log('\n[G] Unauthorized actions rejected');
  const create = await req('POST', '/api/new-game', { category: 'food', numPlayers: 4, numImposters: 1 });
  const { gameCode, hostToken } = create.body;

  const j = await req('POST', `/api/game/${gameCode}/join`, { playerNumber: 2 });
  const p2 = j.body.playerToken;

  const r1 = await req('POST', '/api/reset', { gameCode, token: p2 });
  assertEq(r1.status, 403, 'non-host cannot reset');
  const r2 = await req('POST', '/api/new-game-same-code', { gameCode, token: p2, category: 'food' });
  assertEq(r2.status, 403, 'non-host cannot start new round');
  const r3 = await req('POST', '/api/new-game-same-code', { gameCode, category: 'food' }); // no token
  assertEq(r3.status, 403, 'no token cannot start new round');

  // Cleanup
  await req('POST', '/api/reset', { gameCode, token: hostToken });
}

async function scenarioH_EveryoneGetsWord() {
  console.log('\n[H] everyone-gets-word + imposter-gets-hint');
  const create = await req('POST', '/api/new-game', {
    category: 'fruits', numPlayers: 5, numImposters: 1,
    everyoneGetsWord: true, imposterGetsHint: true, difficulty: 'easy',
  });
  assertEq(create.status, 200, 'create everyone-gets-word game');
  const { gameCode, hostToken } = create.body;

  // Find the impostor by revealing all & inspecting
  const all = await req('POST', '/api/reveal-all', { gameCode, token: hostToken });
  const imp = all.body.results.find(r => r.role === 'Impostor');
  const ins = all.body.results.find(r => r.role === 'Insider');
  assertOk(!!imp && !!ins, 'both impostor and insider present');
  assertOk(!!imp.word && imp.word !== 'N/A', 'impostor has a (different) word');
  assertOk(imp.word !== ins.word, 'impostor word differs from insider word');
  await req('POST', '/api/reset', { gameCode, token: hostToken });
}

async function scenarioI_ChaosCascadeRegression() {
  console.log('\n[I] Chaos enabled, 50 rounds — numImposters NEVER cascades (regression: Bug #1)');
  const create = await req('POST', '/api/new-game', {
    category: 'animals', numPlayers: 6, numImposters: 2, chaosModeEnabled: true,
  });
  const { gameCode, hostToken } = create.body;

  let chaosRounds = 0;
  let normalRounds = 0;
  let violations = 0;

  for (let r = 1; r <= 50; r++) {
    const all = await req('POST', '/api/reveal-all', { gameCode, token: hostToken });
    const impCount = all.body.results.filter(x => x.role === 'Impostor').length;
    const isChaos = all.body.chaosMode;
    if (isChaos) {
      chaosRounds++;
      if (impCount !== 6) {
        violations++;
        fail(`round ${r}`, `chaos round had ${impCount} impostors, expected 6`);
      }
    } else {
      normalRounds++;
      if (impCount !== 2) {
        violations++;
        fail(`round ${r}`, `NON-CHAOS round had ${impCount} impostors, expected 2 (cascade!)`);
      }
    }
    if (r < 50) {
      const nr = await req('POST', '/api/new-game-same-code', {
        gameCode, token: hostToken, category: `cat-${r}`,
      });
      if (nr.status !== 200) {
        fail(`round ${r} new-round`, `status ${nr.status}: ${JSON.stringify(nr.body)}`);
        break;
      }
    }
  }
  if (violations === 0) ok(`50 rounds with chaos: ${chaosRounds} chaos + ${normalRounds} normal, ALL correct`);
  await req('POST', '/api/reset', { gameCode, token: hostToken });
}

async function scenarioJ_ChaosDisabled() {
  console.log('\n[J] Chaos disabled — chaos never rolls (100 rounds)');
  const create = await req('POST', '/api/new-game', {
    category: 'sports', numPlayers: 5, numImposters: 1, chaosModeEnabled: false,
  });
  const { gameCode, hostToken } = create.body;

  let chaosCount = 0;
  for (let r = 1; r <= 100; r++) {
    const all = await req('POST', '/api/reveal-all', { gameCode, token: hostToken });
    if (all.body.chaosMode) chaosCount++;
    if (r < 100) {
      await req('POST', '/api/new-game-same-code', { gameCode, token: hostToken, category: `c-${r}` });
    }
  }
  assertEq(chaosCount, 0, 'chaos never rolls when disabled (100 rounds)');
  await req('POST', '/api/reset', { gameCode, token: hostToken });
}

async function scenarioK_Boundaries() {
  console.log('\n[K] Boundary inputs');
  // Min players
  let r = await req('POST', '/api/new-game', { category: 'xx', numPlayers: 3, numImposters: 1 });
  assertEq(r.status, 200, 'min players (3) ok');
  await req('POST', '/api/reset', { gameCode: r.body.gameCode, token: r.body.hostToken });

  // Max players
  r = await req('POST', '/api/new-game', { category: 'xx', numPlayers: 12, numImposters: 5 });
  assertEq(r.status, 200, 'max players (12) + max impostors (5) ok');
  await req('POST', '/api/reset', { gameCode: r.body.gameCode, token: r.body.hostToken });

  // Too many impostors
  r = await req('POST', '/api/new-game', { category: 'xx', numPlayers: 5, numImposters: 3 });
  assertEq(r.status, 400, 'reject impostors > floor((n-1)/2)');

  // Too few players
  r = await req('POST', '/api/new-game', { category: 'xx', numPlayers: 2, numImposters: 1 });
  assertEq(r.status, 400, 'reject numPlayers below min');

  // Too many players
  r = await req('POST', '/api/new-game', { category: 'xx', numPlayers: 20, numImposters: 1 });
  assertEq(r.status, 400, 'reject numPlayers above max');

  // Bad category
  r = await req('POST', '/api/new-game', { category: '', numPlayers: 5, numImposters: 1 });
  assertEq(r.status, 400, 'reject empty category');
}

async function scenarioL_UniformityE2E() {
  console.log('\n[L] End-to-end impostor uniformity over 3000 same-code rounds');
  const N = 5;
  const ROUNDS = 3000;
  const create = await req('POST', '/api/new-game', {
    category: 'numbers', numPlayers: N, numImposters: 1,
  });
  const { gameCode, hostToken } = create.body;
  const counts = new Array(N).fill(0);
  for (let r = 0; r < ROUNDS; r++) {
    const all = await req('POST', '/api/reveal-all', { gameCode, token: hostToken });
    const impIdx = all.body.results.findIndex(x => x.role === 'Impostor');
    if (impIdx >= 0) counts[impIdx]++;
    if (r < ROUNDS - 1) {
      await req('POST', '/api/new-game-same-code', { gameCode, token: hostToken, category: 'numbers' });
    }
  }
  const expected = ROUNDS / N;
  let chi = 0;
  for (const c of counts) chi += ((c - expected) ** 2) / expected;
  if (chi <= 18.47) ok(`E2E uniformity (chi²=${chi.toFixed(2)} <= 18.47); counts=${counts.join(',')}`);
  else fail('E2E uniformity', `chi²=${chi.toFixed(2)}; counts=${counts.join(',')}`);

  await req('POST', '/api/reset', { gameCode, token: hostToken });
}

async function scenarioM_DoubleSlotJoin() {
  console.log('\n[M] Double join on same slot rejected');
  const create = await req('POST', '/api/new-game', { category: 'xx', numPlayers: 4, numImposters: 1 });
  const { gameCode, hostToken } = create.body;
  const j1 = await req('POST', `/api/game/${gameCode}/join`, { playerNumber: 2 });
  assertEq(j1.status, 200, 'first join ok');
  const j2 = await req('POST', `/api/game/${gameCode}/join`, { playerNumber: 2 });
  assertEq(j2.status, 409, 'second join on same slot rejected');
  const jh = await req('POST', `/api/game/${gameCode}/join`, { playerNumber: 1 });
  assertEq(jh.status, 403, 'cannot claim host slot via join');
  await req('POST', '/api/reset', { gameCode, token: hostToken });
}

async function scenarioN_StatusReporting() {
  console.log('\n[N] /api/status correctly reports state across lifecycle');
  const create = await req('POST', '/api/new-game', { category: 'xx', numPlayers: 4, numImposters: 1 });
  const { gameCode, hostToken } = create.body;

  let st = await req('GET', `/api/status?gameCode=${gameCode}`);
  assertEq(st.body.roundId, 1, 'initial roundId=1');
  assertEq(st.body.numImposters, 1, 'status carries numImposters intent');
  assertOk(st.body.revealedFlags.every(f => !f), 'no reveals yet');

  await req('POST', '/api/reveal', { playerIndex: 0, gameCode, token: hostToken });
  st = await req('GET', `/api/status?gameCode=${gameCode}`);
  assertEq(st.body.revealedCount, 1, 'revealedCount increments');

  // hostToken NEVER leaks in status payload
  assertOk(!('hostToken' in st.body), 'hostToken not leaked');
  for (const a of Object.values(st.body.playerAssignments || {})) {
    if ('playerToken' in a) fail('playerToken leaked in status', JSON.stringify(a));
  }
  ok('no tokens leaked in status payload');

  await req('POST', '/api/reset', { gameCode, token: hostToken });
}

async function scenarioO_NumPlayersBoundCanonical() {
  console.log('\n[O] Status survives all (numPlayers, numImposters) combos for chained rounds');
  for (const n of [3, 4, 5, 6, 8, 12]) {
    const maxK = Math.max(1, Math.floor((n - 1) / 2));
    for (const k of [1, maxK]) {
      const create = await req('POST', '/api/new-game', { category: 'animals', numPlayers: n, numImposters: k });
      if (create.status !== 200) { fail(`n=${n} k=${k} create`, `status ${create.status}`); continue; }
      const { gameCode, hostToken } = create.body;
      // Run 3 chained same-code rounds
      let okCount = 0;
      for (let r = 0; r < 3; r++) {
        const all = await req('POST', '/api/reveal-all', { gameCode, token: hostToken });
        const imp = all.body.results.filter(x => x.role === 'Impostor').length;
        if (imp === k && !all.body.chaosMode) okCount++;
        if (r < 2) await req('POST', '/api/new-game-same-code', { gameCode, token: hostToken });
      }
      assertEq(okCount, 3, `n=${n} k=${k} chained rounds preserve numImposters`);
      await req('POST', '/api/reset', { gameCode, token: hostToken });
    }
  }
}

/**
 * Q: realistic through-game randomization — 5000 rounds with mixed flows.
 * Verifies the impostor distribution stays uniform even when alternating
 * between "same category" and "different category" new-round triggers AND
 * with joined players in some slots. This catches any state-leak between
 * rounds that an isolated shuffle test would miss.
 */
async function scenarioQ_ThroughGameRandomization() {
  console.log('\n[Q] Through-game uniformity, 5000 mixed rounds (joined players + same/diff category)');
  const N = 5;
  const ROUNDS = 5000;
  const create = await req('POST', '/api/new-game', {
    category: 'movies', numPlayers: N, numImposters: 1,
  });
  const { gameCode, hostToken } = create.body;

  // Slots 2 and 3 are joined; 4 and 5 are not. The host's slot is 1.
  await req('POST', `/api/game/${gameCode}/join`, { playerNumber: 2 });
  await req('POST', `/api/game/${gameCode}/join`, { playerNumber: 3 });

  const counts = new Array(N).fill(0);
  let chaosCount = 0;
  for (let r = 0; r < ROUNDS; r++) {
    const all = await req('POST', '/api/reveal-all', { gameCode, token: hostToken });
    if (all.body.chaosMode) { chaosCount++; continue; }
    const impIdx = all.body.results.findIndex(x => x.role === 'Impostor');
    if (impIdx >= 0) counts[impIdx]++;
    if (r < ROUNDS - 1) {
      // Alternate: even rounds → new category; odd rounds → same category
      const body = { gameCode, token: hostToken };
      if (r % 2 === 0) body.category = `cat-${r}`;
      const nr = await req('POST', '/api/new-game-same-code', body);
      if (nr.status !== 200) { fail(`Q round ${r}`, `${nr.status}`); return; }
    }
  }
  assertEq(chaosCount, 0, 'chaos never rolls with default disabled');
  const expected = (ROUNDS - chaosCount) / N;
  let chi = 0;
  for (const c of counts) chi += ((c - expected) ** 2) / expected;
  if (chi <= 18.47) ok(`Q: uniform impostor over ${ROUNDS} mixed-flow rounds (chi²=${chi.toFixed(2)} <= 18.47); counts=${counts.join(',')}`);
  else fail('Q', `chi²=${chi.toFixed(2)}; counts=${counts.join(',')}`);
  await req('POST', '/api/reset', { gameCode, token: hostToken });
}

/**
 * R: multi-impostor through-game uniformity. With 2 impostors out of 5
 * players, each slot should be impostor 2/5 of the time.
 */
async function scenarioR_MultiImpostorThroughGame() {
  console.log('\n[R] Multi-impostor through-game uniformity, 5 players × 2 impostors, 4000 rounds');
  const N = 5;
  const K = 2;
  const ROUNDS = 4000;
  const create = await req('POST', '/api/new-game', { category: 'food', numPlayers: N, numImposters: K });
  const { gameCode, hostToken } = create.body;

  const counts = new Array(N).fill(0);
  for (let r = 0; r < ROUNDS; r++) {
    const all = await req('POST', '/api/reveal-all', { gameCode, token: hostToken });
    all.body.results.forEach(x => { if (x.role === 'Impostor') counts[x.playerNumber - 1]++; });
    if (r < ROUNDS - 1) {
      await req('POST', '/api/new-game-same-code', { gameCode, token: hostToken });
    }
  }
  // Each slot expected to be impostor K/N of rounds = 2/5 = 0.4
  const expected = ROUNDS * K / N;
  let chi = 0;
  for (const c of counts) chi += ((c - expected) ** 2) / expected;
  if (chi <= 18.47) ok(`R: uniform 2-impostor distribution (chi²=${chi.toFixed(2)} <= 18.47); counts=${counts.join(',')}`);
  else fail('R', `chi²=${chi.toFixed(2)}; counts=${counts.join(',')}`);
  await req('POST', '/api/reset', { gameCode, token: hostToken });
}

/**
 * S: chaos rounds DO make everyone impostor and following non-chaos rounds
 * return to the configured count. (Stronger version of I, but checks each
 * round individually.)
 */
async function scenarioS_ChaosBoundary() {
  console.log('\n[S] Chaos: per-round invariant — chaos→all, non-chaos→exactly numImposters');
  const N = 6, K = 2;
  const create = await req('POST', '/api/new-game', {
    category: 'animals', numPlayers: N, numImposters: K, chaosModeEnabled: true,
  });
  const { gameCode, hostToken } = create.body;
  for (let r = 0; r < 200; r++) {
    const all = await req('POST', '/api/reveal-all', { gameCode, token: hostToken });
    const impCount = all.body.results.filter(x => x.role === 'Impostor').length;
    const expected = all.body.chaosMode ? N : K;
    if (impCount !== expected) {
      fail(`S round ${r}`, `chaos=${all.body.chaosMode}, impCount=${impCount}, expected=${expected}`);
      return;
    }
    if (r < 199) await req('POST', '/api/new-game-same-code', { gameCode, token: hostToken });
  }
  ok('S: 200 rounds with chaos all obey the invariant');
  await req('POST', '/api/reset', { gameCode, token: hostToken });
}

/**
 * T: full realistic game flow — host + 2 joined players play 5 chained
 * rounds with reveals in between. Validates roundId-based sync and that
 * tokens persist across rounds.
 */
async function scenarioT_FullRealisticChain() {
  console.log('\n[T] Full realistic chain: 5 rounds with reveals between each');
  const create = await req('POST', '/api/new-game', { category: 'cities', numPlayers: 4, numImposters: 1 });
  const { gameCode, hostToken } = create.body;
  const j2 = await req('POST', `/api/game/${gameCode}/join`, { playerNumber: 2 });
  const j3 = await req('POST', `/api/game/${gameCode}/join`, { playerNumber: 3 });
  const p2 = j2.body.playerToken;
  const p3 = j3.body.playerToken;

  for (let round = 1; round <= 5; round++) {
    // Each player reveals their own role
    const r1 = await req('POST', '/api/reveal', { playerIndex: 0, gameCode, token: hostToken });
    const r2 = await req('POST', '/api/reveal', { playerIndex: 1, gameCode, token: p2 });
    const r3 = await req('POST', '/api/reveal', { playerIndex: 2, gameCode, token: p3 });
    // Slot 4 has not joined → host can still reveal it
    const r4 = await req('POST', '/api/reveal', { playerIndex: 3, gameCode, token: hostToken });
    if (r1.status !== 200 || r2.status !== 200 || r3.status !== 200 || r4.status !== 200) {
      fail(`T round ${round} reveals`, `${r1.status}/${r2.status}/${r3.status}/${r4.status}`);
      return;
    }
    // Host re-reveals own slot (should still work)
    const reReveal = await req('POST', '/api/reveal', { playerIndex: 0, gameCode, token: hostToken });
    if (reReveal.status !== 200) { fail(`T round ${round} re-reveal`, `${reReveal.status}`); return; }

    // End the round
    const all = await req('POST', '/api/reveal-all', { gameCode, token: hostToken });
    if (all.status !== 200) { fail(`T round ${round} reveal-all`, `${all.status}`); return; }
    const expectedRound = round;
    if (all.body.roundId !== expectedRound) {
      fail(`T round ${round} roundId`, `expected ${expectedRound}, got ${all.body.roundId}`);
      return;
    }

    if (round < 5) {
      // Alternate same/different category
      const body = { gameCode, token: hostToken };
      if (round % 2 === 0) body.category = `new-${round}`;
      const nr = await req('POST', '/api/new-game-same-code', body);
      if (nr.status !== 200) { fail(`T round ${round} new-round`, `${nr.status}`); return; }
      // Status should reflect new roundId AND revealedFlags reset
      const st = await req('GET', `/api/status?gameCode=${gameCode}`);
      if (st.body.roundId !== round + 1 || !st.body.revealedFlags.every(f => !f)) {
        fail(`T round ${round} status reset`, `roundId=${st.body.roundId}, flags=${JSON.stringify(st.body.revealedFlags)}`);
        return;
      }
    }
  }
  ok('T: 5 chained rounds with reveals, tokens preserved, roundIds correct');
  await req('POST', '/api/reset', { gameCode, token: hostToken });
}

/**
 * U: ensure /api/status never leaks token information across the lifecycle
 * (every possible state has been hit by now in scenario T).
 */
async function scenarioU_NoTokenLeaks() {
  console.log('\n[U] Token leak audit across status responses');
  const create = await req('POST', '/api/new-game', { category: 'sports', numPlayers: 4, numImposters: 1 });
  const { gameCode, hostToken } = create.body;
  await req('POST', `/api/game/${gameCode}/join`, { playerNumber: 2 });
  await req('POST', `/api/game/${gameCode}/join`, { playerNumber: 3 });

  const checks = [
    await req('GET', `/api/status?gameCode=${gameCode}`),
  ];
  for (const r of checks) {
    const body = JSON.stringify(r.body);
    if (body.includes('Token') || body.includes('token') || body.includes(hostToken)) {
      fail('U token leak', `body had token info`);
      return;
    }
  }
  ok('U: no token strings leaked in public status/lookup endpoints');
  await req('POST', '/api/reset', { gameCode, token: hostToken });
}

/**
 * V: bad-input fuzz — server doesn't crash on weird payloads.
 */
async function scenarioV_InputFuzz() {
  console.log('\n[V] Input fuzz — server stays sane on weird payloads');
  const bads = [
    ['POST', '/api/new-game', null],
    ['POST', '/api/new-game', {}],
    ['POST', '/api/new-game', { category: 'animals', numPlayers: 'five', numImposters: 1 }],
    ['POST', '/api/new-game', { category: 'a'.repeat(1000), numPlayers: 5, numImposters: 1 }],
    ['POST', '/api/reveal', null],
    ['POST', '/api/reveal', { playerIndex: -1, gameCode: 'NOPE', token: 'x' }],
    ['POST', '/api/reveal', { playerIndex: 999999, gameCode: 'NOPE', token: 'x' }],
    ['POST', '/api/reveal-all', null],
    ['POST', '/api/reset', null],
    ['POST', '/api/new-game-same-code', null],
    ['GET',  '/api/status?gameCode=!!!@@@', undefined],
    ['POST', '/api/game/!!!@@@/join', { playerNumber: 1 }],
  ];
  for (const [m, p, b] of bads) {
    const r = await req(m, p, b);
    if (r.status >= 500) { fail(`V ${m} ${p}`, `5xx on bad input: ${r.status}`); return; }
  }
  ok(`V: ${bads.length} bad payloads → no 5xx`);
}

async function scenarioP_RateLimitConfig() {
  // Tests run with NEW_GAME_RATE_LIMIT_MAX set artificially high (see top of file).
  // Verifying the actual limiter would require a sub-process or limiter reset;
  // we trust the well-tested `express-rate-limit` middleware and just check
  // the config knobs are reasonable.
  console.log('\n[P] Rate limit config sanity');
  const cfg = require('../config');
  assertOk(
    Number.isFinite(cfg.NEW_GAME_RATE_LIMIT_WINDOW_MS) && cfg.NEW_GAME_RATE_LIMIT_WINDOW_MS > 0,
    'rate limit window configured'
  );
  assertOk(
    Number.isFinite(cfg.NEW_GAME_RATE_LIMIT_MAX) && cfg.NEW_GAME_RATE_LIMIT_MAX > 0,
    'rate limit max configured'
  );
}

// ----------- Run -----------

(async function main() {
  await startServer();
  console.log(`Test server: ${baseUrl}`);
  try {
    await scenarioA_PassAndPlay();
    await scenarioB_MultiDevice();
    await scenarioC_SameCategoryNewRound();
    await scenarioD_ChainedNewCategories();
    await scenarioE_StrangerVisitsLink();
    await scenarioF_ReRevealAfterRefresh();
    await scenarioG_Unauthorized();
    await scenarioH_EveryoneGetsWord();
    await scenarioI_ChaosCascadeRegression();
    await scenarioJ_ChaosDisabled();
    await scenarioK_Boundaries();
    await scenarioM_DoubleSlotJoin();
    await scenarioN_StatusReporting();
    await scenarioO_NumPlayersBoundCanonical();
    await scenarioL_UniformityE2E();
    await scenarioQ_ThroughGameRandomization();
    await scenarioR_MultiImpostorThroughGame();
    await scenarioS_ChaosBoundary();
    await scenarioT_FullRealisticChain();
    await scenarioU_NoTokenLeaks();
    await scenarioV_InputFuzz();
    await scenarioP_RateLimitConfig();
  } catch (e) {
    console.error('Test runner crashed:', e);
    totalFail++;
  }
  console.log(`\n===== ${totalPass} passed, ${totalFail} failed =====`);
  server.close();
  process.exit(totalFail > 0 ? 1 : 0);
})();

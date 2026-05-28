/**
 * Pure-randomizer tests — no server required.
 *
 * Proves Fisher-Yates is uniform and that selectImpostorIndices distributes
 * the impostor slot evenly across all players (for 1, 2, and 3 impostor
 * scenarios across 3..12 players).
 */

const { fisherYatesShuffle, selectImpostorIndices } = require('../lib/gameLogic');

let failures = 0;
function ok(name) { console.log(`  ✓ ${name}`); }
function fail(name, msg) { console.log(`  ✗ ${name}: ${msg}`); failures++; }

function chiSquare(observed, expected) {
  let chi = 0;
  for (let i = 0; i < observed.length; i++) {
    const e = expected[i];
    chi += ((observed[i] - e) ** 2) / e;
  }
  return chi;
}

// Chi-square critical values for k-1 dof at p=0.001 (very conservative)
// k = 2..12 (we never run more than 12 buckets)
const CRIT_001 = {
  2: 10.83, 3: 13.82, 4: 16.27, 5: 18.47, 6: 20.52,
  7: 22.46, 8: 24.32, 9: 26.13, 10: 27.88, 11: 29.59, 12: 31.26,
};

function testImpostorDistribution(numPlayers, numImposters, trials = 120000) {
  const counts = new Array(numPlayers).fill(0);
  for (let t = 0; t < trials; t++) {
    const sel = selectImpostorIndices(numPlayers, numImposters);
    if (new Set(sel).size !== numImposters) {
      fail(`distinct indices (n=${numPlayers}, k=${numImposters})`, 'duplicates returned');
      return;
    }
    sel.forEach(i => counts[i]++);
  }
  const expected = new Array(numPlayers).fill(trials * numImposters / numPlayers);
  const chi = chiSquare(counts, expected);
  const crit = CRIT_001[numPlayers];
  const name = `uniform impostor selection (n=${numPlayers}, k=${numImposters}, trials=${trials})`;
  if (chi <= crit) ok(`${name} — chi²=${chi.toFixed(2)} (crit ${crit})`);
  else fail(name, `chi²=${chi.toFixed(2)} > crit ${crit}; counts=${counts.join(',')}`);
}

function testShuffleUniformity() {
  const trials = 600000;
  const arr = [0, 1, 2, 3];
  const factorial = 24;
  const counts = {};
  for (let t = 0; t < trials; t++) {
    const k = fisherYatesShuffle(arr).join('');
    counts[k] = (counts[k] || 0) + 1;
  }
  const keys = Object.keys(counts);
  if (keys.length !== factorial) {
    fail('shuffle reaches all permutations', `${keys.length}/24`);
    return;
  }
  const expected = new Array(factorial).fill(trials / factorial);
  const obs = keys.map(k => counts[k]);
  const chi = chiSquare(obs, expected);
  // 23 dof, p=0.001 ~ 49.7
  if (chi <= 70) ok(`fisher-yates uniform permutations (chi²=${chi.toFixed(2)} <= 70)`);
  else fail('fisher-yates uniform permutations', `chi²=${chi.toFixed(2)}`);
}

console.log('## Randomizer tests');
testShuffleUniformity();
for (const n of [3, 4, 5, 6, 8, 12]) {
  const maxK = Math.max(1, Math.floor((n - 1) / 2));
  for (let k = 1; k <= maxK; k++) {
    testImpostorDistribution(n, k);
  }
}

if (failures) {
  console.log(`\n${failures} test(s) failed`);
  process.exit(1);
} else {
  console.log(`\nAll randomizer tests passed`);
}

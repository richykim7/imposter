/**
 * Playwright smoke harness.
 * Walks every screen of the app, captures static screenshots (we can't
 * meaningfully film an animation through this tool), and reports any
 * console errors / page-level errors.
 *
 * For animated transitions (card flip), we capture the two stable
 * states: back-face visible and front-face visible. The transition
 * itself isn't worth iterating on through this harness — eyeball it.
 *
 *   node tests/playwright.js
 */

process.env.NO_PERSIST = '1';
process.env.NEW_GAME_RATE_LIMIT_MAX = '100000';

const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');
const { app } = require('../server');

const SHOTS_DIR = path.join(__dirname, 'shots');
fs.mkdirSync(SHOTS_DIR, { recursive: true });

const errors = [];

function ok(name)  { console.log(`  ✓ ${name}`); }
function fail(name, msg) { console.log(`  ✗ ${name}: ${msg}`); errors.push(`${name}: ${msg}`); }

async function shot(page, name) {
  const file = path.join(SHOTS_DIR, `${name}.png`);
  await page.screenshot({ path: file, fullPage: false });
  ok(`shot → ${path.relative(process.cwd(), file)}`);
}

async function run() {
  const server = await new Promise(resolve => {
    const s = app.listen(0, () => resolve(s));
  });
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;
  console.log(`▶ Test server: ${baseUrl}`);

  const browser = await chromium.launch();
  // Mobile-first viewport — this is how most users will play.
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
  });
  const page = await ctx.newPage();

  // Surface JS errors back to us — important: the design overhaul could
  // easily introduce a typo we wouldn't otherwise see.
  const jsErrors = [];
  page.on('console', m => { if (m.type() === 'error') jsErrors.push(m.text()); });
  page.on('pageerror', e => jsErrors.push(`pageerror: ${e.message}`));
  // Auto-accept confirm() prompts (used by reveal-all / reset).
  page.on('dialog', d => d.accept());

  try {
    /* ===== Setup screen ===== */
    await page.goto(baseUrl);
    await page.waitForSelector('#setupSection:not(.hidden)');
    await page.waitForTimeout(700); // let custom fonts paint
    await shot(page, '01-setup');

    /* ===== Settings open ===== */
    await page.click('#settingsToggle');
    await page.waitForTimeout(300);
    await shot(page, '02-settings-open');
    await page.click('#settingsToggle');
    await page.waitForTimeout(200);

    /* ===== Create a game ===== */
    await page.fill('#categoryInput', 'movies');
    // Step up to 5 players via the +
    await page.click('.stepper-btn[data-step="1"]');
    await page.click('.stepper-btn[data-step="1"]');
    await page.click('#createGameBtn');
    await page.waitForSelector('#gameSection:not(.hidden)', { timeout: 10000 });
    await page.waitForTimeout(700);
    await shot(page, '03-game');

    /* ===== Reveal modal — back face ===== */
    await page.click('button.mini-card[data-player-index="0"]');
    await page.waitForSelector('#revealModal.show');
    // The flip timer is 600ms in; screenshot at 250ms so we see the back.
    // Also pin state explicitly in case timing varies.
    await page.evaluate(() => {
      document.getElementById('flipCard').setAttribute('data-revealed', 'false');
    });
    await page.waitForTimeout(350);
    await shot(page, '04-reveal-back');

    /* ===== Reveal modal — front face (forced) ===== */
    await page.evaluate(() => {
      document.getElementById('flipCard').setAttribute('data-revealed', 'true');
    });
    await page.waitForTimeout(1100);
    await shot(page, '05-reveal-front');

    /* ===== Close reveal modal ===== */
    await page.click('#hideModalBtn');
    await page.waitForTimeout(500);

    /* ===== Reveal all (with confetti) ===== */
    await page.click('#revealAllBtn');
    // Wait for the modal + confetti
    await page.waitForSelector('#revealAllModal.show');
    await page.waitForTimeout(500);
    await shot(page, '06-reveal-all');

    /* ===== Reshuffle screen ===== */
    await page.click('#startNewGameFromModalBtn');
    await page.waitForSelector('#newRoundSection:not(.hidden)');
    await page.waitForTimeout(400);
    await shot(page, '07-reshuffle');

    /* ===== Same-theme new round ===== */
    await page.click('#sameCategoryBtn');
    await page.waitForSelector('#gameSection:not(.hidden)', { timeout: 10000 });
    await page.waitForTimeout(500);
    await shot(page, '08-round-2');

    /* ===== Title-card / felt zoom-out  ===== */
    await page.click('#resetBtn');
    // accept the confirm dialog (already wired)
    await page.waitForSelector('#setupSection:not(.hidden)', { timeout: 5000 });
    await page.waitForTimeout(400);
    await shot(page, '09-after-reset');

    /* ===== Join flow ===== */
    await page.click('#switchToJoinBtn');
    await page.waitForSelector('#joinSection:not(.hidden)');
    await page.waitForTimeout(300);
    await shot(page, '10-join');

    if (jsErrors.length) {
      console.log('\n  JS errors on page:');
      jsErrors.forEach(e => fail('console', e));
    } else {
      ok('no JS errors during full walkthrough');
    }
  } catch (e) {
    fail('harness', e.message);
  } finally {
    await browser.close();
    server.close();
  }

  if (errors.length) {
    console.log(`\n✗ ${errors.length} issue(s)`);
    process.exit(1);
  } else {
    console.log(`\n✓ Playwright harness completed cleanly. Screenshots in ${path.relative(process.cwd(), SHOTS_DIR)}/`);
  }
}

run().catch(e => { console.error(e); process.exit(1); });

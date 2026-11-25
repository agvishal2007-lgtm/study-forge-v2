/*
 * Draws the picture that shows up when a student pastes the Study Forge link into a group chat.
 *
 * Generated rather than drawn by hand, and from the app's own colour tokens read out of
 * src/styles.css, so the card cannot quietly drift away from the app it is advertising. Re-run with
 * `node scripts/share-card.cjs` after a colour change.
 *
 * Every word on it has to be something Study Forge really does. No user counts, no reviews, no
 * college's name or crest.
 */
const { readFile, writeFile } = require('node:fs/promises');
const path = require('node:path');
// `require` rather than `import`: Playwright is installed outside this project, where only the
// CommonJS resolver finds it — the same way every test in tests/ loads it.
const { chromium } = require('playwright');

async function main() {
const css = await readFile(path.join(__dirname, '..', 'src', 'styles.css'), 'utf8');
const token = (name, fallback) => (css.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{3,8})`))?.[1] ?? fallback);

const accent = token('accent', '#4f46e5');
const ink = token('ink', '#15181d');

const page = `<!doctype html>
<html><head><meta charset="utf-8"><style>
  * { box-sizing: border-box; margin: 0; }
  body { width: 1200px; height: 630px; display: flex; flex-direction: column; justify-content: center;
    gap: 28px; padding: 76px 84px; background: ${ink}; color: #f7f8fb;
    font-family: ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; }
  .mark { display: flex; align-items: center; gap: 18px; }
  .mark svg { width: 56px; height: 56px; }
  .mark span { font-size: 34px; font-weight: 650; letter-spacing: -0.01em; }
  h1 { font-size: 66px; line-height: 1.07; font-weight: 700; letter-spacing: -0.025em; max-width: 17ch; }
  p { font-size: 29px; line-height: 1.4; color: #b9c0cc; max-width: 30ch; }
  ul { display: flex; gap: 12px; list-style: none; padding: 0; flex-wrap: wrap; }
  li { font-size: 23px; padding: 11px 20px; border-radius: 999px; border: 1px solid #39414f; color: #dfe4ec; }
  .rule { height: 7px; width: 132px; border-radius: 999px;
    background: linear-gradient(90deg, ${accent}, #6ee7c8); }
</style></head><body>
  <div class="mark">
    <svg viewBox="0 0 32 32"><rect width="32" height="32" rx="6" fill="#162130"/>
      <rect x="6" y="8" width="6" height="18" fill="#7DD3FC"/>
      <rect x="14" y="5" width="5" height="21" fill="#6EE7C8"/>
      <rect x="21" y="11" width="5" height="15" fill="#B4A7F5"/></svg>
    <span>Study Forge</span>
  </div>
  <div class="rule"></div>
  <h1>Your whole semester, in one place.</h1>
  <p>Courses, files, lectures, notes, flashcards and deadlines together.</p>
  <ul><li>Free</li><li>Works offline</li><li>Laptop and phone</li><li>No AI required</li></ul>
</body></html>`;

const browser = await chromium.launch();
const tab = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
await tab.setContent(page, { waitUntil: 'load' });
const shot = await tab.screenshot({ type: 'png' });
await browser.close();
await writeFile(path.join(__dirname, '..', 'public', 'share-card.png'), shot);
console.log(`share-card.png written, ${(shot.length / 1024).toFixed(0)} KB, accent ${accent}`);
}

main().catch((error) => { console.error(error); process.exit(1); });

// Signing in is its own page. None of the student dashboard may follow a student onto it, and the
// dashboard must keep every control that was moved off it.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const path = require('node:path');
const { chromium } = require('playwright');

const PORT = 4213;
const URL_BASE = `http://localhost:${PORT}/`;
// Every address a student can arrive at an account by.
const WAYS_IN = ['/auth', '/login', '/signup', '/sign-in', '/sign-up', '/forgot-password', '/forgot-email', '/account-recovery'];
let server;
let browser;
const pageErrors = [];

const open = async (viewport, theme) => {
  const page = await browser.newPage({ viewport, deviceScaleFactor: 1 });
  page.setDefaultTimeout(15000);
  page.on('pageerror', (error) => pageErrors.push(error.message));
  if (theme) {
    await page.addInitScript((value) => {
      try { localStorage.setItem('study-forge-theme', value); } catch { /* private window */ }
    }, theme);
  }
  return page;
};

before(async () => {
  server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { cwd: path.join(__dirname, '..'), stdio: 'ignore', detached: true });
  for (let attempt = 0; attempt < 100; attempt++) {
    try { await fetch(URL_BASE); break; } catch { await new Promise((resolve) => setTimeout(resolve, 150)); }
  }
  browser = await chromium.launch();
});

after(async () => {
  await browser?.close();
  try { process.kill(-server.pid); } catch { /* already stopped */ }
});

test('no way in carries the student dashboard with it', async () => {
  const page = await open({ width: 1280, height: 900 });
  for (const route of WAYS_IN) {
    await page.goto(`${URL_BASE}#${route}`);
    await page.locator('.auth-card').waitFor();
    const named = await page.locator('nav').evaluateAll((navs) => navs.map((nav) => nav.getAttribute('aria-label')));
    // The tabs are the only navigation that belongs here.
    assert.deepEqual(named.filter((name) => name !== 'Log in or sign up'), [], `${route} still renders dashboard navigation`);
    for (const section of ['Today', 'Courses', 'Library', 'Planner', 'Calendar', 'Flashcards', 'Practice']) {
      assert.equal(await page.getByRole('link', { name: section, exact: true }).count(), 0, `${route} still links to ${section}`);
    }
    // The bars and floating controls the dashboard owns.
    for (const owned of ['.nav', '.topbar', '.recording-bar', '.save-panel', '.shell']) {
      assert.equal(await page.locator(owned).count(), 0, `${route} still renders ${owned}`);
    }
    assert.equal(await page.locator('.auth-brand').count(), 1, `${route} is missing the Study Forge branding`);
  }
  await page.close();
});

test('an account is still optional, so the page says how to leave without one', async () => {
  const page = await open({ width: 1280, height: 900 });
  await page.goto(`${URL_BASE}#/login`);
  await page.getByRole('link', { name: 'Back to Study Forge' }).click();
  // Back on the dashboard, with everything the entrance left behind.
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Today', exact: true }).waitFor();
  await page.getByRole('navigation', { name: 'Account' }).waitFor();
  await page.close();
});

test('the one way in from the app opens the entrance', async () => {
  const page = await open({ width: 1280, height: 900 });
  await page.goto(URL_BASE);
  await page.getByRole('navigation', { name: 'Account' }).getByRole('link', { name: 'Log In / Sign Up' }).click();
  await page.locator('.auth-card').waitFor();
  assert.equal(new URL(page.url()).hash, '#/auth');
  assert.equal(await page.getByRole('navigation', { name: 'Main' }).count(), 0);
  await page.close();
});

test('both tabs are reachable, and each one keeps every way to sign in', async () => {
  const page = await open({ width: 1280, height: 900 });
  await page.goto(`${URL_BASE}#/auth`);
  for (const [tab, heading] of [['Sign Up', 'Create your account'], ['Log In', 'Sign in']]) {
    await page.getByRole('navigation', { name: 'Log in or sign up' }).getByRole('link', { name: tab }).click();
    await page.getByRole('heading', { name: heading, exact: true }).waitFor();
    await page.getByRole('button', { name: 'Continue with Google' }).waitFor();
    await page.getByRole('button', { name: 'Continue with Microsoft' }).waitFor();
    await page.getByLabel('Email', { exact: true }).waitFor();
    // Deferred for now, so it must not be offered as though it worked.
    assert.equal(await page.getByRole('button', { name: /Yahoo/i }).count(), 0);
  }
  // Recovery is reachable without typing an address by hand.
  await page.getByRole('link', { name: 'Forgot your password?' }).click();
  await page.getByRole('heading', { name: 'Reset your password' }).waitFor();
  await page.close();
});

test('a phone gets the whole screen: no bottom bar, no sideways scroll, big targets', async () => {
  const page = await open({ width: 390, height: 844 });
  await page.goto(`${URL_BASE}#/login`);
  await page.locator('.auth-card').waitFor();
  const sideways = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  assert.equal(sideways, false, 'the entrance scrolls sideways on a phone');
  // The branding is near the top rather than centred down the screen.
  const brand = await page.locator('.auth-brand').boundingBox();
  assert.ok(brand.y < 120, `branding sits ${Math.round(brand.y)}px down instead of near the top`);
  for (const name of ['Continue with Google', 'Continue with Microsoft', 'Sign in']) {
    const box = await page.getByRole('button', { name, exact: true }).boundingBox();
    assert.ok(box.height >= 44, `${name} is only ${Math.round(box.height)}px tall`);
  }
  await page.close();
});

test('the entrance is readable in both themes', async () => {
  const { contrastRatio } = await import('../src/data/statusRules.ts');
  for (const theme of ['light', 'dark']) {
    const page = await open({ width: 1280, height: 900 }, theme);
    await page.goto(`${URL_BASE}#/login`);
    await page.locator('.auth-card').waitFor();
    await page.waitForFunction((want) => document.documentElement.getAttribute('data-theme') === want, theme);
    const shades = await page.evaluate(() => {
      const card = getComputedStyle(document.querySelector('.auth-card')).backgroundColor;
      const read = (selector) => getComputedStyle(document.querySelector(selector)).color;
      return { card, heading: read('.auth-card h1'), brand: read('.auth-brand'), page: getComputedStyle(document.querySelector('.auth-shell')).backgroundColor };
    });
    assert.ok(contrastRatio(shades.heading, shades.card) >= 4.5, `${theme}: heading is ${contrastRatio(shades.heading, shades.card).toFixed(2)}:1 on the card`);
    assert.ok(contrastRatio(shades.brand, shades.page) >= 4.5, `${theme}: branding is ${contrastRatio(shades.brand, shades.page).toFixed(2)}:1 on the page`);
    await page.close();
  }
});

test('no uncaught errors happened during the whole run', () => {
  assert.deepEqual(pageErrors, []);
});

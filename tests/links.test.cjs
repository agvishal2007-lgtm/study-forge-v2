// Saving a web address as a resource — and being honest that a link is not a copy of the page.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { chromium } = require('playwright');
const returningStudent = require('./returningStudent.cjs');

const rules = () => import('../src/data/linkRules.ts');

test('only ordinary web addresses are saved', async () => {
  const { tidyUrl } = await rules();
  assert.equal(tidyUrl('https://www.jstor.org/stable/123'), 'https://www.jstor.org/stable/123');
  assert.equal(tidyUrl('  jstor.org/stable/123 '), 'https://jstor.org/stable/123', 'a bare address gets https');
  assert.equal(tidyUrl('javascript:alert(1)'), null, 'a script is refused');
  assert.equal(tidyUrl('data:text/html,<b>x</b>'), null, 'a data address is refused');
  assert.equal(tidyUrl('file:///etc/passwd'), null, 'a file on the device is refused');
  assert.equal(tidyUrl('mailto:someone@example.com'), null);
  assert.equal(tidyUrl('   '), null);
  assert.equal(tidyUrl('notadomain'), null);
});

test('a link is sorted by what it points at', async () => {
  const { categorize } = await rules();
  assert.equal(categorize('https://docs.google.com/document/d/abc/edit'), 'cloud');
  assert.equal(categorize('https://tcnj.instructure.com/courses/1'), 'portal');
  assert.equal(categorize('https://www.youtube.com/watch?v=abc'), 'video');
  assert.equal(categorize('https://www.jstor.org/stable/123'), 'research');
  assert.equal(categorize('https://pubmed.ncbi.nlm.nih.gov/123'), 'research');
  assert.equal(categorize('https://en.wikipedia.org/wiki/Accounting'), 'reference');
  assert.equal(categorize('https://example.com/thing'), 'other');
  for (const book of ['https://connect.mheducation.com/class/x', 'https://mlm.pearson.com/home', 'https://www.webassign.net/web/Student', 'https://ng.cengage.com/static/nb/ui/evo/index.html', 'https://bookshelf.vitalsource.com/books/123', 'https://www.wileyplus.com/', 'https://education.wiley.com/', 'https://openstax.org/books/biology-2e/pages/1-introduction', 'https://www.cengagenow.com/ilrn/', 'https://www.aplia.com/']) {
    assert.equal(categorize(book), 'textbook', book);
  }
  assert.equal(categorize('https://onlinelibrary.wiley.com/doi/1'), 'research', 'Wiley research papers are still research');
});

test('a link gets a readable name from its address', async () => {
  const { nameFromUrl, siteOf } = await rules();
  assert.equal(nameFromUrl('https://www.example.com/the-big-idea.html'), 'the big idea — example.com');
  assert.equal(nameFromUrl('https://www.example.com/'), 'example.com');
  assert.equal(siteOf('https://www.jstor.org/stable/1'), 'jstor.org');
});

const PORT = Number(process.env.LINKS_PORT) || 4204;
const URL_BASE = `http://localhost:${PORT}/`;
let server;
let context;
let page;
let work;
const pageErrors = [];

before(async () => {
  work = fs.mkdtempSync(path.join(os.tmpdir(), 'study-forge-links-'));
  server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { cwd: path.join(__dirname, '..'), stdio: 'ignore', detached: true });
  for (let attempt = 0; attempt < 100; attempt++) {
    try { await fetch(URL_BASE); break; } catch { await new Promise((resolve) => setTimeout(resolve, 150)); }
  }
  context = await chromium.launchPersistentContext(path.join(work, 'main'), { viewport: { width: 1280, height: 900 }, timezoneId: 'America/New_York', serviceWorkers: 'block' });
  await returningStudent(context);
  page = context.pages()[0] ?? (await context.newPage());
  page.setDefaultTimeout(15000);
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.goto(URL_BASE);
});

after(async () => {
  await context?.close();
  try { process.kill(-server.pid); } catch { /* already stopped */ }
  fs.rmSync(work, { recursive: true, force: true });
});

const openAdder = async () => {
  const details = page.locator('details.link-adder');
  await details.waitFor();
  if (!(await details.evaluate((element) => element.open))) await details.locator('summary').click();
  await page.getByTestId('save-link').getByLabel('Web address').waitFor();
};

const saveLink = async (url, name) => {
  await page.goto(`${URL_BASE}#/library`);
  await openAdder();
  await page.getByTestId('save-link').getByLabel('Web address').fill(url);
  if (name) await page.getByTestId('save-link').getByLabel('Name it (optional)').fill(name);
  await page.getByRole('button', { name: 'Save link' }).click();
  await page.getByRole('status').waitFor();
};

test('a research link is saved and listed as a link', async () => {
  await saveLink('https://www.jstor.org/stable/2626876', 'Accounting history');
  await page.goto(`${URL_BASE}#/library`);
  await page.getByRole('link', { name: 'Accounting history' }).waitFor();
  const row = page.locator('.files li', { hasText: 'Accounting history' });
  const meta = await row.innerText();
  assert.match(meta, /Link/);
  assert.match(meta, /Research/);
  assert.match(meta, /jstor\.org/);
});

test('an address that is not a web page is refused', async () => {
  await page.goto(`${URL_BASE}#/library`);
  await openAdder();
  await page.getByTestId('save-link').getByLabel('Web address').fill('javascript:alert(1)');
  await page.getByRole('button', { name: 'Save link' }).click();
  await page.getByRole('alert').waitFor();
  assert.match(await page.getByRole('alert').innerText(), /http:\/\/ or https:\/\//);
});

test('opening a link says plainly that the page was not copied', async () => {
  await page.goto(`${URL_BASE}#/library`);
  await page.getByRole('link', { name: 'Accounting history' }).click();
  await page.getByTestId('link-notice').waitFor();
  const notice = await page.getByTestId('link-notice').innerText();
  assert.match(notice, /not a copy of the page/);
  assert.match(notice, /never changes or deletes the original/);
  const open = page.getByRole('link', { name: 'Open in a new tab' });
  assert.equal(await open.getAttribute('href'), 'https://www.jstor.org/stable/2626876');
  assert.equal(await open.getAttribute('target'), '_blank');
  assert.match(String(await open.getAttribute('rel')), /noopener/);
});

test('a Google Docs link is kept as a link, not pretended to be a document', async () => {
  await saveLink('https://docs.google.com/document/d/abc123/edit', 'Essay draft');
  await page.goto(`${URL_BASE}#/library`);
  const row = page.locator('.files li', { hasText: 'Essay draft' });
  assert.match(await row.innerText(), /Cloud document/);
  await page.getByRole('link', { name: 'Essay draft' }).click();
  await page.getByTestId('link-notice').waitFor();
  // It must never claim to have imported the document.
  assert.equal(await page.getByTestId('viewer-fallback').count(), 0);
});

test('a saved link is findable by its address', async () => {
  await page.goto(`${URL_BASE}#/search`);
  await page.getByRole('searchbox').fill('jstor.org');
  await page.getByTestId('search-Files').waitFor();
  assert.match(await page.getByTestId('search-Files').innerText(), /Accounting history/);
});

test('a link goes to the bin and comes back, and the bin is honest about it', async () => {
  await page.goto(`${URL_BASE}#/library`);
  await page.getByRole('link', { name: 'Essay draft' }).click();
  await page.getByRole('button', { name: 'Move to Trash' }).click();
  await page.getByRole('heading', { name: 'Library' }).waitFor();
  assert.equal(await page.getByRole('link', { name: 'Essay draft' }).count(), 0);
  await page.goto(`${URL_BASE}#/trash`);
  await page.getByTestId('trash-list').waitFor();
  await page.getByRole('button', { name: 'Restore Essay draft' }).click();
  await page.goto(`${URL_BASE}#/library`);
  await page.getByRole('link', { name: 'Essay draft' }).waitFor();
});

test('an online textbook link keeps your place and saved spots, without ever seeing the book or your login', async () => {
  const { cleanOnlineReading } = await import('../src/data/readingRules.ts');
  const { tidyUrl } = await rules();
  assert.deepEqual(cleanOnlineReading({ place: '  Ch 4 ', at: 5, spots: [{ id: 'a', label: 'HW', place: '', url: 'javascript:alert(1)' }, { id: 'b', label: '', place: '' }, 'x'] }, tidyUrl),
    { place: 'Ch 4', at: 5, spots: [{ id: 'a', label: 'HW', place: '', url: '' }] }, 'unsafe addresses and empty spots are dropped');
  await saveLink('https://connect.mheducation.com/student/class/123', 'Biology textbook');
  await page.goto(`${URL_BASE}#/library`);
  await page.getByRole('link', { name: 'Biology textbook' }).click();
  const tools = page.getByTestId('online-book');
  await tools.waitFor();
  assert.match(await tools.innerText(), /never\s+sees your login, payment or the book’s pages/);
  await tools.getByLabel('Where you are').fill('Chapter 4, section 4.2, page 112');
  await tools.getByRole('button', { name: 'Save my place' }).click();
  await tools.getByTestId('book-place').filter({ hasText: 'Chapter 4, section 4.2, page 112' }).waitFor();
  await tools.getByLabel('Name', { exact: true }).fill('Homework 5');
  await tools.getByLabel('Place (optional)').fill('Chapter 5, problems 1–20');
  await tools.getByLabel('Direct address (optional)').fill('connect.mheducation.com/assignment/5');
  await tools.getByRole('button', { name: 'Save spot' }).click();
  const spot = tools.getByTestId('book-spot');
  await spot.getByRole('link', { name: 'Homework 5' }).waitFor();
  assert.equal(await spot.getByRole('link', { name: 'Homework 5' }).getAttribute('href'), 'https://connect.mheducation.com/assignment/5');
  assert.equal(await spot.getByRole('link', { name: 'Homework 5' }).getAttribute('target'), '_blank', 'opens on the publisher’s site');
  await tools.getByLabel('Name', { exact: true }).fill('Bad');
  await tools.getByLabel('Direct address (optional)').fill('javascript:alert(1)');
  await tools.getByRole('button', { name: 'Save spot' }).click();
  await tools.getByTestId('book-message').filter({ hasText: 'doesn’t look right' }).waitFor();
  assert.equal(await spot.count(), 1);
  await page.reload();
  await page.getByTestId('online-book').getByTestId('book-place').filter({ hasText: 'page 112' }).waitFor();
  await page.getByTestId('online-book').getByTestId('book-spot').filter({ hasText: 'Chapter 5, problems 1–20' }).waitFor();
  await page.getByTestId('related-assignments').waitFor();
  assert.equal(await page.locator('iframe').count(), 0, 'the paid site is never framed inside Study Forge');
});

test('any link can be changed to an online textbook on its page, and gets the book tools', async () => {
  await saveLink('https://homework.myschoolbooks.example.edu/acct101', 'Accounting homework site');
  await page.goto(`${URL_BASE}#/library`);
  await page.getByRole('link', { name: 'Accounting homework site' }).click();
  await page.getByTestId('link-notice').waitFor();
  assert.equal(await page.getByTestId('online-book').count(), 0);
  await page.getByLabel('Kind').selectOption({ label: 'Online textbook' });
  await page.getByTestId('online-book').waitFor();
  await page.reload();
  await page.getByTestId('online-book').waitFor();
  assert.equal(await page.getByLabel('Kind').inputValue(), 'textbook');
});

test('no uncaught errors happened during the whole run', () => {
  assert.deepEqual(pageErrors, []);
});

// Which browser is in use, so instructions name the real menus. Tested with real browsers' details.
const { test } = require('node:test');
const assert = require('node:assert/strict');

const UA = {
  chrome: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  edge: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0',
  opera: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 OPR/116.0.0.0',
  firefox: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:133.0) Gecko/20100101 Firefox/133.0',
  safari: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15',
  iphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/131.0 Mobile/15E148 Safari/604.1',
  samsung: 'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/26.0 Chrome/122.0.0.0 Mobile Safari/537.36',
};

test('each browser is recognised, including Arc and Brave, which look like Chrome', async () => {
  const { detectBrowser } = await import('../src/data/browserRules.ts');
  assert.equal(detectBrowser({ userAgent: UA.chrome }), 'chrome');
  // Arc and Brave report Chrome's details, so they're told apart by what they add to the page.
  assert.equal(detectBrowser({ userAgent: UA.chrome, arcPalette: true }), 'arc');
  assert.equal(detectBrowser({ userAgent: UA.chrome, isBrave: true }), 'brave');
  assert.equal(detectBrowser({ userAgent: UA.edge }), 'edge');
  assert.equal(detectBrowser({ userAgent: UA.opera }), 'opera');
  assert.equal(detectBrowser({ userAgent: UA.firefox }), 'firefox');
  assert.equal(detectBrowser({ userAgent: UA.safari }), 'safari');
  assert.equal(detectBrowser({ userAgent: UA.iphone }), 'ios', 'every iPhone browser is Safari underneath');
  assert.equal(detectBrowser({ userAgent: UA.safari, touchMac: true }), 'ios', 'an iPad that says it is a Mac');
  assert.equal(detectBrowser({ userAgent: UA.samsung }), 'samsung');
});

test('the steps to unblock notifications name each browser\'s own menus', async () => {
  const { unblockNotificationSteps } = await import('../src/data/browserRules.ts');
  assert.match(unblockNotificationSteps('arc', false, true), /arc:\/\/settings\/content\/notifications/);
  assert.match(unblockNotificationSteps('arc', false, true), /System Settings, Notifications, Arc/);
  assert.match(unblockNotificationSteps('brave', false, false), /brave:\/\/settings\/content\/notifications/);
  assert.match(unblockNotificationSteps('edge', false, false), /edge:\/\/settings/);
  assert.match(unblockNotificationSteps('firefox', false, false), /Send notifications/);
  assert.match(unblockNotificationSteps('safari', false, true), /Websites, Notifications/);
  assert.match(unblockNotificationSteps('ios', false, false), /Home Screen/);
  assert.doesNotMatch(unblockNotificationSteps('chrome', false, false), /System Settings/, 'Mac advice only on a Mac');
});

test('a quietly closed question and an extension block each get their own steps', async () => {
  const { quietPromptSteps, extensionBlockSteps } = await import('../src/data/browserRules.ts');
  const quiet = quietPromptSteps('arc', 'https://example.github.io');
  assert.match(quiet, /bell in the address bar/);
  assert.match(quiet, /arc:\/\/settings\/content\/notifications[\s\S]*paste https:\/\/example\.github\.io/);
  assert.doesNotMatch(quietPromptSteps('firefox', 'https://x.io'), /settings\/content/, 'only where such a page exists');
  assert.match(extensionBlockSteps('arc'), /arc:\/\/extensions/);
  assert.match(extensionBlockSteps('arc'), /Pop-up blockers, ad blockers and security extensions/);
});

/*
 * No error in Study Forge may carry an empty message.
 *
 * A thrown Error with no message is reported by the browser as nothing but its class name, and in
 * the built site that name is minified to something like "Ju" — which is how a stray cancelled
 * sign-in appeared in a test log three times before anyone could tell what it was. The messages
 * here are mostly never displayed, because the code checks a flag instead; they exist so that one
 * which does escape says what it was.
 */
const { test: errorTest } = require('node:test');
const assertErrors = require('node:assert/strict');
const fsErrors = require('node:fs');
const pathErrors = require('node:path');

errorTest('no error is constructed with an empty message', () => {
  const dir = pathErrors.join(__dirname, '..', 'src', 'data');
  const offenders = [];
  for (const name of fsErrors.readdirSync(dir).filter((file) => file.endsWith('.ts'))) {
    const text = fsErrors.readFileSync(pathErrors.join(dir, name), 'utf8');
    for (const [line, at] of text.split('\n').map((one, index) => [one, index + 1])) {
      // new SomethingError('') or new SomethingError('', …) — an error that will print as its own
      // minified class name and nothing else.
      if (/new \w*Error\(\s*(''|"")\s*[,)]/.test(line)) offenders.push(`${name}:${at}`);
    }
  }
  assertErrors.deepEqual(offenders, [], 'an error with no message prints as its minified class name and tells nobody anything');
});

errorTest('a promise started early is marked as handled before anything is awaited', () => {
  /*
   * googleConnect asks Google for permission before awaiting anything, because a browser only
   * opens Google's window while it can still see the student's tap. That leaves a gap: if the
   * request fails during the await that follows — which is exactly what closing the Google window
   * does — nothing is listening yet, and the browser reports an uncaught error even though the
   * code below handles it properly.
   *
   * This is the leak that hid behind the unreadable "Ju" in the test logs for two weeks.
   */
  const text = fsErrors.readFileSync(pathErrors.join(__dirname, '..', 'src', 'data', 'googleConnect.ts'), 'utf8');
  const started = text.indexOf('const permission =');
  const guarded = text.indexOf('permission?.catch(');
  const awaited = text.indexOf('await getGoogleConnection()');
  assertErrors.ok(started !== -1 && guarded !== -1 && awaited !== -1, 'the early permission request is still written this way');
  assertErrors.ok(guarded > started && guarded < awaited, 'it is marked as handled between being started and the first await');
});

errorTest('every link that names a setting points at a section that exists and can take focus', () => {
  /*
   * A link into Settings that means one particular setting should land on it, not at the top of a
   * long category — the owner hit this coming from Trash and asked for it everywhere.
   *
   * Checked statically because the failure is silent: rename a section's id and the link still
   * works, it just quietly stops jumping, and nobody notices until they are scrolling a phone
   * looking for the thing they tapped.
   */
  const root = pathErrors.join(__dirname, '..', 'src');
  const files = [];
  const walk = (dir) => {
    for (const entry of fsErrors.readdirSync(dir, { withFileTypes: true })) {
      const full = pathErrors.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.tsx')) files.push(full);
    }
  };
  walk(root);

  const sources = new Map(files.map((file) => [file, fsErrors.readFileSync(file, 'utf8')]));
  const everything = [...sources.values()].join('\n');

  const asked = [];
  for (const [file, text] of sources) {
    for (const match of text.matchAll(/to="\/settings[^"]*\?go=([a-z-]+)"/g)) asked.push({ file: pathErrors.basename(file), id: match[1] });
  }
  assertErrors.ok(asked.length >= 4, `links that name a setting, found ${asked.length}`);

  for (const { file, id } of asked) {
    assertErrors.ok(everything.includes(`id="${id}"`), `${file} asks for "${id}", but no section has that id`);
    const owner = [...sources.values()].find((text) => text.includes(`id="${id}"`));
    assertErrors.match(owner.slice(owner.indexOf(`id="${id}"`), owner.indexOf(`id="${id}"`) + 220), /tabIndex=\{-1\}/,
      `the section "${id}" can take focus, so a keyboard arrives there too`);
  }
});

errorTest('every word a course kind suggests can actually be chosen', () => {
  /*
   * The kind of a course suggests what to call the level below it — a class has chapters, software
   * has lessons, an exam has sections. If a suggestion is missing from the list of choices, the
   * box renders empty and the student sees a blank where a word should be, which looks broken and
   * is easy to miss in review.
   */
  const kinds = fsErrors.readFileSync(pathErrors.join(__dirname, '..', 'src', 'data', 'courseKinds.ts'), 'utf8');
  const page = fsErrors.readFileSync(pathErrors.join(__dirname, '..', 'src', 'features', 'guided', 'StudyPage.tsx'), 'utf8');
  const suggested = [...kinds.matchAll(/levelWord: '([A-Za-z]+)'/g)].map((match) => match[1]);
  const offered = [...page.matchAll(/'([A-Z][a-z]+)'/g)].map((match) => match[1]);
  assertErrors.ok(suggested.length >= 6, `all six kinds suggest a word, found ${suggested.length}`);
  for (const word of suggested) {
    assertErrors.ok(offered.includes(word), `"${word}" is suggested by a course kind, so it must be choosable`);
  }
  assertErrors.ok(kinds.includes("|| 'Lesson'"), 'a course that never said what kind it is keeps the old word');
});

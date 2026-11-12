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

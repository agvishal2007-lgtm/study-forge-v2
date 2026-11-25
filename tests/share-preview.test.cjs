// What a student sees before they ever open Study Forge: the search result, and the link preview
// when somebody pastes it into a group chat.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const head = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const SITE = 'https://agvishal2007-lgtm.github.io/study-forge-v2/';

test('a pasted link shows a real preview rather than a bare address', () => {
  for (const tag of ['og:title', 'og:description', 'og:image', 'og:url', 'og:type']) {
    assert.match(head, new RegExp(`property="${tag}"`), `${tag} is there`);
  }
  assert.match(head, /name="twitter:card" content="summary_large_image"/);
  assert.match(head, new RegExp(`content="${SITE}share-card\\.png"`), 'the picture has a full address, since a preview is fetched from elsewhere');
  assert.match(head, new RegExp(`rel="canonical" href="${SITE}"`));
  assert.match(head, /property="og:image:alt"/, 'the picture is described for anyone who cannot see it');
});

test('the preview picture exists, is the right shape, and is small enough to be fetched', () => {
  const file = path.join(root, 'public', 'share-card.png');
  const bytes = fs.readFileSync(file);
  assert.equal(bytes.subarray(1, 4).toString(), 'PNG', 'it is really a PNG');
  // Width and height live in the PNG header, so the file itself is asked rather than trusted.
  assert.equal(bytes.readUInt32BE(16), 1200, 'width');
  assert.equal(bytes.readUInt32BE(20), 630, 'height');
  assert.ok(bytes.length < 1024 * 1024, `under a megabyte, is ${(bytes.length / 1024).toFixed(0)} KB`);
  assert.match(head, /content="1200"[\s\S]*content="630"/, 'and the page says the same size');
});

test('nothing on the way in claims something Study Forge cannot do', () => {
  const card = fs.readFileSync(path.join(root, 'scripts', 'share-card.cjs'), 'utf8');
  const shown = `${head} ${card}`;
  /*
   * The marketing rules, written down where they are checked rather than only in a document: no
   * invented numbers of students, no reviews or testimonials, no claim that a college is involved,
   * and no promise that AI does the studying. These are the claims that would be hardest to take
   * back once a student had repeated them.
   */
  assert.doesNotMatch(shown, /\b\d[\d,]*\+? (students|users|schools|downloads)\b/i, 'no invented numbers');
  assert.doesNotMatch(shown, /testimonial|five[- ]star|\brated\b|reviews? say|trusted by/i, 'no invented praise');
  assert.doesNotMatch(shown, /TCNJ|College of New Jersey|endorsed|official(ly)? approved/i, 'no college implied');
  assert.doesNotMatch(shown, /AI (writes|does|studies) (your|it)/i, 'no promise that AI does the work');
});

test('the description says what it is, in a length a search result will actually show', () => {
  const description = head.match(/<meta name="description" content="([^"]+)"/)[1];
  assert.ok(description.length > 80, 'long enough to say something');
  assert.ok(description.length <= 320, `short enough not to be cut off, is ${description.length}`);
  for (const real of ['free', 'offline']) assert.match(description.toLowerCase(), new RegExp(real));
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'public', 'manifest.webmanifest'), 'utf8'));
  assert.ok(manifest.description.length > 40, 'the installed app describes itself too');
});

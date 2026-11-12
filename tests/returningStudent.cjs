const fs = require('node:fs');
const path = require('node:path');

/** The current Terms and Privacy version, read from the source so it never drifts from the app. */
const AGREEMENT_VERSION = fs.readFileSync(path.join(__dirname, '..', 'src', 'data', 'agreement.ts'), 'utf8').match(/AGREEMENT_VERSION = '([^']+)'/)[1];

/**
 * These suites test a student using Study Forge, not someone meeting it for the first time. The
 * welcome page takes the place of the dashboard only for a brand-new visitor, so a fresh test
 * profile would land there instead of on the screen under test. This marks the profile as having
 * been here before, and as having agreed to the Terms of Use and Privacy Policy. The welcome page
 * and the agreement are tested in entrance.test.cjs.
 */
module.exports = async function returningStudent(context) {
  await context.addInitScript((version) => {
    try {
      localStorage.setItem('study-forge-seen-welcome', 'yes');
      localStorage.setItem('study-forge-agreed', JSON.stringify({ version, at: '2026-11-12T00:00:00.000Z' }));
    } catch { /* private window */ }
  }, AGREEMENT_VERSION);
};
module.exports.AGREEMENT_VERSION = AGREEMENT_VERSION;

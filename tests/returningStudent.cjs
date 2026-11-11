/**
 * These suites test a student using Study Forge, not someone meeting it for the first time. The
 * welcome page takes the place of the dashboard only for a brand-new visitor, so a fresh test
 * profile would land there instead of on the screen under test. This marks the profile as having
 * been here before. The welcome page itself is tested in entrance.test.cjs.
 */
module.exports = async function returningStudent(context) {
  await context.addInitScript(() => {
    try { localStorage.setItem('study-forge-seen-welcome', 'yes'); } catch { /* private window */ }
  });
};

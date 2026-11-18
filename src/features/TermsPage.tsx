import { Link } from 'react-router-dom';

/** When these terms last changed. Update it whenever the wording changes. */
export const TERMS_UPDATED = '17 November 2026';

/**
 * Terms of Use, in plain language, describing how Study Forge actually works. The owner's own words
 * set the rules; this page should be reviewed by someone qualified before it's relied on legally.
 */
export function TermsPage() {
  return (
    <div className="page legal-page" data-testid="terms">
      <h1>Terms of Use</h1>
      <TermsContent />
      <p><Link to="/privacy">Privacy Policy</Link> · <Link to="/">Go to Today</Link></p>
    </div>
  );
}

/** The terms themselves, shown on their own page and in the agreement window. */
export function TermsContent() {
  return (
    <>
      <p className="muted">Last updated {TERMS_UPDATED}. By using Study Forge you agree to these terms. If you don’t agree, please don’t use it.</p>

      <h2>What Study Forge is</h2>
      <p>Study Forge is a free study website for organizing courses, files, lectures, notes and study sessions. It’s offered as it is, for personal learning. It has no ads, and using it costs nothing.</p>

      <h2>Who can use it</h2>
      <p>You must be old enough to agree to these terms where you live, or have a parent or guardian’s permission. Children under 13 can’t create a Study Forge account. If your school or another organization gave you an account, its rules apply to you too.</p>
      <p>If you choose Elementary school or Middle school, Study Forge keeps everything on that device: there’s no account, no syncing, and the Google and Dropbox connections stay switched off. Study Forge never asks anyone’s age, so it can’t check one. That means this is a smaller-footprint way to use Study Forge, not a verified parental-consent system, and a parent or guardian shouldn’t take it as one. Visiting any page still reaches the service that hosts the site.</p>

      <h2>Your account</h2>
      <ul>
        <li>An account is optional. Without one, everything stays on your device.</li>
        <li>Keep your sign-in details private. You’re responsible for what happens under your account.</li>
        <li>You can delete your online copy at any time in Settings.</li>
      </ul>

      <h2>Your work stays yours</h2>
      <p>You own the notes, files, recordings and everything else you add. Study Forge only stores and shows them so you can use them, and doesn’t claim any rights to them. You’re responsible for having the right to add what you add, and for following the rules of the class or lecture you record, including asking permission where it’s needed.</p>

      <h2>Use it honestly</h2>
      <p>Study Forge is for learning. You agree not to use it to cheat or to break your school’s, instructor’s or exam provider’s rules. You’re responsible for knowing and following those rules.</p>
      <ul>
        <li><b>The calculator</b> is a study tool, not an officially approved examination calculator. Its look or features being like a familiar handheld calculator doesn’t make it allowed in any exam. Follow your instructor’s and exam provider’s calculator rules.</li>
        <li><b>Mock exams, practice and flashcards</b> are for practice. They don’t predict your real grades.</li>
        <li><b>Your school years record</b> — your terms, credits and final grades — is only what you type in yourself. Study Forge is not a transcript, a degree audit or any kind of official record, and nothing in it comes from your school. Your school’s own records are the real ones, and they are what counts.</li>
        <li><b>Focus sounds</b> are background sound to study to. They are made by your browser, they aren’t medical or therapeutic, and they don’t claim to improve concentration or any other outcome.</li>
        <li><b>Study Forge is not responsible</b> for how anyone uses it, including any use that breaks an academic-integrity, exam or school rule, such as cheating, or the consequences of that use.</li>
      </ul>

      <h2>Don’t misuse it</h2>
      <p>Don’t use Study Forge to break the law, to share things you don’t have the right to share, to harm other people, or to try to get into anyone else’s account or work. Don’t try to break, overload or get around how the site works.</p>

      <h2>Your data and other services</h2>
      <p>How your information is kept is explained in the <Link to="/privacy">Privacy Policy</Link>. Signing in, syncing and some features use services from other companies, such as Google (including Firebase, Google Drive and Google Calendar), Microsoft and Yahoo. Their own terms apply when you use them.</p>

      <h2>Keep your own backups</h2>
      <p>Study Forge works hard to keep your work safe, and checks saves before calling them saved, but nothing is perfect. Files on a device can be lost if the device or browser data is lost. Make backups of anything important (Settings, then Backup).</p>

      <h2>No guarantees</h2>
      <p>Study Forge is provided “as is” and “as available”, without any promise that it will always work, be free of mistakes, or suit a particular purpose. Answers from the calculator, transcripts, text read from pictures and other results can be wrong. Check anything important.</p>

      <h2>Limits on responsibility</h2>
      <p>As far as the law allows, Study Forge and the people who run it are not responsible for any loss or harm that comes from using it or not being able to use it, including lost work, lost grades, or academic or disciplinary consequences. Some places don’t allow some of these limits, so they apply only as far as the law where you live allows.</p>

      <h2>Changes</h2>
      <p>Study Forge may change, add or remove features, and may update these terms. When the terms change, the date at the top changes too. Using Study Forge after that means you accept the new terms. Study Forge may stop offering the service, and will try to give notice so you can download your work.</p>
    </>
  );
}

import { Link, useNavigate } from 'react-router-dom';
import { markWelcomeSeen } from '../data/firstVisit';

/** Everything here is something Study Forge actually does today. No promises about what is coming. */
const PROMISES = [
  {
    title: 'Free, and no account needed',
    body: 'Open it and start. An account is optional — it only exists to carry your work between your own devices.',
  },
  {
    title: 'Your files stay yours',
    body: 'Uploads, lecture recordings and transcripts are saved on your device, and copied only to your own Google Drive if you turn on sync. Study Forge never keeps them.',
  },
  {
    title: 'Works without internet',
    body: 'Once it has loaded, Study Forge keeps working offline — your files, notes and flashcards included.',
  },
];

const FEATURES = [
  { title: 'Courses and topics', body: 'Your semester, your structure. Chapters, weeks or units — whatever you call them.' },
  { title: 'A library that takes anything', body: 'Files of any kind, plus links to Canvas, Google Docs, journals and ordinary web pages. A link is kept as a link, never pretended to be a copy.' },
  { title: 'Planner and calendar', body: 'Deadlines with what they are worth, class schedules read from a photo, and your Google Calendar brought in if you want it.' },
  { title: 'Flashcards and practice', body: 'Spaced repetition on a 1, 5, 10 and 15 day schedule, question sets, and weak topics worked out from your own answers.' },
  { title: 'Exam Hall', body: 'Timed mock exams and a cram mode, scored from the work you saved — never a made-up readiness percentage.' },
  { title: 'Guided Study', body: 'Lessons you write yourself, with checkpoints that only count once you can actually answer them.' },
  { title: 'Lecture recording', body: 'Record a lecture in person or on screen, with a live transcript made on the device and notes tied to the exact moment.' },
  { title: 'Notes with equations and a calculator', body: 'Notes that save as you type, 50+ kinds of equation, and a scientific or TI-84-style graphing calculator for study.' },
  { title: 'Search that reads inside', body: 'Finds words inside your PDFs, Word, Excel and PowerPoint files, and inside photos and scans.' },
  { title: 'Grades that stay honest', body: 'Your real categories and weights. Work you have not had marked yet is never counted as a zero.' },
];

export function HomePage() {
  const navigate = useNavigate();
  const enter = () => {
    // Choosing to go in means this page has done its job; it is at /welcome from now on.
    markWelcomeSeen();
    navigate('/');
  };
  return (
    <div className="home">
      <header className="home-top">
        <span className="home-brand">
          <span className="brand-mark" aria-hidden="true"><i /><i /><i /></span>
          Study Forge
        </span>
        <Link className="button" to="/auth">Log In / Sign Up</Link>
      </header>

      <main id="content" tabIndex={-1}>
        <section className="home-hero">
          <h1>Your whole semester, in one place that is actually yours.</h1>
          <p className="home-lead">
            Courses, files, deadlines, flashcards and lectures — free, on your own device, and working
            whether or not you sign in or have internet.
          </p>
          <p className="home-actions">
            <button className="button primary" onClick={enter}>Start using it</button>
            <Link className="button" to="/auth">Log In / Sign Up</Link>
          </p>
          <p className="muted home-note">No account required. Nothing to pay for. Nothing to install.</p>
        </section>

        <section className="home-promises" aria-label="What Study Forge is">
          {PROMISES.map((promise) => (
            <article key={promise.title}>
              <h2>{promise.title}</h2>
              <p>{promise.body}</p>
            </article>
          ))}
        </section>

        <section className="home-features" aria-labelledby="features-title">
          <h2 id="features-title">What is in it</h2>
          <ul>
            {FEATURES.map((feature) => (
              <li key={feature.title}>
                <h3>{feature.title}</h3>
                <p>{feature.body}</p>
              </li>
            ))}
          </ul>
        </section>

        <section className="home-account" aria-labelledby="account-title">
          <h2 id="account-title">What an account changes</h2>
          <p>
            Signing in carries your written work — courses, notes, lessons, deadlines, flashcards,
            practice and results — between your own devices. Your files, recordings and transcripts
            stay on the device they are on, and are not part of it.
          </p>
          <p className="home-actions">
            <button className="button primary" onClick={enter}>Start using it</button>
            <Link className="button" to="/auth">Log In / Sign Up</Link>
          </p>
        </section>
      </main>

      <footer className="home-foot">
        <Link to="/privacy">Privacy Policy</Link>
        <Link to="/terms">Terms of Use</Link>
        <Link to="/help">Academy</Link>
        <span className="muted">Built for students. No adverts, no tracking, no selling anything.</span>
      </footer>
    </div>
  );
}

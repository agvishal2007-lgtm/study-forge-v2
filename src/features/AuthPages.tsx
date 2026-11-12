import { useEffect, useState, type ReactNode } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import { getActiveAccount, switchAccount } from '../data/account';
import type { AccountBackend, AccountUser, LoginProvider } from '../data/accountBackend';
import { describeAuthFailure, looksLikeEmail, signUpProblems } from '../data/authMessages';
import { forgetKnownAccounts, listKnownAccounts, rememberAccount } from '../data/knownAccounts';
import { loadBackend } from '../data/sync';

const PROVIDER_LABEL: Record<LoginProvider, string> = { google: 'Google', microsoft: 'Microsoft', yahoo: 'Yahoo' };

/**
 * The entrance to Study Forge. Signing in is its own page, so none of the student dashboard is
 * here: no section navigation, no account bar, no recording or save controls. A student who
 * landed here by accident can leave again without an account, because accounts stay optional.
 */
export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div className="auth-shell">
      <main className="auth-box" id="content">
        <Link to="/" className="auth-brand">
          <span className="brand-mark" aria-hidden="true"><i /><i /><i /></span>
          Study Forge
        </Link>
        <div className="auth-card">{children}</div>
        <p className="auth-back"><Link to="/">Back to Study Forge</Link></p>
      </main>
    </div>
  );
}

/** Phones block a sign-in window that opens late, so this code is ready before any tap. */
function useBackend() {
  const [backend, setBackend] = useState<AccountBackend | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  useEffect(() => {
    let active = true;
    loadBackend().then(
      (loaded) => { if (active) setBackend(loaded); },
      () => { if (active) setLoadFailed(true); },
    );
    return () => { active = false; };
  }, []);
  return { backend, loadFailed };
}

function finish(user: AccountUser, method: string) {
  rememberAccount(user.email, method);
  // Switching accounts reloads the site, so choose where it lands first.
  window.location.hash = '#/';
  switchAccount({ uid: user.uid, email: user.email, photoURL: user.photoURL, usesGoogle: user.usesGoogle });
}

/**
 * One way in. The homepage has a single Log In / Sign Up button that lands here, and the two tabs
 * each have their own address (/login and /signup) so a direct link opens the right one.
 */
export function AuthTabsPage({ mode }: { mode: 'sign-in' | 'sign-up' }) {
  return (
    <>
      <nav className="auth-tabs" aria-label="Log in or sign up">
        <Link to="/login" className="auth-tab" aria-current={mode === 'sign-in' ? 'page' : undefined}>Log In</Link>
        <Link to="/signup" className="auth-tab" aria-current={mode === 'sign-up' ? 'page' : undefined}>Sign Up</Link>
      </nav>
      <AuthPage mode={mode} />
    </>
  );
}

export function AuthPage({ mode }: { mode: 'sign-in' | 'sign-up' }) {
  const signingUp = mode === 'sign-up';
  const { backend, loadFailed } = useBackend();
  const [params] = useSearchParams();
  const [email, setEmail] = useState(params.get('email') ?? '');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problems, setProblems] = useState<string[]>([]);

  useEffect(() => { setProblems([]); setPassword(''); setConfirm(''); }, [mode]);
  if (getActiveAccount()) return <Navigate to="/" replace />;

  const fail = (error: unknown, provider?: string) => {
    const message = describeAuthFailure(error, provider);
    setProblems(message ? [message] : []);
    setBusy(false);
  };

  const withProvider = (provider: LoginProvider) => {
    if (!backend) return;
    setBusy(true);
    setProblems([]);
    // Nothing is awaited before this call, so the window opens as part of the tap itself.
    backend.signIn(provider).then((user) => finish(user, PROVIDER_LABEL[provider]), (error) => fail(error, PROVIDER_LABEL[provider]));
  };

  const withEmail = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!backend) return;
    const found = signingUp ? signUpProblems(email, password, confirm) : [
      ...(looksLikeEmail(email) ? [] : ['Enter your email address.']),
      ...(password ? [] : ['Enter your password.']),
    ];
    setProblems(found);
    if (found.length > 0) return;
    setBusy(true);
    try {
      const user = signingUp ? await backend.signUpWithEmail(email.trim(), password) : await backend.signInWithEmail(email.trim(), password);
      finish(user, 'email and password');
    } catch (error) {
      fail(error);
    }
  };

  return (
    <div className="page auth-page">
      <h1>{signingUp ? 'Create your account' : 'Sign in'}</h1>
      <p className="muted">{signingUp ? 'Your courses, notes, and study progress then follow you between devices.' : 'Welcome back.'} An account is optional. Files and recordings stay on your device unless you choose to sync them through your Google Drive.</p>
      {loadFailed && <p className="error" role="alert">Sign-in couldn't load. Check your internet connection, then reload this page.</p>}
      <div className="auth-providers">
        {(backend?.providers ?? ['google' as LoginProvider]).map((provider) => (
          <button key={provider} className="button" disabled={!backend || busy} onClick={() => withProvider(provider)}>Continue with {PROVIDER_LABEL[provider]}</button>
        ))}
      </div>
      <p className="auth-divider"><span>or use your email</span></p>
      <form className="card-form" onSubmit={(event) => void withEmail(event)} noValidate>
        <label>Email<input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} /></label>
        <label>Password
          <input aria-label="Password" type={show ? 'text' : 'password'} autoComplete={signingUp ? 'new-password' : 'current-password'} value={password} onChange={(event) => setPassword(event.target.value)} />
        </label>
        {signingUp && (
          <label>Type the password again
            <input aria-label="Type the password again" type={show ? 'text' : 'password'} autoComplete="new-password" value={confirm} onChange={(event) => setConfirm(event.target.value)} />
          </label>
        )}
        <label className="auth-show"><input type="checkbox" checked={show} onChange={(event) => setShow(event.target.checked)} /> <span>Show password</span></label>
        {problems.length > 0 && <div className="error-box" role="alert" data-testid="auth-problems"><ul>{problems.map((problem) => <li key={problem}>{problem}</li>)}</ul></div>}
        <div className="session-actions">
          <button className="button primary" type="submit" disabled={!backend || busy}>{busy ? 'One moment…' : signingUp ? 'Create account' : 'Sign in'}</button>
        </div>
      </form>
      <ul className="auth-links">
        {signingUp
          ? <li>Already have an account? <Link to="/login">Log in</Link></li>
          : <li>New here? <Link to="/signup">Create an account</Link></li>}
        <li><Link to="/forgot-password">Forgot your password?</Link></li>
        <li><Link to="/account-recovery">Forgot which email you used?</Link></li>
        <li><Link to="/privacy">Privacy</Link></li>
      </ul>
    </div>
  );
}

export function ForgotPasswordPage() {
  const { backend } = useBackend();
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [problem, setProblem] = useState('');

  const send = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!backend) return;
    if (!looksLikeEmail(email)) {
      setProblem('Enter your email address.');
      return;
    }
    setBusy(true);
    setProblem('');
    try {
      await backend.sendPasswordReset(email.trim());
      setSent(true);
    } catch (error) {
      setProblem(describeAuthFailure(error));
    } finally {
      setBusy(false);
    }
  };

  if (sent) {
    return (
      <div className="page auth-page">
        <h1>Check your email</h1>
        <p role="status" data-testid="reset-sent">If there's an account for {email.trim()}, a link to choose a new password is on its way. It can take a few minutes, so check your spam folder too.</p>
        <p className="muted">If you signed up with Google, Microsoft or Yahoo, use that button to sign in instead.</p>
        <p><Link className="button primary" to="/sign-in">Back to sign in</Link></p>
      </div>
    );
  }
  return (
    <div className="page auth-page">
      <h1>Reset your password</h1>
      <p className="muted">Enter your email, and we'll send a link to choose a new password.</p>
      <form className="card-form" onSubmit={(event) => void send(event)} noValidate>
        <label>Email<input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} /></label>
        {problem && <p className="error" role="alert">{problem}</p>}
        <div className="session-actions"><button className="button primary" type="submit" disabled={!backend || busy}>Send reset link</button></div>
      </form>
      <ul className="auth-links">
        <li><Link to="/login">Back to log in</Link></li>
        <li><Link to="/account-recovery">Forgot which email you used?</Link></li>
      </ul>
    </div>
  );
}

export function ForgotEmailPage() {
  const [known, setKnown] = useState(listKnownAccounts);
  return (
    <div className="page auth-page">
      <h1>Find your email</h1>
      <p className="muted">Study Forge can't look up an account by name or phone, because that would let anyone find out who has an account. These can help you remember:</p>
      <section aria-labelledby="known-heading">
        <h2 id="known-heading">Used in this browser</h2>
        {known.length > 0
          ? (
            <>
              <ul className="planner-list" data-testid="known-accounts">
                {known.map((entry) => <li className="planner-row" key={entry.hint}><div className="planner-main"><strong>{entry.hint}</strong><span className="muted file-meta">Signed in with {entry.method}</span></div></li>)}
              </ul>
              <p><button className="text-button" onClick={() => { forgetKnownAccounts(); setKnown([]); }}>Remove these hints from this browser</button></p>
            </>
          )
          : <p className="muted">No accounts have been used in this browser. Try the device you usually use.</p>}
      </section>
      <section aria-labelledby="tips-heading">
        <h2 id="tips-heading">Other places to look</h2>
        <ul className="plain-list">
          <li>Try your school email and your personal email.</li>
          <li>Search each inbox for "Study Forge". We sent a confirmation email when you signed up with an email and password.</li>
          <li>Check your browser's or phone's saved passwords for this site.</li>
          <li>If you used Google, Microsoft or Yahoo, you don't need to remember an email. Just use that button.</li>
        </ul>
      </section>
      <p><Link className="button primary" to="/sign-in">Back to sign in</Link></p>
    </div>
  );
}

export function PrivacyPage() {
  return (
    <div className="page auth-page" data-testid="privacy">
      <h1>Privacy</h1>
      <p className="muted">What Study Forge keeps, where it's kept, and how to remove it.</p>
      <h2>Without an account</h2>
      <p>Everything stays in your browser on your device. Nothing is sent to Study Forge.</p>
      <h2>With an account</h2>
      <ul className="plain-list">
        <li>Your email address, plus your name and picture if you sign in with Google, Microsoft or Yahoo, are used to sign you in.</li>
        <li>The text you create is saved online so it can follow you: courses, topics, notes, lessons, planner items, calendar items, flashcards, practice questions, and your progress.</li>
        <li>Files and recordings aren't saved online. They stay on your device.</li>
        <li>This is stored in Google's Firebase service. Other students can't read it, but whoever runs this site could technically view it, so don't save anything you wouldn't want seen.</li>
      </ul>
      <h2>Files from Google Drive or Dropbox</h2>
      <p>Study Forge only gets the files you pick. They're copied to your device, and aren't saved online by Study Forge. Screens where you add files load a small piece of code from those services, so the button is ready when you tap it.</p>
      <h2>Pictures of your schedule</h2>
      <p>A picture of your schedule is read on your device and isn't uploaded or saved. Only the classes you choose to save are kept.</p>
      <h2>Google Calendar</h2>
      <p>If you connect Google Calendar, Study Forge can only read it, and never adds, changes, or deletes anything there. It reads your main calendar and school calendars, or the ones you choose, when you connect it, press Get the latest, or open Calendar shortly after that. Items you keep are saved in Study Forge. With an account, they're also saved online with the rest of your text, and Delete my online copy removes them. Google's permission is kept only while the page is open. You can disconnect in Calendar, or remove Study Forge in your Google account settings.</p>
      <h2>Advertising and selling data</h2>
      <p>Study Forge has no ads and doesn't sell your information.</p>
      <h2>Removing your data</h2>
      <p>While signed in, open Settings and use Delete my online copy in the Account section. That also covers anything from signing in with Microsoft or Google. To stop those companies sharing your details, remove Study Forge in your account settings with them.</p>
      <p><Link to="/">Go to Today</Link></p>
    </div>
  );
}

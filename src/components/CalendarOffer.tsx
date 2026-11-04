import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { getActiveAccount } from '../data/account';
import { getGoogleConnection } from '../data/calendar';
import { CalendarError, prepareGoogle } from '../data/googleCalendar';
import { connectWithGuesses, reportWords, skipOffer, wasOfferSkipped } from '../data/googleConnect';
import { useLive } from '../data/useLive';

/** After signing in with Google, offers that same account's calendar in one tap. */
export function CalendarOffer() {
  const account = getActiveAccount();
  const { pathname } = useLocation();
  const { data } = useLive(async () => ({ connection: await getGoogleConnection(), skipped: await wasOfferSkipped() }), []);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  const [message, setMessage] = useState('');
  const offering = Boolean(account?.usesGoogle && data && !data.connection && !data.skipped);

  useEffect(() => {
    if (!offering) return;
    let active = true;
    prepareGoogle().then(() => { if (active) setReady(true); }, () => undefined);
    return () => { active = false; };
  }, [offering]);

  if (message) {
    return (
      <p className="site-notice calendar-offer" role="status" data-testid="calendar-offer-done">
        <span>Google Calendar is connected. {message} <Link to="/calendar?view=plan">See your calendar</Link> or <Link to="/calendar/google">change what comes in</Link>.</span>
        <button className="text-button" onClick={() => setMessage('')}>Dismiss</button>
      </p>
    );
  }
  if (!offering || !account || pathname === '/calendar/google') return null;

  const connect = () => {
    setBusy(true);
    setProblem('');
    // Nothing is awaited before this call, so Google's window opens as part of the tap itself.
    connectWithGuesses(account.email).then(
      (report) => setMessage(reportWords(report)),
      (error: unknown) => {
        if (error instanceof CalendarError && error.cancelled) return;
        setProblem(error instanceof CalendarError ? error.message : `Google Calendar wasn't connected. ${(error as Error).message}`);
      },
    ).finally(() => setBusy(false));
  };

  return (
    <div className="site-notice calendar-offer" role="region" aria-label="Connect Google Calendar" data-testid="calendar-offer">
      <span>Bring in your classes and Canvas work from the Google Calendar for {account.email}? Study Forge can only read it, never change it. Google may warn that it hasn't verified Study Forge yet.</span>
      <span className="calendar-offer-actions">
        <button className="button primary" onClick={connect} disabled={busy || !ready}>{busy ? 'Connecting…' : 'Connect Google Calendar'}</button>
        <button className="text-button" onClick={() => { void skipOffer(); }}>Not now</button>
      </span>
      {problem && <span className="error" role="alert" data-testid="calendar-offer-problem">{problem}</span>}
    </div>
  );
}

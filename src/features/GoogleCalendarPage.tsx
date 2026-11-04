import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { getActiveAccount } from '../data/account';
import { applyGoogleItems, choiceFor, clearGoogleConnection, courseForCode, getGoogleConnection, saveGoogleConnection, type CalendarChoice, type GoogleConnection, type GoogleReport } from '../data/calendar';
import { cleanTitle, courseTokenIn, fromCanvas, type Destination, type GoogleItem } from '../data/calendarRules';
import { askGoogle, CalendarError, forgetGoogle, googleWindow, hasGoogleAccess, listGoogleCalendars, prepareGoogle, readGoogleItems, type GoogleCalendarInfo } from '../data/googleCalendar';
import { formatTime } from '../data/calendarRules';
import { localNow } from '../data/plannerRules';
import { listCourses } from '../data/store';
import { useLive } from '../data/useLive';

const DESTINATIONS: { value: Destination; label: string }[] = [
  { value: 'Class', label: 'Class' },
  { value: 'Deadline', label: 'Deadline (goes in Planner)' },
  { value: 'Appointment', label: 'Appointment' },
  { value: 'Event', label: 'Event' },
  { value: 'No classes', label: 'No classes' },
  { value: 'Skip', label: "Don't bring in" },
];
const NEW_COURSE = 'new:';

interface Row {
  seriesKey: string;
  title: string;
  calendar: string;
  count: number;
  next: string;
  repeats: boolean;
  destination: Destination;
  course: string;
}

const dayWords = (date: string) => {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
};

const reportWords = (report: GoogleReport) => {
  const parts = [
    report.added > 0 && `${report.added} added to your calendar`,
    report.updated > 0 && `${report.updated} updated`,
    report.removed > 0 && `${report.removed} removed because they're gone from Google or were left out`,
    report.deadlinesAdded > 0 && `${report.deadlinesAdded} ${report.deadlinesAdded === 1 ? 'deadline' : 'deadlines'} added to your Planner`,
    report.deadlinesUpdated > 0 && `${report.deadlinesUpdated} ${report.deadlinesUpdated === 1 ? 'deadline' : 'deadlines'} updated`,
  ].filter(Boolean);
  return parts.length > 0 ? `Done: ${parts.join(', ')}.` : 'Everything is already up to date.';
};

export function GoogleCalendarPage() {
  const { data: courses } = useLive(listCourses);
  const { data: connection, error: loadError } = useLive(getGoogleConnection, []);
  const [step, setStep] = useState<'idle' | 'calendars' | 'review'>('idle');
  const [calendars, setCalendars] = useState<GoogleCalendarInfo[]>([]);
  const [picked, setPicked] = useState<string[]>([]);
  const [items, setItems] = useState<GoogleItem[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  const [message, setMessage] = useState('');
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const today = localNow().date;

  const [googleReady, setGoogleReady] = useState(false);
  useEffect(() => {
    let active = true;
    prepareGoogle().then(() => { if (active) setGoogleReady(true); }, (error: Error) => { if (active) setProblem(error.message); });
    return () => { active = false; };
  }, []);

  const failed = (error: unknown) => {
    if (error instanceof CalendarError && error.cancelled) return;
    setProblem(error instanceof CalendarError ? error.message : `Something went wrong. ${(error as Error).message}`);
  };

  const start = (then: () => Promise<void>) => {
    setBusy(true);
    setProblem('');
    setMessage('');
    // Nothing is awaited before this call, so Google's window opens as part of the tap itself.
    askGoogle(getActiveAccount()?.email).then(then).catch(failed).finally(() => setBusy(false));
  };

  const connect = () => start(async () => {
    const found = await listGoogleCalendars();
    setCalendars(found);
    const saved = connection?.calendars.map((calendar) => calendar.id);
    setPicked(saved ?? found.filter((calendar) => calendar.primary || /canvas/i.test(calendar.name)).map((calendar) => calendar.id));
    setStep('calendars');
  });

  const review = async () => {
    if (picked.length === 0) {
      setProblem('Choose at least one calendar.');
      return;
    }
    setBusy(true);
    setProblem('');
    try {
      const chosen = calendars.filter((calendar) => picked.includes(calendar.id)).map(({ id, name }) => ({ id, name }));
      const found = await readGoogleItems(chosen, today);
      const known = courses ?? [];
      const groups = new Map<string, Row>();
      for (const item of found) {
        if (item.cancelled || !item.date) continue;
        const choice = choiceFor(item, connection?.choices ?? {}, known);
        // Old one-time items don't need a decision, since older deadlines aren't brought in.
        if (item.date < today && !item.repeats && choice.destination === 'Deadline') continue;
        const group = groups.get(item.seriesKey);
        if (group) {
          group.count += 1;
          if (item.date >= today && (group.next < today || item.date < group.next)) group.next = item.date;
        } else {
          const token = courseTokenIn(item.title);
          groups.set(item.seriesKey, {
            seriesKey: item.seriesKey,
            title: cleanTitle(item.title),
            calendar: item.calendarName,
            count: 1,
            next: item.date,
            repeats: item.repeats,
            destination: choice.destination,
            course: choice.courseId ?? (token ? `${NEW_COURSE}${token}` : ''),
          });
        }
      }
      setItems(found);
      setRows([...groups.values()].sort((a, b) => a.next.localeCompare(b.next)));
      setStep('review');
    } catch (error) {
      failed(error);
    } finally {
      setBusy(false);
    }
  };

  const bringIn = async () => {
    setBusy(true);
    setProblem('');
    try {
      const choices: Record<string, CalendarChoice> = { ...(connection?.choices ?? {}) };
      for (const row of rows) {
        let courseId: string | null = row.course || null;
        if (row.course.startsWith(NEW_COURSE)) {
          const code = row.course.slice(NEW_COURSE.length);
          courseId = row.destination === 'Skip' ? null : (await courseForCode(code, code)).id;
        }
        choices[row.seriesKey] = { destination: row.destination, courseId };
      }
      const chosen = calendars.filter((calendar) => picked.includes(calendar.id)).map(({ id, name }) => ({ id, name }));
      const report = await applyGoogleItems(items, choices, googleWindow(today), today, chosen.map((calendar) => calendar.id));
      const next: GoogleConnection = { calendars: chosen, lastSync: Date.now(), choices };
      await saveGoogleConnection(next);
      setMessage(reportWords(report));
      setStep('idle');
    } catch (error) {
      failed(error);
    } finally {
      setBusy(false);
    }
  };

  const update = () => start(async () => {
    if (!connection) return;
    const found = await readGoogleItems(connection.calendars, today);
    const report = await applyGoogleItems(found, connection.choices, googleWindow(today), today, connection.calendars.map((calendar) => calendar.id));
    await saveGoogleConnection({ ...connection, lastSync: Date.now() });
    setMessage(reportWords(report));
  });

  const lastSync = useMemo(() => (connection?.lastSync ? new Date(connection.lastSync).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : ''), [connection]);

  if (loadError) return <div className="page"><h1>Google Calendar</h1><p className="error" role="alert">This couldn't be loaded. {loadError.message}</p></div>;

  return (
    <div className="page google-page">
      <h1>Google Calendar</h1>
      {problem && <p className="error" role="alert" data-testid="google-problem">{problem}</p>}
      {message && <p className="notice" role="status" data-testid="google-message">{message} <Link to="/calendar?view=plan">See Plan Calendar</Link></p>}

      {step === 'idle' && !connection && (
        <div data-testid="google-start">
          <p>Bring your classes and appointments into Study Forge. Study Forge can only read your calendar, and never changes anything in Google Calendar.</p>
          <div className="notice">
            <p><strong>To get your Canvas work too:</strong> first add Canvas to Google Calendar. In Canvas, open Calendar, then Calendar Feed, and copy the link. In Google Calendar on a computer, next to Other calendars, press +, then From URL, and paste it.</p>
            <p><strong>Google may warn you:</strong> Study Forge is waiting on Google's review, so you may see "Google hasn't verified this app." To continue, choose Advanced, then Go to Study Forge. Some school accounts block this, so a personal account may work better.</p>
          </div>
          <div className="session-actions">
            <button className="button primary" onClick={connect} disabled={busy || !googleReady}>Connect Google Calendar</button>
            <Link to="/calendar">Back to Calendar</Link>
          </div>
        </div>
      )}

      {step === 'idle' && connection && (
        <div data-testid="google-connected">
          <p>Reading: {connection.calendars.map((calendar) => calendar.name).join(', ')}.</p>
          {lastSync && <p className="muted" data-testid="google-last">Last updated {lastSync}.</p>}
          <p className="muted">New items come in when you press Get the latest, using the same choices as before.{hasGoogleAccess() ? '' : ' Google may ask you to confirm first.'}</p>
          <div className="session-actions">
            <button className="button primary" onClick={update} disabled={busy || !googleReady}>{busy ? 'Working…' : 'Get the latest'}</button>
            <button className="button" onClick={connect} disabled={busy || !googleReady}>Change calendars or choices</button>
            <button className="text-button danger-text" onClick={() => setConfirmDisconnect(true)}>Disconnect</button>
            <Link to="/calendar">Back to Calendar</Link>
          </div>
        </div>
      )}

      {step === 'calendars' && (
        <section aria-label="Choose calendars" data-testid="google-calendars">
          <h2>Which calendars should come in?</h2>
          <p className="muted">Choose your school calendars and Canvas. You'll check the items next, before anything saves.</p>
          <ul className="pick-list">
            {calendars.map((calendar) => (
              <li key={calendar.id}>
                <label className="check-row">
                  <input type="checkbox" checked={picked.includes(calendar.id)} onChange={(event) => setPicked(event.target.checked ? [...picked, calendar.id] : picked.filter((id) => id !== calendar.id))} />
                  {' '}{calendar.name}{fromCanvas({ title: '', calendarName: calendar.name }) && <span className="muted"> (Canvas)</span>}
                </label>
              </li>
            ))}
          </ul>
          <div className="session-actions">
            <button className="button primary" onClick={() => { void review(); }} disabled={busy}>{busy ? 'Reading…' : 'Next'}</button>
            <button className="button" onClick={() => setStep('idle')}>Cancel</button>
          </div>
        </section>
      )}

      {step === 'review' && (
        <section aria-label="Check what comes in" data-testid="google-review">
          <h2>Check what comes in</h2>
          <p className="muted">These are first guesses, so change anything that's wrong. Repeating events show once. Your choices are used again for later updates.</p>
          {rows.length === 0 && <p className="notice">Nothing was found on these calendars for the next 8 months.</p>}
          {rows.length > 0 && (
            <ul className="google-rows">
              {rows.map((row) => {
                const token = row.course.startsWith(NEW_COURSE) ? row.course.slice(NEW_COURSE.length) : '';
                return (
                  <li key={row.seriesKey} className="google-row" data-testid="google-row">
                    <div className="google-what">
                      <b>{row.title}</b>
                      <span className="muted">{row.calendar}. {row.count > 1 ? `${row.count} ${row.repeats ? 'meetings' : 'days'}, ${row.repeats ? 'next ' : 'from '}${dayWords(row.next)}` : dayWords(row.next)}{items.find((item) => item.seriesKey === row.seriesKey && item.startTime) ? `, ${formatTime(items.find((item) => item.seriesKey === row.seriesKey && item.startTime)?.startTime ?? '')}` : ''}</span>
                    </div>
                    <label>Goes to
                      <select aria-label={`Where ${row.title} goes`} value={row.destination} onChange={(event) => setRows((current) => current.map((entry) => (entry.seriesKey === row.seriesKey ? { ...entry, destination: event.target.value as Destination } : entry)))}>
                        {DESTINATIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                      </select>
                    </label>
                    <label>Course
                      <select aria-label={`Course for ${row.title}`} value={row.course} onChange={(event) => setRows((current) => current.map((entry) => (entry.seriesKey === row.seriesKey ? { ...entry, course: event.target.value } : entry)))}>
                        <option value="">No course</option>
                        {token && <option value={row.course}>Add new course: {token}</option>}
                        {courses?.map((course) => <option key={course.id} value={course.id}>{course.name}</option>)}
                      </select>
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
          <div className="session-actions">
            <button className="button primary" onClick={() => { void bringIn(); }} disabled={busy}>{busy ? 'Saving…' : 'Bring these in'}</button>
            <button className="button" onClick={() => setStep('calendars')}>Back</button>
          </div>
        </section>
      )}

      {confirmDisconnect && (
        <ConfirmDialog
          title="Disconnect Google Calendar?"
          confirmLabel="Disconnect"
          onCancel={() => setConfirmDisconnect(false)}
          onConfirm={async () => {
            setConfirmDisconnect(false);
            forgetGoogle();
            await clearGoogleConnection(false);
            setMessage('');
          }}
        >
          <p>Items already brought in stay, and you can delete them one at a time. Nothing changes in Google Calendar.</p>
        </ConfirmDialog>
      )}
    </div>
  );
}

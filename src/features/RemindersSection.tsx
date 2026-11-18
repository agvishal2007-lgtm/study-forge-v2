import { useState } from 'react';
import {
  REPEATS, REPEAT_LABEL, createReminder, deleteReminder, describeNext, getQuietHours,
  listReminders, saveQuietHours, saveReminder, stamp, type Reminder, type Repeat,
} from '../data/reminders';
import { useLive } from '../data/useLive';

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/**
 * Reminders, and the quiet hours that hold them back.
 *
 * The honest limit is said plainly rather than worked around: a website can't be relied on to
 * reach a student while it is closed, so a reminder is a dependable prompt the next time Study
 * Forge is opened, and nothing is worded as an alarm.
 */
export function RemindersSection() {
  const [text, setText] = useState('');
  const [at, setAt] = useState(() => stamp(new Date(Date.now() + 60 * 60 * 1000)).slice(0, 16));
  const [repeat, setRepeat] = useState<Repeat>('once');
  const [fromTime, setFromTime] = useState('09:00');
  const [toTime, setToTime] = useState('17:00');
  const [problem, setProblem] = useState('');
  const { data, error } = useLive(async () => ({ reminders: await listReminders(), quiet: await getQuietHours() }));

  if (error) return <section><h2>Reminders</h2><p className="error" role="alert">These couldn't be loaded. {error.message}</p></section>;
  if (!data) return <section><h2>Reminders</h2><p className="muted">Loading…</p></section>;
  const { reminders, quiet } = data;
  const now = new Date();

  const add = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!text.trim()) { setProblem('Say what the reminder should say.'); return; }
    if (repeat === 'hourly' && toTime <= fromTime) { setProblem('The window has to end after it starts.'); return; }
    try {
      await createReminder({ text, at, repeat, fromTime, toTime });
      setText('');
      setProblem('');
    } catch (failure) {
      setProblem(`That wasn't saved. ${(failure as Error).message}`);
    }
  };

  const toggleDay = async (day: number) => {
    const days = quiet.days.includes(day) ? quiet.days.filter((one) => one !== day) : [...quiet.days, day].sort();
    await saveQuietHours({ ...quiet, days });
  };

  return (
    <section aria-labelledby="reminders-heading" data-testid="reminders-section">
      <h2 id="reminders-heading">Reminders</h2>
      <p className="muted">
        Something you want to be reminded of. Study Forge shows a reminder when it next comes due while
        you have it open, including anything that came due while it was closed.
      </p>
      <p className="muted small" data-testid="reminder-limit">
        <strong>What this can't do:</strong> a website can't be relied on to reach you when it isn't
        open, so these aren't alarms and won't wake your phone. For anything you must not miss, also
        put it in your phone's own clock or calendar.
      </p>

      <form className="reminder-form" onSubmit={add}>
        <label>Remind me to<input value={text} placeholder="Start the accounting homework" onChange={(event) => setText(event.target.value)} /></label>
        <label>When<input type="datetime-local" value={at} onChange={(event) => setAt(event.target.value)} data-testid="reminder-at" /></label>
        <label>How often
          <select value={repeat} onChange={(event) => setRepeat(event.target.value as Repeat)} data-testid="reminder-repeat">
            {REPEATS.map((option) => <option key={option} value={option}>{REPEAT_LABEL[option]}</option>)}
          </select>
        </label>
        {repeat === 'hourly' && (
          <div className="field-row">
            <label>Between<input type="time" value={fromTime} onChange={(event) => setFromTime(event.target.value)} /></label>
            <label>And<input type="time" value={toTime} onChange={(event) => setToTime(event.target.value)} /></label>
          </div>
        )}
        {problem && <p className="error" role="alert">{problem}</p>}
        <button className="button primary" type="submit">Add reminder</button>
      </form>

      {reminders.length === 0
        ? <p className="muted small" data-testid="no-reminders">No reminders yet.</p>
        : (
          <ul className="plain-list reminder-list" data-testid="reminder-list">
            {reminders.map((reminder: Reminder) => (
              <li key={reminder.id} className="reminder-row" data-testid="reminder-row">
                <span>
                  <b>{reminder.text}</b>
                  <span className="muted small"> · {REPEAT_LABEL[reminder.repeat]} · {describeNext(reminder, now)}</span>
                </span>
                <span className="row-actions">
                  <button className="button" onClick={() => void saveReminder({ ...reminder, paused: !reminder.paused })}>
                    {reminder.paused ? 'Resume' : 'Pause'}
                  </button>
                  <button className="text-button danger-text" onClick={() => void deleteReminder(reminder.id)} aria-label={`Delete reminder ${reminder.text}`}>Delete</button>
                </span>
              </li>
            ))}
          </ul>
        )}

      <div className="pref-row">
        <h3 id="quiet-heading">Quiet hours</h3>
        <label className="choice-pair">
          <input type="checkbox" checked={quiet.on} data-testid="quiet-on" onChange={(event) => void saveQuietHours({ ...quiet, on: event.target.checked })} />
          Hold reminders back during these hours
        </label>
        {quiet.on && (
          <>
            <div className="field-row">
              <label>From<input type="time" value={quiet.start} data-testid="quiet-start" onChange={(event) => void saveQuietHours({ ...quiet, start: event.target.value })} /></label>
              <label>Until<input type="time" value={quiet.end} data-testid="quiet-end" onChange={(event) => void saveQuietHours({ ...quiet, end: event.target.value })} /></label>
            </div>
            <fieldset className="quiet-days">
              <legend className="muted small">On these days</legend>
              {DAY_NAMES.map((name, day) => (
                <label key={name} className="choice-pair">
                  <input type="checkbox" checked={quiet.days.includes(day)} onChange={() => void toggleDay(day)} aria-label={name} />
                  {name}
                </label>
              ))}
            </fieldset>
            <p className="muted small" data-testid="quiet-explains">
              A reminder that comes due in quiet hours isn't skipped or lost: it waits and appears once
              the quiet is over. Hours that run past midnight, like 10pm to 8am, belong to the night
              they started.
            </p>
          </>
        )}
      </div>
    </section>
  );
}

import { useEffect, useState } from 'react';
import { dueNow, getQuietHours, listReminders, markShown, type Reminder } from '../data/reminders';
import { useLive } from '../data/useLive';

/**
 * Reminders that have come due, shown where they can't be missed while Study Forge is open —
 * including any that came due while it was closed, which is the honest shape of what a website
 * can promise. Saying "got it" writes down that this one was shown, so it doesn't return for the
 * same moment, and a repeating one still comes back at its next.
 */
export function DueReminders() {
  const [tick, setTick] = useState(0);
  // Checked on a timer as well as on load, so a reminder due in a few minutes still arrives
  // without the student reloading the page.
  useEffect(() => {
    const timer = setInterval(() => setTick((count) => count + 1), 30_000);
    return () => clearInterval(timer);
  }, []);

  const { data } = useLive(async () => ({ reminders: await listReminders(), quiet: await getQuietHours() }), [tick]);
  if (!data) return null;
  const now = new Date();
  const due = dueNow(data.reminders, data.quiet, now);
  if (due.length === 0) return null;

  return (
    <div className="site-notice reminder-due" role="status" data-testid="due-reminders">
      <ul className="plain-list">
        {due.map((reminder: Reminder) => (
          <li key={reminder.id} className="reminder-due-row">
            <span><b>Reminder:</b> {reminder.text}</span>
            <button
              className="button"
              onClick={() => void markShown(reminder.id, now)}
              data-testid={`got-it-${reminder.id}`}
            >
              Got it
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

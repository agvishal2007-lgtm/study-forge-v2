import { formatWhen } from '../data/dateFormat';
import { clearActivity, useActivity } from '../data/activity';

/** "Today at 2:14 PM", "Yesterday at 9:03 AM", or a date for anything older. */
function when(at: number): string {
  const date = new Date(at);
  const time = formatWhen(date, { hour: 'numeric', minute: '2-digit' });
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  if (at >= startOfToday.getTime()) return `Today at ${time}`;
  if (at >= startOfToday.getTime() - 86_400_000) return `Yesterday at ${time}`;
  return formatWhen(date, { month: 'short', day: 'numeric' });
}

/** The last changes made and anything put back, newest first. Nothing is shown that didn't happen. */
export function RecentActivity({ limit = 8 }: { limit?: number }) {
  const activity = useActivity();
  return (
    <section className="dash-card" aria-labelledby="activity-heading" data-testid="recent-activity">
      <h2 id="activity-heading">Recent activity</h2>
      {activity.length === 0
        ? <p className="muted">Changes you make, like renaming, moving, pinning or binning something, show here.</p>
        : (
          <>
            <ul className="activity">
              {activity.slice(0, limit).map((entry) => (
                <li key={`${entry.at}-${entry.text}`} className={entry.recovery ? 'recovery' : undefined}>
                  <span>{entry.text}</span>
                  <time className="muted" dateTime={new Date(entry.at).toISOString()}>{when(entry.at)}</time>
                </li>
              ))}
            </ul>
            <button className="text-button" onClick={clearActivity}>Clear this list</button>
          </>
        )}
    </section>
  );
}

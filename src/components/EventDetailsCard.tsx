import { PROVIDER_ACTION, type EventDetails, type Meeting } from '../data/eventDetails';
import type { CalendarEvent } from '../data/types';

/** "Tuesday, November 18" and "3:00 PM – 4:00 PM", in the student's own words and time. */
function when(event: CalendarEvent): { day: string; time: string } {
  const day = new Date(`${event.date}T12:00:00`).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
  const clock = (value: string) => new Date(`${event.date}T${value}:00`).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  if (!event.startTime) return { day, time: 'All day' };
  return { day, time: event.endTime ? `${clock(event.startTime)} – ${clock(event.endTime)}` : clock(event.startTime) };
}

/**
 * Opens in a new tab. A Zoom, Teams or Webex link hands over to the installed app on a phone or
 * computer when there is one, and stays in the browser otherwise. Nothing opens until tapped.
 */
function JoinButton({ meeting, primary }: { meeting: Meeting; primary?: boolean }) {
  return (
    <a className={primary ? 'button primary join-button' : 'button join-button'} href={meeting.url} target="_blank" rel="noopener noreferrer">
      {PROVIDER_ACTION[meeting.provider]}
    </a>
  );
}

/** Everything a Google Calendar event carried, laid out so nobody needs to go back to Google to find it. */
export function EventDetailsCard({ event, details }: { event: CalendarEvent; details: EventDetails }) {
  const { day, time } = when(event);
  const zone = details.timeZone && details.timeZone !== Intl.DateTimeFormat().resolvedOptions().timeZone ? details.timeZone : '';
  return (
    <section className="event-card" aria-labelledby="event-card-title" data-testid="event-details">
      <h2 id="event-card-title">{event.title}</h2>
      <dl className="event-facts">
        <div><dt>When</dt><dd>{day}, {time}{zone && <span className="muted"> (set in {zone.replace(/_/g, ' ')})</span>}</dd></div>
        {details.place && <div><dt>Where</dt><dd>{details.place}</dd></div>}
        {!details.place && details.meeting && <div><dt>Where</dt><dd>Online</dd></div>}
        {details.organizer && <div><dt>Organizer</dt><dd>{details.organizer}</dd></div>}
      </dl>

      {details.meeting && (
        <div className="event-join">
          <JoinButton meeting={details.meeting} primary />
          {details.meeting.extras.length > 0 && <ul className="event-extras muted">{details.meeting.extras.map((extra) => <li key={extra}>{extra}</li>)}</ul>}
          {details.otherMeetings.length > 0 && (
            <div className="event-other-meetings">
              <p className="muted">This event also has:</p>
              {details.otherMeetings.map((meeting) => <JoinButton key={meeting.url} meeting={meeting} />)}
            </div>
          )}
        </div>
      )}

      {details.notes && (
        <div className="event-block">
          <h3>Description</h3>
          <p className="event-notes">{details.notes}</p>
        </div>
      )}

      {details.links.length > 0 && (
        <div className="event-block">
          <h3>Links</h3>
          <ul className="event-links">
            {details.links.map((link) => (
              <li key={link.url}>
                <a href={link.url} target="_blank" rel="noopener noreferrer">{link.label}</a>
                <span className="muted event-url">{link.url}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {details.attachments.length > 0 && (
        <div className="event-block">
          <h3>Attachments</h3>
          <ul className="event-links">
            {details.attachments.map((file) => (
              <li key={file.url}><a href={file.url} target="_blank" rel="noopener noreferrer">{file.title}</a></li>
            ))}
          </ul>
          <p className="muted">These open with your own Google account. Study Forge doesn't copy them.</p>
        </div>
      )}

      {details.googleUrl && <p><a href={details.googleUrl} target="_blank" rel="noopener noreferrer">Open in Google Calendar</a></p>}
    </section>
  );
}

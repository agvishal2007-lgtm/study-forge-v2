import { useEffect, useState } from 'react';
import { getOnlineReading, saveOnlineReading } from '../data/reading';
import { BOOK_LIMITS, type OnlineReading } from '../data/readingRules';
import { tidyUrl } from '../data/linkRules';
import { formatWhen } from '../data/dateFormat';

/**
 * For a paid online textbook or course platform. The book itself stays on the publisher's site
 * behind the student's own login, so Study Forge keeps their place in their own words, plus named
 * spots with an optional direct address.
 */
export function OnlineBookTools({ materialId, url }: { materialId: string; url: string }) {
  const [reading, setReading] = useState<OnlineReading | null>(null);
  const [place, setPlace] = useState('');
  const [label, setLabel] = useState('');
  const [spotPlace, setSpotPlace] = useState('');
  const [spotUrl, setSpotUrl] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    let active = true;
    void getOnlineReading(materialId).then((saved) => {
      if (!active) return;
      setReading(saved);
      setPlace(saved.place);
    });
    return () => { active = false; };
  }, [materialId]);

  if (!reading) return null;
  const save = (next: OnlineReading, note: string) => {
    setReading(next);
    void saveOnlineReading(materialId, next).then(() => setMessage(note)).catch((error: Error) => setMessage(`That wasn't saved. ${error.message}`));
  };

  return (
    <section className="online-book" aria-labelledby="online-book-heading" data-testid="online-book">
      <h2 id="online-book-heading">Your place in this book</h2>
      <p className="muted small">
        The book stays on the publisher’s site, where you sign in with the account you paid for. Study Forge never
        sees your login, payment or the book’s pages, so it keeps your place in your own words.
      </p>
      <form className="inline-form" onSubmit={(event) => {
        event.preventDefault();
        save({ ...reading, place: place.trim(), at: Date.now() }, place.trim() ? 'Your place is saved.' : 'Your place was cleared.');
      }}>
        <label>Where you are<input value={place} onChange={(event) => setPlace(event.target.value)} maxLength={BOOK_LIMITS.place} placeholder="Chapter 4, section 4.2, page 112" /></label>
        <button className="button" type="submit">Save my place</button>
      </form>
      {reading.place && reading.at > 0 && (
        <p data-testid="book-place">
          You were at <b>{reading.place}</b> <span className="muted small">(saved {formatWhen(new Date(reading.at), { month: 'short', day: 'numeric' })})</span>.{' '}
          <a href={url} target="_blank" rel="noopener noreferrer">Open the book</a>
        </p>
      )}

      <h3>Saved spots</h3>
      {reading.spots.length === 0
        ? <p className="muted small">None yet. Save chapters, problem sets or pages you’ll come back to.</p>
        : (
          <ul className="plain-list">
            {reading.spots.map((spot) => (
              <li key={spot.id} className="bookmark-row" data-testid="book-spot">
                <span>
                  {spot.url
                    ? <a href={spot.url} target="_blank" rel="noopener noreferrer">{spot.label || spot.place}</a>
                    : <b>{spot.label || spot.place}</b>}
                  {spot.label && spot.place && <span className="muted small"> · {spot.place}</span>}
                </span>
                <button className="text-button" onClick={() => save({ ...reading, spots: reading.spots.filter((other) => other.id !== spot.id) }, 'Spot removed.')} aria-label={`Remove ${spot.label || spot.place}`}>Remove</button>
              </li>
            ))}
          </ul>
        )}
      <form className="inline-form book-spot-form" onSubmit={(event) => {
        event.preventDefault();
        if (!label.trim() && !spotPlace.trim()) { setMessage('Give the spot a name or a place.'); return; }
        const link = spotUrl.trim() ? tidyUrl(spotUrl) : '';
        if (link === null) { setMessage('That web address doesn’t look right. Leave it empty, or paste the full address.'); return; }
        save({ ...reading, spots: [...reading.spots, { id: crypto.randomUUID(), label: label.trim(), place: spotPlace.trim(), url: link }].slice(0, BOOK_LIMITS.spots) }, 'Spot saved.');
        setLabel(''); setSpotPlace(''); setSpotUrl('');
      }}>
        <label>Name<input value={label} onChange={(event) => setLabel(event.target.value)} maxLength={BOOK_LIMITS.label} placeholder="Homework 5" /></label>
        <label>Place (optional)<input value={spotPlace} onChange={(event) => setSpotPlace(event.target.value)} maxLength={BOOK_LIMITS.place} placeholder="Chapter 5, problems 1–20" /></label>
        <label>Direct address (optional)<input value={spotUrl} onChange={(event) => setSpotUrl(event.target.value)} inputMode="url" placeholder="Copy it from the publisher’s site" /></label>
        <button className="button" type="submit">Save spot</button>
      </form>
      {message && <p className="muted" role="status" data-testid="book-message">{message}</p>}
    </section>
  );
}

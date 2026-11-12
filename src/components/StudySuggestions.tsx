import { useState } from 'react';
import { Link } from 'react-router-dom';
import { pickSuggestions, type SuggestionInputs } from '../data/suggestionRules';

const KEY = 'study-forge-hidden-suggestions';

/** Suggestions hidden today, on this device. Tomorrow everything that still applies comes back. */
export function hiddenToday(today: string): Set<string> {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? 'null') as { date?: string; ids?: unknown } | null;
    if (saved?.date === today && Array.isArray(saved.ids)) return new Set(saved.ids.filter((id): id is string => typeof id === 'string'));
  } catch {
    // Blocked storage just means nothing stays hidden.
  }
  return new Set();
}

function saveHidden(today: string, ids: Set<string>) {
  try {
    if (ids.size === 0) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, JSON.stringify({ date: today, ids: [...ids] }));
  } catch {
    // Hiding is a convenience; the list still works without it.
  }
}

/** A few more things worth doing today, each with the reason it's here, and a way to hide it for today. */
export function StudySuggestions({ inputs }: { inputs: Omit<SuggestionInputs, 'dismissed'> }) {
  const [dismissed, setDismissed] = useState(() => hiddenToday(inputs.today));
  const { shown, hidden } = pickSuggestions({ ...inputs, dismissed });
  if (shown.length === 0 && hidden === 0) return null;
  const hide = (id: string) => {
    const next = new Set(dismissed).add(id);
    setDismissed(next);
    saveHidden(inputs.today, next);
  };
  return (
    <section className="dash-card study-suggestions" aria-labelledby="suggestions-heading" data-testid="study-suggestions">
      <h2 id="suggestions-heading">Also worth doing</h2>
      {shown.length > 0
        ? (
          <ul className="plain-list suggestion-list">
            {shown.map((item) => (
              <li key={item.id} className="suggestion-row" data-testid="suggestion">
                <span>
                  <Link to={item.to}>{item.label}</Link>
                  <span className="muted small suggestion-why">Why: {item.reason}</span>
                </span>
                <button className="text-button" onClick={() => hide(item.id)} aria-label={`Hide “${item.label}” for today`}>Not today</button>
              </li>
            ))}
          </ul>
        )
        : <p className="muted small">Nothing else to suggest right now.</p>}
      <p className="muted small">
        Suggested from your own deadlines, flashcards, practice answers and lessons. No AI is used.
        {hidden > 0 && (
          <>
            {' '}{hidden} hidden for today.{' '}
            <button className="text-button" onClick={() => { setDismissed(new Set()); saveHidden(inputs.today, new Set()); }}>Show them</button>
          </>
        )}
      </p>
    </section>
  );
}

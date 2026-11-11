import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { createDeck, listCardProgress, listCards, listDecks } from '../data/flashcards';
import { isDue, isWeak } from '../data/flashcardRules';
import { localNow } from '../data/plannerRules';
import { listAllCourses } from '../data/store';
import { useLive } from '../data/useLive';

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`;

export function FlashcardsPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [courseId, setCourseId] = useState(params.get('course') ?? '');
  const [name, setName] = useState('');
  const [failure, setFailure] = useState('');
  const { data, error } = useLive(async () => {
    const [decks, cards, progress, courses] = await Promise.all([listDecks(), listCards(), listCardProgress(), listAllCourses()]);
    return { decks, cards, progress, courses };
  });
  if (error) return <div className="page"><h1>Flashcards</h1><p className="error" role="alert">Your flashcards couldn't be loaded. {error.message}</p></div>;
  if (!data) return <p className="page muted">Loading…</p>;
  const today = localNow().date;
  const shown = data.decks.filter((deck) => !courseId || (courseId === 'none' ? !deck.courseId : deck.courseId === courseId));
  const allDue = data.cards.filter((card) => isDue(data.progress.get(card.id), today)).length;

  const create = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!name.trim()) {
      setFailure('Enter a name for the deck.');
      return;
    }
    try {
      const deck = await createDeck(name, courseId && courseId !== 'none' ? courseId : null, null);
      navigate(`/cards/${deck.id}`);
    } catch (problem) {
      setFailure(`The deck wasn't created. ${(problem as Error).message}`);
    }
  };

  return (
    <div className="page">
      <h1>Flashcards</h1>
      <p className="muted">Write cards, test yourself, and review each one just before you'd forget it.</p>
      {data.cards.length > 0 && (
        <p className="session-actions">
          {allDue > 0
            ? <Link className="button primary" to="/cards/review" data-testid="review-all">Review {plural(allDue, 'card')} due</Link>
            : <span data-testid="nothing-due">Nothing due today.</span>}
        </p>
      )}
      <form className="inline-form" onSubmit={(event) => void create(event)} data-tour="new-deck">
        <label>New deck<input value={name} onChange={(event) => { setName(event.target.value); setFailure(''); }} placeholder="Chapter 3 terms" /></label>
        <button className="button" type="submit">Create deck</button>
      </form>
      {failure && <p className="error" role="alert">{failure}</p>}
      {data.decks.length > 0 && (
        <label className="search">Show
          <select value={courseId} onChange={(event) => setCourseId(event.target.value)}>
            <option value="">All courses</option>
            {data.courses.map((course) => <option key={course.id} value={course.id}>{course.name}</option>)}
            <option value="none">No course</option>
          </select>
        </label>
      )}
      {data.decks.length === 0 && <p className="muted planner-empty">No decks yet. Name your first one above, then add cards to it.</p>}
      {data.decks.length > 0 && shown.length === 0 && <p className="muted planner-empty">No decks for this course.</p>}
      <ul className="planner-list">
        {shown.map((deck) => {
          const course = data.courses.find((entry) => entry.id === deck.courseId);
          const cards = data.cards.filter((card) => card.deckId === deck.id);
          const due = cards.filter((card) => isDue(data.progress.get(card.id), today)).length;
          const weak = cards.filter((card) => isWeak(data.progress.get(card.id))).length;
          return (
            <li key={deck.id} className="planner-row" data-testid="deck-row" style={{ '--spine': course?.color ?? 'var(--line)' } as React.CSSProperties}>
              <div className="planner-main">
                <Link to={`/cards/${deck.id}`}>{deck.name}</Link>
                <span className="planner-due">{plural(cards.length, 'card')}, {due} due{weak > 0 ? `, ${weak} weak` : ''}</span>
                {course && <span className="muted file-meta">{course.name}</span>}
              </div>
              {due > 0 && <Link className="button" to={`/cards/review?deck=${deck.id}`} aria-label={`Review ${deck.name}`}>Review</Link>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

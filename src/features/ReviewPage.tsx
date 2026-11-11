import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { clearReviewSession, listCardProgress, listCards, listDecks, loadReviewSession, rateCard, saveReviewSession } from '../data/flashcards';
import { describeInterval, dueQueue, isWeak, outcome } from '../data/flashcardRules';
import { localNow } from '../data/plannerRules';
import { useStudyClock } from '../data/studyClock';
import { CARD_RATINGS, type CardProgress, type CardRating, type Flashcard } from '../data/types';

type Mode = 'due' | 'practice' | 'weak';

export function ReviewPage() {
  const [params] = useSearchParams();
  const { pathname, search } = useLocation();
  const url = `${pathname}${search}`;
  const [removed, setRemoved] = useState(0);
  const deckId = params.get('deck');
  const mode: Mode = params.get('mode') === 'practice' ? 'practice' : params.get('mode') === 'weak' ? 'weak' : 'due';
  const saves = mode === 'due';
  useStudyClock(params.get('course'));
  const [queue, setQueue] = useState<Flashcard[] | null>(null);
  const [progress, setProgress] = useState<Map<string, CardProgress>>(new Map());
  const [deckNames, setDeckNames] = useState<Map<string, string>>(new Map());
  const [loadFailure, setLoadFailure] = useState('');
  const [revealed, setRevealed] = useState(false);
  const [failure, setFailure] = useState('');
  const [tally, setTally] = useState<Record<CardRating, number>>({ Again: 0, Hard: 0, Good: 0, Easy: 0 });
  const busy = useRef(false);
  const reveal = useRef<HTMLButtonElement>(null);

  // The list is set once at the start, so a card can't jump away mid-session.
  useEffect(() => {
    let active = true;
    Promise.all([listCards(), listCardProgress(), listDecks(), loadReviewSession()]).then(([cards, saved, decks, resumed]) => {
      if (!active) return;
      // The same review left part-way picks up where it stopped. A card deleted since is skipped, and said so.
      if (resumed && resumed.url === url && resumed.cardIds.length > 0) {
        const byId = new Map(cards.map((entry) => [entry.id, entry]));
        const left = resumed.cardIds.flatMap((id) => (byId.has(id) ? [byId.get(id) as Flashcard] : []));
        if (left.length > 0) {
          setProgress(saved);
          setDeckNames(new Map(decks.map((deck) => [deck.id, deck.name])));
          setTally(resumed.tally);
          setRemoved(resumed.cardIds.length - left.length);
          setQueue(left);
          return;
        }
      }
      const courseId = params.get('course');
      const courseDecks = courseId ? new Set(decks.filter((deck) => deck.courseId === courseId).map((deck) => deck.id)) : null;
      const inDeck = cards.filter((card) => (!deckId || card.deckId === deckId) && (!courseDecks || courseDecks.has(card.deckId)));
      setProgress(saved);
      setDeckNames(new Map(decks.map((deck) => [deck.id, deck.name])));
      if (mode === 'due') setQueue(dueQueue(inDeck, saved, localNow().date));
      else if (mode === 'weak') setQueue(inDeck.filter((card) => isWeak(saved.get(card.id))));
      else setQueue([...inDeck].sort((a, b) => a.createdAt - b.createdAt));
    }).catch((error: Error) => { if (active) setLoadFailure(error.message); });
    return () => { active = false; };
  }, [deckId, mode]);

  const card = queue?.[0];

  const rate = useCallback(async (rating: CardRating) => {
    if (!card || busy.current) return;
    busy.current = true;
    setFailure('');
    try {
      if (saves) await rateCard(card.id, rating);
      setProgress((current) => (saves ? new Map(current).set(card.id, {
        ...(current.get(card.id) as CardProgress),
        cardId: card.id,
        stage: outcome(current.get(card.id), rating).stage,
      }) : current));
      const nextTally = { ...tally, [rating]: tally[rating] + 1 };
      const rest = (queue ?? []).slice(1);
      const nextQueue = rating === 'Again' ? [...rest, card] : rest;
      setTally(nextTally);
      setQueue(nextQueue);
      // Kept on the device, so closing the tab mid-review loses nothing.
      if (nextQueue.length > 0) void saveReviewSession({ url, cardIds: nextQueue.map((entry) => entry.id), tally: nextTally }).catch(() => undefined);
      else void clearReviewSession().catch(() => undefined);
      setRevealed(false);
    } catch (error) {
      setFailure(`That answer wasn't saved. Try again. ${(error as Error).message}`);
    } finally {
      busy.current = false;
    }
  }, [card, saves, queue, tally, url]);

  useEffect(() => {
    if (!revealed) reveal.current?.focus({ preventScroll: true });
  }, [revealed, card]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!revealed || event.ctrlKey || event.metaKey || event.altKey) return;
      const rating = CARD_RATINGS[Number(event.key) - 1];
      if (rating) {
        event.preventDefault();
        void rate(rating);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [revealed, rate]);

  if (loadFailure) return <div className="page"><h1>Flashcards</h1><p className="error" role="alert">Your cards couldn't be loaded. {loadFailure}</p></div>;
  if (!queue) return <p className="page muted">Loading…</p>;
  const reviewed = CARD_RATINGS.reduce((sum, rating) => sum + tally[rating], 0);
  const back = deckId ? `/cards/${deckId}` : '/cards';

  if (!card) {
    return (
      <div className="page review-page">
        <h1>{reviewed > 0 ? 'All done' : 'Nothing to review'}</h1>
        {reviewed > 0
          ? (
            <>
              <p data-testid="review-summary">You answered {reviewed} {reviewed === 1 ? 'time' : 'times'}: {CARD_RATINGS.map((rating) => `${tally[rating]} ${rating}`).join(', ')}.</p>
              {saves ? <p className="muted">Your progress is saved, and each card will come back when it's due.</p> : <p className="muted">Practice doesn't change your schedule.</p>}
            </>
          )
          : <p className="muted">Nothing is due right now. Come back later, or practice any time from a deck.</p>}
        <p><Link className="button primary" to={back}>{deckId ? 'Back to deck' : 'Back to Flashcards'}</Link></p>
      </div>
    );
  }

  return (
    <div className="page review-page">
      <header className="course-head">
        <div>
          <h1>{saves ? 'Review' : mode === 'weak' ? 'Practice weak cards' : 'Practice'}</h1>
          <p className="muted" data-testid="review-left">{queue.length} left in {deckNames.get(card.deckId) ?? 'this deck'}{saves ? '' : ". This doesn't change your schedule."}</p>
        </div>
        <Link to={back}>Stop for now</Link>
      </header>
      {removed > 0 && <p className="notice">Picked up where you left off. {removed} {removed === 1 ? 'card was' : 'cards were'} deleted since, so {removed === 1 ? 'it is' : 'they are'} skipped.</p>}
      <article className="flashcard" data-testid="flashcard" aria-live="polite">
        <p className="flashcard-label">Front</p>
        <p className="card-text flashcard-text" data-testid="card-front">{card.front}</p>
        {revealed && (
          <>
            <hr />
            <p className="flashcard-label">Back</p>
            <p className="card-text flashcard-text" data-testid="card-back">{card.back}</p>
          </>
        )}
      </article>
      {failure && <p className="error" role="alert">{failure}</p>}
      {!revealed
        ? <div className="session-actions"><button ref={reveal} className="button primary" onClick={() => setRevealed(true)}>Reveal answer</button></div>
        : (
          <>
            <p className="muted">How well did you remember it?</p>
            <div className="rating-row" role="group" aria-label="How well did you remember it?">
              {CARD_RATINGS.map((rating, index) => (
                <button key={rating} className={rating === 'Good' ? 'button primary' : 'button'} onClick={() => void rate(rating)}>
                  <span>{rating}</span>
                  {saves && <small>{describeInterval(outcome(progress.get(card.id), rating).days)}</small>}
                  <span className="sr-only"> (press {index + 1})</span>
                </button>
              ))}
            </div>
          </>
        )}
    </div>
  );
}

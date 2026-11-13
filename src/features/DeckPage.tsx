import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { useStillHere } from '../components/useStillHere';
import {
  addCard, deleteCard, deleteDeck, getDeck, listCardProgress, listDeckCards, MAX_CARD_SIDE, updateCard, updateDeck,
} from '../data/flashcards';
import { describeCardDue, isDue, isWeak } from '../data/flashcardRules';
import { localNow } from '../data/plannerRules';
import { listAllCourses, listTopics } from '../data/store';
import type { Flashcard } from '../data/types';
import { useLive } from '../data/useLive';

function problemWith(front: string, back: string): string {
  if (!front.trim() || !back.trim()) return 'A card needs both a front and a back.';
  if (front.length > MAX_CARD_SIDE || back.length > MAX_CARD_SIDE) return `Each side can hold up to ${MAX_CARD_SIDE.toLocaleString()} characters.`;
  return '';
}

function CardEditor({ card, onDone }: { card: Flashcard; onDone: () => void }) {
  const [front, setFront] = useState(card.front);
  const [back, setBack] = useState(card.back);
  const [failure, setFailure] = useState('');
  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    const problem = problemWith(front, back);
    if (problem) {
      setFailure(problem);
      return;
    }
    try {
      await updateCard(card.id, front, back);
      onDone();
    } catch (error) {
      setFailure(`That wasn't saved, but your text is still here. ${(error as Error).message}`);
    }
  };
  return (
    <form className="card-form" onSubmit={(event) => void save(event)}>
      <label>Front<textarea aria-label="Front" value={front} onChange={(event) => setFront(event.target.value)} /></label>
      <label>Back<textarea aria-label="Back" value={back} onChange={(event) => setBack(event.target.value)} /></label>
      {failure && <p className="error" role="alert">{failure}</p>}
      <div className="session-actions">
        <button className="button primary" type="submit">Save card</button>
        <button className="button" type="button" onClick={onDone}>Cancel</button>
      </div>
    </form>
  );
}

export function DeckPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const stillHere = useStillHere();
  const { data, error } = useLive(async () => {
    const [deck, cards, progress, courses] = await Promise.all([getDeck(id), listDeckCards(id), listCardProgress(), listAllCourses()]);
    return { deck, cards, progress, courses };
  }, [id]);
  const [front, setFront] = useState('');
  const [back, setBack] = useState('');
  const [failure, setFailure] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [removeCard, setRemoveCard] = useState<Flashcard | null>(null);
  const [removeDeck, setRemoveDeck] = useState(false);
  const [editingDeck, setEditingDeck] = useState(false);
  const [deckName, setDeckName] = useState('');
  const [deckCourse, setDeckCourse] = useState('');
  const [deckTopic, setDeckTopic] = useState('');
  const frontBox = useRef<HTMLTextAreaElement>(null);
  const { data: topics } = useLive(() => (deckCourse ? listTopics(deckCourse) : Promise.resolve([])), [deckCourse]);

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { if (front.trim() || back.trim()) event.preventDefault(); };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [front, back]);

  if (error) return <div className="page"><h1>Flashcards</h1><p className="error" role="alert">This deck couldn't be loaded. {error.message}</p></div>;
  if (!data) return <p className="page muted">Loading…</p>;
  const { deck, cards, progress, courses } = data;
  if (!deck) return <div className="page"><h1>This deck doesn't exist</h1><Link to="/cards">Go to Flashcards</Link></div>;
  const today = localNow().date;
  const due = cards.filter((card) => isDue(progress.get(card.id), today)).length;
  const course = courses.find((entry) => entry.id === deck.courseId);

  const add = async (event: React.FormEvent) => {
    event.preventDefault();
    const problem = problemWith(front, back);
    setFailure(problem);
    if (problem) return;
    try {
      await addCard(deck.id, front, back);
      setFront('');
      setBack('');
      frontBox.current?.focus();
    } catch (problemSaving) {
      setFailure(`That card wasn't saved, but your text is still here. ${(problemSaving as Error).message}`);
    }
  };

  const saveDeck = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!deckName.trim()) {
      setFailure('Enter a name for the deck.');
      return;
    }
    try {
      await updateDeck(deck.id, { name: deckName, courseId: deckCourse || null, topicId: deckTopic || null });
      setFailure('');
      setEditingDeck(false);
    } catch (problem) {
      setFailure(`That wasn't saved. ${(problem as Error).message}`);
    }
  };

  return (
    <div className="page">
      <p><Link to="/cards">Back to Flashcards</Link></p>
      <header className="course-head">
        <h1>{deck.name}</h1>
        <div className="session-actions">
          <button className="text-button" onClick={() => {
            setDeckName(deck.name);
            setDeckCourse(deck.courseId ?? '');
            setDeckTopic(deck.topicId ?? '');
            setEditingDeck(true);
          }}>Edit deck</button>
          <button className="text-button danger-text" onClick={() => setRemoveDeck(true)}>Delete deck</button>
        </div>
      </header>
      {course && <p className="muted">{course.name}</p>}
      {editingDeck && (
        <form className="card-form" onSubmit={(event) => void saveDeck(event)}>
          <label>Deck name<input value={deckName} onChange={(event) => setDeckName(event.target.value)} /></label>
          <div className="form-row">
            <label>Course
              <select value={deckCourse} onChange={(event) => { setDeckCourse(event.target.value); setDeckTopic(''); }}>
                <option value="">No course</option>
                {courses.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}
              </select>
            </label>
            {deckCourse && (topics?.length ?? 0) > 0 && (
              <label>Topic
                <select value={deckTopic} onChange={(event) => setDeckTopic(event.target.value)}>
                  <option value="">No topic</option>
                  {topics?.map((topic) => <option key={topic.id} value={topic.id}>{topic.name}</option>)}
                </select>
              </label>
            )}
          </div>
          <div className="session-actions">
            <button className="button primary" type="submit">Save deck</button>
            <button className="button" type="button" onClick={() => setEditingDeck(false)}>Cancel</button>
          </div>
        </form>
      )}
      <div className="session-actions">
        {due > 0 && <Link className="button primary" to={`/cards/review?deck=${deck.id}`}>Review {due} due</Link>}
        {cards.length > 0 && <Link className="button" to={`/cards/review?deck=${deck.id}&mode=practice`}>Practice all</Link>}
        {cards.some((card) => isWeak(progress.get(card.id))) && <Link className="button" to={`/cards/review?deck=${deck.id}&mode=weak`}>Practice weak cards</Link>}
      </div>
      <section aria-labelledby="add-card-heading">
        <h2 id="add-card-heading">Add a card</h2>
        <form className="card-form" onSubmit={(event) => void add(event)}>
          <label>Front<textarea aria-label="Front" ref={frontBox} value={front} onChange={(event) => { setFront(event.target.value); setFailure(''); }} placeholder="What's the accounting equation?" /></label>
          <label>Back<textarea aria-label="Back" value={back} onChange={(event) => { setBack(event.target.value); setFailure(''); }} placeholder="Assets = Liabilities + Equity" /></label>
          {failure && <p className="error" role="alert">{failure}</p>}
          <div className="session-actions"><button className="button primary" type="submit">Add card</button></div>
        </form>
      </section>
      <section aria-labelledby="cards-heading">
        <h2 id="cards-heading">Cards ({cards.length})</h2>
        {cards.length === 0 && <p className="muted">No cards yet.</p>}
        <ul className="planner-list">
          {cards.map((card) => {
            const state = progress.get(card.id);
            if (editing === card.id) return <li key={card.id} className="planner-row"><CardEditor card={card} onDone={() => setEditing(null)} /></li>;
            return (
              <li key={card.id} className="planner-row card-row" data-testid="card-row">
                <div className="planner-main">
                  <span className="card-text"><strong>{card.front}</strong></span>
                  <span className="card-text">{card.back}</span>
                  <span className="muted file-meta">{describeCardDue(state, today)}{isWeak(state) ? ', weak' : ''}</span>
                </div>
                <div className="planner-actions">
                  <button className="button" onClick={() => setEditing(card.id)} aria-label={`Edit ${card.front}`}>Edit</button>
                  <button className="text-button danger-text" onClick={() => setRemoveCard(card)} aria-label={`Delete ${card.front}`}>Delete</button>
                </div>
              </li>
            );
          })}
        </ul>
      </section>
      {removeCard && (
        <ConfirmDialog
          title="Delete this card?"
          confirmLabel="Delete card"
          onCancel={() => setRemoveCard(null)}
          onConfirm={async () => {
            const target = removeCard;
            setRemoveCard(null);
            await deleteCard(target.id).catch((problem: Error) => setFailure(`It wasn't deleted. ${problem.message}`));
          }}
        >
          <p>This permanently removes the card and its review history.</p>
        </ConfirmDialog>
      )}
      {removeDeck && (
        <ConfirmDialog
          title={`Delete ${deck.name}?`}
          confirmLabel="Delete deck"
          onCancel={() => setRemoveDeck(false)}
          onConfirm={async () => {
            setRemoveDeck(false);
            try {
              await deleteDeck(deck.id);
              if (stillHere.current) navigate('/cards', { replace: true });
            } catch (problem) {
              setFailure(`It wasn't deleted. ${(problem as Error).message}`);
            }
          }}
        >
          <p>The deck, its {cards.length === 1 ? '1 card' : `${cards.length} cards`} and their review history go to Trash together. You can restore them from there.</p>
        </ConfirmDialog>
      )}
    </div>
  );
}

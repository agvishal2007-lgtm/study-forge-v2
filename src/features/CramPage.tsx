import { Link, useSearchParams } from 'react-router-dom';
import { cramPlan, CRAM_MODES, type CramMode } from '../data/examRules';
import { listCardProgress, listCards, listDecks } from '../data/flashcards';
import { isDue } from '../data/flashcardRules';
import { listNotes } from '../data/notes';
import { localNow } from '../data/plannerRules';
import { listAllTopics, listPracticeAttempts, listPracticeQuestions, listPracticeSets } from '../data/practice';
import { mistakesIn, weakTopics } from '../data/practiceRules';
import { useLive } from '../data/useLive';
import { topicLabeler } from './PracticePage';

export function CramPage() {
  const [params] = useSearchParams();
  const asked = params.get('mode') as CramMode;
  const mode: CramMode = asked in CRAM_MODES ? asked : 'tomorrow';
  const course = params.get('course') ?? '';
  const { data, error } = useLive(async () => {
    const [sets, questions, attempts, topics, decks, cards, progress, notes] = await Promise.all([
      listPracticeSets(), listPracticeQuestions(), listPracticeAttempts(), listAllTopics(), listDecks(), listCards(), listCardProgress(), listNotes(),
    ]);
    const setIds = new Set(sets.filter((set) => !course || set.courseId === course).map((set) => set.id));
    const inScope = questions.filter((question) => setIds.has(question.setId));
    const scoped = attempts.filter((attempt) => setIds.has(attempt.setId));
    const deckIds = new Set(decks.filter((deck) => !course || deck.courseId === course).map((deck) => deck.id));
    const today = localNow().date;
    return cramPlan(mode, {
      course,
      total: inScope.length,
      mistakes: mistakesIn(inScope, scoped).length,
      weakTopics: weakTopics(inScope, scoped, topicLabeler(sets, topics)).map((topic) => ({ label: topic.label, questions: topic.questionIds.length })),
      definitions: inScope.filter((question) => question.kind === 'definition').length,
      formulas: inScope.filter((question) => question.kind === 'formula').length,
      cardsDue: cards.filter((card) => deckIds.has(card.deckId) && isDue(progress.get(card.id), today)).length,
      notes: notes.filter((note) => !course || note.courseId === course).length,
    });
  }, [mode, course]);
  if (error) return <div className="page"><h1>Cram Mode</h1><p className="error" role="alert">Your plan couldn't be made. {error.message}</p></div>;
  if (!data) return <p className="page muted">Loading…</p>;
  const { label, summary } = CRAM_MODES[mode];
  return (
    <div className="page review-page">
      <p><Link to="/exams">Back to Exam Hall</Link></p>
      <h1>{label}</h1>
      <p className="muted">{summary}</p>
      {data.steps.length === 0
        ? <p className="notice" data-testid="cram-empty">{mode === 'weak' ? 'No weak topics or mistakes right now. Answer more practice questions to find them.' : 'There\'s nothing saved for this yet. Add practice questions, flashcards, or notes, and your plan will build from them.'}</p>
        : (
          <>
            <p data-testid="cram-total">About {data.minutes} minutes. Times are rough estimates.</p>
            <ol className="planner-list cram-steps" data-testid="cram-plan">
              {data.steps.map((step) => (
                <li key={step.title} className="planner-row">
                  <div className="planner-main">
                    <strong>{step.title}</strong>
                    <span className="muted file-meta">{step.detail}, about {step.minutes} min</span>
                  </div>
                  <Link className="button" to={step.to} aria-label={`Start ${step.title}`}>Start</Link>
                </li>
              ))}
            </ol>
            {data.leftOut > 0 && <p className="muted" data-testid="cram-left-out">{data.leftOut} more {data.leftOut === 1 ? 'step' : 'steps'} didn't fit in this time.</p>}
          </>
        )}
    </div>
  );
}

import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { gradeAutomatically } from '../data/mastery';
import {
  clearPracticeSession, listAllTopics, listPracticeAttempts, listPracticeQuestions, listPracticeSets, loadPracticeSession, recordAttempt, savedQuestionIds, savePracticeSession,
  setAttemptDifficulty, toggleSavedQuestion, type PracticeSession,
} from '../data/practice';
import { feedbackFor, mistakesIn } from '../data/practiceRules';
import { useStudyClock } from '../data/studyClock';
import { CONFIDENCE_LEVELS, DIFFICULTY_LEVELS, PRACTICE_KIND_LABEL, type Confidence, type PracticeAttempt, type PracticeKind, type PracticeQuestion, type PracticeResult } from '../data/types';
import { topicLabeler } from './PracticePage';

const newId = () => crypto.randomUUID();
/** Practical session lengths. A longer list is offered as these, or all of it. */
const LENGTHS = [5, 10, 20];
/** A gap longer than this means the student stepped away, so it isn't counted as study time. */
const IDLE_MS = 5 * 60_000;

/** "12 min", "1 hr 5 min". */
const minutes = (ms: number) => {
  const total = Math.max(1, Math.round(ms / 60_000));
  return total >= 60 ? `${Math.floor(total / 60)} hr${total % 60 ? ` ${total % 60} min` : ''}` : `${total} min`;
};

export function PracticeSessionPage() {
  const [params] = useSearchParams();
  const { pathname, search, key: visit } = useLocation();
  const url = `${pathname}${search}`;
  const setId = params.get('set');
  const mode = params.get('mode') ?? 'all';
  useStudyClock(params.get('course'));
  const [session, setSession] = useState<PracticeSession | null>(null);
  const [questions, setQuestions] = useState<Map<string, PracticeQuestion>>(new Map());
  const [attempts, setAttempts] = useState<Map<string, PracticeAttempt>>(new Map());
  const [loaded, setLoaded] = useState(false);
  // A long list waits here until the student chooses how many to do.
  const [pool, setPool] = useState<string[] | null>(null);
  const [saved, setSaved] = useState<Set<string>>(new Set());
  // How many questions this visit found removed, so coming back says so wherever it picks up.
  const [justSkipped, setJustSkipped] = useState(0);
  const lastTick = useRef(Date.now());
  const [failure, setFailure] = useState('');
  const busy = useRef(false);

  useEffect(() => {
    let active = true;
    setLoaded(false);
    setSession(null);
    (async () => {
      const [resumed, allQuestions, allAttempts, sets, topics, bookmarked] = await Promise.all([
        loadPracticeSession(), listPracticeQuestions(), listPracticeAttempts(), listPracticeSets(), listAllTopics(), savedQuestionIds(),
      ]);
      if (!active) return;
      setQuestions(new Map(allQuestions.map((question) => [question.id, question])));
      setAttempts(new Map(allAttempts.map((attempt) => [attempt.id, attempt])));
      setSaved(new Set(bookmarked));
      const present = new Set(allQuestions.map((question) => question.id));
      // Coming back to the same session picks up where it stopped. A question removed since is
      // skipped and said so, rather than throwing the whole session and its answers away.
      const remaining = resumed && resumed.url === url ? resumed.questionIds.filter((id, index) => index < resumed.position || present.has(id)) : [];
      if (resumed && resumed.url === url && remaining.slice(resumed.position).length > 0) {
        const gone = resumed.questionIds.length - remaining.length;
        const kept = { ...resumed, questionIds: remaining, skipped: (resumed.skipped ?? 0) + gone };
        if (gone) await savePracticeSession(kept);
        if (active) setJustSkipped(gone);
        lastTick.current = Date.now();
        setSession(kept);
      } else {
        const courseSets = params.get('course') ? new Set(sets.filter((set) => set.courseId === params.get('course')).map((set) => set.id)) : null;
        const inScope = allQuestions.filter((question) => (!setId || question.setId === setId) && (!courseSets || courseSets.has(question.setId)));
        const labelOf = topicLabeler(sets, topics);
        let picked = inScope;
        if (mode === 'mistakes') picked = mistakesIn(inScope, allAttempts);
        if (mode === 'saved') picked = inScope.filter((question) => bookmarked.includes(question.id));
        if (mode === 'topic') picked = inScope.filter((question) => labelOf(question) === params.get('topic'));
        const kind = params.get('kind') as PracticeKind | null;
        if (kind) picked = picked.filter((question) => question.kind === kind);
        const ids = picked.map((question) => question.id);
        const asked = Number(params.get('count'));
        if (ids.length > LENGTHS[0] && !asked) {
          if (active) setPool(ids);
        } else if (ids.length > 0) {
          const fresh = startSession(asked ? ids.slice(0, asked) : ids);
          await savePracticeSession(fresh);
          if (active) setSession(fresh);
        }
      }
      if (active) setLoaded(true);
    })().catch((error: Error) => { if (active) { setFailure(error.message); setLoaded(true); } });
    return () => { active = false; };
    // The session is set up once for each visit, including starting the same list again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visit]);

  function startSession(ids: string[]): PracticeSession {
    lastTick.current = Date.now();
    return { id: newId(), url, questionIds: ids, position: 0, attemptId: newId(), draft: '', selected: null, confidence: null, checking: false, answer: '', activeMs: 0, skipped: 0 };
  }

  /**
   * Keeps the session in step with the screen. Typing shows at once and saves behind it; moving on
   * (a new question, finishing) waits for the save first, so closing the tab right after can't lose
   * the step.
   */
  const change = async (patch: Partial<PracticeSession>, settle = false) => {
    if (!session) return;
    // Study time counts only while working: a long gap means the student stepped away.
    const now = Date.now();
    const gap = now - lastTick.current;
    lastTick.current = now;
    const next = { ...session, ...patch, activeMs: (session.activeMs ?? 0) + (gap < IDLE_MS ? gap : 0) };
    // A failed draft save only risks a little typing, so the student isn't interrupted.
    const saving = savePracticeSession(next).catch(() => undefined);
    if (settle) await saving;
    setSession(next);
  };

  const back = setId ? `/practice/${setId}` : '/practice';
  if (!loaded) return <p className="page muted">Loading…</p>;
  if (failure && !session) return <div className="page"><h1>Practice</h1><p className="error" role="alert">Your questions couldn't be loaded. {failure}</p></div>;
  if (!session && pool) {
    const choose = async (count: number) => {
      const fresh = startSession(pool.slice(0, count));
      await savePracticeSession(fresh);
      setPool(null);
      setSession(fresh);
    };
    return (
      <div className="page review-page">
        <h1>How many questions?</h1>
        <p className="muted">There are {pool.length} to practise. You can stop at any point and pick up where you left off.</p>
        <div className="session-actions" data-testid="practice-length">
          {LENGTHS.filter((length) => length < pool.length).map((length) => (
            <button key={length} className="button" onClick={() => void choose(length)}>{length} questions</button>
          ))}
          <button className="button primary" onClick={() => void choose(pool.length)}>All {pool.length}</button>
        </div>
      </div>
    );
  }
  if (!session) {
    return (
      <div className="page">
        <h1>Nothing to practice</h1>
        <p className="muted">{mode === 'mistakes' ? 'You have no mistakes to review.' : 'No questions match this.'}</p>
        <p><Link className="button primary" to={back}>Back</Link></p>
      </div>
    );
  }

  const finished = session.position >= session.questionIds.length || session.endedEarly;
  if (finished) {
    const results = [...attempts.values()].filter((attempt) => attempt.sessionId === session.id);
    const count = (result: PracticeResult) => results.filter((attempt) => attempt.result === result).length;
    const missed = count('wrong') + count('partial');
    const topicsDone = [...new Set(results.map((attempt) => questions.get(attempt.questionId)?.topic).filter(Boolean))];
    const savedHere = session.questionIds.filter((id) => saved.has(id)).length;
    const felt = (level: string) => results.filter((attempt) => attempt.difficulty === level).length;
    // Only questions with no answer at all; one answered just before finishing was reached.
    const answeredIds = new Set(results.map((attempt) => attempt.questionId));
    const notReached = session.questionIds.slice(session.position).filter((id) => !answeredIds.has(id)).length;
    return (
      <div className="page review-page">
        <h1>{session.endedEarly ? 'Practice stopped' : 'Practice finished'}</h1>
        <dl className="session-summary" data-testid="practice-summary">
          <div><dt>Answered</dt><dd>{results.length}{notReached > 0 ? ` (${notReached} not reached)` : ''}</dd></div>
          <div><dt>Results</dt><dd>{count('correct')} correct, {count('partial')} partly right, {count('wrong')} wrong</dd></div>
          {results.some((attempt) => attempt.difficulty) && <div><dt>How it felt</dt><dd>{DIFFICULTY_LEVELS.map((level) => `${felt(level)} ${level.toLowerCase()}`).join(', ')}</dd></div>}
          {topicsDone.length > 0 && <div><dt>Topics</dt><dd>{topicsDone.join(', ')}</dd></div>}
          {savedHere > 0 && <div><dt>Saved for later</dt><dd>{savedHere}</dd></div>}
          {(session.activeMs ?? 0) >= 60_000 && <div><dt>Time spent</dt><dd>{minutes(session.activeMs ?? 0)}</dd></div>}
        </dl>
        {(session.skipped ?? 0) > 0 && <p className="notice">{session.skipped} {session.skipped === 1 ? 'question was' : 'questions were'} removed after this session began, so {session.skipped === 1 ? 'it was' : 'they were'} skipped.</p>}
        <p className="muted">This counts answers, not mastery. Getting a question right once doesn't mean it's learned.</p>
        <div className="session-actions">
          {missed > 0 && <Link className="button primary" onClick={() => void clearPracticeSession()} to={`/practice/session?mode=mistakes${setId ? `&set=${setId}` : ''}`}>Practice what you missed</Link>}
          {savedHere > 0 && <Link className="button" onClick={() => void clearPracticeSession()} to="/practice/session?mode=saved">Practise saved questions</Link>}
          <Link className="button" onClick={() => void clearPracticeSession()} to={back}>Done</Link>
        </div>
      </div>
    );
  }

  const question = questions.get(session.questionIds[session.position]) as PracticeQuestion;
  const isChoice = question.options.length > 0;
  const attempt = attempts.get(session.attemptId);
  const left = session.questionIds.length - session.position;
  const correctText = isChoice
    ? question.options[question.correctOption as number]
    : question.modelAnswer || question.accepted.join(', ');

  const save = async (answer: string, result: PracticeResult, selfChecked: boolean) => {
    if (busy.current) return;
    busy.current = true;
    setFailure('');
    const now = Date.now();
    const record: PracticeAttempt = {
      id: session.attemptId, questionId: question.id, setId: question.setId, sessionId: session.id, answer, result, selfChecked, confidence: session.confidence, at: now, updatedAt: now,
    };
    try {
      await recordAttempt(record);
      setAttempts((current) => new Map(current).set(record.id, record));
      change({ checking: false, answer });
    } catch (error) {
      // The answer stays on screen, and pressing the button again retries it.
      setFailure(`Your answer wasn't saved. Try again. ${(error as Error).message}`);
    } finally {
      busy.current = false;
    }
  };

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (isChoice) {
      if (session.selected === null) return;
      void save(question.options[session.selected], gradeAutomatically(question, String(session.selected)) ? 'correct' : 'wrong', false);
    } else {
      const answer = session.draft.trim();
      if (!answer) return;
      if (gradeAutomatically(question, answer)) void save(answer, 'correct', false);
      else change({ checking: true, answer });
    }
  };

  const next = () => void change({ position: session.position + 1, attemptId: newId(), draft: '', selected: null, confidence: null, checking: false, answer: '' }, true);
  const feedback = attempt ? feedbackFor(attempt.result, attempt.confidence) : null;
  const ready = isChoice ? session.selected !== null : session.draft.trim() !== '';

  return (
    <div className="page review-page">
      <header className="course-head">
        <div>
          <h1>Practice</h1>
          <p className="muted" data-testid="practice-left">{left} left. {PRACTICE_KIND_LABEL[question.kind]}{question.topic ? `, ${question.topic}` : ''}.</p>
        </div>
        <div className="row-actions">
          <Link to={back}>Stop for now</Link>
          <button className="text-button" onClick={() => void change({ endedEarly: true }, true)}>Finish now</button>
        </div>
      </header>
      {justSkipped > 0 && <p className="notice">Picked up where you left off. {justSkipped} {justSkipped === 1 ? 'question in this session was' : 'questions in this session were'} removed since, so {justSkipped === 1 ? 'it is' : 'they are'} skipped. Your earlier answers still count.</p>}
      <p className="save-later">
        <button
          className="text-button"
          aria-pressed={saved.has(question.id)}
          onClick={() => {
            const keep = !saved.has(question.id);
            setSaved((current) => { const next = new Set(current); if (keep) next.add(question.id); else next.delete(question.id); return next; });
            void toggleSavedQuestion(question.id).catch((error: Error) => setFailure(`That wasn't saved for later. ${error.message}`));
          }}
        >
          {saved.has(question.id) ? 'Saved for later ✓' : 'Save for later'}
        </button>
      </p>
      {failure && <p className="error" role="alert">{failure}</p>}
      {!attempt && !session.checking && (
        <form className="session-card" data-testid="practice-question" onSubmit={submit}>
          <h2 className="question-prompt card-text" id="practice-prompt">{question.prompt}</h2>
          {isChoice ? (
            <fieldset className="options" aria-labelledby="practice-prompt">
              {question.options.map((option, index) => (
                <label className="option" key={`${index}-${option}`}>
                  <input type="radio" name={session.attemptId} checked={session.selected === index} onChange={() => change({ selected: index })} />
                  <span>{option}</span>
                </label>
              ))}
            </fieldset>
          ) : (
            <label>Your answer
              <textarea aria-label="Your answer" className="answer-box" value={session.draft} onChange={(event) => change({ draft: event.target.value })} />
            </label>
          )}
          <fieldset className="confidence">
            <legend>How sure are you? (optional)</legend>
            {CONFIDENCE_LEVELS.map((level: Confidence) => (
              <label key={level}>
                <input type="radio" name={`${session.attemptId}-confidence`} checked={session.confidence === level} onChange={() => change({ confidence: level })} />
                <span>{level}</span>
              </label>
            ))}
          </fieldset>
          <div className="session-actions">
            <button className="button primary" type="submit" disabled={!ready}>Submit answer</button>
          </div>
        </form>
      )}
      {!attempt && session.checking && (
        <div className="session-card" data-testid="practice-check">
          <h2 className="question-prompt card-text">{question.prompt}</h2>
          <p className="flashcard-label">Your answer</p>
          <p className="card-text" data-testid="your-answer">{session.answer}</p>
          <p className="flashcard-label">Model answer</p>
          <p className="card-text" data-testid="model-answer">{correctText}</p>
          <p className="muted">Compare them. How did you do? Your answer is marked as self-checked.</p>
          <div className="session-actions">
            <button className="button primary" onClick={() => void save(session.answer, 'correct', true)}>I got it right</button>
            <button className="button" onClick={() => void save(session.answer, 'partial', true)}>Partly right</button>
            <button className="button" onClick={() => void save(session.answer, 'wrong', true)}>I missed it</button>
          </div>
        </div>
      )}
      {attempt && feedback && (
        <div className="session-card" data-testid="practice-feedback" data-result={attempt.result}>
          <h2 className="question-prompt card-text">{question.prompt}</h2>
          <p className={attempt.result === 'correct' ? 'practice-verdict good' : 'practice-verdict'} data-testid="verdict"><strong>{feedback.title}{attempt.selfChecked ? ' (self-checked)' : ''}.</strong> {feedback.detail}</p>
          <p className="flashcard-label">Your answer</p>
          <p className="card-text">{attempt.answer}</p>
          <p className="flashcard-label">{isChoice ? 'Correct answer' : 'Model answer'}</p>
          <p className="card-text" data-testid="correct-answer">{correctText}</p>
          {question.explanation && <><p className="flashcard-label">Why</p><p className="card-text">{question.explanation}</p></>}
          {question.source && <p className="muted file-meta">Source: {question.source}</p>}
          <fieldset className="confidence" data-testid="difficulty">
            <legend>How hard did this feel? (optional, doesn't change your score)</legend>
            {DIFFICULTY_LEVELS.map((level) => (
              <label key={level}>
                <input
                  type="radio"
                  name={`${attempt.id}-difficulty`}
                  checked={attempt.difficulty === level}
                  onChange={() => {
                    // Shown at once; the save follows, and a failed save is said rather than hidden.
                    setAttempts((current) => new Map(current).set(attempt.id, { ...attempt, difficulty: level }));
                    void setAttemptDifficulty(attempt.id, level).catch((error: Error) => setFailure(`How hard it felt wasn't saved. ${error.message}`));
                  }}
                />
                <span>{level}</span>
              </label>
            ))}
          </fieldset>
          <div className="session-actions">
            <button className="button primary" onClick={next}>{left > 1 ? 'Next question' : 'See results'}</button>
          </div>
        </div>
      )}
    </div>
  );
}

import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { gradeAutomatically } from '../data/mastery';
import {
  clearPracticeSession, listAllTopics, listPracticeAttempts, listPracticeQuestions, listPracticeSets, loadPracticeSession, recordAttempt, savePracticeSession, type PracticeSession,
} from '../data/practice';
import { feedbackFor, mistakesIn } from '../data/practiceRules';
import { useStudyClock } from '../data/studyClock';
import { CONFIDENCE_LEVELS, PRACTICE_KIND_LABEL, type Confidence, type PracticeAttempt, type PracticeKind, type PracticeQuestion, type PracticeResult } from '../data/types';
import { topicLabeler } from './PracticePage';

const newId = () => crypto.randomUUID();

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
  const [failure, setFailure] = useState('');
  const busy = useRef(false);

  useEffect(() => {
    let active = true;
    setLoaded(false);
    setSession(null);
    (async () => {
      const [saved, allQuestions, allAttempts, sets, topics] = await Promise.all([
        loadPracticeSession(), listPracticeQuestions(), listPracticeAttempts(), listPracticeSets(), listAllTopics(),
      ]);
      if (!active) return;
      setQuestions(new Map(allQuestions.map((question) => [question.id, question])));
      setAttempts(new Map(allAttempts.map((attempt) => [attempt.id, attempt])));
      const present = new Set(allQuestions.map((question) => question.id));
      if (saved && saved.url === url && saved.questionIds.every((id) => present.has(id))) {
        setSession(saved);
      } else {
        const courseSets = params.get('course') ? new Set(sets.filter((set) => set.courseId === params.get('course')).map((set) => set.id)) : null;
        const inScope = allQuestions.filter((question) => (!setId || question.setId === setId) && (!courseSets || courseSets.has(question.setId)));
        const labelOf = topicLabeler(sets, topics);
        let picked = inScope;
        if (mode === 'mistakes') picked = mistakesIn(inScope, allAttempts);
        if (mode === 'topic') picked = inScope.filter((question) => labelOf(question) === params.get('topic'));
        const kind = params.get('kind') as PracticeKind | null;
        if (kind) picked = picked.filter((question) => question.kind === kind);
        if (picked.length > 0) {
          const fresh: PracticeSession = {
            id: newId(), url, questionIds: picked.map((question) => question.id), position: 0, attemptId: newId(), draft: '', selected: null, confidence: null, checking: false, answer: '',
          };
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

  const change = (patch: Partial<PracticeSession>) => {
    if (!session) return;
    const next = { ...session, ...patch };
    setSession(next);
    // A failed draft save only risks a little typing, so the student isn't interrupted.
    if (next.position >= next.questionIds.length) void clearPracticeSession().catch(() => undefined);
    else void savePracticeSession(next).catch(() => undefined);
  };

  const back = setId ? `/practice/${setId}` : '/practice';
  if (!loaded) return <p className="page muted">Loading…</p>;
  if (failure && !session) return <div className="page"><h1>Practice</h1><p className="error" role="alert">Your questions couldn't be loaded. {failure}</p></div>;
  if (!session) {
    return (
      <div className="page">
        <h1>Nothing to practice</h1>
        <p className="muted">{mode === 'mistakes' ? 'You have no mistakes to review.' : 'No questions match this.'}</p>
        <p><Link className="button primary" to={back}>Back</Link></p>
      </div>
    );
  }

  const finished = session.position >= session.questionIds.length;
  if (finished) {
    const results = [...attempts.values()].filter((attempt) => attempt.sessionId === session.id);
    const count = (result: PracticeResult) => results.filter((attempt) => attempt.result === result).length;
    const missed = count('wrong') + count('partial');
    return (
      <div className="page review-page">
        <h1>Practice finished</h1>
        <p data-testid="practice-summary">{count('correct')} correct, {count('partial')} partly right, {count('wrong')} wrong.</p>
        <div className="session-actions">
          {missed > 0 && <Link className="button primary" to={`/practice/session?mode=mistakes${setId ? `&set=${setId}` : ''}`}>Practice what you missed</Link>}
          <Link className="button" to={back}>Done</Link>
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

  const next = () => change({ position: session.position + 1, attemptId: newId(), draft: '', selected: null, confidence: null, checking: false, answer: '' });
  const feedback = attempt ? feedbackFor(attempt.result, attempt.confidence) : null;
  const ready = isChoice ? session.selected !== null : session.draft.trim() !== '';

  return (
    <div className="page review-page">
      <header className="course-head">
        <div>
          <h1>Practice</h1>
          <p className="muted" data-testid="practice-left">{left} left. {PRACTICE_KIND_LABEL[question.kind]}{question.topic ? `, ${question.topic}` : ''}.</p>
        </div>
        <Link to={back}>Stop for now</Link>
      </header>
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
          <div className="session-actions">
            <button className="button primary" onClick={next}>{left > 1 ? 'Next question' : 'See results'}</button>
          </div>
        </div>
      )}
    </div>
  );
}

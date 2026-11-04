import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { getCheckpoint, getLesson, getProgress, listCheckpoints, listLessons, listProgress, recordStudyAction } from '../../data/guided';
import {
  canAutoGrade, countLesson, evaluateMastery, gradeAutomatically, missingContent, newProgress, recommendNext, STATUS_LABEL, type StudyAction,
} from '../../data/mastery';
import { getCourse, getMaterial } from '../../data/store';
import type { Checkpoint, CheckpointProgress, GuidedQuestion, KeyPointRating, Lesson } from '../../data/types';
import { useLive } from '../../data/useLive';

const newAttempt = () => crypto.randomUUID();

/** Keeps the student's place visible. Every number comes from saved records. */
function ProgressHeader({ checkpoint, progress, lesson }: { checkpoint: Checkpoint; progress: CheckpointProgress; lesson: Lesson | undefined }) {
  const { data } = useLive(async () => {
    const [course, lessons, checkpoints, records] = await Promise.all([
      lesson?.courseId ? getCourse(lesson.courseId) : Promise.resolve(undefined), listLessons(), listCheckpoints(), listProgress(),
    ]);
    return { course, lessons, checkpoints, records };
  }, [lesson?.courseId, checkpoint.id]);
  if (!data || !lesson) return null;
  const { course, lessons, checkpoints, records } = data;
  const count = countLesson(checkpoints.filter((c) => c.lessonId === lesson.id), records);
  const siblings = lessons.filter((candidate) => candidate.courseId === lesson.courseId);
  const completed = siblings.filter((candidate) => countLesson(checkpoints.filter((c) => c.lessonId === candidate.id), records).completed).length;
  const wrong = progress.answers.filter((answer) => !answer.correct).length;
  return (
    <div className="session-progress" data-testid="session-progress">
      <p className="session-course">{course?.name ?? 'No course'}</p>
      <p data-testid="lesson-progress">{lesson.title}: {count.mastered}/{count.total} checkpoints mastered</p>
      <p data-testid="course-progress">Entire course: {completed}/{siblings.length} lessons completed</p>
      <p>Current: {checkpoint.title} <span className="status" data-status={progress.status} data-testid="status">({STATUS_LABEL[progress.status]})</span></p>
      {progress.answers.length > 0 && <p className="muted" data-testid="answer-counts">{progress.answers.length} answered: {progress.answers.length - wrong} right, {wrong} wrong</p>}
    </div>
  );
}

function teachingSteps(checkpoint: Checkpoint): { heading: string; body: ReactNode }[] {
  const t = checkpoint.teaching;
  const steps: { heading: string; body: ReactNode }[] = [];
  if (t.intro) steps.push({ heading: checkpoint.title, body: <p className="teach-text">{t.intro}</p> });
  if (t.meaning) steps.push({ heading: 'What it means', body: <p className="teach-text">{t.meaning}</p> });
  if (t.why) steps.push({ heading: 'Why it matters', body: <p className="teach-text">{t.why}</p> });
  if (t.parts.length) steps.push({ heading: 'The parts', body: <ul className="teach-text">{t.parts.map((part) => <li key={part}>{part}</li>)}</ul> });
  if (t.example) steps.push({ heading: 'A realistic example', body: <p className="teach-text">{t.example}</p> });
  if (t.walkthrough.length) steps.push({ heading: 'Walk through it', body: <ol className="teach-text">{t.walkthrough.map((step) => <li key={step}>{step}</li>)}</ol> });
  if (t.keyIdea) steps.push({ heading: 'The most important idea', body: <p className="teach-text">{t.keyIdea}</p> });
  return steps;
}

function Question({ question, attemptId, draft, busy, position, onDraft, onSubmit }: {
  question: GuidedQuestion;
  attemptId: string;
  draft: string;
  busy: boolean;
  position: number;
  onDraft: (text: string) => void;
  onSubmit: (answer: string) => void;
}) {
  // A new question always starts with nothing selected.
  const [selected, setSelected] = useState<string | null>(null);
  const [typed, setTyped] = useState(draft);
  const isChoice = question.options.length > 0;
  const ready = isChoice ? selected !== null : typed.trim() !== '';
  return (
    <form
      className="session-card"
      data-testid="question"
      data-attempt={attemptId}
      onSubmit={(event) => {
        event.preventDefault();
        if (ready && !busy) onSubmit(isChoice ? String(selected) : typed.trim());
      }}
    >
      <p className="step-count">Question {position}</p>
      <h2 className="question-prompt" id="question-prompt">{question.prompt}</h2>
      {isChoice ? (
        <fieldset className="options" aria-labelledby="question-prompt">
          {question.options.map((option, index) => (
            <label className="option" key={option}>
              <input type="radio" name={attemptId} checked={selected === String(index)} onChange={() => setSelected(String(index))} />
              <span>{option}</span>
            </label>
          ))}
        </fieldset>
      ) : (
        <label>Your answer
          <textarea
            className="answer-box"
            value={typed}
            onChange={(event) => {
              setTyped(event.target.value);
              onDraft(event.target.value);
            }}
          />
        </label>
      )}
      <div className="session-actions">
        <button className="button primary" type="submit" disabled={!ready || busy}>Submit answer</button>
      </div>
    </form>
  );
}

function ExplainWrite({ checkpoint, draft, busy, onDraft, onSubmit }: { checkpoint: Checkpoint; draft: string; busy: boolean; onDraft: (text: string) => void; onSubmit: (text: string) => void }) {
  const [text, setText] = useState(draft);
  return (
    <form className="session-card" onSubmit={(event) => { event.preventDefault(); if (text.trim() && !busy) onSubmit(text.trim()); }}>
      <h2>Explain it in your own words</h2>
      <p className="teach-text">{checkpoint.explainPrompt || `Explain ${checkpoint.title} in your own words.`}</p>
      <p className="muted">Don't look at your notes. Spelling and grammar don't matter, only whether you understand it.</p>
      <label>Your explanation
        <textarea className="answer-box" value={text} onChange={(event) => { setText(event.target.value); onDraft(event.target.value); }} />
      </label>
      <div className="session-actions">
        <button className="button primary" type="submit" disabled={!text.trim() || busy}>Check my explanation</button>
      </div>
    </form>
  );
}

const RATING_LABEL: Record<KeyPointRating, string> = { included: 'I included this', partly: 'Partly', missed: 'I missed this' };

function ExplainCheck({ checkpoint, text, busy, onRate }: { checkpoint: Checkpoint; text: string; busy: boolean; onRate: (ratings: KeyPointRating[]) => void }) {
  const points = checkpoint.keyPoints.filter((point) => point.trim());
  const [ratings, setRatings] = useState<(KeyPointRating | null)[]>(points.map(() => null));
  const ready = ratings.every((rating) => rating !== null);
  return (
    <div className="session-card">
      <h2>Compare it to the key points</h2>
      <p className="muted">Your explanation:</p>
      <p className="quote">{text}</p>
      <p>Be honest. This only helps if it shows what you really know. Mark each point:</p>
      {points.map((point, index) => (
        <div className="key-point" key={point}>
          <strong id={`point-${index}`}>{point}</strong>
          <fieldset aria-labelledby={`point-${index}`}>
            {(Object.keys(RATING_LABEL) as KeyPointRating[]).map((rating) => (
              <label key={rating}>
                <input type="radio" name={`point-${index}`} checked={ratings[index] === rating} onChange={() => setRatings(ratings.map((value, position) => (position === index ? rating : value)))} />
                {RATING_LABEL[rating]}
              </label>
            ))}
          </fieldset>
        </div>
      ))}
      <div className="session-actions">
        <button className="button primary" disabled={!ready || busy} onClick={() => onRate(ratings as KeyPointRating[])}>Finish check</button>
      </div>
    </div>
  );
}

export function SessionPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const [checkpoint, setCheckpoint] = useState<Checkpoint | null | undefined>(undefined);
  const [lesson, setLesson] = useState<Lesson | undefined>();
  const [progress, setProgress] = useState<CheckpointProgress | null>(null);
  const [materialName, setMaterialName] = useState('');
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState('');
  const draftTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const latestDraft = useRef<string | null>(null);
  const loadedRef = useRef<Checkpoint | null>(null);
  const { data: others } = useLive(async () => {
    const [lessons, checkpoints, records] = await Promise.all([listLessons(), listCheckpoints(), listProgress()]);
    return { lessons, checkpoints, records };
  }, [id]);

  useEffect(() => {
    let active = true;
    void (async () => {
      const found = await getCheckpoint(id);
      if (!active) return;
      setCheckpoint(found ?? null);
      loadedRef.current = found ?? null;
      if (!found) return;
      const [saved, owner, material] = await Promise.all([
        getProgress(id), getLesson(found.lessonId), found.materialId ? getMaterial(found.materialId) : Promise.resolve(undefined),
      ]);
      if (!active) return;
      setProgress(saved ?? newProgress(id, Date.now()));
      setLesson(owner);
      setMaterialName(material?.name ?? '');
    })().catch((error: Error) => {
      if (active) setFailure(`This checkpoint couldn't be loaded. ${error.message}`);
    });
    return () => {
      active = false;
      // Keep a half-typed answer when leaving this screen.
      clearTimeout(draftTimer.current);
      const target = loadedRef.current;
      if (latestDraft.current !== null && target) void recordStudyAction(target, { type: 'draft', text: latestDraft.current });
      latestDraft.current = null;
    };
  }, [id]);

  const act = async (action: StudyAction) => {
    if (!checkpoint) return;
    clearTimeout(draftTimer.current);
    latestDraft.current = null;
    setBusy(true);
    setFailure('');
    try {
      // Progress only appears once it's really saved.
      setProgress(await recordStudyAction(checkpoint, action));
    } catch (error) {
      setFailure(`That wasn't saved, so nothing has changed. Your answer is still here. ${(error as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  const saveDraft = (text: string) => {
    if (!checkpoint) return;
    latestDraft.current = text;
    clearTimeout(draftTimer.current);
    draftTimer.current = setTimeout(() => {
      latestDraft.current = null;
      void recordStudyAction(checkpoint, { type: 'draft', text }).catch(() => undefined);
    }, 400);
  };

  if (failure && !checkpoint) return <div className="page"><p className="error" role="alert">{failure}</p></div>;
  if (checkpoint === undefined || (checkpoint && !progress)) return <p className="page muted">Loading…</p>;
  if (checkpoint === null || !progress) return <div className="page"><h1>This checkpoint doesn't exist</h1><Link to="/study">Go to Study</Link></div>;

  const backLink = `/study/lessons/${checkpoint.lessonId}`;
  const missing = missingContent(checkpoint);
  const reteachFor = (idea: string) => {
    const specific = checkpoint.reteach.find((item) => item.idea === idea);
    return specific ?? checkpoint.reteach.find((item) => !item.idea) ?? null;
  };
  const answeredCount = progress.answers.length;
  const stage = progress.stage;
  const steps = teachingSteps(checkpoint);

  let body: ReactNode = null;
  if (missing.length > 0 && stage.kind !== 'mastered') {
    body = (
      <div className="session-card" data-testid="not-ready">
        <h2>This checkpoint isn't ready yet</h2>
        <p>It still needs {missing.join(' and ')}. Study Forge won't quiz you on something it hasn't taught.</p>
        <div className="session-actions">
          <Link className="button primary" to={`/study/lessons/${checkpoint.lessonId}/checkpoints/${checkpoint.id}/edit`}>Add what's missing</Link>
        </div>
      </div>
    );
  } else if (stage.kind === 'teach') {
    const index = Math.min(stage.step, steps.length - 1);
    const step = steps[index];
    const isLast = index >= steps.length - 1;
    body = (
      <div className="session-card" data-testid="teaching">
        <p className="step-count">Learning: step {index + 1} of {steps.length}</p>
        <h2>{step?.heading}</h2>
        {step?.body}
        <div className="session-actions">
          {index > 0 && <button className="button" disabled={busy} onClick={() => void act({ type: 'teach-step', step: index - 1 })}>Back</button>}
          {isLast
            ? <button className="button primary" disabled={busy} onClick={() => void act({ type: 'finish-teaching', skipped: false, attemptId: newAttempt() })}>Start practice</button>
            : <button className="button primary" disabled={busy} onClick={() => void act({ type: 'teach-step', step: index + 1 })}>Continue</button>}
          {!isLast && <button className="text-button" disabled={busy} onClick={() => void act({ type: 'finish-teaching', skipped: true, attemptId: newAttempt() })}>I already know this</button>}
        </div>
      </div>
    );
  } else if (stage.kind === 'question') {
    const question = checkpoint.questions.find((candidate) => candidate.id === stage.questionId);
    body = question ? (
      <Question
        key={stage.attemptId}
        question={question}
        attemptId={stage.attemptId}
        draft={progress.draft}
        busy={busy}
        position={answeredCount + 1}
        onDraft={saveDraft}
        onSubmit={(answer) => {
          if (canAutoGrade(question, answer)) {
            void act({ type: 'answer', attemptId: stage.attemptId, questionId: question.id, answer, correct: gradeAutomatically(question, answer), method: 'automatic' });
          } else {
            void act({ type: 'to-self-check', attemptId: stage.attemptId, questionId: question.id, answer });
          }
        }}
      />
    ) : (
      <div className="session-card">
        <p>This question was removed from the checkpoint.</p>
        <button className="button primary" onClick={() => void act({ type: 'finish-reteach', attemptId: newAttempt() })}>Continue</button>
      </div>
    );
  } else if (stage.kind === 'self-check') {
    const question = checkpoint.questions.find((candidate) => candidate.id === stage.questionId);
    const mark = (correct: boolean) => void act({ type: 'answer', attemptId: stage.attemptId, questionId: stage.questionId, answer: stage.answer, correct, method: 'self-checked' });
    body = (
      <div className="session-card" data-testid="self-check">
        <h2>Check your answer</h2>
        <p className="question-prompt">{question?.prompt}</p>
        <p className="muted">Your answer:</p>
        <p className="quote">{stage.answer}</p>
        <p className="muted">Model answer:</p>
        <p className="quote">{question?.modelAnswer || 'This question has no saved answer.'}</p>
        <p>Does your answer mean the same thing? Different wording is fine.</p>
        <div className="session-actions">
          <button className="button primary" disabled={busy} onClick={() => mark(true)}>Yes, I got it</button>
          <button className="button" disabled={busy} onClick={() => mark(false)}>No, not quite</button>
        </div>
      </div>
    );
  } else if (stage.kind === 'feedback') {
    const record = progress.answers.find((answer) => answer.attemptId === stage.attemptId);
    const question = checkpoint.questions.find((candidate) => candidate.id === record?.questionId);
    const shown = question?.options.length ? question.options[Number(record?.answer)] : record?.answer;
    body = (
      <div className="session-card" data-testid="feedback">
        <p className="verdict" data-correct={String(record?.correct)}>{record?.correct ? 'That\'s right.' : 'Not quite.'}</p>
        <p className="muted">{question?.prompt}</p>
        <p className="muted">Your answer{record?.method === 'self-checked' ? ', which you checked yourself' : ''}:</p>
        <p className="quote">{shown}</p>
        {!record?.correct && question?.modelAnswer && <><p className="muted">The answer:</p><p className="quote">{question.modelAnswer}</p></>}
        {question?.explanation && <p className="teach-text">{question.explanation}</p>}
        <div className="session-actions">
          <button className="button primary" disabled={busy} onClick={() => void act({ type: 'continue', attemptId: newAttempt() })}>Continue</button>
        </div>
      </div>
    );
  } else if (stage.kind === 'reteach') {
    const help = reteachFor(stage.idea);
    body = (
      <div className="session-card" data-testid="reteach">
        <h2>Let's look at that part again</h2>
        {help?.explanation && <p className="teach-text">{help.explanation}</p>}
        {help?.example && <><p className="muted">A different example:</p><p className="teach-text">{help.example}</p></>}
        {!help && <p className="teach-text">{checkpoint.teaching.keyIdea || checkpoint.teaching.meaning}</p>}
        {!help && <p className="muted">This lesson doesn't have another example yet, so here's the main idea again.</p>}
        <div className="session-actions">
          <button className="button primary" disabled={busy} onClick={() => void act({ type: 'finish-reteach', attemptId: newAttempt() })}>Try another question</button>
        </div>
      </div>
    );
  } else if (stage.kind === 'stuck') {
    const idea = stage.idea;
    const next = others ? recommendNext(others.lessons, others.checkpoints.filter((c) => c.id !== checkpoint.id), others.records) : null;
    body = (
      <div className="session-card" data-testid="stuck">
        <h2>This part needs a little more time</h2>
        <p>That's normal, and everything you've already gotten right is saved. What would help?</p>
        <div className="session-actions">
          <button className="button primary" disabled={busy} onClick={() => void act({ type: 'try-another-example', idea })}>Try another example</button>
          {checkpoint.materialId && materialName && <Link className="button" to={`/files/${checkpoint.materialId}`}>Review {materialName}</Link>}
          <Link className="button" to={next ? `/study/checkpoints/${next.checkpoint.id}` : backLink}>Move on and return later</Link>
        </div>
      </div>
    );
  } else if (stage.kind === 'explain') {
    body = <ExplainWrite checkpoint={checkpoint} draft={progress.draft} busy={busy} onDraft={saveDraft} onSubmit={(text) => void act({ type: 'explain-write', text })} />;
  } else if (stage.kind === 'explain-check') {
    body = <ExplainCheck checkpoint={checkpoint} text={stage.text} busy={busy} onRate={(ratings) => void act({ type: 'explain-rate', text: stage.text, ratings })} />;
  } else if (stage.kind === 'explain-result') {
    const last = progress.explanations.at(-1);
    const points = checkpoint.keyPoints.filter((point) => point.trim());
    const gaps = points.filter((_, index) => last?.ratings[index] !== 'included');
    body = (
      <div className="session-card" data-testid="explain-result">
        <h2>{last?.passed ? 'You covered the key points' : 'Almost there'}</h2>
        {gaps.length > 0 && <><p>Here's what to work in next time:</p><ul>{gaps.map((gap) => <li key={gap}>{gap}</li>)}</ul></>}
        <div className="session-actions">
          <button className="button primary" disabled={busy} onClick={() => void act(last?.passed ? { type: 'finish-reteach', attemptId: newAttempt() } : { type: 'explain-again' })}>
            {last?.passed ? 'Continue' : 'Try explaining again'}
          </button>
          {!last?.passed && <Link className="button" to={backLink}>Come back later</Link>}
        </div>
      </div>
    );
  } else if (stage.kind === 'mastered') {
    const evidence = evaluateMastery(checkpoint, progress);
    const siblings = others?.checkpoints.filter((c) => c.lessonId === checkpoint.lessonId) ?? [];
    const nextInLesson = siblings.find((c) => c.id !== checkpoint.id && missingContent(c).length === 0 && others?.records.get(c.id)?.status !== 'mastered');
    const next = others ? recommendNext(others.lessons, others.checkpoints.filter((c) => c.id !== checkpoint.id), others.records) : null;
    const goTo = nextInLesson ?? next?.checkpoint;
    body = (
      <div className="session-card" data-testid="mastered">
        <h2>You've mastered this checkpoint</h2>
        <p>{Math.round(evidence.accuracy * 100)}% of your latest answers were right{evidence.applicationNeeded ? ', including applying it to a situation' : ''}, and you explained it in your own words.</p>
        <p className="muted">You checked your explanation yourself against the key points. Later review can bring this back so it sticks.</p>
        <div className="session-actions">
          {goTo && <button className="button primary" onClick={() => navigate(`/study/checkpoints/${goTo.id}`)}>Next checkpoint</button>}
          <Link className={goTo ? 'button' : 'button primary'} to={backLink}>Back to lesson</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="page session">
      <ProgressHeader key={`${checkpoint.id}-${answeredCount}-${progress.status}`} checkpoint={checkpoint} progress={progress} lesson={lesson} />
      {failure && <p className="error" role="alert">{failure}</p>}
      {body}
      {(checkpoint.sourceNote || (checkpoint.materialId && materialName)) && (
        <p className="muted source-note">
          Source: {checkpoint.sourceNote}
          {checkpoint.materialId && materialName && <> <Link to={`/files/${checkpoint.materialId}`}>Open {materialName}</Link></>}
        </p>
      )}
    </div>
  );
}

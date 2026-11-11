import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { correctTextOf, formatClock } from '../data/examRules';
import { clearExamInProgress, finishExam, loadExamInProgress, saveExamInProgress, type ExamInProgress } from '../data/exams';
import { gradeAutomatically } from '../data/mastery';
import { listPracticeQuestions } from '../data/practice';
import { useStudyClock } from '../data/studyClock';
import { PRACTICE_KIND_LABEL, type ExamItem, type PracticeQuestion } from '../data/types';

export function ExamRunPage() {
  const navigate = useNavigate();
  const [exam, setExam] = useState<ExamInProgress | null | undefined>(undefined);
  useStudyClock(exam?.courseId ?? null);
  const [questions, setQuestions] = useState<PracticeQuestion[]>([]);
  const [now, setNow] = useState(Date.now());
  const [confirmFinish, setConfirmFinish] = useState(false);
  const [confirmQuit, setConfirmQuit] = useState(false);
  const [failure, setFailure] = useState('');
  const finishing = useRef(false);

  useEffect(() => {
    let active = true;
    Promise.all([loadExamInProgress(), listPracticeQuestions()]).then(([saved, all]) => {
      if (!active) return;
      const byId = new Map(all.map((question) => [question.id, question]));
      setQuestions((saved?.questionIds ?? []).map((id) => byId.get(id)).filter((question): question is PracticeQuestion => !!question));
      setExam(saved ?? null);
    }).catch((error: Error) => { if (active) setFailure(error.message); });
    return () => { active = false; };
  }, []);

  const finish = useCallback(async (current: ExamInProgress, timedOut: boolean) => {
    if (finishing.current) return;
    finishing.current = true;
    setFailure('');
    const items: ExamItem[] = questions.map((question) => {
      const answer = current.answers[question.id];
      const isChoice = question.options.length > 0;
      const given = isChoice ? answer?.selected ?? null : answer?.text.trim() ?? '';
      const empty = isChoice ? given === null : given === '';
      let result: ExamItem['result'];
      if (empty) result = 'wrong';
      else if (gradeAutomatically(question, String(given))) result = 'correct';
      else result = isChoice ? 'wrong' : null;
      return {
        questionId: question.id,
        setId: question.setId,
        kind: question.kind,
        prompt: question.prompt,
        answer: empty ? '' : isChoice ? question.options[given as number] : String(given),
        correctText: correctTextOf(question),
        explanation: question.explanation,
        source: question.source,
        topic: question.topic,
        result,
      };
    });
    const finishedAt = Date.now();
    try {
      await finishExam({
        id: current.id, name: current.name, courseId: current.courseId, durationMinutes: current.durationMinutes, startedAt: current.startedAt, finishedAt, timedOut, items, updatedAt: finishedAt,
      });
      navigate(`/exams/result/${current.id}`, { replace: true });
    } catch (error) {
      finishing.current = false;
      // The answers are still saved on this device, so nothing is lost.
      setFailure(`Your exam wasn't submitted, but your answers are safe. Try again. ${(error as Error).message}`);
    }
  }, [navigate, questions]);

  const endsAt = exam?.endsAt ?? null;
  useEffect(() => {
    if (endsAt === null) return undefined;
    const timer = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(timer);
  }, [endsAt]);

  useEffect(() => {
    if (exam && endsAt !== null && now >= endsAt && questions.length > 0) void finish(exam, true);
  }, [exam, endsAt, now, questions, finish]);

  const change = (patch: Partial<ExamInProgress>) => {
    if (!exam) return;
    const next = { ...exam, ...patch };
    setExam(next);
    // A failed save only risks the latest change, and the answer is still on screen.
    void saveExamInProgress(next).catch(() => undefined);
  };

  if (exam === undefined) return <p className="page muted">{failure || 'Loading…'}</p>;
  if (exam === null) return <div className="page"><h1>No exam in progress</h1><p><Link className="button primary" to="/exams">Go to Exam Hall</Link></p></div>;
  if (questions.length === 0) {
    return (
      <div className="page">
        <h1>This exam's questions are gone</h1>
        <p className="muted">They were deleted after the exam started.</p>
        <p><button className="button primary" onClick={() => { void clearExamInProgress().then(() => navigate('/exams')); }}>Back to Exam Hall</button></p>
      </div>
    );
  }
  const position = Math.min(exam.position, questions.length - 1);
  const question = questions[position];
  const answer = exam.answers[question.id] ?? { selected: null, text: '' };
  const isAnswered = (entry: PracticeQuestion) => {
    const saved = exam.answers[entry.id];
    return entry.options.length > 0 ? saved?.selected !== null && saved?.selected !== undefined : !!saved?.text.trim();
  };
  const unanswered = questions.filter((entry) => !isAnswered(entry)).length;
  const remaining = endsAt === null ? null : endsAt - now;
  const setAnswer = (patch: Partial<typeof answer>) => change({ answers: { ...exam.answers, [question.id]: { ...answer, ...patch } } });

  return (
    <div className="page review-page">
      <header className="course-head">
        <div>
          <h1>Mock exam</h1>
          <p className="muted" data-testid="exam-position">Question {position + 1} of {questions.length}. {PRACTICE_KIND_LABEL[question.kind]}.</p>
        </div>
        {remaining !== null && <p className={remaining < 60_000 ? 'exam-clock low' : 'exam-clock'} role="timer" aria-label="Time left" data-testid="exam-clock">{formatClock(remaining)}</p>}
      </header>
      {failure && <p className="error" role="alert">{failure}</p>}
      <nav className="exam-strip" aria-label="Exam questions">
        {questions.map((entry, index) => (
          <button key={entry.id} className="exam-dot" aria-current={index === position} data-answered={isAnswered(entry)} aria-label={`Question ${index + 1}, ${isAnswered(entry) ? 'answered' : 'not answered'}`} onClick={() => change({ position: index })}>{index + 1}</button>
        ))}
      </nav>
      <div className="session-card" data-testid="exam-question">
        <h2 className="question-prompt card-text" id="exam-prompt">{question.prompt}</h2>
        {question.options.length > 0 ? (
          <fieldset className="options" aria-labelledby="exam-prompt">
            {question.options.map((option, index) => (
              <label className="option" key={`${question.id}-${index}`}>
                <input type="radio" name={question.id} checked={answer.selected === index} onChange={() => setAnswer({ selected: index })} />
                <span>{option}</span>
              </label>
            ))}
          </fieldset>
        ) : (
          <label>Your answer
            <textarea aria-label="Your answer" className="answer-box" value={answer.text} onChange={(event) => setAnswer({ text: event.target.value })} />
          </label>
        )}
      </div>
      <div className="session-actions exam-actions">
        <button className="button" disabled={position === 0} onClick={() => change({ position: position - 1 })}>Previous</button>
        {position < questions.length - 1 && <button className="button primary" onClick={() => change({ position: position + 1 })}>Next</button>}
        <button className={position === questions.length - 1 ? 'button primary' : 'button'} onClick={() => setConfirmFinish(true)}>Finish exam</button>
        <button className="text-button danger-text" onClick={() => setConfirmQuit(true)}>Quit without saving</button>
      </div>
      {confirmFinish && (
        <ConfirmDialog
          title="Finish this exam?"
          confirmLabel="Finish exam"
          onCancel={() => setConfirmFinish(false)}
          onConfirm={async () => {
            setConfirmFinish(false);
            await finish(exam, false);
          }}
        >
          <p>{unanswered > 0 ? `You have ${unanswered} unanswered ${unanswered === 1 ? 'question' : 'questions'}, which will count as wrong. ` : ''}You'll see your results next.</p>
        </ConfirmDialog>
      )}
      {confirmQuit && (
        <ConfirmDialog
          title="Quit this exam?"
          confirmLabel="Quit without saving"
          onCancel={() => setConfirmQuit(false)}
          onConfirm={async () => {
            setConfirmQuit(false);
            await clearExamInProgress();
            navigate('/exams');
          }}
        >
          <p>Your answers won't be saved, and this exam won't count.</p>
        </ConfirmDialog>
      )}
    </div>
  );
}

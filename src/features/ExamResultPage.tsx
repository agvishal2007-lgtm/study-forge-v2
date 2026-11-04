import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { useStillHere } from '../components/useStillHere';
import { examScore, pendingChecks } from '../data/examRules';
import { checkExamAnswer, deleteExamResult, getExamResult } from '../data/exams';
import { formatDate } from '../data/format';
import { useLive } from '../data/useLive';
import type { PracticeResult } from '../data/types';

const LABEL: Record<PracticeResult, string> = { correct: 'Correct', partial: 'Partly right', wrong: 'Wrong' };

export function ExamResultPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const stillHere = useStillHere();
  const [failure, setFailure] = useState('');
  const [confirm, setConfirm] = useState(false);
  const { data: result, loading } = useLive(() => getExamResult(id), [id]);
  if (loading && !result) return <p className="page muted">Loading…</p>;
  if (!result) return <div className="page"><h1>This exam isn't here</h1><Link to="/exams">Go to Exam Hall</Link></div>;
  const score = examScore(result.items);
  const pending = pendingChecks(result.items);
  const count = (value: PracticeResult) => result.items.filter((item) => item.result === value).length;
  const check = (questionId: string, verdict: PracticeResult) => {
    setFailure('');
    checkExamAnswer(result.id, questionId, verdict).catch((error: Error) => setFailure(`That wasn't saved. ${error.message}`));
  };
  // Written answers come first, because they're what's left to do.
  const ordered = [...result.items].sort((a, b) => Number(a.result !== null) - Number(b.result !== null));

  return (
    <div className="page review-page">
      <p><Link to="/exams">Back to Exam Hall</Link></p>
      <header className="course-head">
        <div>
          <h1>{result.name}</h1>
          <p className="muted">{formatDate(result.finishedAt)}{result.timedOut ? '. Time ran out, so it was submitted for you.' : '.'}</p>
        </div>
        <button className="text-button danger-text" onClick={() => setConfirm(true)}>Delete exam</button>
      </header>
      {failure && <p className="error" role="alert">{failure}</p>}
      {score !== null
        ? <p className="exam-score" data-testid="exam-score">{score}%</p>
        : <p className="notice" data-testid="exam-pending">Check {pending} written {pending === 1 ? 'answer' : 'answers'} below to see your score.</p>}
      <p className="muted" data-testid="exam-tally">{count('correct')} correct, {count('partial')} partly right, {count('wrong')} wrong out of {result.items.length}. A partly right answer counts as half.</p>
      {count('wrong') + count('partial') > 0 && <p><Link className="button primary" to={`/practice/session?mode=mistakes${result.courseId ? `&course=${result.courseId}` : ''}`}>Practice your mistakes</Link></p>}
      <ol className="exam-review">
        {ordered.map((item) => (
          <li key={item.questionId} className="session-card" data-testid="exam-item" data-result={item.result ?? 'pending'}>
            <h2 className="question-prompt card-text">{item.prompt}</h2>
            <p className="flashcard-label">Your answer</p>
            <p className="card-text">{item.answer || 'No answer'}</p>
            <p className="flashcard-label">{item.kind === 'multiple' ? 'Correct answer' : 'Model answer'}</p>
            <p className="card-text">{item.correctText}</p>
            {item.explanation && <><p className="flashcard-label">Why</p><p className="card-text">{item.explanation}</p></>}
            {item.source && <p className="muted file-meta">Source: {item.source}</p>}
            {item.result === null
              ? (
                <div className="session-actions">
                  <button className="button primary" onClick={() => check(item.questionId, 'correct')} aria-label={`I got it right: ${item.prompt}`}>I got it right</button>
                  <button className="button" onClick={() => check(item.questionId, 'partial')} aria-label={`Partly right: ${item.prompt}`}>Partly right</button>
                  <button className="button" onClick={() => check(item.questionId, 'wrong')} aria-label={`I missed it: ${item.prompt}`}>I missed it</button>
                </div>
              )
              : <p className={item.result === 'correct' ? 'practice-verdict good' : 'practice-verdict'}><strong>{LABEL[item.result]}</strong></p>}
          </li>
        ))}
      </ol>
      {confirm && (
        <ConfirmDialog
          title="Delete this exam?"
          confirmLabel="Delete exam"
          onCancel={() => setConfirm(false)}
          onConfirm={async () => {
            setConfirm(false);
            await deleteExamResult(result.id);
            if (stillHere.current) navigate('/exams', { replace: true });
          }}
        >
          <p>This removes its score from Exam Hall. Your practice history stays.</p>
        </ConfirmDialog>
      )}
    </div>
  );
}

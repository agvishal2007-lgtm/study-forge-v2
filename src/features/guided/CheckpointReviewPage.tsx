import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { getCheckpoint, getLesson, saveReview } from '../../data/guided';
import { gradeAutomatically } from '../../data/mastery';
import { inChosenOrder } from '../../data/studyToolRules';
import { useDisplayPrefs } from '../../data/displayPrefs';
import { useLive } from '../../data/useLive';
import { Question } from './SessionPage';
import type { Checkpoint, GuidedQuestion } from '../../data/types';

/**
 * Practising a checkpoint again, once it has already been mastered.
 *
 * Reviewing is not restarting, and the difference matters: a student who wants a refresher before
 * an exam should not have to give up the record of having understood this. So nothing here touches
 * mastery, the status, or the answers that earned it. The only mark a review leaves is that it
 * happened, and how it went — which is what decides what gets suggested for review next.
 *
 * It is deliberately a plainer loop than a study session: no teaching, no reteaching ladder, no
 * explanation check. Those are for learning something. This is for remembering it.
 */
export function CheckpointReviewPage() {
  const { checkpointId } = useParams();
  const navigate = useNavigate();
  const { practiceOrder } = useDisplayPrefs();
  const { data: checkpoint } = useLive(() => getCheckpoint(checkpointId ?? ''), [checkpointId]);
  const { data: lesson } = useLive(
    () => (checkpoint ? getLesson(checkpoint.lessonId) : Promise.resolve(undefined)),
    [checkpoint?.lessonId],
  );

  const [at, setAt] = useState(0);
  const [given, setGiven] = useState<{ answer: string; correct: boolean } | null>(null);
  const [right, setRight] = useState(0);
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState('');

  /*
   * The student's own setting decides the order, the same as it does in practice, and the shuffle
   * is seeded by the checkpoint so the order holds still while they are working through it.
   */
  const questions: GuidedQuestion[] = useMemo(
    () => (checkpoint ? inChosenOrder(checkpoint.questions, practiceOrder, checkpoint.id) : []),
    [checkpoint, practiceOrder],
  );

  const done = at >= questions.length;
  useEffect(() => {
    if (!done || !checkpoint || saving) return;
    setSaving(true);
    saveReview(checkpoint.id, { answered: questions.length, correct: right })
      .catch((error: Error) => setFailure(`That review wasn't saved. ${error.message}`));
  }, [done, checkpoint, questions.length, right, saving]);

  if (!checkpointId) return null;
  if (!checkpoint) return <div className="page"><p className="muted">Loading…</p></div>;
  if (questions.length === 0) {
    return (
      <div className="page">
        <h1>Review {checkpoint.title}</h1>
        <p className="muted">This checkpoint has no practice questions yet, so there is nothing to go over.</p>
        <Link className="button" to={`/study/lessons/${checkpoint.lessonId}`}>Back to lesson</Link>
      </div>
    );
  }

  if (done) {
    return (
      <div className="page">
        <h1>Review finished</h1>
        <p data-testid="review-score">{right} of {questions.length} right.</p>
        <p className="muted">
          Your mastery of {checkpoint.title} is unchanged — reviewing never takes that away. Study Forge has noted
          that you went over it today, so it knows what to suggest next.
        </p>
        {failure && <p className="error" role="alert">{failure}</p>}
        <div className="session-actions">
          <button className="button primary" onClick={() => { setAt(0); setRight(0); setGiven(null); setSaving(false); }}>Go again</button>
          <Link className="button quiet" to={`/study/lessons/${checkpoint.lessonId}`}>Back to lesson</Link>
        </div>
      </div>
    );
  }

  const question = questions[at];
  return (
    <div className="page">
      <h1>Review {checkpoint.title}</h1>
      <p className="muted" data-testid="review-lead">
        Practising again. Nothing here changes what you mastered{lesson ? ` in ${lesson.title}` : ''}.
      </p>
      {given === null ? (
        <Question
          key={question.id}
          question={question}
          attemptId={`review-${question.id}`}
          draft=""
          busy={false}
          position={at + 1}
          onDraft={() => undefined}
          onSubmit={(answer) => {
            const correct = gradeAutomatically(question, answer);
            if (correct) setRight((count) => count + 1);
            setGiven({ answer, correct });
          }}
        />
      ) : (
        <div className="session-card" data-testid="review-feedback">
          <p className="status" data-status={given.correct ? 'mastered' : 'needs-review'}>{given.correct ? 'Right' : 'Not right'}</p>
          <p>{question.explanation}</p>
          {!given.correct && question.modelAnswer && <p className="muted">A good answer: {question.modelAnswer}</p>}
          <div className="session-actions">
            <button className="button primary" onClick={() => { setGiven(null); setAt((index) => index + 1); }}>
              {at + 1 === questions.length ? 'Finish review' : 'Next question'}
            </button>
          </div>
        </div>
      )}
      <p className="first-offer">
        <button className="button quiet" onClick={() => navigate(`/study/lessons/${checkpoint.lessonId}`)}>Stop reviewing</button>
      </p>
    </div>
  );
}

export const reviewPathFor = (checkpoint: Checkpoint) => `/study/checkpoints/${checkpoint.id}/review`;

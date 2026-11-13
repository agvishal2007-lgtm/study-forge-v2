import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { useStillHere } from '../../components/useStillHere';
import { deleteCheckpoint, deleteLesson, getLesson, listCheckpoints, listLessons, listProgress, resetProgress, saveLesson } from '../../data/guided';
import { countLesson, evaluateMastery, missingContent, STATUS_LABEL } from '../../data/mastery';
import { listAllCourses } from '../../data/store';
import type { Checkpoint } from '../../data/types';
import { useLive } from '../../data/useLive';

export function LessonPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const stillHere = useStillHere();
  const [confirm, setConfirm] = useState<{ kind: 'lesson' } | { kind: 'checkpoint' | 'reset'; checkpoint: Checkpoint } | null>(null);
  const [failure, setFailure] = useState('');
  const { data, error } = useLive(async () => {
    const [lesson, all, progress, lessons, courses] = await Promise.all([getLesson(id), listCheckpoints(), listProgress(), listLessons(), listAllCourses()]);
    return { lesson, checkpoints: all.filter((c) => c.lessonId === id), all, progress, lessons, courses };
  }, [id]);
  if (error) return <div className="page"><p className="error" role="alert">This lesson couldn't be loaded. {error.message}</p></div>;
  if (!data) return <p className="page muted">Loading…</p>;
  const { lesson, checkpoints, progress, courses } = data;
  if (!lesson) return <div className="page"><h1>This lesson doesn't exist</h1><Link to="/study">Go to Study</Link></div>;

  const count = countLesson(checkpoints, progress);
  const attempt = async (work: () => Promise<void>) => {
    setConfirm(null);
    setFailure('');
    try {
      await work();
    } catch (problem) {
      setFailure(`That didn't work. ${(problem as Error).message}`);
    }
  };

  return (
    <div className="page">
      <header className="course-head">
        <div>
          <h1>{lesson.title}</h1>
          <p className="muted" data-testid="lesson-count">{count.mastered} of {count.total} checkpoints mastered{count.completed ? '. Lesson completed.' : ''}</p>
        </div>
        <button className="text-button danger-text" onClick={() => setConfirm({ kind: 'lesson' })}>Delete lesson</button>
      </header>
      {failure && <p className="error" role="alert">{failure}</p>}
      <div className="filing">
        <label>Course
          <select value={lesson.courseId ?? ''} onChange={(event) => void attempt(() => saveLesson({ ...lesson, courseId: event.target.value || null }))}>
            <option value="">No course</option>
            {courses.map((course) => <option key={course.id} value={course.id}>{course.name}</option>)}
          </select>
        </label>
      </div>

      <section aria-labelledby="checkpoints-heading">
        <h2 id="checkpoints-heading">Checkpoints</h2>
        {checkpoints.length === 0 && <p className="muted">Add a checkpoint: one small idea to teach and practice.</p>}
        <ul className="checkpoints">
          {checkpoints.map((checkpoint) => {
            const record = progress.get(checkpoint.id);
            const status = record?.status ?? 'not-started';
            const missing = missingContent(checkpoint);
            const evidence = record ? evaluateMastery(checkpoint, record) : null;
            const wrong = record ? record.answers.filter((answer) => !answer.correct).length : 0;
            return (
              <li key={checkpoint.id}>
                <div>
                  <Link to={`/study/checkpoints/${checkpoint.id}`}>{checkpoint.title}</Link>
                  <div className="muted file-meta">
                    {missing.length > 0 ? `Still needs ${missing.join(', ')}` : evidence && record && record.answers.length > 0
                      ? `${record.answers.length} answered, ${record.answers.length - wrong} right, ${wrong} wrong`
                      : `${checkpoint.questions.length} practice questions`}
                  </div>
                </div>
                <div className="row-actions">
                  <span className="status" data-status={status}>{STATUS_LABEL[status]}</span>
                  <Link className="text-button" to={`/study/lessons/${lesson.id}/checkpoints/${checkpoint.id}/edit`} aria-label={`Edit ${checkpoint.title}`}>Edit</Link>
                  {record && <button className="text-button" onClick={() => setConfirm({ kind: 'reset', checkpoint })} aria-label={`Start ${checkpoint.title} over`}>Start over</button>}
                  <button className="text-button danger-text" onClick={() => setConfirm({ kind: 'checkpoint', checkpoint })} aria-label={`Delete ${checkpoint.title}`}>Delete</button>
                </div>
              </li>
            );
          })}
        </ul>
        <div className="session-actions">
          <button className="button primary" onClick={() => navigate(`/study/lessons/${lesson.id}/checkpoints/${crypto.randomUUID()}/edit`)}>Add checkpoint</button>
          <Link to="/study">Back to Study</Link>
        </div>
      </section>

      {confirm?.kind === 'lesson' && (
        <ConfirmDialog
          title={`Delete ${lesson.title}?`}
          confirmLabel="Delete lesson"
          onCancel={() => setConfirm(null)}
          onConfirm={() => void attempt(async () => { await deleteLesson(lesson.id); if (stillHere.current) navigate('/study', { replace: true }); })}
        >
          <p>The lesson, its checkpoints and your progress in them go to Trash together. You can restore them from there. Your files and notes aren't affected.</p>
        </ConfirmDialog>
      )}
      {confirm?.kind === 'checkpoint' && (
        <ConfirmDialog
          title={`Delete ${confirm.checkpoint.title}?`}
          confirmLabel="Delete checkpoint"
          onCancel={() => setConfirm(null)}
          onConfirm={() => void attempt(() => deleteCheckpoint(confirm.checkpoint.id))}
        >
          <p>This permanently removes the checkpoint and your progress in it.</p>
        </ConfirmDialog>
      )}
      {confirm?.kind === 'reset' && (
        <ConfirmDialog
          title={`Start ${confirm.checkpoint.title} over?`}
          confirmLabel="Clear my progress"
          onCancel={() => setConfirm(null)}
          onConfirm={() => void attempt(() => resetProgress(confirm.checkpoint.id))}
        >
          <p>This clears your answers and progress for this checkpoint only. The lesson, its questions, and everything else stay.</p>
        </ConfirmDialog>
      )}
    </div>
  );
}

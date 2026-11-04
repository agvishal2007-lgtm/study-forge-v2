import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { createLesson, listCheckpoints, listLessons, listProgress } from '../../data/guided';
import { countLesson, recommendNext, STATUS_LABEL } from '../../data/mastery';
import { addSampleLesson } from '../../data/sampleLesson';
import { listCourses } from '../../data/store';
import { useLive } from '../../data/useLive';

export function StudyPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [title, setTitle] = useState('');
  const [label, setLabel] = useState('Lesson');
  const [courseId, setCourseId] = useState(params.get('course') ?? '');
  const [failure, setFailure] = useState('');
  const { data, error } = useLive(async () => {
    const [courses, lessons, checkpoints, progress] = await Promise.all([listCourses(), listLessons(), listCheckpoints(), listProgress()]);
    return { courses, lessons, checkpoints, progress };
  });
  if (error) return <div className="page"><h1>Study</h1><p className="error" role="alert">Your lessons couldn't be loaded. {error.message}</p></div>;
  if (!data) return <p className="page muted">Loading…</p>;

  const { courses, lessons, checkpoints, progress } = data;
  const next = recommendNext(lessons, checkpoints, progress);
  const needsReview = checkpoints.filter((checkpoint) => progress.get(checkpoint.id)?.status === 'needs-review');
  const groups = [...courses.map((course) => ({ id: course.id as string | null, name: course.name, color: course.color })), { id: null, name: 'No course', color: 'var(--line)' }]
    .map((group) => ({ ...group, lessons: lessons.filter((lesson) => lesson.courseId === group.id) }))
    .filter((group) => group.lessons.length > 0);

  return (
    <div className="page">
      <h1>Study</h1>
      <p className="muted">Learn one small piece at a time: first the idea, then an example, then practice, then explain it in your own words.</p>
      {failure && <p className="error" role="alert">{failure}</p>}

      {next && (
        <section className="next-up" aria-labelledby="study-next" data-testid="next-up">
          <h2 id="study-next">Study next</h2>
          <p><Link to={`/study/checkpoints/${next.checkpoint.id}`}>{next.checkpoint.title}</Link></p>
          <p className="muted">{next.lesson.title}. {next.reason}</p>
        </section>
      )}

      {needsReview.length > 0 && (
        <section aria-labelledby="weak-heading">
          <h2 id="weak-heading">Needs review</h2>
          <ul className="checkpoints">
            {needsReview.map((checkpoint) => (
              <li key={checkpoint.id}>
                <Link to={`/study/checkpoints/${checkpoint.id}`}>{checkpoint.title}</Link>
                <span className="status" data-status="needs-review">{STATUS_LABEL['needs-review']}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {groups.map((group) => {
        const completed = group.lessons.filter((lesson) => countLesson(checkpoints.filter((c) => c.lessonId === lesson.id), progress).completed).length;
        return (
          <section className="study-course" key={group.id ?? 'none'} style={{ '--spine': group.color } as React.CSSProperties}>
            <h2>{group.name}</h2>
            <p className="muted">{completed} of {group.lessons.length} {group.lessons.length === 1 ? 'lesson' : 'lessons'} completed</p>
            {group.lessons.map((lesson) => {
              const count = countLesson(checkpoints.filter((c) => c.lessonId === lesson.id), progress);
              return (
                <div className="lesson-row" key={lesson.id}>
                  <Link to={`/study/lessons/${lesson.id}`}>{lesson.title}</Link>
                  <div className="muted file-meta">{count.mastered} of {count.total} checkpoints mastered</div>
                </div>
              );
            })}
          </section>
        );
      })}

      {lessons.length === 0 && (
        <section aria-labelledby="try-sample">
          <h2 id="try-sample">See how it works</h2>
          <p>Try a short sample lesson on accounting basics, or write your own below.</p>
        </section>
      )}
      <div className="session-actions">
        <button
          className={lessons.length === 0 ? 'button primary' : 'button'}
          onClick={async () => {
            setFailure('');
            try {
              const lesson = await addSampleLesson();
              navigate(`/study/lessons/${lesson.id}`);
            } catch (problem) {
              setFailure(`The sample lesson wasn't added. ${(problem as Error).message}`);
            }
          }}
        >
          Add sample lesson
        </button>
      </div>

      <section aria-labelledby="new-lesson">
        <h2 id="new-lesson">Write your own lesson</h2>
        <form
          className="inline-form"
          onSubmit={async (event) => {
            event.preventDefault();
            if (!title.trim()) return setFailure('Enter a lesson title.');
            setFailure('');
            try {
              const lesson = await createLesson(title, label, courseId || null);
              navigate(`/study/lessons/${lesson.id}`);
            } catch (problem) {
              setFailure(`The lesson wasn't saved. ${(problem as Error).message}`);
            }
          }}
        >
          <label>Lesson title<input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Chapter 1: Assets" /></label>
          <label>Called a
            <select value={label} onChange={(event) => setLabel(event.target.value)}>
              <option>Lesson</option>
              <option>Chapter</option>
              <option>Module</option>
              <option>Unit</option>
            </select>
          </label>
          <label>Course
            <select value={courseId} onChange={(event) => setCourseId(event.target.value)}>
              <option value="">No course</option>
              {courses.map((course) => <option key={course.id} value={course.id}>{course.name}</option>)}
            </select>
          </label>
          <button className="button" type="submit">Create lesson</button>
        </form>
      </section>
    </div>
  );
}

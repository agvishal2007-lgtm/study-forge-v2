import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { finishLesson, getAcademyProgress, saveLessonStage } from '../../data/academyProgress';
import { ActivityView, MockApp } from './Activities';
import { ALL_LESSONS, lessonById, MODULES } from './lessons';

/**
 * One Academy lesson, in short parts: what it is, where it lives, your turn, then what happened.
 * The lesson counts as finished only once the activity is done. Opening it, or pressing Next, never does.
 */
export function LessonPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const lesson = lessonById(id);
  type Part = 'intro' | 'demo' | 'try' | 'done';
  const parts: Part[] = lesson ? ['intro', ...(lesson.demo ? ['demo' as const] : []), 'try', 'done'] : [];
  const [stage, setStage] = useState(0);
  const [activityDone, setActivityDone] = useState(false);
  const [finishedBefore, setFinishedBefore] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);

  // Pick up where the student stopped, but never past the activity: it has to be done again to see the result.
  useEffect(() => {
    let active = true;
    setActivityDone(false);
    setStage(0);
    void getAcademyProgress().then((all) => {
      if (!active || !lesson) return;
      const saved = all[lesson.id];
      setFinishedBefore(Boolean(saved?.done));
      setStage(Math.min(saved?.stage ?? 0, parts.indexOf('try')));
    });
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);
  useEffect(() => { heading.current?.focus(); }, [stage]);

  if (!lesson) return <div className="page"><h1>Lesson not found</h1><Link to="/help">Back to the Academy</Link></div>;
  const module = MODULES.find((item) => item.lessons.some((other) => other.id === lesson.id))!;
  const part = parts[stage];
  const go = (next: number) => { setStage(next); void saveLessonStage(lesson.id, next); };
  const index = ALL_LESSONS.findIndex((other) => other.id === lesson.id);
  const following = ALL_LESSONS[index + 1];
  const titles = { intro: 'What it is', demo: 'Where it is', try: 'Your turn', done: 'Done' } as const;

  return (
    <div className="page academy-lesson" data-testid="academy-lesson">
      <p className="small"><Link to="/help">Academy</Link> › {module.title}</p>
      <h1>{lesson.title}</h1>
      <ol className="lesson-parts" aria-label="Parts of this lesson">
        {parts.map((name, number) => (
          <li key={name} className={number === stage ? 'current' : number < stage ? 'past' : ''} aria-current={number === stage ? 'step' : undefined}>{titles[name]}</li>
        ))}
      </ol>
      <section className="lesson-card" aria-labelledby="lesson-part">
        <h2 id="lesson-part" ref={heading} tabIndex={-1}>{titles[part]}</h2>
        {part === 'intro' && (
          <>
            <p className="lesson-lead">{lesson.intro}</p>
            {finishedBefore && <p className="muted small">You finished this lesson before. Do it again any time.</p>}
            <button className="button primary" type="button" onClick={() => go(stage + 1)}>{lesson.demo ? 'Show me where' : 'Try it'}</button>
          </>
        )}
        {part === 'demo' && lesson.demo && (
          <>
            <p>{lesson.demo.caption}</p>
            <MockApp screen={lesson.demo.screen} highlight={lesson.demo.highlight} />
            <button className="button primary" type="button" onClick={() => go(stage + 1)}>Now you try</button>
          </>
        )}
        {part === 'try' && (
          <>
            <p className="muted small">This is a practice copy. Nothing here changes your real work.</p>
            <ActivityView activity={lesson.activity} onDone={() => { if (!activityDone) { setActivityDone(true); void finishLesson(lesson.id); } }} />
            <div className="session-actions">
              <button className="button primary" type="button" disabled={!activityDone} onClick={() => go(stage + 1)}>{activityDone ? 'Finish lesson' : 'Finish the activity to continue'}</button>
            </div>
          </>
        )}
        {part === 'done' && (
          <>
            <p className="academy-feedback good" data-testid="lesson-done">✓ Lesson finished.</p>
            <p>{lesson.feedback}</p>
            <div className="session-actions">
              {following && <button className="button primary" type="button" onClick={() => navigate(`/help/lessons/${following.id}`)}>Next lesson: {following.title}</button>}
              <button className="button" type="button" onClick={() => { setActivityDone(false); go(0); }}>Do it again</button>
              <Link className="button" to="/help">All lessons</Link>
            </div>
          </>
        )}
      </section>
      <div className="session-actions lesson-nav">
        {stage > 0 && part !== 'done' && <button className="text-button" type="button" onClick={() => go(stage - 1)}>Back</button>}
        <Link className="text-button" to={`/help/guide?topic=${lesson.learnMore}`}>Learn more in the reference guide</Link>
      </div>
    </div>
  );
}

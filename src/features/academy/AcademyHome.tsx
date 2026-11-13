import { Link } from 'react-router-dom';
import { NAV_ICONS } from '../../components/NavIcons';
import { getAcademyProgress } from '../../data/academyProgress';
import { useLive } from '../../data/useLive';
import { useWalkthrough } from '../walkthrough/Walkthrough';
import { MODULES } from './lessons';

/** Study Forge Academy: short hands-on lessons, grouped into modules, with progress. */
export function AcademyHome() {
  const { start } = useWalkthrough();
  const { data: progress } = useLive(getAcademyProgress);
  const all = MODULES.flatMap((module) => module.lessons);
  const finished = all.filter((lesson) => progress?.[lesson.id]?.done).length;
  return (
    <div className="page academy-home" data-testid="academy">
      <h1>Study Forge Academy</h1>
      <p className="muted">Learn Study Forge by doing it: short lessons where you try each feature on a practice copy. Nothing you do here changes your real work.</p>
      <div className="academy-overall">
        <p data-testid="academy-overall"><b>{finished} of {all.length}</b> lessons finished</p>
        <div className="meter" aria-hidden="true"><span style={{ width: `${(finished / all.length) * 100}%` }} /></div>
      </div>
      <div className="academy-modules">
        {MODULES.map((module) => {
          const done = module.lessons.filter((lesson) => progress?.[lesson.id]?.done).length;
          const next = module.lessons.find((lesson) => !progress?.[lesson.id]?.done) ?? module.lessons[0];
          const started = module.lessons.some((lesson) => progress?.[lesson.id]);
          return (
            <section key={module.id} className="academy-module" aria-labelledby={`module-${module.id}`} data-testid="academy-module">
              <div className="academy-module-head">
                <span className="academy-icon" aria-hidden="true">{NAV_ICONS[module.icon]}</span>
                <div>
                  <h2 id={`module-${module.id}`}>{module.title}</h2>
                  <p className="muted small">{module.level} · {module.lessons.length} lessons</p>
                </div>
              </div>
              <p>{module.description}</p>
              <p className="small" data-testid="module-progress">{done === module.lessons.length ? '✓ All done' : `${done} of ${module.lessons.length} done`}</p>
              <div className="meter" aria-hidden="true"><span style={{ width: `${(done / module.lessons.length) * 100}%` }} /></div>
              <ol className="academy-lesson-list">
                {module.lessons.map((lesson) => (
                  <li key={lesson.id}>
                    <Link to={`/help/lessons/${lesson.id}`}>{lesson.title}</Link>
                    {progress?.[lesson.id]?.done && <span className="academy-tick" aria-label="finished"> ✓</span>}
                  </li>
                ))}
              </ol>
              <Link className="button primary" to={`/help/lessons/${next.id}`}>{done === module.lessons.length ? 'Review' : started ? 'Continue' : 'Start'}</Link>
            </section>
          );
        })}
      </div>
      <section className="academy-more" aria-labelledby="academy-more">
        <h2 id="academy-more">More help</h2>
        <p className="muted">The short walkthrough shows where everything is. The reference guide has the full details and limits of every feature.</p>
        <div className="session-actions">
          <button type="button" className="button" onClick={start}>Take the short walkthrough</button>
          <Link className="button" to="/help/guide">Open the reference guide</Link>
        </div>
      </section>
    </div>
  );
}

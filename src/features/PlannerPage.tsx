import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { PlannerList } from '../components/PlannerList';
import { listPlannerItems } from '../data/planner';
import { GROUP_LABEL, groupItems, localNow } from '../data/plannerRules';
import { listAllCourses } from '../data/store';
import { useLive } from '../data/useLive';
import { PriorityView } from './PriorityView';
import { PRIORITY_MODES, PRIORITY_MODE_LABEL, type PriorityMode } from '../data/priorityRules';
import { savedMode, saveMode, savedPinned, savePinned, savedWeights, saveWeights } from '../data/priorityChoice';

export function PlannerPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [courseId, setCourseId] = useState(params.get('course') ?? '');
  const [mode, setMode] = useState<PriorityMode>(savedMode);
  const [weights, setWeights] = useState(savedWeights);
  const [pinned, setPinned] = useState(savedPinned);
  const { data, error } = useLive(async () => {
    const [items, courses] = await Promise.all([listPlannerItems(), listAllCourses()]);
    return { items, courses };
  });
  if (error) return <div className="page"><h1>Planner</h1><p className="error" role="alert">Your planner couldn't be loaded. {error.message}</p></div>;
  if (!data) return <p className="page muted">Loading…</p>;
  const shown = data.items.filter((item) => !courseId || (courseId === 'none' ? !item.courseId : item.courseId === courseId));
  const groups = groupItems(shown, localNow());
  return (
    <div className="page">
      <h1>Planner</h1>
      <p className="muted">Assignments, exams, and everything else with a deadline.</p>
      <div className="session-actions" data-tour="add-planner">
        <button className="button primary" onClick={() => navigate(`/planner/new${courseId && courseId !== 'none' ? `?course=${courseId}` : ''}`)}>Add item</button>
      </div>
      {data.items.length > 0 && (
        <label className="search">Show
          <select value={courseId} onChange={(event) => setCourseId(event.target.value)}>
            <option value="">All courses</option>
            {data.courses.map((course) => <option key={course.id} value={course.id}>{course.name}</option>)}
            <option value="none">No course</option>
          </select>
        </label>
      )}
      {data.items.length > 0 && (
        <label className="search">Order by
          <select
            value={mode}
            data-testid="priority-mode"
            onChange={(event) => {
              const chosen = event.target.value as PriorityMode;
              setMode(chosen);
              saveMode(chosen);
            }}
          >
            {PRIORITY_MODES.map((option) => <option key={option} value={option}>{PRIORITY_MODE_LABEL[option]}</option>)}
          </select>
        </label>
      )}
      {data.items.length === 0 && <p className="muted planner-empty">Nothing here yet. Add your first assignment or exam, or look at your <Link to="/courses">courses</Link> first.</p>}
      {data.items.length > 0 && shown.length === 0 && <p className="muted planner-empty">Nothing here for this course.</p>}
      {mode === 'due'
        ? groups.map(({ group, items }) => (
          <section key={group} className="planner-group" aria-labelledby={`group-${group}`} data-group={group}>
            <h2 id={`group-${group}`} className={group === 'overdue' ? 'error' : undefined}>{GROUP_LABEL[group]} <span className="muted planner-count">({items.length})</span></h2>
            <PlannerList items={items} courses={data.courses} />
          </section>
        ))
        : shown.length > 0 && (
          <PriorityView
            items={shown}
            courses={data.courses}
            today={localNow().date}
            mode={mode}
            weights={weights}
            pinned={pinned}
            onPin={(id) => {
              const next = pinned.includes(id) ? pinned.filter((other) => other !== id) : [...pinned, id];
              setPinned(next);
              savePinned(next);
            }}
            onWeights={(next) => { setWeights(next); saveWeights(next); }}
          />
        )}
    </div>
  );
}

import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { PlannerList } from '../components/PlannerList';
import { listPlannerItems } from '../data/planner';
import { GROUP_LABEL, groupBySection, groupItems, isDone, localNow } from '../data/plannerRules';
import { setDisplayPref, useDisplayPrefs } from '../data/displayPrefs';
import { listAllCourses } from '../data/store';
import { listAllGradeCategories } from '../data/grades';
import { useLive } from '../data/useLive';
import { PriorityView } from './PriorityView';
import { PRIORITY_MODES, PRIORITY_MODE_LABEL, type PriorityMode } from '../data/priorityRules';
import { savedMode, saveMode, savedPinned, savePinned, savedWeights, saveWeights } from '../data/priorityChoice';

export function PlannerPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [courseId, setCourseId] = useState(params.get('course') ?? '');
  // Three views over the same records: what's left, what's finished, or everything. Nothing is
  // copied or duplicated to make a view — each one is a filter over the one planner list.
  const [show, setShow] = useState<'all' | 'todo' | 'done' | 'hidden'>(params.get('show') === 'done' ? 'done' : params.get('show') === 'hidden' ? 'hidden' : 'all');
  const [kind, setKind] = useState<'all' | 'course' | 'personal'>('all');
  const { completed, grouping } = useDisplayPrefs();
  const [mode, setMode] = useState<PriorityMode>(savedMode);
  const [weights, setWeights] = useState(savedWeights);
  const [pinned, setPinned] = useState(savedPinned);
  const { data, error } = useLive(async () => {
    const [items, courses, categories] = await Promise.all([listPlannerItems(), listAllCourses(), listAllGradeCategories()]);
    return { items, courses, categories };
  });
  if (error) return <div className="page"><h1>Planner</h1><p className="error" role="alert">Your planner couldn't be loaded. {error.message}</p></div>;
  if (!data) return <p className="page muted">Loading…</p>;
  const doneCount = data.items.filter(isDone).length;
  const hiddenCount = data.items.filter((item) => item.hiddenFromList).length;
  const shown = data.items.filter((item) => {
    // Anything taken off the list is out of every view but the one for finding it again.
    if (Boolean(item.hiddenFromList) !== (show === 'hidden')) return false;
    if (courseId && (courseId === 'none' ? Boolean(item.courseId) : item.courseId !== courseId)) return false;
    if (kind === 'course' && !item.courseId) return false;
    if (kind === 'personal' && item.courseId) return false;
    const finished = isDone(item);
    if (show === 'done') return finished;
    if (show === 'todo') return !finished;
    // Everything: a finished task still shows unless the student asked for it to step aside, and
    // even then it's only out of this view — it's never changed and it's always in Done.
    return !finished || completed !== 'hidden';
  });
  const groups = groupItems(shown, localNow());
  const sections = groupBySection(shown);
  const bySection = grouping === 'section';
  return (
    <div className="page">
      <h1>Planner</h1>
      <p className="muted">Assignments, exams, and everything else with a deadline.</p>
      <div className="session-actions" data-tour="add-planner">
        <button className="button primary" onClick={() => navigate(`/planner/new${courseId && courseId !== 'none' ? `?course=${courseId}` : ''}`)}>Add item</button>
      </div>
      {data.items.length > 0 && (
        <label className="search">Show
          <select value={show} aria-label="Show" onChange={(event) => setShow(event.target.value as typeof show)} data-testid="show-filter">
            <option value="all">Everything</option>
            <option value="todo">Still to do</option>
            <option value="done">Done{doneCount > 0 ? '' : ' (nothing yet)'}</option>
            {hiddenCount > 0 && <option value="hidden">Taken off my list ({hiddenCount})</option>}
          </select>
        </label>
      )}
      {data.items.length > 0 && (
        <label className="search">Kind
          <select value={kind} aria-label="Kind" onChange={(event) => setKind(event.target.value as typeof kind)} data-testid="kind-filter">
            <option value="all">Course work and personal</option>
            <option value="course">Course work</option>
            <option value="personal">Personal</option>
          </select>
        </label>
      )}
      {data.items.length > 0 && (
        <label className="search">Course
          <select value={courseId} aria-label="Course" onChange={(event) => setCourseId(event.target.value)}>
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
            aria-label="Order by"
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
      {data.items.length > 0 && mode === 'due' && (
        <label className="search">Group by
          <select
            value={grouping}
            aria-label="Group by"
            data-testid="grouping"
            onChange={(event) => setDisplayPref('grouping', event.target.value as typeof grouping)}
          >
            <option value="due">When it's due</option>
            <option value="section">My own sections</option>
          </select>
        </label>
      )}
      {data.items.length === 0 && <p className="muted planner-empty">Nothing here yet. Add your first assignment or exam, or look at your <Link to="/courses">courses</Link> first.</p>}
      {data.items.length > 0 && shown.length === 0 && (
        <p className="muted planner-empty" data-testid="planner-none">
          {show === 'done' ? "Nothing is ticked off yet." : show === 'todo' ? "Nothing left to do here." : show === 'hidden' ? "Nothing has been taken off your list." : 'Nothing here for this course.'}
        </p>
      )}
      {show === 'all' && completed === 'hidden' && doneCount > 0 && (
        <p className="muted small" data-testid="hidden-note">
          {doneCount === 1 ? '1 finished task is' : `${doneCount} finished tasks are`} set aside.{' '}
          <button className="text-button" type="button" onClick={() => setShow('done')}>See what's done</button>
        </p>
      )}
      {mode === 'due' && bySection
        ? sections.map(({ section, items }) => (
          <section key={section || 'no-section'} className="planner-group" aria-labelledby={`section-${section || 'none'}`} data-section={section || 'none'}>
            <h2 id={`section-${section || 'none'}`}>
              {section || 'No section'}
              <span className="muted planner-count"> ({items.length})</span>
            </h2>
            <PlannerList items={items} courses={data.courses} />
          </section>
        ))
        : mode === 'due'
        ? groups.map(({ group, items }) => (
          <section key={group} className="planner-group" aria-labelledby={`group-${group}`} data-group={group}>
            <h2 id={`group-${group}`} className={group === 'overdue' ? 'error' : undefined}>
              {GROUP_LABEL[group]}
              {group !== 'done' && <span className="muted planner-count"> ({items.length})</span>}
            </h2>
            <PlannerList items={items} courses={data.courses} />
          </section>
        ))
        : shown.length > 0 && (
          <PriorityView
            items={shown}
            courses={data.courses}
            categories={data.categories}
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

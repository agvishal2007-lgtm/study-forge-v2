import { useEffect, useRef, useState } from 'react';
import { LinkedFiles } from '../components/RelatedWork';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { useStillHere } from '../components/useStillHere';
import { deletePlannerItem, getPlannerItem, savePlannerItem } from '../data/planner';
import { isValidDate } from '../data/plannerRules';
import { listCourses } from '../data/store';
import { PLANNER_PRIORITIES, PLANNER_STATUSES, PLANNER_TYPES, type PlannerPriority, type PlannerStatus, type PlannerType } from '../data/types';
import { useLive } from '../data/useLive';
import { listGradeCategories } from '../data/grades';

export function PlannerItemPage() {
  const { id = '' } = useParams();
  const [params] = useSearchParams();
  const isNew = id === 'new';
  const navigate = useNavigate();
  const stillHere = useStillHere();
  const newId = useRef(crypto.randomUUID());
  const dirty = useRef(false);
  const [loaded, setLoaded] = useState(isNew);
  const [missing, setMissing] = useState(false);
  const [createdAt, setCreatedAt] = useState<number | undefined>();
  const [title, setTitle] = useState('');
  const [courseId, setCourseId] = useState(params.get('course') ?? '');
  const [type, setType] = useState<PlannerType>('Assignment');
  const [dueDate, setDueDate] = useState(params.get('date') ?? '');
  const [dueTime, setDueTime] = useState('');
  const [status, setStatus] = useState<PlannerStatus>('Not Started');
  const [priority, setPriority] = useState<PlannerPriority>('Normal');
  const [estimate, setEstimate] = useState('');
  const [points, setPoints] = useState('');
  const [earned, setEarned] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [details, setDetails] = useState('');
  const [problems, setProblems] = useState<string[]>([]);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [saving, setSaving] = useState(false);
  const { data: courses } = useLive(listCourses);
  // The grading categories of whichever course this belongs to.
  const { data: categoryList } = useLive(
    () => (courseId ? listGradeCategories(courseId) : Promise.resolve([])),
    [courseId],
  );
  const categories = categoryList ?? [];

  useEffect(() => {
    if (isNew) return;
    let active = true;
    void getPlannerItem(id).then((item) => {
      if (!active) return;
      if (!item) {
        setMissing(true);
      } else {
        setTitle(item.title);
        setCourseId(item.courseId ?? '');
        setType(item.type);
        setDueDate(item.dueDate);
        setDueTime(item.dueTime);
        setStatus(item.status);
        setPriority(item.priority);
        setEstimate(item.estimateHours === null ? '' : String(item.estimateHours));
        setPoints(item.points === null ? '' : String(item.points));
        setEarned(item.earnedPoints === null ? '' : String(item.earnedPoints));
        setCategoryId(item.categoryId ?? '');
        setDetails(item.details);
        setCreatedAt(item.createdAt);
      }
      setLoaded(true);
    });
    return () => { active = false; };
  }, [id, isNew]);

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { if (dirty.current) event.preventDefault(); };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, []);

  if (!loaded) return <p className="page muted">Loading…</p>;
  if (missing) return <div className="page"><h1>This item doesn't exist</h1><Link to="/planner">Go to Planner</Link></div>;

  const touch = <T,>(setter: (value: T) => void) => (value: T) => {
    dirty.current = true;
    setter(value);
  };

  const save = async () => {
    const found: string[] = [];
    if (!title.trim()) found.push('Enter a name.');
    if (dueDate && !isValidDate(dueDate)) found.push('Enter a real due date.');
    if (dueTime && !dueDate) found.push('Add a due date to go with the time.');
    const hours = estimate.trim() === '' ? null : Number(estimate);
    if (hours !== null && (!Number.isFinite(hours) || hours <= 0)) found.push('Enter estimated hours as a number above 0, or leave it empty.');
    const worth = points.trim() === '' ? null : Number(points);
    if (worth !== null && (!Number.isFinite(worth) || worth < 0)) found.push('Enter points as a number of 0 or more, or leave it empty.');
    const scored = earned.trim() === '' ? null : Number(earned);
    if (scored !== null && (!Number.isFinite(scored) || scored < 0)) found.push('Enter the marks you got as a number of 0 or more, or leave it empty.');
    setProblems(found);
    if (found.length > 0) return;
    setSaving(true);
    try {
      await savePlannerItem({
        id: isNew ? newId.current : id,
        title: title.trim(),
        courseId: courseId || null,
        type,
        dueDate,
        dueTime: dueDate ? dueTime : '',
        status,
        priority,
        estimateHours: hours,
        points: worth,
        earnedPoints: scored,
        categoryId: categoryId || null,
        details: details.trim(),
        createdAt,
      });
      dirty.current = false;
      if (stillHere.current) navigate('/planner', { replace: true });
    } catch (error) {
      setProblems([`This wasn't saved, but your text is still here. ${(error as Error).message}`]);
      setSaving(false);
    }
  };

  return (
    <div className="page planner-form">
      <header className="course-head">
        <h1>{isNew ? 'Add item' : 'Edit item'}</h1>
        {!isNew && <Link to={`/calendar/event/new?plannerItem=${id}&title=${encodeURIComponent(title)}&course=${courseId}`}>Schedule time for this</Link>}
        {!isNew && <button className="text-button danger-text" onClick={() => setConfirmDelete(true)}>Delete item</button>}
      </header>
      <form onSubmit={(event) => { event.preventDefault(); void save(); }}>
        <label>Name<input value={title} onChange={(event) => touch(setTitle)(event.target.value)} placeholder="Chapter 3 homework" /></label>
        <div className="form-row">
          <label>Type
            <select value={type} onChange={(event) => touch(setType)(event.target.value as PlannerType)}>
              {PLANNER_TYPES.map((option) => <option key={option}>{option}</option>)}
            </select>
          </label>
          <label>Course
            <select value={courseId} onChange={(event) => touch(setCourseId)(event.target.value)}>
              <option value="">No course</option>
              {courses?.map((course) => <option key={course.id} value={course.id}>{course.name}</option>)}
            </select>
          </label>
        </div>
        <div className="form-row">
          <label>Due date<input type="date" value={dueDate} onChange={(event) => touch(setDueDate)(event.target.value)} /></label>
          <label>Due time (optional)<input type="time" value={dueTime} onChange={(event) => touch(setDueTime)(event.target.value)} /></label>
        </div>
        <div className="form-row">
          <label>Status
            <select value={status} onChange={(event) => touch(setStatus)(event.target.value as PlannerStatus)}>
              {PLANNER_STATUSES.map((option) => <option key={option}>{option}</option>)}
            </select>
          </label>
          <label>Priority
            <select value={priority} onChange={(event) => touch(setPriority)(event.target.value as PlannerPriority)}>
              {PLANNER_PRIORITIES.map((option) => <option key={option}>{option}</option>)}
            </select>
          </label>
          <label>Estimated hours (optional)<input inputMode="decimal" value={estimate} onChange={(event) => touch(setEstimate)(event.target.value)} /></label>
          <label>Points it is worth (optional)<input inputMode="decimal" value={points} onChange={(event) => touch(setPoints)(event.target.value)} /></label>
          <label>Marks you got (optional)<input inputMode="decimal" value={earned} onChange={(event) => touch(setEarned)(event.target.value)} /></label>
          {categories.length > 0 && (
            <label>Grading category
              <select value={categoryId} onChange={(event) => touch(setCategoryId)(event.target.value)}>
                <option value="">Not in a category</option>
                {categories.map((category) => <option key={category.id} value={category.id}>{category.name} ({category.weight}%)</option>)}
              </select>
            </label>
          )}
        </div>
        <label>Details (optional)<textarea value={details} onChange={(event) => touch(setDetails)(event.target.value)} placeholder="Pages 40 to 52, odd problems only" /></label>
        {problems.length > 0 && (
          <div className="error-box" role="alert" data-testid="planner-problems">
            <strong>This isn't saved yet.</strong>
            <ul>{problems.map((problem) => <li key={problem}>{problem}</li>)}</ul>
          </div>
        )}
        <div className="session-actions">
          <button className="button primary" type="submit" disabled={saving}>Save item</button>
          <Link to="/planner">Cancel</Link>
        </div>
      </form>
      {!isNew && <LinkedFiles itemId={id} />}
      {confirmDelete && (
        <ConfirmDialog
          title={`Delete ${title || 'this item'}?`}
          confirmLabel="Delete item"
          onCancel={() => setConfirmDelete(false)}
          onConfirm={async () => {
            setConfirmDelete(false);
            try {
              await deletePlannerItem(id);
              dirty.current = false;
              if (stillHere.current) navigate('/planner', { replace: true });
            } catch (error) {
              setProblems([`It wasn't deleted. ${(error as Error).message}`]);
            }
          }}
        >
          <p>This permanently removes it from your planner. It can't be undone.</p>
        </ConfirmDialog>
      )}
    </div>
  );
}

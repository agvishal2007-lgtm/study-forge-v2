import { useEffect, useState, useSyncExternalStore } from 'react';
import { Link } from 'react-router-dom';
import { setPlannerHidden, setPlannerStatus } from '../data/planner';
import { pendingTick, setPendingTick, subscribePendingTicks, tickVersion } from '../data/pendingTicks';
import { describeDue, describeGoal, groupOf, isDone, localNow, uncheckedStatus } from '../data/plannerRules';
import { describeNext, stepProgress } from '../data/stepRules';
import { useDisplayPrefs } from '../data/displayPrefs';
import { shortDate } from './AssignmentSteps';
import { PLANNER_STATUSES, type Course, type PlannerItem, type PlannerStatus } from '../data/types';

export function PlannerRow({ item, course, now }: { item: PlannerItem; course?: Course; now: { date: string; time: string } }) {
  const [failure, setFailure] = useState('');
  const { completed } = useDisplayPrefs();
  const saved = isDone(item);
  /*
   * The tick moves the moment it's tapped, then the save follows. Saving goes to this device's
   * database and on to the student's other devices, which takes a moment, and a box that sprang
   * back in the meantime would look like the tap was missed. If the save really fails, the box
   * goes back to what is actually stored and says so, so a change is never quietly lost.
   *
   * What was tapped is kept in pendingTicks rather than in this row, because ticking something off
   * moves it into Done — a different list — and a row that moves is taken apart and built again,
   * losing anything it was holding. See that file for the whole story.
   */
  useSyncExternalStore(subscribePendingTicks, tickVersion, () => 0);
  const pending = pendingTick(item.id);
  const done = pending ?? saved;
  useEffect(() => { if (pending !== undefined && pending === saved) setPendingTick(item.id, undefined); }, [pending, saved, item.id]);

  const change = (status: PlannerStatus) => {
    setFailure('');
    setPendingTick(item.id, ['Submitted', 'Waiting for Grade', 'Completed'].includes(status));
    setPlannerStatus(item.id, status).catch((error: Error) => {
      setPendingTick(item.id, undefined);
      setFailure(`That wasn't saved, so it's back as it was. ${error.message}`);
    });
  };
  const overdue = groupOf(item, now) === 'overdue';
  const progress = stepProgress(item.steps, now.date);
  const goal = describeGoal(item.goal);
  const details = [item.type, course?.name, item.priority === 'High' ? 'High priority' : '', item.estimateHours ? `About ${item.estimateHours} ${item.estimateHours === 1 ? 'hour' : 'hours'}` : ''].filter(Boolean);
  return (
    <li className="planner-row" data-testid="planner-row" data-done={done} style={{ '--spine': course?.color ?? 'var(--line)' } as React.CSSProperties}>
      <input
        type="checkbox"
        className="planner-tick"
        checked={done}
        aria-label={item.title}
        onChange={(event) => change(event.target.checked ? 'Completed' : uncheckedStatus(item.status))}
      />
      <div className="planner-main">
        <Link to={`/planner/${item.id}`} className={done && completed === 'struck' ? 'struck' : undefined}>{item.title}</Link>
        <span className={overdue ? 'planner-due overdue' : 'planner-due'}>{describeDue(item, now)}</span>
        <span className="muted file-meta">{details.join(', ')}</span>
        {progress && !done && <span className="muted small step-summary" data-testid="row-steps">{describeNext(progress, shortDate)}</span>}
        {goal && <span className="muted small row-goal" data-testid="row-goal">{goal}</span>}
        {failure && <span className="error" role="alert">{failure}</span>}
      </div>
      <div className="planner-actions">
        <label className="sr-only" htmlFor={`status-${item.id}`}>Status of {item.title}</label>
        <select id={`status-${item.id}`} value={item.status} onChange={(event) => change(event.target.value as PlannerStatus)}>
          {PLANNER_STATUSES.map((status) => <option key={status}>{status}</option>)}
        </select>
        <button
          className="text-button"
          type="button"
          data-testid={`hide-${item.id}`}
          onClick={() => void setPlannerHidden(item.id, !item.hiddenFromList)}
        >
          {item.hiddenFromList ? 'Put back on my list' : 'Take off my list'}
        </button>
      </div>
    </li>
  );
}

export function PlannerList({ items, courses }: { items: PlannerItem[]; courses: Course[] }) {
  const now = localNow();
  return (
    <ul className="planner-list">
      {items.map((item) => <PlannerRow key={item.id} item={item} course={courses.find((course) => course.id === item.courseId)} now={now} />)}
    </ul>
  );
}

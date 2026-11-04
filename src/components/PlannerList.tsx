import { useState } from 'react';
import { Link } from 'react-router-dom';
import { setPlannerStatus } from '../data/planner';
import { describeDue, groupOf, isDone, localNow } from '../data/plannerRules';
import { PLANNER_STATUSES, type Course, type PlannerItem, type PlannerStatus } from '../data/types';

export function PlannerRow({ item, course, now }: { item: PlannerItem; course?: Course; now: { date: string; time: string } }) {
  const [failure, setFailure] = useState('');
  const change = (status: PlannerStatus) => {
    setFailure('');
    setPlannerStatus(item.id, status).catch((error: Error) => setFailure(`That wasn't saved. ${error.message}`));
  };
  const overdue = groupOf(item, now) === 'overdue';
  const details = [item.type, course?.name, item.priority === 'High' ? 'High priority' : '', item.estimateHours ? `About ${item.estimateHours} ${item.estimateHours === 1 ? 'hour' : 'hours'}` : ''].filter(Boolean);
  return (
    <li className="planner-row" data-testid="planner-row" data-done={isDone(item)} style={{ '--spine': course?.color ?? 'var(--line)' } as React.CSSProperties}>
      <div className="planner-main">
        <Link to={`/planner/${item.id}`}>{item.title}</Link>
        <span className={overdue ? 'planner-due overdue' : 'planner-due'}>{describeDue(item, now)}</span>
        <span className="muted file-meta">{details.join(', ')}</span>
        {failure && <span className="error" role="alert">{failure}</span>}
      </div>
      <div className="planner-actions">
        <label className="sr-only" htmlFor={`status-${item.id}`}>Status of {item.title}</label>
        <select id={`status-${item.id}`} value={item.status} onChange={(event) => change(event.target.value as PlannerStatus)}>
          {PLANNER_STATUSES.map((status) => <option key={status}>{status}</option>)}
        </select>
        {!isDone(item) && <button className="button" onClick={() => change('Completed')} aria-label={`Mark ${item.title} done`}>Done</button>}
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

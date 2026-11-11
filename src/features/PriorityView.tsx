import { Link } from 'react-router-dom';
import { STATUS_LABEL, STATUS_MARK, workStatus } from '../data/statusRules';
import { DEFAULT_WEIGHTS, PRIORITY_MODE_LABEL, rankWork, type PriorityMode, type Weights } from '../data/priorityRules';
import type { Course, PlannerItem } from '../data/types';

/**
 * Work in the order a student chose, with the reasons on show. Every mode keeps overdue and
 * due-soon work at the top of the page, so no way of sorting can hide a deadline.
 */
export function PriorityView({ items, courses, today, mode, weights, pinned, onPin, onWeights }: {
  items: PlannerItem[];
  courses: Course[];
  today: string;
  mode: PriorityMode;
  weights: Weights;
  pinned: string[];
  onPin: (id: string) => void;
  onWeights: (weights: Weights) => void;
}) {
  const { ranked, urgent } = rankWork(items, { mode, today, weights, pinned });
  const nameOf = (id: string | null) => courses.find((course) => course.id === id)?.name;

  return (
    <>
      {urgent.length > 0 && (
        <section className="planner-group" aria-labelledby="needs-now" data-testid="needs-now">
          <h2 id="needs-now" className="error">Needs attention now <span className="muted planner-count">({urgent.length})</span></h2>
          <p className="muted small">Shown whatever order you choose, so a deadline can't slip behind the sorting.</p>
          <ul className="plain-list">
            {urgent.map((item) => (
              <li key={item.id}>
                <Link to={`/planner/${item.id}`}>{item.title}</Link>
                <span className="status-tag" data-status={workStatus(item, today)}>
                  <span aria-hidden="true">{STATUS_MARK[workStatus(item, today)]}</span>{STATUS_LABEL[workStatus(item, today)]}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {mode === 'custom' && (
        <section className="weights" aria-labelledby="weights-heading" data-testid="weights">
          <h2 id="weights-heading">Your weighting</h2>
          <p className="muted small">How much each thing counts. They're compared against each other, so only the sizes relative to one another matter.</p>
          <div className="weight-rows">
            {(['urgency', 'points', 'effort', 'importance'] as const).map((key) => (
              <label key={key}>
                {{ urgency: 'How soon it is due', points: 'Points it is worth', effort: 'How quick it is', importance: 'How much it matters to you' }[key]}
                <input
                  type="range"
                  min="0"
                  max="10"
                  value={weights[key]}
                  aria-valuetext={`${weights[key]} out of 10`}
                  onChange={(event) => onWeights({ ...weights, [key]: Number(event.target.value) })}
                />
                <span className="muted">{weights[key]}</span>
              </label>
            ))}
          </div>
          <button className="text-button" onClick={() => onWeights(DEFAULT_WEIGHTS)}>Back to the usual weighting</button>
        </section>
      )}

      <section className="planner-group" aria-labelledby="ranked" data-testid="ranked">
        <h2 id="ranked">{PRIORITY_MODE_LABEL[mode]} <span className="muted planner-count">({ranked.length})</span></h2>
        {mode === 'impact' && (
          <p className="notice" data-testid="impact-notice">
            Grade impact needs each course's grading categories and their weights, which Study Forge can't record yet.
            Nothing here is guessed from points, because points and grade impact are not the same thing. This list falls
            back to what is due soonest until grading categories exist.
          </p>
        )}
        {ranked.length === 0
          ? <p className="muted">Nothing waiting. Anything finished stays in your planner.</p>
          : (
            <ol className="ranked-list">
              {ranked.map((entry) => {
                const status = workStatus(entry.item, today);
                const isPinned = pinned.includes(entry.item.id);
                return (
                  <li key={entry.item.id} data-testid={`ranked-${entry.item.id}`}>
                    <div className="ranked-head">
                      <Link to={`/planner/${entry.item.id}`}>{entry.item.title}</Link>
                      <span className="status-tag" data-status={status}>
                        <span aria-hidden="true">{STATUS_MARK[status]}</span>{STATUS_LABEL[status]}
                      </span>
                      {nameOf(entry.item.courseId) && <span className="muted">{nameOf(entry.item.courseId)}</span>}
                      <button
                        className="text-button"
                        onClick={() => onPin(entry.item.id)}
                        aria-label={isPinned ? `Unpin ${entry.item.title}` : `Pin ${entry.item.title} to the top`}
                      >
                        {isPinned ? 'Unpin' : 'Pin to top'}
                      </button>
                    </div>
                    <p className="muted small ranked-why">
                      {entry.factors.map((factor) => `${factor.name}: ${factor.detail}`).join(' · ')}
                    </p>
                    {entry.missing.length > 0 && (
                      <p className="muted small">Not counted, because you haven't entered it: {entry.missing.join(', ')}.</p>
                    )}
                  </li>
                );
              })}
            </ol>
          )}
      </section>
    </>
  );
}

import { useEffect, useRef, useState } from 'react';
import { getPlannerItem, savePlannerSteps, setPlannerStatus } from '../data/planner';
import { isDone, localNow } from '../data/plannerRules';
import { addStep, addSuggested, cleanSteps, describeProgress, moveStep, spreadTargets, stepProgress, STEP_LIMITS } from '../data/stepRules';
import type { PlannerStep } from '../data/types';
import { useLive } from '../data/useLive';

export const shortDate = (date: string) => new Date(`${date}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

/**
 * Breaks one planner item into optional steps. Each step can have the student's own target date.
 * The item stays the real deadline: nothing here changes its due date, and finishing every step only
 * offers to mark it done.
 */
export function AssignmentSteps({ itemId }: { itemId: string }) {
  const { data: item } = useLive(() => getPlannerItem(itemId), [itemId]);
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  // The list as the student last left it. Each change builds on this, never on a stored copy that
  // may not have caught up yet, so two quick ticks can't undo each other. It hands back to the stored
  // list once every save has finished and the stored list has changed (another device, for example).
  const [local, setLocal] = useState<PlannerStep[] | null>(null);
  const saving = useRef(0);
  const current = useRef<PlannerStep[]>([]);
  const updatedAt = item?.updatedAt;
  useEffect(() => {
    if (saving.current === 0) setLocal(null);
  }, [updatedAt]);
  if (!item) return null;
  const steps = local ?? cleanSteps(item.steps);
  // The newest list, even before React has redrawn, so changes made in quick succession all build on each other.
  current.current = steps;
  const today = localNow().date;
  const progress = stepProgress(steps, today);
  const save = (next: PlannerStep[], note = '') => {
    setMessage(note);
    current.current = next;
    setLocal(next);
    saving.current++;
    void savePlannerSteps(itemId, next)
      .catch((error: Error) => { setMessage(`That wasn't saved. ${error.message}`); setLocal(null); })
      .finally(() => { saving.current--; });
  };
  const change = (id: string, patch: Partial<PlannerStep>) => save(current.current.map((step) => (step.id === id ? { ...step, ...patch } : step)));
  const allDone = progress !== null && progress.done === progress.total;

  return (
    <section className="assignment-steps" aria-labelledby="steps-heading" data-testid="assignment-steps">
      <h2 id="steps-heading">Steps</h2>
      <p className="muted small">
        Optional. Break this into smaller pieces. Target dates are your own goals; the due date
        {item.dueDate ? ` (${shortDate(item.dueDate)})` : ''} stays the real deadline and is never changed by steps.
      </p>
      {progress && <p data-testid="step-progress">{describeProgress(progress, shortDate)}{progress.lateTargets > 0 ? ` ${progress.lateTargets} target ${progress.lateTargets === 1 ? 'date has' : 'dates have'} passed.` : ''}</p>}
      {steps.length > 0 && (
        <ol className="step-list">
          {steps.map((step, index) => (
            <li key={step.id} className="step-row" data-done={step.done}>
              <label className="check-label">
                <input type="checkbox" checked={step.done} onChange={(event) => change(step.id, { done: event.target.checked })} />
                <span className={step.done ? 'step-title done' : 'step-title'}>{step.title}</span>
              </label>
              <input className="step-date" type="date" value={step.targetDate} onChange={(event) => change(step.id, { targetDate: event.target.value })} aria-label={`Target date for ${step.title}`} />
              {step.targetDate && !step.done && step.targetDate < today && <span className="error small">Target passed</span>}
              <span className="row-actions">
                <button type="button" className="text-button" disabled={index === 0} onClick={() => save(moveStep(steps, step.id, -1))} aria-label={`Move ${step.title} up`}>Up</button>
                <button type="button" className="text-button" disabled={index === steps.length - 1} onClick={() => save(moveStep(steps, step.id, 1))} aria-label={`Move ${step.title} down`}>Down</button>
                <button type="button" className="text-button danger-text" onClick={() => save(steps.filter((other) => other.id !== step.id), `Removed “${step.title}”.`)} aria-label={`Remove step ${step.title}`}>Remove</button>
              </span>
            </li>
          ))}
        </ol>
      )}
      <form className="inline-form" onSubmit={(event) => {
        event.preventDefault();
        if (!title.trim()) return;
        save(addStep(steps, title, crypto.randomUUID()));
        setTitle('');
      }}>
        <label>Add a step<input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={STEP_LIMITS.title} placeholder="Read chapter 4" /></label>
        <button className="button" type="submit" disabled={!title.trim() || steps.length >= STEP_LIMITS.count}>Add step</button>
      </form>
      <div className="session-actions">
        <button type="button" className="button" onClick={() => {
          const next = addSuggested(steps, () => crypto.randomUUID());
          save(next, next.length === steps.length ? 'All the suggested steps are already here.' : 'Added the suggested steps. Rename or remove any you don’t need.');
        }}>Add suggested steps</button>
        {steps.some((step) => !step.done && !step.targetDate) && (
          <button type="button" className="button" onClick={() => {
            const result = spreadTargets(steps, today, item.dueDate);
            if (result.problem) setMessage(result.problem);
            else save(result.steps, 'Suggested target dates between today and the due date. Change any of them; the due date didn’t change.');
          }}>Suggest target dates</button>
        )}
      </div>
      {allDone && !isDone(item) && (
        <p className="notice" data-testid="steps-all-done">
          Every step is done.{' '}
          <button type="button" className="button" onClick={() => void setPlannerStatus(itemId, 'Completed').then(() => setMessage('Marked as Completed.'))}>Mark the item Completed</button>
        </p>
      )}
      {message && <p className="muted" role="status" data-testid="steps-message">{message}</p>}
    </section>
  );
}

import { Link } from 'react-router-dom';
import { setDisplayPref, useDisplayPrefs, type CompletedLook } from '../data/displayPrefs';

const OPTIONS: { value: CompletedLook; label: string; what: string }[] = [
  { value: 'visible', label: 'Stays put', what: 'A task you tick off stays in the list, ticked and still easy to read.' },
  { value: 'struck', label: 'Crossed out', what: 'A task you tick off stays in the list, ticked, with a line through it.' },
  { value: 'hidden', label: 'Steps aside', what: 'A task you tick off leaves the list. It is still in Done, ticked and not crossed out.' },
];

/**
 * How a ticked-off task looks. Three choices, no more, and none of them changes a task: the record,
 * its date, its course and its history are identical whichever is picked, and everything finished
 * is always in Done. Ticking the box is itself the save, so there's nothing here about saving.
 */
export function TasksSection() {
  const { completed, autoWork } = useDisplayPrefs();
  const chosen = OPTIONS.find((option) => option.value === completed) ?? OPTIONS[0];
  return (
    <section aria-labelledby="tasks-heading" data-testid="tasks-section">
      <h2 id="tasks-heading">Tasks</h2>
      <div className="pref-row">
        <h3 id="pref-completed">When you tick a task off</h3>
        <div className="segmented" role="radiogroup" aria-labelledby="pref-completed">
          {OPTIONS.map((option) => (
            <label key={option.value} className="segment" data-chosen={completed === option.value ? 'true' : undefined}>
              <input
                className="sr-only"
                type="radio"
                name="pref-completed"
                checked={completed === option.value}
                onChange={() => setDisplayPref('completed', option.value)}
              />
              {option.label}
            </label>
          ))}
        </div>
        <p className="muted">{chosen.what}</p>
      </div>
      {/* A real row, not a drawing of one, so what's shown is what happens. */}
      <ul className="planner-list tasks-preview" data-testid="completed-preview" aria-label="How a ticked task will look">
        <li className="planner-row" data-done="true">
          <input type="checkbox" className="planner-tick" checked readOnly aria-label="Example, already ticked" tabIndex={-1} />
          <div className="planner-main">
            <span className={completed === 'struck' ? 'struck' : undefined}>Read chapter 4</span>
            <span className="muted file-meta">Example{completed === 'hidden' ? ' · in Done only' : ''}</span>
          </div>
        </li>
      </ul>
      <div className="pref-row">
        <h3 id="pref-auto-work">Work from your calendar</h3>
        <label className="choice-pair">
          <input
            type="checkbox"
            checked={autoWork === 'on'}
            data-testid="auto-work"
            onChange={(event) => setDisplayPref('autoWork', event.target.checked ? 'on' : 'off')}
          />
          Turn homework, quizzes and exams from a connected calendar into tasks by themselves
        </label>
        <p className="muted small">
          On, work found in a calendar you've connected becomes a task in the class it belongs to, so
          you don't type your deadlines in twice. Class times and appointments are never turned into
          tasks. Off, calendar items still show in Calendar, and nothing already in your list is
          removed or changed — new ones just stop arriving on their own.
        </p>
      </div>
      <p className="muted small">
        Whichever you pick, nothing is deleted and nothing is hidden from you: everything you've
        ticked off is in <Link to="/planner?show=done">Done</Link>. Ticking a box saves it straight
        away, on this device and then to your other devices, so there's never anything to press
        afterwards.
      </p>
    </section>
  );
}

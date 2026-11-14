import { useState } from 'react';
import { createCourse, listCourses } from '../data/store';

/** Optional college-only starter subjects. No age collection or child-facing modes. */
const SUGGESTIONS = ['Writing', 'Mathematics', 'Biology', 'Economics', 'History'];

export function CollegeCourseSetup({ hasCourses }: { hasCourses: boolean }) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [finished, setFinished] = useState(false);

  const save = async () => {
    setBusy(true);
    setError('');
    try {
      const existing = await listCourses();
      const names = new Set(existing.map(course => course.name.trim().toLowerCase()));
      for (const name of selected) {
        if (!names.has(name.toLowerCase())) {
          await createCourse(name, '');
          names.add(name.toLowerCase());
        }
      }
      setFinished(true);
      setOpen(false);
    } catch (failure) {
      setError('Could not finish setup: ' + (failure as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section aria-label="Optional college course setup" data-testid="college-course-setup">
      {!open ? (
        <p>
          <button className="text-button" type="button" onClick={() => setOpen(true)}>
            {finished ? 'Add more suggested courses' : 'Set up suggested college courses (optional)'}
          </button>
        </p>
      ) : (
        <div className="panel">
          <h2>Suggested college courses</h2>
          <p className="muted">Select only the subjects you want. This does not change your existing courses, grades or deadlines. You can skip this and add courses manually.</p>
          {hasCourses && <p className="muted small">Your existing courses will be kept.</p>}
          <fieldset>
            <legend>Starting subjects (optional)</legend>
            {SUGGESTIONS.map(name => (
              <label key={name} style={{ display: 'block', marginBottom: '.5rem' }}>
                <input type="checkbox" checked={selected.includes(name)}
                  onChange={event => setSelected(previous => event.target.checked ? [...previous, name] : previous.filter(item => item !== name))} />
                {' '}{name}
              </label>
            ))}
          </fieldset>
          <p className="muted small">Set grading weights using your actual syllabus. No deadlines or grades are invented.</p>
          {error && <p role="alert" className="error">{error}</p>}
          <div className="session-actions">
            <button className="button primary" type="button" disabled={busy} onClick={() => void save()}>{busy ? 'Saving…' : 'Add selected courses'}</button>
            <button className="button" type="button" disabled={busy} onClick={() => setOpen(false)}>Skip for now</button>
          </div>
        </div>
      )}
    </section>
  );
}

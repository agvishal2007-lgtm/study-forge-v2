import { useState } from 'react';
import { createCourse, listCourses } from '../data/store';
import { getActiveAccount } from '../data/account';
import { SCHOOL_LEVELS, saveSchoolProfile, useSchoolProfile, type AgeGroup, type SchoolLevel } from '../data/schoolProfile';

/** An optional starting point, not a second course or semester system. */
export function CourseSetup({ hasCourses }: { hasCourses: boolean }) {
  const profile = useSchoolProfile();
  const [open, setOpen] = useState(!profile.completed && !hasCourses);
  const [level, setLevel] = useState<SchoolLevel>(profile.level);
  const [age, setAge] = useState<AgeGroup>(profile.age);
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const choice = SCHOOL_LEVELS.find(item => item.id === level)!;
  const signedIn = Boolean(getActiveAccount());
  const close = () => { saveSchoolProfile({ level, age: signedIn && age === 'under13' ? profile.age : age, completed: true }); setOpen(false); };
  const save = async () => {
    if (age === 'unanswered') { setError('Choose an age group to continue, or skip setup.'); return; }
    if (age === 'under13' && signedIn) { setError('The under-13 local-only experience needs a signed-out browser. Sign out first; no account changes are made here.'); return; }
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
      close();
    } catch (e) { setError('Setup could not finish: ' + (e as Error).message); }
    finally { setBusy(false); }
  };
  return (
    <section className="school-setup" aria-label="Course setup" data-testid="school-setup">
      {!open ? (
        <p><button className="text-button" type="button" onClick={() => setOpen(true)}>School level and course setup</button>{profile.completed && <span className="muted small"> · {SCHOOL_LEVELS.find(item => item.id === profile.level)?.label}</span>}</p>
      ) : (
        <div className="school-setup-panel">
          <h2>{hasCourses ? 'Change your course setup' : 'Set up your courses'}</h2>
          <p className="muted">Choose your school level and optional starting subjects. You can skip this and add courses yourself. Existing courses and grades will not be changed.</p>
          <label>School level
            <select value={level} onChange={event => { setLevel(event.target.value as SchoolLevel); setSelected([]); }}>
              {SCHOOL_LEVELS.map(item => <option value={item.id} key={item.id}>{item.label}</option>)}
            </select>
          </label>
          <fieldset className="school-setup-ages">
            <legend>Student age (separate from school level)</legend>
            <label><input type="radio" checked={age === '13plus'} onChange={() => setAge('13plus')} /> 13 or older</label>
            <label><input type="radio" checked={age === 'under13'} onChange={() => setAge('under13')} /> Under 13</label>
          </fieldset>
          {age === 'under13' && <p className="notice" role="note">Under-13 mode keeps study work on this device and blocks account sign-in and cloud integrations. This mode is undergoing a child-privacy review and is not yet certified for children's use.</p>}
          <fieldset className="school-setup-subjects">
            <legend>Starting subjects (optional)</legend>
            <div className="school-setup-grid">
              {choice.examples.map(name => <label key={name}><input type="checkbox" checked={selected.includes(name)} onChange={event => setSelected(old => event.target.checked ? [...old, name] : old.filter(item => item !== name))} /> {name}</label>)}
            </div>
          </fieldset>
          <p className="muted small">{choice.gradeHelp}</p>
          {error && <p role="alert" className="error">{error}</p>}
          <div className="session-actions">
            <button className="button primary" type="button" disabled={busy} onClick={() => void save()}>{busy ? 'Saving…' : 'Save setup'}</button>
            <button className="button" type="button" disabled={busy} onClick={() => { saveSchoolProfile({ ...profile, completed: true }); setOpen(false); }}>Skip for now</button>
          </div>
        </div>
      )}
    </section>
  );
}

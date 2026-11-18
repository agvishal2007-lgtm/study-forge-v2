import { useState } from 'react';
import { createCourse, updateCourse } from '../data/store';
import { asOneUndo } from '../data/undo';
import { getActiveAccount } from '../data/account';
import {
  DEFAULT_TERM_KIND, LEVEL_GRADES, LEVEL_GRADE_HELP, LEVEL_LABEL, SCHOOL_LEVELS, STARTER_CLASSES,
  TERM_KINDS, TERM_KIND_LABEL, allowsAccounts, setSchool, suggestTermName, useSchool, wordsFor,
  type SchoolLevel, type TermKind,
} from '../data/schoolLevel';

/**
 * The setup a student meets the first time they open Courses with nothing in them: which school
 * they're in, what their first term is called, and which classes to start with. Everything here is
 * optional — Skip leaves Study Forge exactly as it was — and it never touches classes, marks or
 * deadlines that already exist. It reuses the ordinary course records, so it isn't a second
 * course system.
 */
export function CourseSetup({ hasCourses, onClose }: { hasCourses: boolean; onClose?: () => void }) {
  const school = useSchool();
  const [step, setStep] = useState(0);
  const [level, setLevel] = useState<SchoolLevel>(school.level);
  const [termKind, setTermKind] = useState<TermKind>(school.termKindChosen ? school.termKind : DEFAULT_TERM_KIND[school.level]);
  const [term, setTerm] = useState(() => suggestTermName(school.termKindChosen ? school.termKind : DEFAULT_TERM_KIND[school.level]));
  const [termEdited, setTermEdited] = useState(false);
  const [kindEdited, setKindEdited] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');

  const words = wordsFor(level, termKind);
  const signedIn = Boolean(getActiveAccount());
  const losesSync = signedIn && !allowsAccounts(level);
  // Elementary keeps one school year, so there's nothing to choose.
  const asksTermKind = level !== 'elementary';
  const steps = ['School', words.Term, words.Courses];

  const chooseLevel = (next: SchoolLevel) => {
    setLevel(next);
    const kind = school.termKindChosen ? school.termKind : DEFAULT_TERM_KIND[next];
    setTermKind(kind);
    setPicked([]);
    if (!termEdited) setTerm(suggestTermName(kind));
  };
  const chooseTermKind = (next: TermKind) => {
    setTermKind(next);
    setKindEdited(true);
    if (!termEdited) setTerm(suggestTermName(next));
  };

  const chosenKind = () => (kindEdited ? { termKind } : {});

  const finish = async (withClasses: boolean) => {
    setBusy(true);
    setProblem('');
    try {
      setSchool({ level, ...chosenKind(), setupDone: true });
      const names = withClasses
        ? [...picked, ...typed.split(/[\n,]/).map((one) => one.trim()).filter(Boolean)]
        : [];
      const wanted: string[] = [];
      const seen = new Set<string>();
      for (const name of names) {
        const key = name.toLowerCase();
        if (!seen.has(key)) { seen.add(key); wanted.push(name); }
      }
      if (wanted.length) {
        await asOneUndo(`Added ${wanted.length} ${wanted.length === 1 ? words.course : words.courses}`, async () => {
          for (const name of wanted) {
            const course = await createCourse(name, '');
            if (term.trim()) await updateCourse(course.id, { term: term.trim() });
          }
        });
      }
      onClose?.();
    } catch (failure) {
      setProblem(`That didn't finish. ${(failure as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  const skip = () => {
    // Skipping still remembers the level, so the words are right and nobody is asked twice.
    setSchool({ level, ...chosenKind(), setupDone: true });
    onClose?.();
  };

  return (
    <section className="panel course-setup" aria-labelledby="course-setup-heading" data-testid="course-setup">
      <h2 id="course-setup-heading">{hasCourses ? 'Change your setup' : 'Set up your first term'}</h2>
      <p className="muted small" data-testid="setup-step">Step {step + 1} of 3 · {steps[step]}</p>

      {step === 0 && (
        <>
          <fieldset className="choice-pair">
            <legend>Which school are you in?</legend>
            {SCHOOL_LEVELS.map((one) => (
              <label key={one}>
                <input type="radio" name="school-level" checked={level === one} onChange={() => chooseLevel(one)} />
                <span><b>{LEVEL_LABEL[one]}</b><span className="muted small"> · {LEVEL_GRADES[one]}</span></span>
              </label>
            ))}
          </fieldset>
          <p className="muted small">This changes the words Study Forge uses and the classes it offers to start with. It never changes {words.courses}, marks or deadlines you already have, and you can change it later in Settings.</p>
          {!allowsAccounts(level) && (
            <p className="notice" role="note" data-testid="device-only-note">
              {LEVEL_LABEL[level]} works on this device only. There's no sign-in and no syncing to other devices, and Google and Dropbox stay switched off, because each of those signs in with an outside account. Study Forge never asks your age. Make a backup from Settings to keep a copy of your work.
            </p>
          )}
          {losesSync && (
            <p className="notice" role="alert" data-testid="loses-sync-note">
              You're signed in. Choosing {LEVEL_LABEL[level]} stops this device syncing while that's set. Nothing is deleted — your account and everything in it stay, and switching back to College or High school starts syncing again.
            </p>
          )}
        </>
      )}

      {step === 1 && (
        <>
          {asksTermKind && (
            <fieldset className="choice-pair">
              <legend>How does your school split the year?</legend>
              {TERM_KINDS.map((kind) => (
                <label key={kind}>
                  <input type="radio" name="term-kind" checked={termKind === kind} onChange={() => chooseTermKind(kind)} />
                  <span>{TERM_KIND_LABEL[kind]}</span>
                </label>
              ))}
            </fieldset>
          )}
          <label>What's this {words.term} called?
            <input
              value={term}
              onChange={(event) => { setTerm(event.target.value); setTermEdited(true); }}
              placeholder={suggestTermName(termKind)}
              data-testid="term-name"
            />
          </label>
          <p className="muted small">Your {words.courses} are grouped under this name, so next year's are kept apart from this year's. You can leave it empty, rename it later, or start another {words.term} whenever you like.</p>
        </>
      )}

      {step === 2 && (
        <>
          <fieldset className="choice-pair setup-classes">
            <legend>Which {words.courses} are you taking{term.trim() ? ` in ${term.trim()}` : ''}?</legend>
            {STARTER_CLASSES[level].map((name) => (
              <label key={name}>
                <input
                  type="checkbox"
                  checked={picked.includes(name)}
                  onChange={(event) => setPicked((before) => event.target.checked ? [...before, name] : before.filter((one) => one !== name))}
                />
                <span>{name}</span>
              </label>
            ))}
          </fieldset>
          <label>Any others? One per line
            <textarea
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
              rows={3}
              placeholder={level === 'college' ? 'Financial Accounting\nOrganic Chemistry' : 'Band\nRobotics'}
              data-testid="own-classes"
            />
          </label>
          <p className="muted small">{LEVEL_GRADE_HELP[level]}</p>
        </>
      )}

      {problem && <p className="error" role="alert">{problem}</p>}

      <div className="session-actions">
        {step > 0 && <button className="button" type="button" disabled={busy} onClick={() => setStep(step - 1)}>Back</button>}
        {step < 2
          ? <button className="button primary" type="button" onClick={() => setStep(step + 1)} data-testid="setup-next">Next</button>
          : <button className="button primary" type="button" disabled={busy} onClick={() => void finish(true)} data-testid="setup-finish">
              {busy ? 'Setting up…' : picked.length || typed.trim() ? `Add ${words.courses} and finish` : 'Finish'}
            </button>}
        <button className="text-button" type="button" disabled={busy} onClick={skip} data-testid="setup-skip">Skip for now</button>
      </div>
    </section>
  );
}

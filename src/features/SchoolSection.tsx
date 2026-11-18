import { useState } from 'react';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { getActiveAccount } from '../data/account';
import {
  LEVEL_GRADES, LEVEL_LABEL, SCHOOL_LEVELS, TERM_KINDS, TERM_KIND_LABEL,
  allowsAccounts, setSchool, useSchool, wordsFor, type SchoolLevel,
} from '../data/schoolLevel';

/**
 * Changing school level later. It only changes wording, suggestions and which tools show — never a
 * class, a mark or a deadline. Moving to a level that works on this device only is confirmed first
 * when the student is signed in, because their device stops syncing until they move back.
 */
export function SchoolSection() {
  const school = useSchool();
  const words = wordsFor(school.level, school.termKind);
  const [pending, setPending] = useState<SchoolLevel | null>(null);
  const signedIn = Boolean(getActiveAccount());

  const choose = (next: SchoolLevel) => {
    if (next === school.level) return;
    if (signedIn && !allowsAccounts(next)) { setPending(next); return; }
    setSchool({ level: next });
  };

  return (
    <section aria-labelledby="school-heading" data-testid="school-section">
      <h2 id="school-heading">School</h2>
      <label>Which school are you in?
        <select value={school.level} onChange={(event) => choose(event.target.value as SchoolLevel)} data-testid="school-level">
          {SCHOOL_LEVELS.map((one) => <option key={one} value={one}>{LEVEL_LABEL[one]} · {LEVEL_GRADES[one]}</option>)}
        </select>
      </label>
      <label>How does your school split the year?
        <select value={school.termKind} onChange={(event) => setSchool({ termKind: event.target.value as typeof school.termKind })} data-testid="term-kind">
          {TERM_KINDS.map((kind) => <option key={kind} value={kind}>{TERM_KIND_LABEL[kind]}</option>)}
        </select>
      </label>
      <p className="muted small">
        This changes the words Study Forge uses, the {words.courses} it offers to start with, and how grades read. Your {words.courses}, marks, files and deadlines are never changed by it.
      </p>
      {!allowsAccounts(school.level) && (
        <p className="notice" role="note" data-testid="settings-device-only">
          {LEVEL_LABEL[school.level]} keeps everything on this device. There's no account, no syncing, and Google and Dropbox stay switched off, because each of those signs in with an outside account. Study Forge never asks your age. Make a backup below to keep a copy of your work.
        </p>
      )}

      {pending && (
        <ConfirmDialog
          title={`Switch to ${LEVEL_LABEL[pending]}?`}
          confirmLabel="Switch and stop syncing"
          onCancel={() => setPending(null)}
          onConfirm={() => { setSchool({ level: pending }); setPending(null); }}
        >
          <p>{LEVEL_LABEL[pending]} works on this device only, so this device stops syncing to your account while that level is set. Nothing is deleted: your account and everything already in it stay exactly as they are, and switching back to College or High school starts syncing again.</p>
        </ConfirmDialog>
      )}
    </section>
  );
}

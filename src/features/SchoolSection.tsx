import { useState } from 'react';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { getActiveAccount } from '../data/account';
import {
  LEVEL_GRADES, LEVEL_LABEL, ROTATION_LETTERS, ROTATION_MAX, SCHOOL_LEVELS, SCHOOL_WEEK, TERM_KINDS, TERM_KIND_LABEL,
  allowsAccounts, dayLabel, dayNames, reanchor, rotationDayOn, setSchool, useSchool, wordsFor, type DayStyle, type Rotation, type SchoolLevel,
} from '../data/schoolLevel';
import { localNow } from '../data/plannerRules';

/**
 * Changing school level later. It only changes wording, suggestions and which tools show — never a
 * class, a mark or a deadline. Moving to a level that works on this device only is confirmed first
 * when the student is signed in, because their device stops syncing until they move back.
 */
/**
 * Which naming a stored rotation is using. Worked out from the names themselves rather than kept
 * as a fourth setting, so there is no way for the two to disagree with each other.
 */
function styleOf(rotation: Rotation): DayStyle {
  if (!rotation.names) return 'letters';
  return rotation.names.join('|') === dayNames('numbers', rotation.length).join('|') ? 'numbers' : 'custom';
}

/** Names for a cycle of this length, keeping anything already typed. */
const resize = (rotation: Rotation, length: number): string[] | undefined => {
  const style = styleOf(rotation);
  if (style === 'letters') return undefined;
  const fallback = dayNames(style, length);
  return fallback.map((name, day) => (style === 'custom' ? (rotation.names?.[day] ?? '') : name));
};

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

      <div className="pref-row">
        <h3 id="block-heading">Block schedule</h3>
        <p className="muted small">
          Some schools rotate through named days — an A day, then a B day — instead of running the same {words.courses} every day. The cycle only moves on days school is open, so a weekend or a day off never pushes it on.
        </p>
        <label className="choice-pair">
          <input
            type="checkbox"
            checked={Boolean(school.rotation)}
            data-testid="block-on"
            onChange={(event) => setSchool({ rotation: event.target.checked ? { length: 2, anchor: localNow().date, weekdays: SCHOOL_WEEK } : null })}
          />
          My school runs a block schedule
        </label>
        {school.rotation && (
          <div className="block-setup">
            <label>How many days in the cycle?
              <select
                value={school.rotation.length}
                data-testid="block-length"
                onChange={(event) => {
                  const length = Number(event.target.value);
                  setSchool({ rotation: { ...school.rotation!, length, names: resize(school.rotation!, length) } });
                }}
              >
                {Array.from({ length: ROTATION_MAX - 1 }, (_, index) => index + 2).map((length) => (
                  <option key={length} value={length}>{length} days (A to {ROTATION_LETTERS[length - 1]})</option>
                ))}
              </select>
            </label>
            <label>What does your school call its days?
              <select
                value={styleOf(school.rotation)}
                data-testid="block-naming"
                onChange={(event) => {
                  const style = event.target.value as DayStyle;
                  const current = Array.from({ length: school.rotation!.length }, (_, day) => dayLabel(school.rotation, day));
                  setSchool({
                    rotation: {
                      ...school.rotation!,
                      // Switching to your own names starts from what is on screen, so nothing is
                      // wiped and you only change the ones that are wrong.
                      names: style === 'letters' ? undefined : style === 'numbers' ? dayNames('numbers', school.rotation!.length) : current,
                    },
                  });
                }}
              >
                <option value="letters">A day, B day, C day</option>
                <option value="numbers">Day 1, Day 2, Day 3</option>
                <option value="custom">My own names</option>
              </select>
            </label>
            {styleOf(school.rotation) === 'custom' && (
              <div className="block-names" data-testid="block-names">
                {Array.from({ length: school.rotation.length }, (_, day) => (
                  <label key={day}>
                    Day {day + 1} is called
                    <input
                      value={school.rotation!.names?.[day] ?? ''}
                      placeholder={dayNames('letters', school.rotation!.length)[day]}
                      onChange={(event) => {
                        const names = Array.from({ length: school.rotation!.length }, (_, index) => school.rotation!.names?.[index] ?? '');
                        names[day] = event.target.value;
                        setSchool({ rotation: { ...school.rotation!, names } });
                      }}
                    />
                  </label>
                ))}
                <p className="muted small">Any you leave empty show as a letter instead, so nothing ever appears blank.</p>
              </div>
            )}
            <label>What is today?
              <select
                value={rotationDayOn(school.rotation, localNow().date) ?? ''}
                data-testid="block-today"
                onChange={(event) => setSchool({ rotation: reanchor(school.rotation!, localNow().date, Number(event.target.value)) })}
              >
                {rotationDayOn(school.rotation, localNow().date) === null && <option value="">Not a school day today</option>}
                {Array.from({ length: school.rotation.length }, (_, day) => (
                  <option key={day} value={day}>{dayLabel(school.rotation, day)} day</option>
                ))}
              </select>
            </label>
            <p className="muted small" data-testid="block-state">
              {rotationDayOn(school.rotation, localNow().date) === null
                ? 'School is closed today, so there is no letter for it. Set this on a school day.'
                : `Today is a ${dayLabel(school.rotation, rotationDayOn(school.rotation, localNow().date)!)} day.`}
              {' '}If a day off has put the cycle out, just say what today really is and every other day follows from it.
            </p>
          </div>
        )}
      </div>

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

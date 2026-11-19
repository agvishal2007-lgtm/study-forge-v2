import { setDisplayPref, useDisplayPrefs, type DisplayPrefs } from '../data/displayPrefs';
import { explains } from '../data/studyToolRules';

/**
 * Per-feature choices for the study tools.
 *
 * Every setting here changes what actually happens, and each one says what it does underneath the
 * choice rather than leaving a bare label to be guessed at. Anything that would have been a switch
 * with nothing behind it was left out instead of shipped — there is no study-session length here
 * for exactly that reason, because there is no timed session to apply one to yet.
 */
type Choice<K extends keyof DisplayPrefs> = { value: DisplayPrefs[K]; label: string };

function Setting<K extends keyof DisplayPrefs>({ name, title, choices, note }: {
  name: K;
  title: string;
  choices: Choice<K>[];
  note?: string;
}) {
  const prefs = useDisplayPrefs();
  const current = prefs[name];
  return (
    <fieldset className="tool-setting" data-testid={`setting-${name}`}>
      <legend>{title}</legend>
      <div className="tool-choices">
        {choices.map((choice) => (
          <label key={String(choice.value)} className="check-line">
            <input
              type="radio"
              name={name}
              checked={current === choice.value}
              onChange={() => setDisplayPref(name, choice.value)}
            />
            {choice.label}
          </label>
        ))}
      </div>
      <p className="muted small" data-testid={`effect-${name}`}>{explains(name, String(current))}</p>
      {note && <p className="muted small">{note}</p>}
    </fieldset>
  );
}

export function StudyToolsSection() {
  return (
    <section aria-labelledby="tools-heading" data-testid="study-tools">
      <h3 id="tools-heading">Flashcards</h3>
      <Setting
        name="cardOrder"
        title="What order do cards come in?"
        choices={[{ value: 'created', label: 'The order I made them' }, { value: 'shuffled', label: 'Shuffled' }]}
        note="A shuffled order holds still while you work through a deck, so cards never swap places between one and the next. Each card's own schedule is unaffected either way."
      />
      <Setting
        name="cardSide"
        title="Which side shows first?"
        choices={[{ value: 'front', label: 'The front' }, { value: 'back', label: 'The back' }]}
      />

      <h3>Practice</h3>
      <Setting
        name="practiceOrder"
        title="What order do questions come in?"
        choices={[{ value: 'created', label: 'The order they were written' }, { value: 'shuffled', label: 'Shuffled' }]}
      />
      <Setting
        name="explanations"
        title="When do explanations show?"
        choices={[{ value: 'each', label: 'As soon as I answer' }, { value: 'end', label: 'All together at the end' }]}
        note="Either way you get every explanation. Choosing the end only delays them."
      />

      <h3>Notes</h3>
      <Setting
        name="noteStart"
        title="How does a note open?"
        choices={[{ value: 'write', label: 'Ready to write' }, { value: 'preview', label: 'Showing how it reads' }]}
        note="A note with nothing in it always opens ready to write, whichever you pick."
      />

      <h3>Recordings</h3>
      <Setting
        name="autoTranscript"
        title="Make a transcript automatically?"
        choices={[{ value: 'off', label: "No, only when I ask" }, { value: 'on', label: 'Yes, as soon as I stop recording' }]}
        note="A transcript runs speech software on your device. Nothing is uploaded, but it is slow on a long recording and it warms a phone up, which is why it is off unless you ask for it."
      />

      <p className="muted small" data-testid="tools-missing">
        No study-session length here yet: Study Forge has no timed study session to apply one to, and
        a setting with nothing behind it would be worse than none. It will appear when there is.
      </p>
    </section>
  );
}

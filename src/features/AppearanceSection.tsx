import { setThemeChoice, useThemeChoice, type ThemeChoice } from '../data/theme';
import { setDisplayPref, useDisplayPrefs, type DisplayPrefs } from '../data/displayPrefs';

/** One row of choices. Radios underneath, so keyboards and screen readers get them for free. */
function Choices<K extends keyof DisplayPrefs>({ name, label, options, hint }: {
  name: K;
  label: string;
  options: { value: DisplayPrefs[K]; label: string }[];
  hint: string;
}) {
  const prefs = useDisplayPrefs();
  const id = `pref-${name}`;
  return (
    <div className="pref-row">
      <h3 id={id}>{label}</h3>
      <div className="segmented" role="radiogroup" aria-labelledby={id}>
        {options.map((option) => (
          <label key={option.value} className="segment" data-chosen={prefs[name] === option.value ? 'true' : undefined}>
            <input className="sr-only" type="radio" name={id} checked={prefs[name] === option.value} onChange={() => setDisplayPref(name, option.value)} />
            {option.label}
          </label>
        ))}
      </div>
      <p className="muted">{hint}</p>
    </div>
  );
}

const CHOICES: { value: ThemeChoice; label: string }[] = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'system', label: 'Match my device' },
];

export function AppearanceSection() {
  const choice = useThemeChoice();
  return (
    <section aria-labelledby="appearance-heading">
      <h2 id="appearance-heading">Appearance</h2>
      <div className="segmented" role="radiogroup" aria-labelledby="appearance-heading">
        {CHOICES.map((option) => (
          <label key={option.value} className="segment" data-chosen={choice === option.value ? 'true' : undefined}>
            <input className="sr-only" type="radio" name="theme" checked={choice === option.value} onChange={() => setThemeChoice(option.value)} />
            {option.label}
          </label>
        ))}
      </div>
      <p className="muted">This is remembered in this browser.</p>
      <Choices
        name="text"
        label="Text size"
        options={[{ value: 'standard', label: 'Standard' }, { value: 'large', label: 'Large' }, { value: 'larger', label: 'Larger' }]}
        hint="Makes every screen's text bigger, on top of your browser's own zoom."
      />
      <Choices
        name="motion"
        label="Motion"
        options={[{ value: 'device', label: 'Match my device' }, { value: 'reduce', label: 'Reduce motion' }]}
        hint="Reduce motion stops sliding, lifting and animated effects, even if your device allows them."
      />
      <Choices
        name="density"
        label="Spacing"
        options={[{ value: 'comfortable', label: 'Comfortable' }, { value: 'compact', label: 'Compact' }]}
        hint="Compact fits more on the screen. Buttons stay large enough to tap."
      />
    </section>
  );
}

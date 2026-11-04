import { setThemeChoice, useThemeChoice, type ThemeChoice } from '../data/theme';

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
    </section>
  );
}

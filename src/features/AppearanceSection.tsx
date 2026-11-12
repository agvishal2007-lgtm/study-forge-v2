import { setThemeChoice, setThemePlace, useTheme, type ThemeChoice } from '../data/theme';
import { PLACES } from '../data/sunRules';
import { formatWhen, getClockStyle, getDateOrder, sampleDate, sampleTime, setDateFormat, subscribeDateFormat, dateFormatVersion, type ClockStyle, type DateOrder } from '../data/dateFormat';
import { useSyncExternalStore } from 'react';
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
  { value: 'system', label: 'Match Device' },
  { value: 'sun', label: 'Sunrise/Sunset' },
];

const CHOICE_HINT: Record<ThemeChoice, string> = {
  light: 'Always light.',
  dark: 'Always dark.',
  system: "Follows your device's own light or dark setting.",
  sun: 'Light during the day and dark at night, using sunrise and sunset in your city.',
};

const clock = (ms: number | null) => (ms === null ? '' : formatWhen(ms, { hour: 'numeric', minute: '2-digit' }));

const ORDERS: { value: DateOrder; label: string }[] = [
  { value: 'device', label: 'Match my device' },
  { value: 'mdy', label: 'Month/Day/Year' },
  { value: 'dmy', label: 'Day/Month/Year' },
  { value: 'ymd', label: 'Year-Month-Day' },
];
const CLOCKS: { value: ClockStyle; label: string }[] = [
  { value: 'device', label: 'Match my device' },
  { value: '12', label: '12-hour' },
  { value: '24', label: '24-hour' },
];

/** How dates and times are written. The clock and time zone always come from the device. */
function DateTimeChoices() {
  useSyncExternalStore(subscribeDateFormat, dateFormatVersion);
  const order = getDateOrder();
  const clock = getClockStyle();
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return (
    <div className="pref-row" data-testid="date-format">
      <h3 id="pref-date-order">Date format</h3>
      <div className="segmented" role="radiogroup" aria-labelledby="pref-date-order">
        {ORDERS.map((option) => (
          <label key={option.value} className="segment" data-chosen={order === option.value ? 'true' : undefined}>
            <input className="sr-only" type="radio" name="date-order" checked={order === option.value} onChange={() => setDateFormat({ order: option.value })} />
            {option.label} <span className="muted small">({sampleDate(option.value)})</span>
          </label>
        ))}
      </div>
      <h3 id="pref-clock">Time format</h3>
      <div className="segmented" role="radiogroup" aria-labelledby="pref-clock">
        {CLOCKS.map((option) => (
          <label key={option.value} className="segment" data-chosen={clock === option.value ? 'true' : undefined}>
            <input className="sr-only" type="radio" name="clock" checked={clock === option.value} onChange={() => setDateFormat({ clock: option.value })} />
            {option.label} <span className="muted small">({sampleTime(option.value)})</span>
          </label>
        ))}
      </div>
      <p className="muted" data-testid="date-format-now">
        Right now: {formatWhen(new Date(), { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}.
        Times always follow this device's own clock and time zone ({zone.replace(/_/g, ' ')}), in any country. Date boxes you type into use your browser's own format.
      </p>
    </div>
  );
}

export function AppearanceSection() {
  const theme = useTheme();
  const choice = theme.choice;
  const known = PLACES.some((place) => place.name === theme.place.name);
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
      <p className="muted" data-testid="theme-hint">{CHOICE_HINT[choice]} The sun or moon button at the top switches between light and dark at any time.</p>
      {choice === 'sun' && (
        <div className="pref-row" data-testid="sun-settings">
          <label htmlFor="theme-city">City for sunrise and sunset</label>
          <select id="theme-city" value={theme.place.name} onChange={(event) => { const place = PLACES.find((entry) => entry.name === event.target.value); if (place) setThemePlace(place); }}>
            {!known && <option value={theme.place.name}>{theme.place.name}</option>}
            {[...PLACES].sort((a, b) => a.name.localeCompare(b.name)).map((place) => <option key={place.name} value={place.name}>{place.name}</option>)}
          </select>
          <p className="muted" data-testid="sun-times">
            {theme.sunrise !== null
              ? `Today in ${theme.place.name}: light from ${clock(theme.sunrise)}, dark from ${clock(theme.sunset)}, shown in your device's time. `
              : `Today in ${theme.place.name} the sun doesn't ${theme.look === 'dark' ? 'rise' : 'set'}. `}
            The city was suggested from your device's time zone, so your location was never asked for. Pick the nearest city if it's wrong.
          </p>
        </div>
      )}
      {theme.override && (choice === 'system' || choice === 'sun') && (
        <p className="notice" role="status" data-testid="theme-override">
          You switched to {theme.override === 'dark' ? 'Dark' : 'Light'} Mode with the button at the top, so {choice === 'sun' ? 'Sunrise/Sunset' : 'Match Device'} is paused and the look won't change by itself.{' '}
          <button type="button" className="text-button" onClick={() => setThemeChoice(choice)}>Go back to {choice === 'sun' ? 'Sunrise/Sunset' : 'Match Device'}</button>
        </p>
      )}
      <DateTimeChoices />
      <Choices
        name="text"
        label="Text size"
        options={[{ value: 'standard', label: 'Standard' }, { value: 'large', label: 'Large' }, { value: 'larger', label: 'Larger' }]}
        hint="Makes every screen's text bigger, on top of your browser's own zoom."
      />
      <Choices
        name="motion"
        label="Motion"
        options={[{ value: 'device', label: 'Follow my device' }, { value: 'reduce', label: 'Reduce motion' }]}
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

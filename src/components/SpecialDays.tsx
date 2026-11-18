import { useState } from 'react';
import {
  EFFECTS, EFFECT_LABEL, createSpecialDay, deleteSpecialDay, describeSpecial, inDateOrder,
  listSpecialDays, saveSpecialDay, usableSpecial, type Effect, type SpecialDay,
} from '../data/specialDays';
import { useLive } from '../data/useLive';
import { InstantCheck } from './InstantCheck';

/**
 * Days that don't run like the others.
 *
 * There is deliberately no menu of kinds — a school's spirit day, assembly, field trip, half day,
 * testing morning or anything else it invents goes in as whatever the student calls it. The only
 * things asked are what it does to the classes and whether a rotating cycle still moves along,
 * because that second one is the thing that silently throws every later day onto the wrong letter.
 */
export function SpecialDays({ blockNames, rotating }: { blockNames: string[]; rotating: boolean }) {
  const [date, setDate] = useState('');
  const [name, setName] = useState('');
  const [effect, setEffect] = useState<Effect>('as-usual');
  const [problem, setProblem] = useState('');
  const { data, error } = useLive(async () => ({ days: await listSpecialDays() }));

  if (error) return <section><h2>Special days</h2><p className="error" role="alert">These couldn't be loaded. {error.message}</p></section>;
  if (!data) return <section><h2>Special days</h2><p className="muted">Loading…</p></section>;
  const days = inDateOrder(data.days);

  const add = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!usableSpecial({ date })) { setProblem('Pick the date it falls on.'); return; }
    try {
      // A day with no classes usually doesn't move a cycle along; that is where the switch starts,
      // and it stays a switch rather than a rule.
      await createSpecialDay({ date, name, effect, cycleMoves: effect !== 'no-classes' });
      setDate('');
      setName('');
      setEffect('as-usual');
      setProblem('');
    } catch (failure) {
      setProblem(`That wasn't saved. ${(failure as Error).message}`);
    }
  };

  const toggleBlock = async (day: SpecialDay, period: number) => {
    const blocks = day.blocks.includes(period) ? day.blocks.filter((one) => one !== period) : [...day.blocks, period].sort((a, b) => a - b);
    await saveSpecialDay({ ...day, blocks });
  };

  return (
    <section aria-labelledby="special-heading" data-testid="special-days">
      <h2 id="special-heading">Special days</h2>
      <p className="muted">
        A day that doesn't run like the others — call it whatever your school calls it. There's no
        list to pick from, because schools don't share one.
      </p>
      {problem && <p className="error" role="alert">{problem}</p>}

      <form className="special-form" onSubmit={add}>
        <label>Date<input type="date" value={date} onChange={(event) => setDate(event.target.value)} data-testid="special-date" /></label>
        <label>
          What is it called?
          <input value={name} placeholder="Assembly, spirit day, field trip…" onChange={(event) => setName(event.target.value)} data-testid="special-name" />
        </label>
        <label>
          What happens to your classes?
          <select value={effect} onChange={(event) => setEffect(event.target.value as Effect)} data-testid="special-effect">
            {EFFECTS.map((one) => <option key={one} value={one}>{EFFECT_LABEL[one]}</option>)}
          </select>
        </label>
        <button className="button primary" type="submit">Add this day</button>
      </form>

      {days.length === 0 ? (
        <p className="muted">Nothing added yet.</p>
      ) : (
        <ul className="plain-list" data-testid="special-list">
          {days.map((day) => (
            <li key={day.id} className="special-row">
              <div>
                <b>{day.date}</b> — {describeSpecial(day, blockNames)}
                {rotating && (
                  <InstantCheck
                    checked={day.cycleMoves}
                    label={`The cycle still moves on ${day.date}`}
                    onSet={(value) => saveSpecialDay({ ...day, cycleMoves: value })}
                  >
                    My rotation still moves along on this day
                  </InstantCheck>
                )}
                {day.effect === 'some-classes' && (
                  <div className="special-blocks">
                    <span className="muted small">Which blocks still happen?</span>
                    {blockNames.map((label, period) => (
                      <InstantCheck
                        key={period}
                        checked={day.blocks.includes(period)}
                        label={`${label.trim() || `Period ${period + 1}`} on ${day.date}`}
                        onSet={() => toggleBlock(day, period)}
                      >
                        {label.trim() || `Period ${period + 1}`}
                      </InstantCheck>
                    ))}
                  </div>
                )}
              </div>
              <button className="text-button danger-text" type="button" onClick={() => void deleteSpecialDay(day.id)}>
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
      {rotating && (
        <p className="muted small" data-testid="special-cycle-note">
          Schools don't agree on whether a day like this moves a rotation along, so Study Forge asks
          instead of deciding. Leave the box ticked and the cycle carries on; untick it and the next
          school day keeps the letter this one would have had.
        </p>
      )}
    </section>
  );
}

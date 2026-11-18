import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Breadcrumbs } from '../components/Breadcrumbs';
import { SpecialDays } from '../components/SpecialDays';
import { dayLabel, useSchool } from '../data/schoolLevel';
import { listCourses } from '../data/store';
import {
  MAX_PERIODS, addPeriod, blankTimetable, blockLength, blockTime, daysForCourse, getTimetable,
  periodName, removePeriod, renamePeriod, resizeTimetable, rotateDay, copyDay, saveTimetable,
  setBlockTime, setSlot, type Timetable,
} from '../data/timetable';
import { useLive } from '../data/useLive';

/**
 * The student's own daily schedule, as an empty grid they fill in.
 *
 * Nothing here is a template. Schools arrange a day in ways no preset would survive — six blocks
 * with lunch in the middle, four then two, a class that moves one block along each day and drops
 * on the day it rotates off, an advisory nobody else has. So this asks only two things: what the
 * blocks of your day are called, and what is in each one on each day of your cycle.
 */
export function TimetablePage() {
  const rotation = useSchool().rotation;
  const cycle = rotation?.length ?? 1;
  const [saving, setSaving] = useState('');
  const [notice, setNotice] = useState('');
  // Saving fires the app's change signal, so this reloads itself; there is no manual refresh.
  const { data, error } = useLive(async () => {
    // Nothing is assumed about the shape of a day, so there is no starter grid: until the student
    // says how many blocks their day has, there is nothing to show them.
    const [courses, saved] = await Promise.all([listCourses(), getTimetable()]);
    const table = saved && saved.days.length === cycle ? saved : saved ? resizeTimetable(saved, saved.periodNames.length, cycle) : null;
    return { courses, table };
  }, [cycle]);

  if (error) return <div className="page"><h1>My daily schedule</h1><p className="error" role="alert">This couldn't be loaded. {error.message}</p></div>;
  if (!data) return <p className="page muted">Loading…</p>;
  const { courses, table } = data;

  const keep = async (next: Timetable, message = '') => {
    setNotice(message);
    try {
      await saveTimetable(next);
      setSaving('');
    } catch (failure) {
      setSaving(`That wasn't saved. ${(failure as Error).message}`);
    }
  };

  const dayName = (day: number) => (rotation ? `${dayLabel(rotation, day)} day` : 'Every day');

  // Until the student says how long their day is, there is no grid: a starter grid would be a guess
  // about their school, and the whole point of this screen is that nothing is guessed.
  if (!table) {
    return (
      <div className="page">
        <Breadcrumbs trail={[{ label: 'Courses', to: '/courses' }, { label: 'My daily schedule' }]} />
        <h1>My daily schedule</h1>
        <p className="muted">
          Nothing about this is assumed. Schools arrange a day in ways no ready-made template
          survives — the same {'classes'} every day, a few blocks with lunch in the middle, a
          {' '}{'class'} that moves one block along each day and drops on the day it rotates off. So
          this starts with one question and builds around your answer.
        </p>
        <form
          className="stack-form"
          data-testid="timetable-setup"
          onSubmit={(event) => {
            event.preventDefault();
            const count = Number(new FormData(event.currentTarget).get('blocks'));
            if (!Number.isInteger(count) || count < 1 || count > MAX_PERIODS) {
              setSaving(`Say how many blocks your day has, from 1 to ${MAX_PERIODS}.`);
              return;
            }
            void keep(blankTimetable(Array.from({ length: count }, () => ''), cycle));
          }}
        >
          <label>
            How many blocks are in your day?
            <input name="blocks" type="number" min={1} max={MAX_PERIODS} data-testid="setup-blocks" required />
          </label>
          <p className="muted small">
            Count every slot you want to see, including lunch or an advisory if you want them on the
            list. You can add or remove blocks afterwards without losing anything.
          </p>
          {saving && <p className="error" role="alert">{saving}</p>}
          <button className="button primary" type="submit">Start my schedule</button>
        </form>
      </div>
    );
  }

  return (
    <div className="page">
      <Breadcrumbs trail={[{ label: 'Courses', to: '/courses' }, { label: 'My daily schedule' }]} />
      <h1>My daily schedule</h1>
      <p className="muted">
        This starts empty on purpose. Say what the blocks of your day are called and what is in each
        one, and nothing is assumed about how your school arranges a day.
      </p>
      <p className="muted small" data-testid="timetable-help">
        An empty slot is a real answer: a free period, lunch, or the day a class rotates off. If your
        classes move one block along each day, fill in the first day and then use <b>shifted one
        block</b> on the next — it is offered, never applied for you.
      </p>
      {!rotation && (
        <p className="muted small">
          Your schedule is the same every day, so there is one column. If your school runs a rotation,
          turn on the block schedule in <Link to="/settings/school">school settings</Link> and a column
          appears for each day of the cycle.
        </p>
      )}
      {saving && <p className="error" role="alert">{saving}</p>}
      {notice && <p className="muted small" role="status" data-testid="timetable-notice">{notice}</p>}

      <label className="check-line">
        <input
          type="checkbox"
          checked={table.sameTimes !== false}
          data-testid="same-times"
          onChange={(event) => void keep({ ...table, sameTimes: event.target.checked })}
        />
        Every day runs at the same times
      </label>
      <p className="muted small">
        Times are optional and any length — thirty minutes, an hour, two hours. Leave them blank and
        the schedule still works. Untick the box above if one of your days runs on different times,
        which is what a late start or an assembly schedule does.
      </p>

      <div className="field-row">
        <label>
          How many blocks are in your day?
          <input
            type="number"
            min={1}
            max={MAX_PERIODS}
            value={table.periodNames.length}
            data-testid="period-count"
            onChange={(event) => {
              const count = Number(event.target.value);
              if (!Number.isInteger(count) || count < 1 || count > MAX_PERIODS) return;
              void keep(resizeTimetable(table, count, cycle));
            }}
          />
        </label>
        <button className="button" type="button" data-testid="add-period" onClick={() => void keep(addPeriod(table))}>
          Add a block
        </button>
      </div>

      {courses.length === 0 ? (
        <p className="muted">Add a class first and it will be here to choose. <Link to="/courses">Go to Courses</Link></p>
      ) : (
        <div className="table-scroll">
          <table className="timetable" data-testid="timetable">
            <thead>
              <tr>
                <th scope="col">Block</th>
                {Array.from({ length: cycle }, (_, day) => (
                  <th scope="col" key={day}>
                    {dayName(day)}
                    {day > 0 && (
                      <span className="day-tools">
                        <button
                          className="text-button"
                          type="button"
                          data-testid={`same-as-${day}`}
                          onClick={() => void keep(copyDay(table, day - 1, day), `${dayName(day)} now matches ${dayName(day - 1)}.`)}
                        >
                          Same as {dayName(day - 1)}
                        </button>
                        <button
                          className="text-button"
                          type="button"
                          data-testid={`shift-${day}`}
                          onClick={() => void keep(rotateDay(table, day - 1, day, 1), `${dayName(day)} is ${dayName(day - 1)} shifted one block along.`)}
                        >
                          Shifted one block
                        </button>
                      </span>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {table.periodNames.map((_, period) => (
                <tr key={period}>
                  <th scope="row">
                    <input
                      value={table.periodNames[period]}
                      placeholder={`Period ${period + 1}`}
                      aria-label={`Name of block ${period + 1}`}
                      data-testid={`period-name-${period}`}
                      onChange={(event) => void keep(renamePeriod(table, period, event.target.value))}
                    />
                    {table.sameTimes !== false && (
                      <span className="block-times">
                        <input
                          type="time"
                          value={blockTime(table, 0, period)?.start ?? ''}
                          aria-label={`${periodName(table, period)} starts at`}
                          data-testid={`start-${period}`}
                          onChange={(event) => void keep(setBlockTime(table, 0, period, { start: event.target.value, end: blockTime(table, 0, period)?.end ?? '' }))}
                        />
                        <input
                          type="time"
                          value={blockTime(table, 0, period)?.end ?? ''}
                          aria-label={`${periodName(table, period)} ends at`}
                          data-testid={`end-${period}`}
                          onChange={(event) => void keep(setBlockTime(table, 0, period, { start: blockTime(table, 0, period)?.start ?? '', end: event.target.value }))}
                        />
                        {blockLength(blockTime(table, 0, period)) && (
                          <span className="muted small" data-testid={`length-${period}`}>{blockLength(blockTime(table, 0, period))}</span>
                        )}
                      </span>
                    )}
                    {table.periodNames.length > 1 && (
                      <button
                        className="text-button danger-text"
                        type="button"
                        aria-label={`Remove ${periodName(table, period)}`}
                        onClick={() => void keep(removePeriod(table, period))}
                      >
                        Remove
                      </button>
                    )}
                  </th>
                  {Array.from({ length: cycle }, (_, day) => (
                    <td key={day}>
                      <select
                        value={table.days[day]?.[period] ?? ''}
                        aria-label={`${periodName(table, period)} on ${dayName(day)}`}
                        onChange={(event) => {
                          const result = setSlot(table, day, period, event.target.value);
                          void keep(
                            result.table,
                            result.repeated ? 'That class is now in two blocks on the same day. That is allowed — a lab or a double — but check it is what you meant.' : '',
                          );
                        }}
                      >
                        <option value="">— nothing —</option>
                        {courses.map((course) => (
                          <option key={course.id} value={course.id}>{course.name}</option>
                        ))}
                      </select>
                      {table.sameTimes === false && (
                        <span className="block-times">
                          <input
                            type="time"
                            value={blockTime(table, day, period)?.start ?? ''}
                            aria-label={`${periodName(table, period)} on ${dayName(day)} starts at`}
                            onChange={(event) => void keep(setBlockTime(table, day, period, { start: event.target.value, end: blockTime(table, day, period)?.end ?? '' }))}
                          />
                          <input
                            type="time"
                            value={blockTime(table, day, period)?.end ?? ''}
                            aria-label={`${periodName(table, period)} on ${dayName(day)} ends at`}
                            onChange={(event) => void keep(setBlockTime(table, day, period, { start: blockTime(table, day, period)?.start ?? '', end: event.target.value }))}
                          />
                          {blockLength(blockTime(table, day, period)) && (
                            <span className="muted small">{blockLength(blockTime(table, day, period))}</span>
                          )}
                        </span>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <SpecialDays blockNames={table.periodNames} rotating={Boolean(rotation)} />

      {courses.length > 0 && (
        <section aria-labelledby="which-days">
          <h2 id="which-days">Which days each class meets</h2>
          <p className="muted small">Worked out from the grid above, so there is nothing to keep in step by hand.</p>
          <ul className="plain-list" data-testid="course-days">
            {courses.map((course) => {
              const days = daysForCourse(table, course.id);
              return (
                <li key={course.id}>
                  <b>{course.name}</b>{' — '}
                  {days.length === 0
                    ? 'not in your schedule yet'
                    : rotation
                      ? days.map((day) => dayLabel(rotation, day)).join(', ')
                      : 'every day'}
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}

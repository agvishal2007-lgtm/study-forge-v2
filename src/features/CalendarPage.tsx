import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { listCalendarEvents, getGoogleConnection, setEventCompleted } from '../data/calendar';
import { compareEvents, describeTime, minutesOf, monthGrid, monthOf, noClassesOn, shiftMonth, todaysPlan, visibleEvents } from '../data/calendarRules';
import { getActiveAccount } from '../data/account';
import { CalendarError, hasGoogleAccess, prepareGoogle } from '../data/googleCalendar';
import { getLatestFromGoogle, reportWords } from '../data/googleConnect';
import { listPlannerItems } from '../data/planner';
import { describeDue, isDone, localNow } from '../data/plannerRules';
import { listAllCourses } from '../data/store';
import type { CalendarEvent, Course, PlannerItem } from '../data/types';
import { useLive } from '../data/useLive';

const VIEWS = [
  { id: 'today', label: "Today's Plan" },
  { id: 'plan', label: 'Plan Calendar' },
  { id: 'deadlines', label: 'Deadline Calendar' },
] as const;
type View = (typeof VIEWS)[number]['id'];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const SHOWN_IN_CELL = 3;
const AUTO_UPDATE_MS = 15 * 60 * 1000;

const words = (date: string, options: Intl.DateTimeFormatOptions) => {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString(undefined, { ...options, timeZone: 'UTC' });
};

function Completed({ event, onProblem }: { event: CalendarEvent; onProblem: (text: string) => void }) {
  return (
    <input
      type="checkbox"
      className="plan-check"
      aria-label={`${event.title} completed`}
      checked={event.completed}
      onChange={(change) => {
        setEventCompleted(event.id, change.target.checked).catch((error: Error) => onProblem(`That wasn't saved. ${error.message}`));
      }}
    />
  );
}

function TodayView({ events, deadlines, courses, today }: { events: CalendarEvent[]; deadlines: PlannerItem[]; courses: Course[]; today: string }) {
  const [problem, setProblem] = useState('');
  const [showFinished, setShowFinished] = useState(false);
  const plan = todaysPlan(events, today);
  const noClasses = noClassesOn(events, today);
  const finished = visibleEvents(events).filter((event) => event.date === today && event.completed && event.kind !== 'No classes').sort(compareEvents);
  const dueToday = deadlines.filter((item) => item.dueDate === today && !isDone(item));
  const courseName = (id: string | null) => courses.find((course) => course.id === id)?.code || courses.find((course) => course.id === id)?.name || '—';
  const now = localNow();
  return (
    <section aria-label="Today's Plan" data-testid="today-view">
      {problem && <p className="error" role="alert">{problem}</p>}
      {noClasses.map((event) => <p key={event.id} className="notice no-classes" data-testid="no-classes">No classes today: {event.title}</p>)}
      {plan.length === 0
        ? <p className="muted plan-empty">Nothing left on your plan today.</p>
        : (
          <div className="table-scroll">
            <table className="plan-table" data-testid="plan-table">
              <thead><tr><th scope="col">Task or event</th><th scope="col">Course</th><th scope="col">Time</th><th scope="col">What to do</th><th scope="col">Priority</th><th scope="col">Time needed</th><th scope="col">Completed</th></tr></thead>
              <tbody>
                {plan.map((event) => {
                  const minutes = minutesOf(event);
                  return (
                    <tr key={event.id} data-testid="plan-row">
                      <th scope="row"><Link to={`/calendar/event/${event.id}`}>{event.title}</Link>{noClasses.length > 0 && event.kind === 'Class' && <span className="plan-flag"> Check this: today is marked no classes.</span>}</th>
                      <td>{courseName(event.courseId)}</td>
                      <td>{describeTime(event)}{event.location && <span className="muted plan-where">{event.location}</span>}</td>
                      <td data-empty={event.whatToDo ? undefined : 'true'}>{event.whatToDo || '—'}</td>
                      <td data-label="Priority" data-empty={event.priority === 'Normal' ? 'true' : undefined}>{event.priority}</td>
                      <td data-label="Time needed" data-empty={minutes === null ? 'true' : undefined}>{minutes === null ? '—' : `${minutes} min`}</td>
                      <td data-label="Completed" className="plan-done-cell"><Completed event={event} onProblem={setProblem} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      {finished.length > 0 && (
        <p><button className="text-button" onClick={() => setShowFinished(!showFinished)}>{showFinished ? 'Hide' : 'Show'} {finished.length} completed today</button></p>
      )}
      {showFinished && (
        <ul className="plan-list">
          {finished.map((event) => (
            <li key={event.id}><Completed event={event} onProblem={setProblem} /> <Link to={`/calendar/event/${event.id}`}>{event.title}</Link> <span className="muted">{describeTime(event)}</span></li>
          ))}
        </ul>
      )}
      <h2 className="plan-subhead">Due today</h2>
      {dueToday.length > 0
        ? <ul className="plan-list" data-testid="due-today">{dueToday.map((item) => <li key={item.id}><Link to={`/planner/${item.id}`}>{item.title}</Link> <span className="muted">{describeDue(item, now)}</span></li>)}</ul>
        : <p className="muted">Nothing is due today.</p>}
    </section>
  );
}

interface CellItem {
  id: string;
  to: string;
  title: string;
  when: string;
  color: string;
  done: boolean;
  noClasses: boolean;
}

function MonthView({ month, items, today, selected, onSelect, onMonth, label, addTo }: { month: string; items: Map<string, CellItem[]>; today: string; selected: string; onSelect: (date: string) => void; onMonth: (month: string) => void; label: string; addTo: (date: string) => string }) {
  const chosen = items.get(selected) ?? [];
  return (
    <section aria-label={label} data-testid="month-view">
      <div className="month-head">
        <h2 data-testid="month-title">{words(`${month}-01`, { month: 'long', year: 'numeric' })}</h2>
        <div className="month-nav">
          <button className="button" onClick={() => onMonth(shiftMonth(month, -1))} aria-label="Previous month">Back</button>
          <button className="button" onClick={() => { onMonth(monthOf(today)); onSelect(today); }}>Today</button>
          <button className="button" onClick={() => onMonth(shiftMonth(month, 1))} aria-label="Next month">Next</button>
        </div>
      </div>
      <div className="month-grid" role="grid" aria-label={words(`${month}-01`, { month: 'long', year: 'numeric' })}>
        <div className="month-row month-weekdays" role="row">{WEEKDAYS.map((day) => <span key={day} role="columnheader">{day}</span>)}</div>
        {monthGrid(month).map((week) => (
          <div className="month-row" role="row" key={week[0]}>
            {week.map((date) => {
              const dayItems = items.get(date) ?? [];
              return (
                <button
                  key={date}
                  role="gridcell"
                  className="month-cell"
                  data-date={date}
                  data-outside={monthOf(date) !== month ? 'true' : undefined}
                  data-today={date === today ? 'true' : undefined}
                  data-selected={date === selected ? 'true' : undefined}
                  data-off={dayItems.some((item) => item.noClasses) ? 'true' : undefined}
                  aria-label={`${words(date, { weekday: 'long', month: 'long', day: 'numeric' })}, ${dayItems.length} ${dayItems.length === 1 ? 'item' : 'items'}`}
                  aria-pressed={date === selected}
                  onClick={() => onSelect(date)}
                >
                  <b>{Number(date.slice(8))}</b>
                  <span className="month-chips">
                    {dayItems.slice(0, SHOWN_IN_CELL).map((item) => <span key={item.id} className="month-chip" data-done={item.done ? 'true' : undefined} style={{ '--spine': item.color } as React.CSSProperties}>{item.title}</span>)}
                    {dayItems.length > SHOWN_IN_CELL && <span className="month-more">{dayItems.length - SHOWN_IN_CELL} more</span>}
                  </span>
                </button>
              );
            })}
          </div>
        ))}
      </div>
      <div className="month-day" data-testid="selected-day">
        <div className="section-head">
          <h3>{words(selected, { weekday: 'long', month: 'long', day: 'numeric' })}</h3>
          <Link to={addTo(selected)}>Add here</Link>
        </div>
        {chosen.length > 0
          ? (
            <ul className="planner-list">
              {chosen.map((item) => (
                <li key={item.id} className="planner-row" style={{ '--spine': item.color } as React.CSSProperties} data-done={item.done ? 'true' : undefined}>
                  <span className="planner-main"><Link to={item.to}>{item.title}</Link><span className="muted">{item.when}</span></span>
                </li>
              ))}
            </ul>
          )
          : <p className="muted">Nothing on this day.</p>}
      </div>
    </section>
  );
}

export function CalendarPage() {
  const [params, setParams] = useSearchParams();
  const today = localNow().date;
  const view = (VIEWS.some((entry) => entry.id === params.get('view')) ? params.get('view') : 'today') as View;
  const courseFilter = params.get('course') ?? '';
  const month = /^\d{4}-\d{2}$/.test(params.get('month') ?? '') ? params.get('month') as string : monthOf(today);
  const [googleReady, setGoogleReady] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [updateNote, setUpdateNote] = useState('');
  const [selected, setSelected] = useState(/^\d{4}-\d{2}-\d{2}$/.test(params.get('day') ?? '') ? params.get('day') as string : today);
  const { data, error } = useLive(async () => {
    const [events, planner, courses, connection] = await Promise.all([listCalendarEvents(), listPlannerItems(), listAllCourses(), getGoogleConnection()]);
    return { events, planner, courses, connection };
  }, []);
  const connected = Boolean(data?.connection);
  useEffect(() => {
    if (!connected) return;
    let active = true;
    prepareGoogle().then(() => { if (active) setGoogleReady(true); }, () => undefined);
    return () => { active = false; };
  }, [connected]);
  // Google's permission lasts about an hour, so while it's still good the calendar updates by itself.
  const lastSync = data?.connection?.lastSync ?? 0;
  useEffect(() => {
    if (!connected || !hasGoogleAccess() || Date.now() - lastSync < AUTO_UPDATE_MS) return;
    getLatestFromGoogle().then((report) => { if (report) setUpdateNote(reportWords(report)); }, () => undefined);
  }, [connected, lastSync]);
  const getLatest = () => {
    setUpdating(true);
    setUpdateNote('');
    // Nothing is awaited before this call, so Google's window opens as part of the tap itself.
    getLatestFromGoogle(getActiveAccount()?.email).then(
      (report) => { if (report) setUpdateNote(reportWords(report)); },
      (problem: unknown) => {
        if (!(problem instanceof CalendarError && problem.cancelled)) setUpdateNote(problem instanceof Error ? problem.message : "Google Calendar couldn't be updated.");
      },
    ).finally(() => setUpdating(false));
  };
  if (error) return <div className="page"><h1>Study Forge Calendar</h1><p className="error" role="alert">Your calendar couldn't be loaded. {error.message}</p></div>;
  if (!data) return <p className="page muted">Loading…</p>;
  const { courses, connection } = data;
  const change = (next: Record<string, string>) => {
    const merged = new URLSearchParams(params);
    Object.entries(next).forEach(([key, value]) => (value ? merged.set(key, value) : merged.delete(key)));
    setParams(merged, { replace: true });
  };
  const events = visibleEvents(data.events).filter((event) => !courseFilter || event.courseId === courseFilter);
  const planner = data.planner.filter((item) => !courseFilter || item.courseId === courseFilter);
  const colorOf = (id: string | null) => courses.find((course) => course.id === id)?.color ?? 'var(--line)';

  const planItems = new Map<string, CellItem[]>();
  for (const event of [...events].sort(compareEvents)) {
    const list = planItems.get(event.date) ?? [];
    list.push({ id: event.id, to: `/calendar/event/${event.id}`, title: event.kind === 'No classes' ? `No classes: ${event.title}` : event.title, when: [event.kind === 'No classes' ? 'No classes' : describeTime(event), event.location].filter(Boolean).join(', '), color: event.kind === 'No classes' ? 'var(--danger)' : colorOf(event.courseId), done: event.completed, noClasses: event.kind === 'No classes' });
    planItems.set(event.date, list);
  }
  const now = localNow();
  const deadlineItems = new Map<string, CellItem[]>();
  for (const item of planner.filter((entry) => entry.dueDate).sort((a, b) => a.dueTime.localeCompare(b.dueTime))) {
    const list = deadlineItems.get(item.dueDate) ?? [];
    list.push({ id: item.id, to: `/planner/${item.id}`, title: item.title, when: `${item.type}. ${describeDue(item, now)}`, color: colorOf(item.courseId), done: isDone(item), noClasses: false });
    deadlineItems.set(item.dueDate, list);
  }

  return (
    <div className="page calendar-page">
      <div className="section-head calendar-head">
        <h1>Study Forge Calendar</h1>
        <div className="calendar-actions" data-tour="calendar-add">
          {connection ? (
            <>
              {/* Set up once; after that you mostly add the odd event and pull new Canvas work. */}
              <Link className="button primary" to={`/calendar/event/new?date=${selected}`}>Add to calendar</Link>
              <button className="button" onClick={getLatest} disabled={updating || !googleReady}>{updating ? 'Updating…' : 'Get the latest'}</button>
              <Link className="button" to="/calendar/google">Google Calendar</Link>
              <Link className="button" to="/calendar/schedule">Add class schedule</Link>
            </>
          ) : (
            <>
              {/* Nothing's set up yet, so the import options come first. */}
              <Link className="button primary" to="/calendar/google">Connect Google Calendar</Link>
              <Link className="button" to="/calendar/schedule">Add class schedule</Link>
              <Link className="button" to={`/calendar/event/new?date=${selected}`}>Add to calendar</Link>
            </>
          )}
        </div>
      </div>
      {updateNote && <p className="notice" role="status" data-testid="calendar-update-note">{updateNote}</p>}
      <div className="calendar-tools">
        <div className="calendar-tabs" role="tablist" aria-label="Calendar views">
          {VIEWS.map((entry) => (
            <button key={entry.id} role="tab" aria-selected={view === entry.id} className="calendar-tab" onClick={() => change({ view: entry.id })}>{entry.label}</button>
          ))}
        </div>
        <label className="calendar-filter">Course
          <select aria-label="Course" value={courseFilter} onChange={(event) => change({ course: event.target.value })}>
            <option value="">All courses</option>
            {courses.map((course) => <option key={course.id} value={course.id}>{course.name}</option>)}
          </select>
        </label>
      </div>
      {view === 'today' && <TodayView events={events} deadlines={planner} courses={courses} today={today} />}
      {view === 'plan' && <MonthView label="Plan Calendar" month={month} items={planItems} today={today} selected={selected} onSelect={setSelected} onMonth={(next) => change({ month: next })} addTo={(date) => `/calendar/event/new?date=${date}`} />}
      {view === 'deadlines' && <MonthView label="Deadline Calendar" month={month} items={deadlineItems} today={today} selected={selected} onSelect={setSelected} onMonth={(next) => change({ month: next })} addTo={(date) => `/planner/new?date=${date}`} />}
      {data.events.length === 0 && (
        <div className="notice" data-testid="calendar-start">
          <p>Your calendar is empty. The quickest start is to <Link to="/calendar/schedule">add your class schedule</Link>. Or <Link to="/calendar/google">connect Google Calendar</Link> to bring in your classes and Canvas work.</p>
        </div>
      )}
    </div>
  );
}

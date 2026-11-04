import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { useStillHere } from '../components/useStillHere';
import { getCalendarEvent, listCalendarEvents, removeCalendarEvents, saveCalendarEvents } from '../data/calendar';
import { weeklyDates } from '../data/calendarRules';
import { isValidDate, localNow } from '../data/plannerRules';
import { listCourses } from '../data/store';
import { CALENDAR_KINDS, PLAN_PRIORITIES, type CalendarEvent, type CalendarKind, type PlanPriority } from '../data/types';
import { useLive } from '../data/useLive';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function CalendarEventPage() {
  const { id = '' } = useParams();
  const [params] = useSearchParams();
  const isNew = id === 'new';
  const navigate = useNavigate();
  const stillHere = useStillHere();
  const plannerItemId = useRef(params.get('plannerItem'));
  const [original, setOriginal] = useState<CalendarEvent | null>(null);
  const [loaded, setLoaded] = useState(isNew);
  const [missing, setMissing] = useState(false);
  const [title, setTitle] = useState(params.get('title') ?? '');
  const [kind, setKind] = useState<CalendarKind>(params.get('plannerItem') ? 'Study block' : 'Class');
  const [courseId, setCourseId] = useState(params.get('course') ?? '');
  const [date, setDate] = useState(params.get('date') ?? localNow().date);
  const [allDay, setAllDay] = useState(false);
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [location, setLocation] = useState('');
  const [whatToDo, setWhatToDo] = useState('');
  const [priority, setPriority] = useState<PlanPriority>('Normal');
  const [repeats, setRepeats] = useState(false);
  const [days, setDays] = useState<number[]>([]);
  const [until, setUntil] = useState('');
  const [applyToRest, setApplyToRest] = useState(false);
  const [problems, setProblems] = useState<string[]>([]);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [saving, setSaving] = useState(false);
  const { data: courses } = useLive(listCourses);

  useEffect(() => {
    if (isNew) return;
    let active = true;
    void getCalendarEvent(id).then((event) => {
      if (!active) return;
      if (!event || event.hidden) {
        setMissing(true);
      } else {
        setOriginal(event);
        setTitle(event.title);
        setKind(event.kind);
        setCourseId(event.courseId ?? '');
        setDate(event.date);
        setAllDay(!event.startTime);
        setStartTime(event.startTime);
        setEndTime(event.endTime);
        setLocation(event.location);
        setWhatToDo(event.whatToDo);
        setPriority(event.priority);
      }
      setLoaded(true);
    });
    return () => { active = false; };
  }, [id, isNew]);

  if (missing) return <div className="page"><h1>This item doesn't exist</h1><Link to="/calendar">Go to Calendar</Link></div>;
  if (!loaded) return <p className="page muted">Loading…</p>;

  const fromGoogle = original?.source === 'google';
  const inSeries = Boolean(original?.seriesId);
  const wholeDay = allDay || kind === 'No classes';

  const check = () => {
    const found: string[] = [];
    if (!title.trim()) found.push('Give it a name.');
    if (!isValidDate(date)) found.push('Choose a date.');
    if (!wholeDay && !startTime) found.push('Choose a start time, or check All day.');
    if (!wholeDay && endTime && endTime <= startTime) found.push('The end time needs to be after the start time.');
    if (repeats) {
      if (days.length === 0) found.push('Choose the days it repeats.');
      if (!isValidDate(until) || until < date) found.push('Choose a last date on or after the first date.');
    }
    return found;
  };

  const save = async () => {
    const found = check();
    setProblems(found);
    if (found.length > 0 || saving) return;
    setSaving(true);
    try {
      const shared = {
        title: title.trim(),
        kind,
        courseId: courseId || null,
        startTime: wholeDay ? '' : startTime,
        endTime: wholeDay ? '' : endTime,
        location: location.trim(),
        whatToDo: whatToDo.trim(),
        priority,
      };
      if (original) {
        const targets: CalendarEvent[] = [original];
        if (applyToRest && inSeries) {
          const all = await listCalendarEvents();
          targets.push(...all.filter((event) => event.seriesId === original.seriesId && event.date > original.date && !event.hidden));
        }
        await saveCalendarEvents(targets.map((target) => ({ ...target, ...shared, date: target.id === original.id ? date : target.date })));
      } else {
        const seriesId = repeats ? crypto.randomUUID() : '';
        const dates = repeats ? weeklyDates(date, until, days) : [date];
        if (dates.length === 0) {
          setProblems(['None of the chosen days fall between those dates.']);
          return;
        }
        await saveCalendarEvents(dates.map((day) => ({
          ...shared,
          id: crypto.randomUUID(),
          date: day,
          completed: false,
          seriesId,
          plannerItemId: plannerItemId.current,
          source: 'manual' as const,
          sourceCalendar: '',
          hidden: false,
        })));
      }
      if (stillHere.current) navigate(`/calendar?view=plan&month=${date.slice(0, 7)}&day=${date}`, { replace: true });
    } catch (error) {
      setProblems([`It wasn't saved. ${(error as Error).message}`]);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="page planner-form">
      <h1>{isNew ? 'Add to calendar' : 'Edit calendar item'}</h1>
      {fromGoogle && <p className="notice">This comes from Google Calendar, so its name, date, time, and place change there. You can still change everything else here.</p>}
      <form onSubmit={(event) => { event.preventDefault(); void save(); }}>
        <label>Name<input value={title} disabled={fromGoogle} onChange={(event) => setTitle(event.target.value)} placeholder="ECO 231 class" /></label>
        <div className="form-row">
          <label>Type
            <select value={kind} onChange={(event) => setKind(event.target.value as CalendarKind)}>
              {CALENDAR_KINDS.map((option) => <option key={option}>{option}</option>)}
            </select>
          </label>
          <label>Course
            <select value={courseId} onChange={(event) => setCourseId(event.target.value)}>
              <option value="">No course</option>
              {courses?.map((course) => <option key={course.id} value={course.id}>{course.name}</option>)}
            </select>
          </label>
        </div>
        <div className="form-row">
          <label>{repeats ? 'First date' : 'Date'}<input type="date" disabled={fromGoogle} value={date} onChange={(event) => setDate(event.target.value)} /></label>
          {kind !== 'No classes' && !allDay && <label>Starts<input type="time" disabled={fromGoogle} value={startTime} onChange={(event) => setStartTime(event.target.value)} /></label>}
          {kind !== 'No classes' && !allDay && <label>Ends<input type="time" disabled={fromGoogle} value={endTime} onChange={(event) => setEndTime(event.target.value)} /></label>}
        </div>
        {kind !== 'No classes' && <label className="check-row"><input type="checkbox" disabled={fromGoogle} checked={allDay} onChange={(event) => setAllDay(event.target.checked)} /> All day</label>}
        <label>Place (optional)<input value={location} disabled={fromGoogle} onChange={(event) => setLocation(event.target.value)} placeholder="Bliss Hall 123" /></label>
        <label>What to do (optional)<textarea value={whatToDo} onChange={(event) => setWhatToDo(event.target.value)} /></label>
        <label>Priority
          <select value={priority} onChange={(event) => setPriority(event.target.value as PlanPriority)}>
            {PLAN_PRIORITIES.map((option) => <option key={option}>{option}</option>)}
          </select>
        </label>
        {isNew && (
          <fieldset className="repeat-box">
            <legend>Repeats</legend>
            <label className="check-row"><input type="checkbox" checked={repeats} onChange={(event) => setRepeats(event.target.checked)} /> Repeats every week</label>
            {repeats && (
              <>
                <div className="day-picks" role="group" aria-label="Days it repeats">
                  {WEEKDAYS.map((name, index) => (
                    <label key={name} className="day-pick"><input type="checkbox" checked={days.includes(index)} onChange={(event) => setDays(event.target.checked ? [...days, index] : days.filter((day) => day !== index))} /> {name}</label>
                  ))}
                </div>
                <label>Last date<input type="date" value={until} onChange={(event) => setUntil(event.target.value)} /></label>
              </>
            )}
          </fieldset>
        )}
        {inSeries && <label className="check-row"><input type="checkbox" checked={applyToRest} onChange={(event) => setApplyToRest(event.target.checked)} /> Also change the later meetings in this series</label>}
        {problems.length > 0 && (
          <div className="error-box" role="alert" data-testid="event-problems">
            <strong>This isn't saved yet.</strong>
            <ul>{problems.map((problem) => <li key={problem}>{problem}</li>)}</ul>
          </div>
        )}
        <div className="session-actions">
          <button className="button primary" type="submit" disabled={saving}>Save</button>
          <Link to="/calendar">Cancel</Link>
          {!isNew && <button type="button" className="text-button danger-text" onClick={() => setConfirmDelete(true)}>Delete</button>}
        </div>
      </form>
      {confirmDelete && original && (
        <ConfirmDialog
          title={`Delete ${title}?`}
          confirmLabel={applyToRest && inSeries ? 'Delete this and later meetings' : 'Delete'}
          onCancel={() => setConfirmDelete(false)}
          onConfirm={async () => {
            setConfirmDelete(false);
            try {
              const ids = [original.id];
              if (applyToRest && inSeries) {
                const all = await listCalendarEvents();
                ids.push(...all.filter((event) => event.seriesId === original.seriesId && event.date > original.date).map((event) => event.id));
              }
              await removeCalendarEvents(ids);
              if (stillHere.current) navigate('/calendar', { replace: true });
            } catch (error) {
              setProblems([`It wasn't deleted. ${(error as Error).message}`]);
            }
          }}
        >
          <p>{applyToRest && inSeries ? 'This removes this meeting and every later one in the series.' : 'This removes only this one.'} {fromGoogle ? 'Google Calendar itself stays the same.' : "It can't be undone."}</p>
        </ConfirmDialog>
      )}
    </div>
  );
}

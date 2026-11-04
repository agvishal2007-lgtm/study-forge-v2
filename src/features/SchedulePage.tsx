import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { courseForCode, saveClasses, type NewClass } from '../data/calendar';
import { addDays, matchCourse, weeklyDates } from '../data/calendarRules';
import { isValidDate, localNow } from '../data/plannerRules';
import { readSchedule } from '../data/scheduleRules';
import { listCourses } from '../data/store';
import { useLive } from '../data/useLive';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const NEW_COURSE = 'new';

interface Row {
  key: string;
  code: string;
  title: string;
  days: number[];
  startTime: string;
  endTime: string;
  location: string;
  /** A course id, 'new' to add one, or empty for none. */
  course: string;
}

const emptyRow = (): Row => ({ key: crypto.randomUUID(), code: '', title: '', days: [], startTime: '', endTime: '', location: '', course: '' });

export function SchedulePage() {
  const today = localNow().date;
  const navigate = useNavigate();
  const { data: courses } = useLive(listCourses);
  const [text, setText] = useState('');
  const [rows, setRows] = useState<Row[]>([]);
  const [unread, setUnread] = useState<string[]>([]);
  const [read, setRead] = useState(false);
  const [first, setFirst] = useState(today);
  const [last, setLast] = useState(addDays(today, 105));
  const [problems, setProblems] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [report, setReport] = useState('');

  const readIt = () => {
    const found = readSchedule(text);
    setRows(found.rows.map((row) => {
      const course = matchCourse(row.code, courses ?? []);
      return {
        key: crypto.randomUUID(),
        code: row.code,
        title: [row.code, row.name].filter(Boolean).join(' ') || row.name,
        days: row.days,
        startTime: row.startTime,
        endTime: row.endTime,
        location: row.location,
        course: course?.id ?? (row.code ? NEW_COURSE : ''),
      };
    }));
    setUnread(found.unread);
    setRead(true);
    const dated = found.rows.find((row) => row.startDate && row.endDate);
    if (dated) {
      setFirst(dated.startDate);
      setLast(dated.endDate);
    }
    setProblems([]);
    setReport('');
  };

  const change = (key: string, next: Partial<Row>) => setRows((current) => current.map((row) => (row.key === key ? { ...row, ...next } : row)));

  const save = async () => {
    const found: string[] = [];
    if (rows.length === 0) found.push('Add at least one class.');
    if (!isValidDate(first) || !isValidDate(last) || last < first) found.push('Choose a first day and a last day of classes, in that order.');
    rows.forEach((row, index) => {
      const name = row.title.trim() || `Class ${index + 1}`;
      if (!row.title.trim()) found.push(`${name} needs a name.`);
      if (row.days.length === 0) found.push(`${name} needs its days.`);
      if (!row.startTime || !row.endTime || row.endTime <= row.startTime) found.push(`${name} needs a start time and a later end time.`);
    });
    setProblems(found);
    if (found.length > 0 || saving) return;
    setSaving(true);
    try {
      const classes: NewClass[] = [];
      for (const row of rows) {
        let courseId = row.course === NEW_COURSE ? null : row.course || null;
        if (row.course === NEW_COURSE) courseId = (await courseForCode(row.code, row.title.trim())).id;
        classes.push({ title: row.title.trim(), courseId, days: row.days, startTime: row.startTime, endTime: row.endTime, location: row.location.trim(), dates: weeklyDates(first, last, row.days) });
      }
      const result = await saveClasses(classes);
      const meetings = result.added + result.updated;
      setReport(`Saved ${classes.length} ${classes.length === 1 ? 'class' : 'classes'} with ${meetings} ${meetings === 1 ? 'meeting' : 'meetings'}.${result.alreadyThere > 0 ? ` ${result.alreadyThere} were already there from Google Calendar.` : ''}`);
      setRows([]);
      setText('');
      setRead(false);
      setUnread([]);
    } catch (error) {
      setProblems([`Your schedule wasn't saved. ${(error as Error).message}`]);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="page schedule-page">
      <h1>Add class schedule</h1>
      <p className="muted">Copy your schedule from your school's site and paste it here. You'll check everything before it saves.</p>
      {report && (
        <div className="notice" role="status" data-testid="schedule-saved">
          <p>{report} Add breaks and holidays as No classes items, so you can see those days clearly.</p>
          <p className="session-actions"><button className="button primary" onClick={() => navigate('/calendar?view=plan')}>See Plan Calendar</button></p>
        </div>
      )}
      <label className="schedule-paste">Paste your schedule
        <textarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          rows={8}
          placeholder={'ECO 231 - Microeconomics\nMoWeFr 10:00AM - 10:50AM   Bliss Hall 123\n\nBUS 200 TR 2:00-3:20pm Business 101'}
        />
      </label>
      <div className="session-actions">
        <button className="button primary" onClick={readIt} disabled={!text.trim()}>Read my schedule</button>
        <button className="button" onClick={() => { setRows((current) => [...current, emptyRow()]); setRead(true); setReport(''); }}>Add a class by hand</button>
        <Link to="/calendar">Back to Calendar</Link>
      </div>
      {read && rows.length === 0 && unread.length === 0 && <p className="notice" data-testid="schedule-none">No classes were found. Each class needs its days and times, such as MWF 10:00-10:50 AM. You can also add a class by hand.</p>}
      {unread.length > 0 && (
        <div className="notice" data-testid="schedule-unread">
          <p>These lines couldn't be read, so they weren't added. Add them by hand if they're classes:</p>
          <ul>{unread.map((line) => <li key={line}>{line}</li>)}</ul>
        </div>
      )}
      {rows.length > 0 && (
        <section aria-label="Check your classes" data-testid="schedule-rows">
          <h2>Check your classes</h2>
          <div className="form-row schedule-dates">
            <label>First day of classes<input type="date" value={first} onChange={(event) => setFirst(event.target.value)} /></label>
            <label>Last day of classes<input type="date" value={last} onChange={(event) => setLast(event.target.value)} /></label>
          </div>
          {rows.map((row, index) => (
            <fieldset className="schedule-row" key={row.key} data-testid="schedule-row">
              <legend>Class {index + 1}</legend>
              <label>Name<input value={row.title} onChange={(event) => change(row.key, { title: event.target.value })} /></label>
              <div className="day-picks" role="group" aria-label={`Days for class ${index + 1}`}>
                {WEEKDAYS.map((name, day) => (
                  <label key={name} className="day-pick"><input type="checkbox" checked={row.days.includes(day)} onChange={(event) => change(row.key, { days: event.target.checked ? [...row.days, day].sort() : row.days.filter((entry) => entry !== day) })} /> {name}</label>
                ))}
              </div>
              <div className="form-row">
                <label>Starts<input type="time" value={row.startTime} onChange={(event) => change(row.key, { startTime: event.target.value })} /></label>
                <label>Ends<input type="time" value={row.endTime} onChange={(event) => change(row.key, { endTime: event.target.value })} /></label>
                <label>Place<input value={row.location} onChange={(event) => change(row.key, { location: event.target.value })} /></label>
                <label>Course
                  <select value={row.course} onChange={(event) => change(row.key, { course: event.target.value })}>
                    <option value="">No course</option>
                    {row.code && !matchCourse(row.code, courses ?? []) && <option value={NEW_COURSE}>Add new course: {row.code}</option>}
                    {courses?.map((course) => <option key={course.id} value={course.id}>{course.name}</option>)}
                  </select>
                </label>
              </div>
              <button className="text-button danger-text" onClick={() => setRows((current) => current.filter((entry) => entry.key !== row.key))}>Remove this class</button>
            </fieldset>
          ))}
          {problems.length > 0 && (
            <div className="error-box" role="alert" data-testid="schedule-problems">
              <strong>This isn't saved yet.</strong>
              <ul>{problems.map((problem) => <li key={problem}>{problem}</li>)}</ul>
            </div>
          )}
          <div className="session-actions">
            <button className="button primary" onClick={() => { void save(); }} disabled={saving}>Save {rows.length} {rows.length === 1 ? 'class' : 'classes'}</button>
          </div>
        </section>
      )}
    </div>
  );
}

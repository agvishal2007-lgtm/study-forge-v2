import { formatDay } from '../data/dateFormat';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { moveStudyBlock } from '../data/calendar';
import { addDays, describeTime } from '../data/calendarRules';
import { STATUS_LABEL, STATUS_MARK, workStatus } from '../data/statusRules';
import type { CalendarEvent, Course, PlannerItem } from '../data/types';
import { barLabel, barPercent, type StartChoice, type WeekLook, type WorkloadDay } from '../data/workloadRules';
import { formatDuration } from '../data/studyTime';

const dayName = (date: string, today: string) => {
  if (date === today) return 'Today';
  if (date === addDays(today, 1)) return 'Tomorrow';
  return formatDay(date, { weekday: 'short', month: 'short', day: 'numeric' });
};

const hours = (value: number) => `${Number.isInteger(value) ? value : value.toFixed(1)} ${value === 1 ? 'hour' : 'hours'}`;

/** One big button that starts the most useful thing, with the reason beside it. */
export function StartStudying({ choice }: { choice: StartChoice }) {
  return (
    <section className="dash-card start-studying" aria-labelledby="start-heading" data-testid="start-studying">
      <h2 id="start-heading" className="sr-only">Start studying</h2>
      <Link className="button primary start-button" to={choice.to}>Start studying: {choice.label}</Link>
      <p className="muted" data-testid="start-reason">{choice.reason}</p>
    </section>
  );
}

function StatusTag({ item, today }: { item: PlannerItem; today: string }) {
  const status = workStatus(item, today);
  return (
    <span className="status-tag" data-status={status}>
      <span aria-hidden="true">{STATUS_MARK[status]}</span>{STATUS_LABEL[status]}
    </span>
  );
}

/** The next seven days, deadlines in the student's own order, with events alongside. */
export function WeekWorkload({ days, today, courses }: { days: WorkloadDay[]; today: string; courses: Course[] }) {
  const courseName = (id: string | null) => courses.find((course) => course.id === id)?.name;
  const totalDeadlines = days.reduce((sum, day) => sum + day.deadlines.length, 0);
  const totalHours = days.reduce((sum, day) => sum + day.estimatedHours, 0);
  const totalUnestimated = days.reduce((sum, day) => sum + day.unestimated, 0);
  const totalStudy = days.reduce((sum, day) => sum + day.plannedStudyMinutes, 0);
  return (
    <section className="dash-card dash-wide" aria-labelledby="week-heading" data-testid="week-workload">
      <div className="section-head">
        <h2 id="week-heading">Next 7 days</h2>
        <Link to="/calendar">See calendar</Link>
      </div>
      <p className="dash-note" data-testid="week-totals">
        {totalDeadlines} {totalDeadlines === 1 ? 'deadline' : 'deadlines'}
        {totalHours > 0 && `, about ${hours(totalHours)} of work you estimated`}
        {totalUnestimated > 0 && ` (${totalUnestimated} without an estimate)`}
        {totalStudy > 0 && `, ${formatDuration(totalStudy * 60)} of study blocks planned`}.
        {' '}Each deadline is counted once, on its due date, even if you've reserved study time for it.
      </p>
      <ol className="week-days">
        {days.map((day) => (
          <li key={day.date} className="week-day" data-testid="week-day" data-date={day.date}>
            <h3>{dayName(day.date, today)}</h3>
            {day.deadlines.length === 0 && day.events.length === 0 && <p className="muted small">Nothing planned.</p>}
            <ul className="plain-list week-items">
              {day.deadlines.map((item) => (
                <li key={item.id} data-testid="week-deadline">
                  <StatusTag item={item} today={today} />{' '}
                  <Link to={`/planner/${item.id}`}>{item.title}</Link>
                  <span className="muted small">
                    {' '}{[item.type, courseName(item.courseId), item.estimateHours ? `about ${hours(item.estimateHours)}` : null].filter(Boolean).join(' · ')}
                  </span>
                  {(day.reserved.get(item.id) ?? []).map((block) => (
                    <span key={block.id} className="muted small week-reserved"> Study time reserved {describeTime(block)}</span>
                  ))}
                </li>
              ))}
              {day.events.map((event) => (
                <li key={event.id} className="week-event" data-kind={event.kind}>
                  <span className="event-kind">{event.kind}</span>{' '}
                  <Link to={`/calendar/event/${event.id}`}>{event.title}</Link>
                  <span className="muted small"> {describeTime(event)}{event.completed ? ' · done' : ''}</span>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ol>
    </section>
  );
}

/** The student's own missed study blocks, which can be moved. Deadlines and classes are never moved. */
export function MissedStudy({ blocks, today }: { blocks: CalendarEvent[]; today: string }) {
  const [failure, setFailure] = useState('');
  if (blocks.length === 0) return null;
  const move = (id: string, date: string) => {
    setFailure('');
    moveStudyBlock(id, date).catch((error: Error) => setFailure(`That wasn't moved. ${error.message}`));
  };
  return (
    <section className="dash-card dash-wide" aria-labelledby="missed-heading" data-testid="missed-study">
      <h2 id="missed-heading">Missed study time</h2>
      <p className="dash-note">Study blocks you planned that went by without being marked done. You can move them. Deadlines from your classes never move.</p>
      {failure && <p className="error" role="alert">{failure}</p>}
      <ul className="dash-rows">
        {blocks.slice(0, 6).map((block) => (
          <li key={block.id} className="dash-simple-row">
            <span className="dash-when">{dayName(block.date, today)}</span>
            <Link className="dash-what" to={`/calendar/event/${block.id}`}>{block.title}</Link>
            <span className="row-actions">
              <button className="button" onClick={() => move(block.id, today)} aria-label={`Move ${block.title} to today`}>Today</button>
              <button className="button" onClick={() => move(block.id, addDays(today, 1))} aria-label={`Move ${block.title} to tomorrow`}>Tomorrow</button>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Bar({ done, total, unit, label, testId }: { done: number; total: number; unit: string; label: string; testId: string }) {
  const percent = barPercent(done, total);
  return (
    <div className="progress-line" data-testid={testId}>
      <div className="progress-words"><span>{label}</span><b>{total > 0 ? barLabel(done, total, unit) : `No ${unit} yet`}</b></div>
      <div className="meter" role="progressbar" aria-valuenow={done} aria-valuemin={0} aria-valuemax={total} aria-label={`${label}: ${barLabel(done, total, unit)}`}>
        <span style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

/** The last seven days from saved records, with every bar saying what it counts. */
export function WeekLookBack({ look, cardsToday }: { look: WeekLook; cardsToday: { reviewed: number; due: number } }) {
  return (
    <section className="dash-card dash-wide" aria-labelledby="look-heading" data-testid="week-look">
      <div className="section-head">
        <h2 id="look-heading">Your last 7 days</h2>
        <Link to="/progress">See progress</Link>
      </div>
      <Bar label="Deadlines from the last 7 days" done={look.dueDone} total={look.dueTotal} unit="done" testId="bar-deadlines" />
      <Bar label="Flashcards today" done={cardsToday.reviewed} total={cardsToday.reviewed + cardsToday.due} unit="cards reviewed" testId="bar-cards" />
      <Bar label="Days with study" done={look.daysStudied} total={7} unit="days" testId="bar-days" />
      <ul className="plain-list week-facts" data-testid="week-facts">
        <li>{look.cardsReviewed} flashcard {look.cardsReviewed === 1 ? 'review' : 'reviews'}</li>
        <li>{look.practiceAnswers} practice {look.practiceAnswers === 1 ? 'answer' : 'answers'}{look.practiceAnswers > 0 ? `, ${look.practiceCorrect} correct` : ''}</li>
        <li>{look.studySeconds > 0 ? `${formatDuration(look.studySeconds)} of study time recorded` : 'No study time recorded'}</li>
      </ul>
      <p className="muted small">Counted only from what you did and saved. Answers and reviews are not the same as mastery.</p>
    </section>
  );
}

import { useState } from 'react';
import { RecentActivity } from '../components/RecentActivity';
import { useWalkthrough } from './walkthrough/Walkthrough';
import { Link } from 'react-router-dom';
import { MaterialList } from '../components/MaterialList';
import { NewCourseForm } from '../components/NewCourseForm';
import { NoteList } from '../components/NoteList';
import { Shelf } from '../components/Shelf';
import { getLastBackupAt } from '../data/backup';
import { daySummary, nextStep } from '../data/dashboard';
import { listCardProgress, listCards, listDecks } from '../data/flashcards';
import { isDue, isWeak } from '../data/flashcardRules';
import { listCheckpoints, listLessons, listProgress } from '../data/guided';
import { recommendNext } from '../data/mastery';
import { listNotes } from '../data/notes';
import { listAllTopics, listPracticeAttempts, listPracticeQuestions, listPracticeSets } from '../data/practice';
import { accuracyOf, latestAnswers, mistakesIn, weakTopics } from '../data/practiceRules';
import { topicLabeler } from './PracticePage';
import { listCalendarEvents, setEventCompleted } from '../data/calendar';
import { describeTime, noClassesOn, todaysPlan } from '../data/calendarRules';
import { dayOf, streaksFrom } from '../data/progressRules';
import { listStudyDays } from '../data/studyLog';
import { PRIORITY_MODE_LABEL, rankWork } from '../data/priorityRules';
import { savedMode, savedPinned, savedWeights } from '../data/priorityChoice';
import { listAllGradeCategories } from '../data/grades';
import { formatDuration, listStudyTime, secondsByDate } from '../data/studyTime';
import { listExamResults } from '../data/exams';
import { listPlannerItems, setPlannerStatus } from '../data/planner';
import { comparePlanner, describeDue, groupOf, localNow } from '../data/plannerRules';
import { listUnfinished } from '../data/recordings';
import { getStorageStatus, listCourses, listMaterials, requestKeepFiles } from '../data/store';
import type { Course, PlannerItem } from '../data/types';
import { useLive } from '../data/useLive';

const BACKUP_REMINDER_MS = 14 * 24 * 60 * 60 * 1000;
const SHOWN_ROWS = 8;

const shortWhen = (text: string) => {
  const words = text.replace(/^Due /, '');
  return words.charAt(0).toUpperCase() + words.slice(1);
};

function DeadlineRows({ items, courses }: { items: PlannerItem[]; courses: Course[] }) {
  const [failure, setFailure] = useState('');
  const now = localNow();
  return (
    <>
      {failure && <p className="error" role="alert">{failure}</p>}
      <ul className="dash-rows">
        {items.map((item) => (
          <li key={item.id} className="dash-row" data-testid="dash-row">
            <span className="dash-when">{shortWhen(describeDue(item, now))}</span>
            <Link className="dash-what" to={`/planner/${item.id}`}>{item.title}</Link>
            <span className="dash-next">{nextStep(item)}</span>
            <span className={item.priority === 'High' ? 'dash-priority high' : 'dash-priority'}>{item.priority === 'Normal' ? '' : item.priority}</span>
            <span className="dash-from">{courses.find((course) => course.id === item.courseId)?.name ?? item.type}</span>
            <button
              className="button dash-done"
              aria-label={`Mark ${item.title} done`}
              onClick={() => {
                setFailure('');
                setPlannerStatus(item.id, 'Completed').catch((error: Error) => setFailure(`That wasn't saved. ${error.message}`));
              }}
            >Done</button>
          </li>
        ))}
      </ul>
    </>
  );
}

export function TodayPage() {
  const { start } = useWalkthrough();
  const [askedToKeep, setAskedToKeep] = useState(false);
  const { data, error } = useLive(async () => {
    const [courses, materials, storage, unfinished, notes, lastBackup] = await Promise.all([listCourses(), listMaterials(), getStorageStatus(), listUnfinished(), listNotes(), getLastBackupAt()]);
    const [lessons, checkpoints, progress, plannerItems, gradeCategories] = await Promise.all([listLessons(), listCheckpoints(), listProgress(), listPlannerItems(), listAllGradeCategories()]);
    const [decks, cards, cardProgress] = await Promise.all([listDecks(), listCards(), listCardProgress()]);
    const [practiceSets, practiceQuestions, practiceAttempts, topics] = await Promise.all([listPracticeSets(), listPracticeQuestions(), listPracticeAttempts(), listAllTopics()]);
    const [calendarEvents, studyDays, examResults, studyTime] = await Promise.all([listCalendarEvents(), listStudyDays(), listExamResults(), listStudyTime()]);
    return { gradeCategories, calendarEvents, studyDays, examResults, studyTime, practiceSets, practiceQuestions, practiceAttempts, topics, courses, materials, storage, unfinished, notes, lastBackup, plannerItems, decks, cards, cardProgress, progress, next: recommendNext(lessons, checkpoints, progress) };
  }, [askedToKeep]);

  if (error) return <div className="page"><h1>Today</h1><p className="error" role="alert">Your courses couldn't be loaded. {error.message}</p></div>;
  if (!data) return <p className="page muted">Loading…</p>;
  const { gradeCategories, courses, materials, storage, unfinished, notes, lastBackup, next, plannerItems, decks, cards, cardProgress, progress, practiceSets, practiceQuestions, practiceAttempts, topics, calendarEvents, studyDays, examResults, studyTime } = data;
  const backupDue = (materials.length > 0 || notes.length > 0) && (lastBackup === null || Date.now() - lastBackup > BACKUP_REMINDER_MS);

  if (courses.length === 0 && materials.length === 0 && unfinished.length === 0 && notes.length === 0 && plannerItems.length === 0 && cards.length === 0 && decks.length === 0 && practiceSets.length === 0 && calendarEvents.length === 0) {
    return (
      <div className="page welcome">
        <h1>Start with one course</h1>
        <p>Add a course, then keep its slides, readings, and recordings together. Everything stays in this browser on this device.</p>
        <NewCourseForm />
        <p><button className="text-button" onClick={start}>New here? Take the walkthrough</button></p>
      </div>
    );
  }

  const now = localNow();
  const sorted = [...plannerItems].sort(comparePlanner);
  const overdue = sorted.filter((item) => groupOf(item, now) === 'overdue');
  const dueThisWeek = sorted.filter((item) => ['today', 'tomorrow', 'week'].includes(groupOf(item, now)));
  // Today's Plan uses the very same ranking engine, and the student's saved choice, as the Planner.
  // Two formulas would eventually disagree with each other in front of them.
  const order = savedMode();
  const dueSoon = order === 'due'
    ? dueThisWeek
    : rankWork(dueThisWeek, { mode: order, today: now.date, weights: savedWeights(), pinned: savedPinned(), categories: gradeCategories }).ranked.map((entry) => entry.item);
  const dueCards = cards.filter((card) => isDue(cardProgress.get(card.id), now.date));
  const weakCards = cards.filter((card) => isWeak(cardProgress.get(card.id)));
  const decksDue = decks
    .map((deck) => ({ deck, due: dueCards.filter((card) => card.deckId === deck.id).length }))
    .filter((entry) => entry.due > 0)
    .sort((a, b) => b.due - a.due);
  const toReview = [...progress.values()].filter((entry) => entry.status === 'needs-review').length;
  const practiceAccuracy = accuracyOf([...latestAnswers(practiceAttempts).values()]);
  const practiceMistakes = mistakesIn(practiceQuestions, practiceAttempts);
  const weak = weakTopics(practiceQuestions, practiceAttempts, topicLabeler(practiceSets, topics));
  const plan = todaysPlan(calendarEvents, now.date);
  const noClasses = noClassesOn(calendarEvents, now.date);
  const studied = new Set<string>([
    ...studyDays.map((entry) => entry.date),
    ...practiceAttempts.map((attempt) => dayOf(attempt.at)),
    ...examResults.map((result) => dayOf(result.finishedAt)),
    ...[...cardProgress.values()].map((entry) => dayOf(entry.lastReviewedAt)),
    ...[...progress.values()].map((entry) => dayOf(entry.lastStudiedAt)),
  ]);
  const streak = streaksFrom(studied, now.date);
  const secondsToday = secondsByDate(studyTime).get(now.date) ?? 0;
  const [year, month, day] = now.date.split('-').map(Number);
  const dateWords = new Date(year, month - 1, day).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });

  const tiles = [
    { label: 'Due in 7 days', value: dueSoon.length, to: '/planner', id: 'due' },
    { label: 'Overdue', value: overdue.length, to: '/planner', id: 'overdue' },
    { label: 'Flashcards due', value: dueCards.length, to: dueCards.length > 0 ? '/cards/review' : '/cards', id: 'cards' },
    { label: 'Weak cards', value: weakCards.length, to: '/cards', id: 'weak' },
    { label: 'Practice accuracy', value: practiceAccuracy === null ? '—' : `${practiceAccuracy}%`, to: '/practice', id: 'practice' },
    { label: 'Lessons to review', value: toReview, to: '/study', id: 'lessons' },
    { label: 'Study streak', value: streak.current, to: '/progress', id: 'streak' },
    { label: 'Studied today', value: formatDuration(secondsToday), to: '/progress', id: 'time-today' },
  ];

  return (
    <div className="page dashboard">
      <header>
        <h1>Today: {dateWords}</h1>
        <p className="dash-lead" data-testid="day-summary">
          {daySummary({
            overdue: overdue.length,
            dueSoon: dueSoon.length,
            cardsDue: dueCards.length,
            firstOverdue: overdue[0]?.title,
            firstDue: dueSoon[0]?.title,
            nextLesson: next?.checkpoint.title,
          })}
        </p>
      </header>
      {unfinished.length > 0 && (
        <p className="notice">
          A recording was interrupted, and what was captured is safe. <Link to="/record">Save or discard it</Link>
        </p>
      )}
      {backupDue && (
        <p className="notice" data-testid="backup-reminder">
          {lastBackup === null ? "You haven't backed up yet." : "It's been a while since your last backup."} Your files are only on this device. <Link to="/settings">Create a backup</Link>
        </p>
      )}
      {materials.length > 0 && storage.persisted === false && (
        <p className="notice">
          Your browser may clear saved files if this device runs low on space.{' '}
          <button className="text-button" onClick={async () => { await requestKeepFiles(); setAskedToKeep(true); }}>Ask to keep them</button>
          {askedToKeep && <span> The browser didn't agree yet. It may need you to use the site more or install it.</span>}
        </p>
      )}

      <div className="dash-tiles">
        {tiles.map((tile) => (
          <Link key={tile.id} className="dash-tile" to={tile.to} data-testid={`tile-${tile.id}`}>
            <b>{tile.value}</b>
            <span>{tile.label}</span>
          </Link>
        ))}
      </div>

      <div className="dash-actions">
        <Link className="button" to="/library">Add a file</Link>
        <Link className="button" to="/planner/new">Add a deadline</Link>
        <Link className="button" to="/notes">Write a note</Link>
        <Link className="button" to="/record">Record a lecture</Link>
      </div>

      <div className="dash-grid">
        <section className="dash-card" aria-labelledby="plan-heading" data-testid="today-plan">
          <div className="section-head">
            <h2 id="plan-heading">Today's plan</h2>
            <Link to="/calendar">See calendar</Link>
          </div>
          <p className="dash-note">Classes and plans still left today.</p>
          {noClasses.map((event) => <p key={event.id} className="notice">No classes today: {event.title}</p>)}
          {plan.length > 0
            ? (
              <ul className="dash-rows">
                {plan.slice(0, SHOWN_ROWS).map((event) => (
                  <li key={event.id} className="dash-simple-row">
                    <span className="dash-when">{describeTime(event)}</span>
                    <Link className="dash-what" to={`/calendar/event/${event.id}`}>{event.title}</Link>
                    <button className="button dash-done" aria-label={`Mark ${event.title} completed`} onClick={() => { void setEventCompleted(event.id, true); }}>Done</button>
                  </li>
                ))}
              </ul>
            )
            : <p className="muted">{calendarEvents.length > 0 ? 'Nothing left on your plan today.' : <>Nothing here yet. <Link to="/calendar/schedule">Add your class schedule</Link>.</>}</p>}
        </section>

        <section className="dash-card" aria-labelledby="due-heading" data-testid="due-soon">
          <div className="section-head">
            <h2 id="due-heading">Due for class and school</h2>
            <Link to="/planner">See all</Link>
          </div>
          <p className="dash-note">Everything due in the next 7 days, soonest first.</p>
          {dueSoon.length > 0
            ? <DeadlineRows items={dueSoon.slice(0, SHOWN_ROWS)} courses={courses} />
            : <p className="muted">Nothing due in the next 7 days.</p>}
          {dueSoon.length > SHOWN_ROWS && <p className="muted">And {dueSoon.length - SHOWN_ROWS} more in your <Link to="/planner">Planner</Link>.</p>}
          {dueSoon.length > 1 && (
            <p className="muted small" data-testid="today-order">
              In your order: {PRIORITY_MODE_LABEL[order]}. <Link to="/planner">Change it in the Planner</Link>.
            </p>
          )}
        </section>

        <section className="dash-card" aria-labelledby="cards-heading" data-testid="today-cards">
          <div className="section-head">
            <h2 id="cards-heading">Flashcards</h2>
            <Link to="/cards">See all</Link>
          </div>
          <p className="dash-note">Cards that are new or due today.</p>
          {dueCards.length > 0 && (
            <>
              <ul className="dash-rows">
                {decksDue.slice(0, 5).map(({ deck, due }) => (
                  <li key={deck.id} className="dash-simple-row">
                    <Link className="dash-what" to={`/cards/${deck.id}`}>{deck.name}</Link>
                    <span className="dash-next">{due} due</span>
                  </li>
                ))}
              </ul>
              <p className="session-actions"><Link className="button primary" to="/cards/review">Review {dueCards.length} {dueCards.length === 1 ? 'flashcard' : 'flashcards'}</Link></p>
            </>
          )}
          {dueCards.length === 0 && <p className="muted">{cards.length > 0 ? 'Nothing due today.' : <>No cards yet. <Link to="/cards">Make your first deck</Link>.</>}</p>}
        </section>

        <section className="dash-card" aria-labelledby="practice-heading" data-testid="today-practice">
          <div className="section-head">
            <h2 id="practice-heading">Practice</h2>
            <Link to="/practice">See all</Link>
          </div>
          <p className="dash-note">Your weakest topics, from your latest answers.</p>
          {weak.length > 0 && (
            <ul className="dash-rows">
              {weak.slice(0, 4).map((topic) => (
                <li key={topic.label} className="dash-simple-row">
                  <Link className="dash-what" to={`/practice/session?mode=topic&topic=${encodeURIComponent(topic.label)}`}>{topic.label}</Link>
                  <span className="dash-next">{topic.percent}%</span>
                </li>
              ))}
            </ul>
          )}
          {practiceMistakes.length > 0 && <p className="session-actions"><Link className="button primary" to="/practice/session?mode=mistakes">Review {practiceMistakes.length} {practiceMistakes.length === 1 ? 'mistake' : 'mistakes'}</Link></p>}
          {practiceMistakes.length === 0 && <p className="muted">{practiceQuestions.length > 0 ? 'No mistakes to review.' : <>No questions yet. <Link to="/practice">Make your first set</Link>.</>}</p>}
        </section>

        <section className="dash-card next-up" aria-labelledby="next-heading" data-testid="next-up">
          <div className="section-head">
            <h2 id="next-heading">Study next</h2>
            <Link to="/study">See all</Link>
          </div>
          {next
            ? (
              <>
                <p className="dash-next-title"><Link to={`/study/checkpoints/${next.checkpoint.id}`}>{next.checkpoint.title}</Link></p>
                <p className="muted">{next.lesson.title}. {next.reason}</p>
              </>
            )
            : <p className="muted">No lessons waiting. <Link to="/study">Go to Study</Link> to add one.</p>}
        </section>

        <section className="dash-card" aria-labelledby="recent-heading">
          <h2 id="recent-heading">Recent files</h2>
          {materials.length > 0
            ? <MaterialList materials={materials.slice(0, 4)} courses={courses} />
            : <p className="muted">No files yet. Open a course and add your first one, or use the <Link to="/library">Library</Link>.</p>}
        </section>

        {notes.length > 0 && (
          <section className="dash-card" aria-labelledby="recent-notes">
            <h2 id="recent-notes">Recent notes</h2>
            <NoteList notes={notes.slice(0, 4)} courses={courses} />
          </section>
        )}

        <RecentActivity />

        {courses.length > 0 && (
          <section className="dash-card dash-wide" aria-labelledby="shelf-heading">
            <h2 id="shelf-heading">Your courses</h2>
            <Shelf courses={courses} materials={materials} />
          </section>
        )}

        <section className="dash-card dash-wide" aria-labelledby="overdue-heading" data-testid="overdue">
          <h2 id="overdue-heading">Still open from before</h2>
          <p className="dash-note">Past their due dates and not marked done. Some may already be finished, so mark those done.</p>
          {overdue.length > 0
            ? <DeadlineRows items={overdue} courses={courses} />
            : <p className="muted">Nothing overdue.</p>}
        </section>

        <section className="dash-card dash-wide" aria-labelledby="counts-heading" data-testid="what-this-counts">
          <h2 id="counts-heading">What this counts</h2>
          <p className="dash-note">Every number comes from what you've saved. Study Forge never makes up assignments or dates.</p>
          <dl className="dash-defs">
            <dt>Due and overdue</dt><dd>Planner items that aren't Submitted, Waiting for Grade, or Completed.</dd>
            <dt>Flashcards due</dt><dd>Cards you haven't reviewed yet, plus cards whose review date is today or earlier.</dd>
            <dt>Weak cards</dt><dd>Your last answer was Again, or you've pressed Again twice or more and haven't since pressed Good or Easy enough to recover.</dd>
            <dt>Practice accuracy</dt><dd>Your latest answer to each practice question. A partly right answer counts as half. Weak topics are under 70%.</dd>
            <dt>Lessons to review</dt><dd>Lesson checkpoints marked Needs review from your answers.</dd>
            <dt>Study streak</dt><dd>Days in a row with a flashcard review, a practice answer, a mock exam, or lesson work.</dd>
          </dl>
        </section>
      </div>
    </div>
  );
}

import { Link } from 'react-router-dom';
import { listExamResults } from '../data/exams';
import { examScore } from '../data/examRules';
import { listCardProgress, listCards, listDecks } from '../data/flashcards';
import { isDue, isWeak } from '../data/flashcardRules';
import { listCheckpoints, listLessons, listProgress } from '../data/guided';
import { listPlannerItems } from '../data/planner';
import { isDone, localNow } from '../data/plannerRules';
import { listPracticeAttempts, listPracticeQuestions, listPracticeSets } from '../data/practice';
import { accuracyOf, latestAnswers } from '../data/practiceRules';
import { activityWeeks, dayOf, lastDays, streaksFrom, totalsByDay } from '../data/progressRules';
import { listCourses } from '../data/store';
import { listStudyDays } from '../data/studyLog';
import { useLive } from '../data/useLive';

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`;
const DAY_LETTERS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function ProgressPage() {
  const { data, error } = useLive(async () => {
    const [courses, studyDays, attempts, questions, sets, exams] = await Promise.all([listCourses(), listStudyDays(), listPracticeAttempts(), listPracticeQuestions(), listPracticeSets(), listExamResults()]);
    const [cards, decks, cardProgress, lessons, checkpoints, progress, planner] = await Promise.all([listCards(), listDecks(), listCardProgress(), listLessons(), listCheckpoints(), listProgress(), listPlannerItems()]);
    return { courses, studyDays, attempts, questions, sets, exams, cards, decks, cardProgress, lessons, checkpoints, progress, planner };
  }, []);
  if (error) return <div className="page"><h1>Progress</h1><p className="error" role="alert">Your progress couldn't be loaded. {error.message}</p></div>;
  if (!data) return <p className="page muted">Loading…</p>;
  const { courses, studyDays, attempts, questions, sets, exams, cards, decks, cardProgress, lessons, checkpoints, progress, planner } = data;

  const today = localNow().date;
  const logged = totalsByDay(studyDays);
  const answersOn = new Map<string, number>();
  for (const attempt of attempts) answersOn.set(dayOf(attempt.at), (answersOn.get(dayOf(attempt.at)) ?? 0) + 1);
  const studied = new Set<string>([
    ...logged.keys(),
    ...answersOn.keys(),
    ...exams.map((exam) => dayOf(exam.finishedAt)),
    ...[...cardProgress.values()].map((entry) => dayOf(entry.lastReviewedAt)),
    ...[...progress.values()].map((entry) => dayOf(entry.lastStudiedAt)),
  ]);
  const streak = streaksFrom(studied, today);
  const week = lastDays(today, 7);
  const cardsThisWeek = week.reduce((sum, date) => sum + (logged.get(date)?.cards ?? 0), 0);
  const answersThisWeek = week.reduce((sum, date) => sum + (answersOn.get(date) ?? 0), 0);
  const daysThisMonth = lastDays(today, 30).filter((date) => studied.has(date)).length;

  const courseRows = courses.map((course) => {
    const courseLessons = new Set(lessons.filter((lesson) => lesson.courseId === course.id).map((lesson) => lesson.id));
    const courseCheckpoints = checkpoints.filter((checkpoint) => courseLessons.has(checkpoint.lessonId));
    const mastered = courseCheckpoints.filter((checkpoint) => progress.get(checkpoint.id)?.status === 'mastered').length;
    const courseDecks = new Set(decks.filter((deck) => deck.courseId === course.id).map((deck) => deck.id));
    const courseCards = cards.filter((card) => courseDecks.has(card.deckId));
    const courseSets = new Set(sets.filter((set) => set.courseId === course.id).map((set) => set.id));
    const courseQuestions = new Set(questions.filter((question) => courseSets.has(question.setId)).map((question) => question.id));
    const accuracy = accuracyOf([...latestAnswers(attempts.filter((attempt) => courseQuestions.has(attempt.questionId))).values()]);
    const work = planner.filter((item) => item.courseId === course.id);
    const latestExam = exams.filter((exam) => exam.courseId === course.id).sort((a, b) => b.finishedAt - a.finishedAt)[0];
    return {
      course,
      lessons: courseCheckpoints.length > 0 ? `${mastered} of ${courseCheckpoints.length} mastered` : '—',
      cards: courseCards.length > 0 ? `${courseCards.filter((card) => isDue(cardProgress.get(card.id), today)).length} due, ${courseCards.filter((card) => isWeak(cardProgress.get(card.id))).length} weak` : '—',
      practice: accuracy === null ? '—' : `${accuracy}%`,
      work: work.length > 0 ? `${work.filter(isDone).length} of ${work.length} done` : '—',
      exam: latestExam ? (examScore(latestExam.items) === null ? 'Needs checking' : `${examScore(latestExam.items)}%`) : '—',
    };
  });

  const tiles = [
    { id: 'current', label: 'Day streak', value: streak.current },
    { id: 'longest', label: 'Longest streak', value: streak.longest },
    { id: 'month', label: 'Days studied, last 30', value: daysThisMonth },
    { id: 'cards', label: 'Cards reviewed, last 7 days', value: cardsThisWeek },
    { id: 'answers', label: 'Questions answered, last 7 days', value: answersThisWeek },
    { id: 'done', label: 'Planner items done', value: planner.filter(isDone).length },
  ];

  return (
    <div className="page dashboard">
      <header>
        <h1>Progress</h1>
        <p className="dash-lead" data-testid="streak-summary">
          {streak.studiedToday
            ? `You've studied today, and your streak is ${plural(streak.current, 'day')}.`
            : streak.current > 0
              ? `Your streak is ${plural(streak.current, 'day')}. Study today to keep it going.`
              : studied.size > 0 ? 'Study today to start a new streak.' : 'Review a flashcard, answer a question, or work on a lesson to start your streak.'}
        </p>
      </header>
      <div className="dash-tiles" data-tour="progress-streak">
        {tiles.map((tile) => (
          <div key={tile.id} className="dash-tile" data-testid={`progress-${tile.id}`}>
            <b>{tile.value}</b>
            <span>{tile.label}</span>
          </div>
        ))}
      </div>
      <div className="dash-grid">
        <section className="dash-card dash-wide" aria-labelledby="activity-heading">
          <h2 id="activity-heading">The last 12 weeks</h2>
          <p className="dash-note">A filled square is a day you studied.</p>
          <div className="activity" data-testid="activity" role="img" aria-label={`${plural([...studied].length, 'day')} studied in total`}>
            <div className="activity-labels" aria-hidden="true">{DAY_LETTERS.map((name, index) => <span key={name}>{index % 2 === 1 ? name : ''}</span>)}</div>
            {activityWeeks(today, 12).map((days, index) => (
              <div className="activity-week" key={index}>
                {days.map((date, dayIndex) => (
                  <i key={dayIndex} title={date ?? undefined} data-date={date ?? undefined} data-on={date && studied.has(date) ? 'true' : undefined} data-today={date === today ? 'true' : undefined} data-empty={date ? undefined : 'true'} />
                ))}
              </div>
            ))}
          </div>
        </section>
        <section className="dash-card dash-wide" aria-labelledby="courses-heading" data-testid="course-progress">
          <h2 id="courses-heading">By course</h2>
          {courseRows.length > 0
            ? (
              <div className="table-scroll">
                <table className="plan-table">
                  <thead><tr><th scope="col">Course</th><th scope="col">Lessons</th><th scope="col">Flashcards</th><th scope="col">Practice accuracy</th><th scope="col">Planner</th><th scope="col">Latest mock exam</th></tr></thead>
                  <tbody>
                    {courseRows.map((row) => (
                      <tr key={row.course.id}>
                        <th scope="row"><Link to={`/courses/${row.course.id}`}>{row.course.name}</Link></th>
                        <td>{row.lessons}</td><td>{row.cards}</td><td>{row.practice}</td><td>{row.work}</td><td>{row.exam}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
            : <p className="muted">No courses yet. <Link to="/courses">Add your first course</Link>.</p>}
        </section>
        <section className="dash-card dash-wide" aria-labelledby="progress-counts">
          <h2 id="progress-counts">What this counts</h2>
          <p className="dash-note">Every number comes from what you've saved. Nothing here predicts a grade.</p>
          <dl className="dash-defs">
            <dt>A day you studied</dt><dd>A day with a flashcard review, a practice answer, a finished mock exam, or work in a lesson. Adding notes or files doesn't count, and study time isn't tracked.</dd>
            <dt>Streak</dt><dd>Days in a row you studied. Not having studied yet today doesn't end it.</dd>
            <dt>Older days</dt><dd>Practice and mock exams count from their saved dates. For days before this page was added, flashcards and lessons only show the latest day you worked on each one, so older streaks may look shorter than they were.</dd>
            <dt>Practice accuracy</dt><dd>Your latest answer to each question. A partly right answer counts as half.</dd>
          </dl>
        </section>
      </div>
    </div>
  );
}

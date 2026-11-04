import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { listCardProgress, listCards, listDecks } from '../data/flashcards';
import { isDue } from '../data/flashcardRules';
import { CRAM_MODES, examScore, improvement, pendingChecks, revisionChecklist, type CramMode } from '../data/examRules';
import { listExamResults, loadExamInProgress } from '../data/exams';
import { listPlannerItems } from '../data/planner';
import { comparePlanner, describeDue, groupOf, isDone, localNow } from '../data/plannerRules';
import { listAllTopics, listPracticeAttempts, listPracticeQuestions, listPracticeSets } from '../data/practice';
import { accuracyOf, latestAnswers, mistakesIn, weakTopics } from '../data/practiceRules';
import { listCourses } from '../data/store';
import { useLive } from '../data/useLive';
import { topicLabeler } from './PracticePage';

const plural = (value: number, word: string) => `${value} ${word}${value === 1 ? '' : 's'}`;

export function ExamHallPage() {
  const navigate = useNavigate();
  const [courseId, setCourseId] = useState('');
  const [count, setCount] = useState('20');
  const [minutes, setMinutes] = useState('30');
  const { data, error } = useLive(async () => {
    const [courses, sets, questions, attempts, topics, results, inProgress, planner, decks, cards, progress] = await Promise.all([
      listCourses(), listPracticeSets(), listPracticeQuestions(), listPracticeAttempts(), listAllTopics(), listExamResults(), loadExamInProgress(), listPlannerItems(), listDecks(), listCards(), listCardProgress(),
    ]);
    return { courses, sets, questions, attempts, topics, results, inProgress, planner, decks, cards, progress };
  });
  if (error) return <div className="page"><h1>Exam Hall</h1><p className="error" role="alert">Exam Hall couldn't be loaded. {error.message}</p></div>;
  if (!data) return <p className="page muted">Loading…</p>;
  const { courses, sets, questions, attempts, topics, results, inProgress, planner, decks, cards, progress } = data;
  const now = localNow();

  const setIds = new Set(sets.filter((set) => !courseId || set.courseId === courseId).map((set) => set.id));
  const inScope = questions.filter((question) => setIds.has(question.setId));
  const scopedAttempts = attempts.filter((attempt) => setIds.has(attempt.setId));
  const latest = latestAnswers(scopedAttempts);
  const answered = inScope.filter((question) => latest.has(question.id));
  const mistakes = mistakesIn(inScope, scopedAttempts);
  const weak = weakTopics(inScope, scopedAttempts, topicLabeler(sets, topics));
  const accuracy = accuracyOf(answered.map((question) => latest.get(question.id)!));
  const deckIds = new Set(decks.filter((deck) => !courseId || deck.courseId === courseId).map((deck) => deck.id));
  const cardsDue = cards.filter((card) => deckIds.has(card.deckId) && isDue(progress.get(card.id), now.date)).length;
  const scopedResults = results.filter((result) => !courseId || result.courseId === courseId);
  const change = improvement(scopedResults);
  const checklist = revisionChecklist({
    total: inScope.length, answered: answered.length, correct: 0, mistakes: mistakes.length, weakTopics: weak.length, cardsDue, mockExams: scopedResults.length,
  });
  const upcoming = planner
    .filter((item) => (item.type === 'Exam' || item.type === 'Quiz') && !isDone(item) && groupOf(item, now) !== 'overdue' && (!courseId || item.courseId === courseId))
    .sort(comparePlanner);
  const courseQuery = courseId ? `&course=${courseId}` : '';

  return (
    <div className="page dashboard">
      <header>
        <h1>Exam Hall</h1>
        <p className="muted">Everything for getting ready: mock exams, quick review, and what's left to do.</p>
      </header>
      {inProgress && <p className="notice" data-testid="exam-in-progress">You have a mock exam in progress. <Link to="/exams/run">Go back to it</Link></p>}
      <label className="search exam-course">Course
        <select value={courseId} onChange={(event) => setCourseId(event.target.value)}>
          <option value="">All courses</option>
          {courses.map((course) => <option key={course.id} value={course.id}>{course.name}</option>)}
        </select>
      </label>

      <div className="dash-tiles" data-testid="exam-evidence">
        <div className="dash-tile"><b data-testid="evidence-answered">{answered.length}/{inScope.length}</b><span>Questions answered</span></div>
        <div className="dash-tile"><b data-testid="evidence-accuracy">{accuracy === null ? '—' : `${accuracy}%`}</b><span>Practice accuracy</span></div>
        <div className="dash-tile"><b>{mistakes.length}</b><span>Mistakes to fix</span></div>
        <div className="dash-tile"><b>{weak.length}</b><span>Weak topics</span></div>
        <div className="dash-tile"><b>{scopedResults.length}</b><span>Mock exams</span></div>
      </div>
      <p className="muted file-meta">These count your saved work. They can't predict your grade, so Study Forge doesn't give a readiness score.</p>

      <div className="dash-grid">
        <section className="dash-card" aria-labelledby="mock-heading" data-tour="exam-start">
          <h2 id="mock-heading">Take a mock exam</h2>
          <p className="dash-note">Questions come from your practice sets. Answers stay hidden until you finish.</p>
          {inScope.length === 0
            ? <p className="muted">No questions yet. <Link to="/practice">Write some in Practice</Link> first.</p>
            : (
              <div className="card-form">
                <div className="form-row">
                  <label>Questions
                    <select value={count} onChange={(event) => setCount(event.target.value)}>
                      {[10, 20, 50].map((value) => <option key={value} value={value}>Up to {value}</option>)}
                      <option value="all">All {inScope.length}</option>
                    </select>
                  </label>
                  <label>Time limit
                    <select value={minutes} onChange={(event) => setMinutes(event.target.value)}>
                      {[15, 30, 60, 90, 120].map((value) => <option key={value} value={value}>{value} minutes</option>)}
                      <option value="none">No time limit</option>
                    </select>
                  </label>
                </div>
                <div className="session-actions">
                  <button className="button primary" disabled={!!inProgress} onClick={() => navigate(`/exams/start?count=${count}&minutes=${minutes}${courseQuery}`)}>Start mock exam</button>
                </div>
              </div>
            )}
        </section>

        <section className="dash-card" aria-labelledby="cram-heading" data-testid="cram-modes">
          <h2 id="cram-heading">Short on time?</h2>
          <p className="dash-note">Cram Mode builds a short plan from your saved work.</p>
          <ul className="dash-rows">
            {(Object.keys(CRAM_MODES) as CramMode[]).map((mode) => (
              <li key={mode} className="dash-simple-row">
                <Link className="dash-what" to={`/exams/cram?mode=${mode}${courseQuery}`}>{CRAM_MODES[mode].label}</Link>
                <span className="dash-next">{CRAM_MODES[mode].summary}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="dash-card" aria-labelledby="upcoming-heading" data-testid="upcoming-exams">
          <div className="section-head"><h2 id="upcoming-heading">Upcoming exams</h2><Link to="/planner">Planner</Link></div>
          {upcoming.length > 0
            ? (
              <ul className="dash-rows">
                {upcoming.slice(0, 5).map((item) => (
                  <li key={item.id} className="dash-simple-row">
                    <Link className="dash-what" to={`/planner/${item.id}`}>{item.title}</Link>
                    <span className="dash-next">{describeDue(item, now)}</span>
                  </li>
                ))}
              </ul>
            )
            : <p className="muted">No exams or quizzes in your Planner.</p>}
        </section>

        <section className="dash-card" aria-labelledby="checklist-heading" data-testid="revision-checklist">
          <h2 id="checklist-heading">Final revision checklist</h2>
          <p className="dash-note">Each line updates from your saved work.</p>
          <ul className="dash-rows">
            {checklist.map((item) => (
              <li key={item.label} className="dash-simple-row" data-done={item.done}>
                <span className="dash-what">{item.done ? 'Done: ' : ''}{item.label}</span>
                <span className="dash-next">{item.detail}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="dash-card" aria-labelledby="review-heading">
          <h2 id="review-heading">Review by type</h2>
          <p className="dash-note">Practice one kind of question, with feedback after each.</p>
          <div className="session-actions">
            <Link className="button" to={`/practice/session?mode=all&kind=definition${courseQuery}`}>Definitions</Link>
            <Link className="button" to={`/practice/session?mode=all&kind=formula${courseQuery}`}>Formulas</Link>
            <Link className="button" to={`/practice/session?mode=mistakes${courseQuery}`}>Mistakes</Link>
          </div>
          {weak.length > 0 && <p className="muted exam-weak">Weakest: {weak.slice(0, 3).map((topic) => `${topic.label} (${topic.percent}%)`).join(', ')}</p>}
        </section>

        <section className="dash-card" aria-labelledby="scores-heading" data-testid="exam-scores">
          <h2 id="scores-heading">Your scores</h2>
          {change && <p className="dash-note" data-testid="improvement">From {change.first}% on your first scored exam to {change.latest}% on your latest, across {plural(change.count, 'exam')}.</p>}
          {scopedResults.length === 0 && <p className="muted">No mock exams yet.</p>}
          <ul className="dash-rows">
            {scopedResults.slice(0, 8).map((result) => {
              const score = examScore(result.items);
              return (
                <li key={result.id} className="dash-simple-row">
                  <Link className="dash-what" to={`/exams/result/${result.id}`}>{result.name}</Link>
                  <span className="dash-next">{score === null ? `${plural(pendingChecks(result.items), 'answer')} to check` : `${score}%`}</span>
                </li>
              );
            })}
          </ul>
        </section>
      </div>
    </div>
  );
}

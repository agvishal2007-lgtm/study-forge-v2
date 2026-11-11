import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { createPracticeSet, listAllTopics, listPracticeAttempts, listPracticeQuestions, listPracticeSets, loadPracticeSession } from '../data/practice';
import { accuracyOf, latestAnswers, mistakesIn, weakTopics, WEAK_BELOW_PERCENT } from '../data/practiceRules';
import { listAllCourses } from '../data/store';
import type { PracticeQuestion, PracticeSet, Topic } from '../data/types';
import { useLive } from '../data/useLive';

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`;

/** The name a weak topic goes by: the question's own topic, then its set's topic, then its set. */
export function topicLabeler(sets: PracticeSet[], topics: Topic[]) {
  return (question: PracticeQuestion) => {
    if (question.topic.trim()) return question.topic.trim();
    const set = sets.find((entry) => entry.id === question.setId);
    return topics.find((topic) => topic.id === set?.topicId)?.name ?? set?.name ?? 'Other';
  };
}

export function PracticePage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [courseId, setCourseId] = useState(params.get('course') ?? '');
  const [name, setName] = useState('');
  const [failure, setFailure] = useState('');
  const { data, error } = useLive(async () => {
    const [sets, questions, attempts, courses, topics, session] = await Promise.all([
      listPracticeSets(), listPracticeQuestions(), listPracticeAttempts(), listAllCourses(), listAllTopics(), loadPracticeSession(),
    ]);
    return { sets, questions, attempts, courses, topics, session };
  });
  if (error) return <div className="page"><h1>Practice</h1><p className="error" role="alert">Your practice sets couldn't be loaded. {error.message}</p></div>;
  if (!data) return <p className="page muted">Loading…</p>;
  const { sets, questions, attempts, courses, topics, session } = data;
  const shownSets = sets.filter((set) => !courseId || (courseId === 'none' ? !set.courseId : set.courseId === courseId));
  const latest = latestAnswers(attempts);
  const mistakes = mistakesIn(questions, attempts);
  const weak = weakTopics(questions, attempts, topicLabeler(sets, topics));
  const accuracy = accuracyOf([...latest.values()]);

  const create = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!name.trim()) {
      setFailure('Enter a name for the set.');
      return;
    }
    try {
      const set = await createPracticeSet(name, courseId && courseId !== 'none' ? courseId : null);
      navigate(`/practice/${set.id}`);
    } catch (problem) {
      setFailure(`The set wasn't created. ${(problem as Error).message}`);
    }
  };

  return (
    <div className="page">
      <h1>Practice</h1>
      <p className="muted">Answer questions without your notes, see what you missed, and repeat your weak topics.</p>
      {session && <p className="session-actions"><Link className="button primary" to={session.url} data-testid="resume-practice">Pick up where you left off</Link></p>}
      {latest.size > 0 && (
        <div className="dash-tiles practice-tiles">
          <div className="dash-tile" data-testid="practice-accuracy"><b>{accuracy}%</b><span>Accuracy</span></div>
          <div className="dash-tile"><b>{latest.size}</b><span>Questions answered</span></div>
          <div className="dash-tile" data-testid="practice-mistakes"><b>{mistakes.length}</b><span>To fix</span></div>
        </div>
      )}
      {mistakes.length > 0 && <p className="session-actions"><Link className="button" to="/practice/session?mode=mistakes">Review {plural(mistakes.length, 'mistake')}</Link></p>}
      {weak.length > 0 && (
        <section aria-labelledby="weak-heading" data-testid="weak-topics">
          <h2 id="weak-heading">Weak topics</h2>
          <p className="muted file-meta">Under {WEAK_BELOW_PERCENT}%, using your latest answer to each question. A partly right answer counts as half.</p>
          <ul className="planner-list">
            {weak.map((topic) => (
              <li key={topic.label} className="planner-row">
                <div className="planner-main">
                  <strong>{topic.label}</strong>
                  <span className="planner-due">{topic.percent}% across {plural(topic.answered, 'question')}</span>
                </div>
                <Link className="button" to={`/practice/session?mode=topic&topic=${encodeURIComponent(topic.label)}`} aria-label={`Practice ${topic.label}`}>Practice</Link>
              </li>
            ))}
          </ul>
        </section>
      )}
      <form className="inline-form" onSubmit={(event) => void create(event)} data-tour="new-practice">
        <label>New practice set<input value={name} onChange={(event) => { setName(event.target.value); setFailure(''); }} placeholder="Chapter 3 review" /></label>
        <button className="button" type="submit">Create set</button>
      </form>
      {failure && <p className="error" role="alert">{failure}</p>}
      {sets.length > 0 && (
        <label className="search">Show
          <select value={courseId} onChange={(event) => setCourseId(event.target.value)}>
            <option value="">All courses</option>
            {courses.map((course) => <option key={course.id} value={course.id}>{course.name}</option>)}
            <option value="none">No course</option>
          </select>
        </label>
      )}
      {sets.length === 0 && <p className="muted planner-empty">No practice sets yet. Name your first one above, then add questions to it.</p>}
      {sets.length > 0 && shownSets.length === 0 && <p className="muted planner-empty">No practice sets for this course.</p>}
      <ul className="planner-list">
        {shownSets.map((set) => {
          const course = courses.find((entry) => entry.id === set.courseId);
          const inSet = questions.filter((question) => question.setId === set.id);
          const answered = inSet.map((question) => latest.get(question.id)).filter((answer) => answer !== undefined);
          const percent = accuracyOf(answered);
          return (
            <li key={set.id} className="planner-row" data-testid="set-row" style={{ '--spine': course?.color ?? 'var(--line)' } as React.CSSProperties}>
              <div className="planner-main">
                <Link to={`/practice/${set.id}`}>{set.name}</Link>
                <span className="planner-due">{plural(inSet.length, 'question')}{percent === null ? ', not practiced yet' : `, ${percent}% accuracy`}</span>
                {course && <span className="muted file-meta">{course.name}</span>}
              </div>
              {inSet.length > 0 && <Link className="button" to={`/practice/session?set=${set.id}`} aria-label={`Start ${set.name}`}>Start</Link>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

import { formatWhen } from '../data/dateFormat';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { pickQuestions } from '../data/examRules';
import { loadExamInProgress, saveExamInProgress } from '../data/exams';
import { listPracticeQuestions, listPracticeSets } from '../data/practice';
import { getCourse } from '../data/store';

/** Sets up one exam, then goes straight to it. An exam already running is never replaced. */
export function ExamStartPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [problem, setProblem] = useState('');
  useEffect(() => {
    let active = true;
    (async () => {
      if (await loadExamInProgress()) {
        if (active) navigate('/exams/run', { replace: true });
        return;
      }
      const courseId = params.get('course') || null;
      const [sets, questions, course] = await Promise.all([listPracticeSets(), listPracticeQuestions(), courseId ? getCourse(courseId) : Promise.resolve(undefined)]);
      const setIds = new Set(sets.filter((set) => !courseId || set.courseId === courseId).map((set) => set.id));
      const countParam = params.get('count');
      const picked = pickQuestions(questions.filter((question) => setIds.has(question.setId)), countParam && countParam !== 'all' ? Number(countParam) : null);
      if (picked.length === 0) {
        if (active) setProblem('There are no practice questions to build an exam from yet.');
        return;
      }
      const minutes = Number(params.get('minutes'));
      const durationMinutes = Number.isFinite(minutes) && minutes > 0 ? minutes : null;
      const startedAt = Date.now();
      await saveExamInProgress({
        id: crypto.randomUUID(),
        name: `${course?.name ?? 'Mock exam'}, ${formatWhen(startedAt, { month: 'short', day: 'numeric' })}`,
        courseId,
        durationMinutes,
        startedAt,
        endsAt: durationMinutes ? startedAt + durationMinutes * 60_000 : null,
        questionIds: picked.map((question) => question.id),
        answers: {},
        position: 0,
      });
      if (active) navigate('/exams/run', { replace: true });
    })().catch((error: Error) => { if (active) setProblem(`The exam couldn't start. ${error.message}`); });
    return () => { active = false; };
    // This runs once for each visit to this address.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  if (problem) return <div className="page"><h1>Exam Hall</h1><p className="error" role="alert">{problem}</p><p><Link to="/exams">Back to Exam Hall</Link></p></div>;
  return <p className="page muted">Setting up your exam…</p>;
}

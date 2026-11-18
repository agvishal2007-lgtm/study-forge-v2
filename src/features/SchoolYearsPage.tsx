import { useState } from 'react';
import { Link } from 'react-router-dom';
import { listAllCourses, updateCourse } from '../data/store';
import { listTerms, orderTerms, setTermStatus, summarizeAll, summarizeTerm, statusFor, termsForCourses, TERM_STATUS_LABEL, type CourseRecord, type Term } from '../data/terms';
import { localNow } from '../data/plannerRules';
import { useLive } from '../data/useLive';
import { useSchool, useSchoolWords, showsGpa } from '../data/schoolLevel';

const recordOf = (course: { id: string; name: string; code: string; term: string; credits?: number | null; finalGrade?: string; status: string }): CourseRecord => ({
  id: course.id,
  name: course.name,
  code: course.code,
  term: course.term,
  credits: course.credits ?? null,
  finalGrade: course.finalGrade ?? '',
  status: course.status,
});

/**
 * Every term a student has had, with what they took and how it went. Nothing here is worked out
 * from anything but what the student entered, and it says so: this is their own record, not a
 * transcript, and their school's own records are the real ones.
 */
export function SchoolYearsPage() {
  const school = useSchool();
  const words = useSchoolWords();
  const [message, setMessage] = useState('');
  const { data, error } = useLive(async () => {
    const courses = await listAllCourses();
    // Terms already written on courses get a record, so a student who has been here a while sees
    // their old terms without typing anything in again.
    await termsForCourses(courses.map((course) => course.term));
    return { courses: courses.map(recordOf), terms: await listTerms() };
  });

  if (error) return <div className="page"><h1>School years</h1><p className="error" role="alert">This couldn't be loaded. {error.message}</p></div>;
  if (!data) return <p className="page muted">Loading…</p>;

  const today = localNow().date;
  const terms = orderTerms(data.terms, today);
  const overall = summarizeAll(data.courses.filter((course) => course.term));
  const gpaShown = showsGpa(school.level);

  const save = async (id: string, changes: { credits?: number | null; finalGrade?: string }) => {
    try {
      await updateCourse(id, changes);
      setMessage('');
    } catch (problem) {
      setMessage(`That wasn't saved. ${(problem as Error).message}`);
    }
  };

  return (
    <div className="page school-years">
      <h1>School years</h1>
      <p className="muted">
        Every {words.term} you've had, with what you took and how it went. Only what you enter is counted here,
        and nothing is guessed. This is your own record, not a transcript — your school's records are the real ones.
      </p>
      {message && <p className="error" role="alert">{message}</p>}

      {terms.length === 0 && (
        <p className="muted" data-testid="years-empty">
          No {words.term}s yet. They appear here as soon as your {words.courses} belong to one.{' '}
          <Link to="/courses">Go to {words.Courses}</Link>.
        </p>
      )}

      {terms.length > 0 && (
        <section aria-labelledby="overall-heading" className="years-overall">
          <h2 id="overall-heading">Altogether</h2>
          <p data-testid="overall-summary">
            {overall.classes} {overall.classes === 1 ? words.course : words.courses}
            {overall.attempted > 0 && <> · {overall.attempted} credits taken, {overall.earned} earned</>}
            {gpaShown && overall.gpa !== null && <> · {overall.gpa} average</>}
          </p>
          {overall.incomplete && (
            <p className="muted small" data-testid="overall-incomplete">
              Some {words.courses} have no credits entered, so these totals aren't the whole story.
            </p>
          )}
        </section>
      )}

      {terms.map((term: Term) => {
        const inTerm = data.courses.filter((course) => course.term === term.name);
        const sum = summarizeTerm(inTerm);
        const where = statusFor(term, today);
        return (
          <section key={term.id} className="year-term" data-testid="year-term" data-term={term.name} aria-labelledby={`term-${term.id}`}>
            <div className="course-head">
              <h2 id={`term-${term.id}`}>{term.name} <span className="muted small">{TERM_STATUS_LABEL[where]}</span></h2>
              <button
                className="text-button"
                onClick={() => void setTermStatus(term.id, where === 'archived' ? 'past' : 'archived')}
                data-testid={`archive-${term.name}`}
              >
                {where === 'archived' ? 'Take back out' : 'Put this ' + words.term + ' away'}
              </button>
            </div>
            {where === 'archived' && (
              <p className="muted small">
                Put away, so it stays out of the way. Everything in it is still here, and nothing about these {words.courses} changed.
              </p>
            )}
            {inTerm.length === 0
              ? <p className="muted small">Nothing in this {words.term}.</p>
              : (
                <table className="year-table">
                  <thead>
                    <tr>
                      <th scope="col">{words.Course}</th>
                      <th scope="col">Credits</th>
                      <th scope="col">Final grade</th>
                    </tr>
                  </thead>
                  <tbody>
                    {inTerm.map((course) => (
                      <tr key={course.id}>
                        <th scope="row">
                          <Link to={`/courses/${course.id}`}>{course.name}</Link>
                          {course.code && <span className="muted small"> {course.code}</span>}
                        </th>
                        <td>
                          <label className="sr-only" htmlFor={`credits-${course.id}`}>Credits for {course.name}</label>
                          <input
                            id={`credits-${course.id}`}
                            className="year-input"
                            inputMode="decimal"
                            defaultValue={course.credits === null ? '' : String(course.credits)}
                            placeholder="—"
                            onBlur={(event) => {
                              const raw = event.target.value.trim();
                              const value = raw === '' ? null : Number(raw);
                              if (value !== null && (!Number.isFinite(value) || value < 0)) { setMessage('Enter credits as a number of 0 or more, or leave it empty.'); return; }
                              void save(course.id, { credits: value });
                            }}
                          />
                        </td>
                        <td>
                          <label className="sr-only" htmlFor={`grade-${course.id}`}>Final grade for {course.name}</label>
                          <input
                            id={`grade-${course.id}`}
                            className="year-input"
                            defaultValue={course.finalGrade}
                            placeholder="—"
                            onBlur={(event) => void save(course.id, { finalGrade: event.target.value })}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            {inTerm.length > 0 && (
              <p className="muted small" data-testid={`summary-${term.name}`}>
                {sum.attempted > 0 ? `${sum.attempted} credits taken, ${sum.earned} earned` : 'No credits entered'}
                {gpaShown && sum.gpa !== null && ` · ${sum.gpa} average`}
                {sum.graded < sum.classes && ` · ${sum.classes - sum.graded} with no grade yet`}
              </p>
            )}
          </section>
        );
      })}
    </div>
  );
}

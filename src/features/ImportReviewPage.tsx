import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Breadcrumbs } from '../components/Breadcrumbs';
import {
  clearImportReview, describeImport, getImportReview, looksLikeACode, markImportExplained,
  reviewable, reviewOrder,
} from '../data/importReview';
import { listCourses, updateCourse } from '../data/store';
import { useLive } from '../data/useLive';

/**
 * Looking over the names an import brought in.
 *
 * A school calendar names a class the way the school's software does — BIO-101-02, ACCT201 LEC — and
 * those become course names. This says so plainly and offers them for renaming, once, straight
 * after the import. Nothing is renamed automatically: a student who calls their class ACCT201 is
 * not wrong, and guessing a "real" name from a code would invent information.
 */
export function ImportReviewPage() {
  const navigate = useNavigate();
  const [names, setNames] = useState<Record<string, string>>({});
  const [problem, setProblem] = useState('');
  const [busy, setBusy] = useState(false);
  const { data, error } = useLive(async () => {
    const [review, courses] = await Promise.all([getImportReview(), listCourses()]);
    return { review, courses: reviewOrder(reviewable(review, courses)) };
  });

  if (error) return <div className="page"><h1>Names from your calendar</h1><p className="error" role="alert">This couldn't be loaded. {error.message}</p></div>;
  if (!data) return <p className="page muted">Loading…</p>;
  const { courses } = data;

  const done = async () => {
    setBusy(true);
    setProblem('');
    try {
      // Only the ones actually changed are saved, so "looks fine" costs nothing.
      for (const course of courses) {
        const wanted = (names[course.id] ?? course.name).trim();
        if (wanted && wanted !== course.name) await updateCourse(course.id, { name: wanted });
      }
      await clearImportReview();
      navigate('/courses');
    } catch (failure) {
      setBusy(false);
      setProblem(`That wasn't saved. ${(failure as Error).message}`);
    }
  };

  if (courses.length === 0) {
    return (
      <div className="page">
        <Breadcrumbs trail={[{ label: 'Courses', to: '/courses' }, { label: 'Names from your calendar' }]} />
        <h1>Names from your calendar</h1>
        <p className="muted" data-testid="review-empty">
          Nothing is waiting to be looked over. Course names from a calendar can be changed any time
          on the course itself. <Link to="/courses">Go to Courses</Link>
        </p>
      </div>
    );
  }

  return (
    <div className="page">
      <Breadcrumbs trail={[{ label: 'Courses', to: '/courses' }, { label: 'Names from your calendar' }]} />
      <h1>Names from your calendar</h1>
      <p className="muted" data-testid="review-explanation">
        {describeImport(courses.length)} Their names are whatever your school's calendar called them,
        which is often a code rather than a name. Change any of them here, or leave them as they are
        — a code may be exactly what you call it. <b>Renaming is safe:</b> getting the latest from
        your calendar matches on the course code, so your name is kept rather than written over.
      </p>
      {problem && <p className="error" role="alert">{problem}</p>}

      <ul className="plain-list review-list" data-testid="review-list">
        {courses.map((course) => (
          <li key={course.id} className="review-row">
            <label>
              <span className="muted small">
                From your calendar: <b>{course.name}</b>
                {looksLikeACode(course.name) ? ' — this looks like a code' : ''}
              </span>
              <input
                value={names[course.id] ?? course.name}
                aria-label={`Name for ${course.name}`}
                data-testid={`review-name-${course.id}`}
                onChange={(event) => setNames((all) => ({ ...all, [course.id]: event.target.value }))}
              />
            </label>
          </li>
        ))}
      </ul>

      <div className="row-actions">
        <button className="button primary" type="button" disabled={busy} onClick={() => void done()} data-testid="review-save">
          {busy ? 'Saving…' : 'Save these names'}
        </button>
        <button
          className="button"
          type="button"
          disabled={busy}
          data-testid="review-keep"
          onClick={() => void clearImportReview().then(() => navigate('/courses'))}
        >
          They're fine as they are
        </button>
      </div>
      <p className="muted small">
        Either way this is only asked once. You can rename a {'class'} on its own page at any time.
      </p>
      <p className="muted small">
        <button className="text-button" type="button" onClick={() => void markImportExplained()}>
          Don't explain this again
        </button>
      </p>
    </div>
  );
}

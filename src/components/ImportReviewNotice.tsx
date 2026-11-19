import { Link } from 'react-router-dom';
import { clearImportReview, describeImport, getImportReview, reviewable } from '../data/importReview';
import { listCourses } from '../data/store';
import { useLive } from '../data/useLive';

/**
 * Says what an import did, where its results are visible.
 *
 * Courses arriving with names like BIO-101-02 is the single most confusing thing a calendar import
 * does, and before this nothing explained it. This appears once, next to the courses themselves,
 * and goes away whether the student renames them or decides they are fine.
 */
export function ImportReviewNotice() {
  const { data } = useLive(async () => {
    const [review, courses] = await Promise.all([getImportReview(), listCourses()]);
    return { waiting: reviewable(review, courses).length };
  });
  if (!data || data.waiting === 0) return null;

  return (
    <div className="site-notice import-notice" role="status" data-testid="import-notice">
      <p>
        <b>{describeImport(data.waiting)}</b> Their names came from your calendar, which often uses
        codes rather than names.
      </p>
      <div className="row-actions">
        <Link className="button primary" to="/courses/review">Look over the names</Link>
        <button className="button" type="button" onClick={() => void clearImportReview()} data-testid="import-notice-dismiss">
          Leave them as they are
        </button>
      </div>
    </div>
  );
}

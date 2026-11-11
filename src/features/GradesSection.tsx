import { useState } from 'react';
import { Link } from 'react-router-dom';
import { addGradeCategory, deleteGradeCategory, listGradeCategories } from '../data/grades';
import { courseGrade, projectGrade, round1 } from '../data/gradeRules';
import { listPlannerItems } from '../data/planner';
import { useLive } from '../data/useLive';

/**
 * Where a course stands, worked out only from the student's own syllabus weights and the marks they
 * were given. Ungraded work is never counted as a zero, and a projection is always labelled as one.
 */
export function GradesSection({ courseId }: { courseId: string }) {
  const [name, setName] = useState('');
  const [weight, setWeight] = useState('');
  const [assumed, setAssumed] = useState('85');
  const [failure, setFailure] = useState('');
  const { data, error } = useLive(async () => {
    const [categories, planner] = await Promise.all([listGradeCategories(courseId), listPlannerItems()]);
    return { categories, items: planner.filter((item) => item.courseId === courseId) };
  }, [courseId]);

  if (error) return <p className="error" role="alert">Grades couldn't be loaded. {error.message}</p>;
  if (!data) return null;
  const grade = courseGrade(data.categories, data.items);
  const guess = Number(assumed);
  const projected = Number.isFinite(guess) && guess >= 0 && guess <= 100
    ? projectGrade(data.categories, data.items, guess)
    : null;

  const attempt = async (action: () => Promise<void>) => {
    setFailure('');
    try {
      await action();
    } catch (problem) {
      setFailure(`That didn't work. ${(problem as Error).message}`);
    }
  };

  return (
    <section aria-labelledby="grades-heading" data-testid="grades">
      <h2 id="grades-heading">Grades</h2>
      {failure && <p className="error" role="alert">{failure}</p>}

      {data.categories.length === 0
        ? <p className="muted">Copy your grading categories from the syllabus — "Exams, 40%" — and Study Forge can work out where you stand. It never guesses them.</p>
        : (
          <>
            <p className="grade-now" data-testid="grade-now">
              {grade.percent === null
                ? 'Nothing is graded yet, so there is no grade to show.'
                : <>So far: <b>{grade.percent}%</b> <span className="muted">based on the {grade.weightCounted}% of the course that has been graded</span></>}
            </p>
            {grade.weightTotal !== 100 && (
              <p className="notice" data-testid="weights-warning">
                Your categories add up to {grade.weightTotal}%, not 100%. Study Forge still works out a grade from the
                part that has been graded, but check the weights against your syllabus.
              </p>
            )}
            {grade.unsorted > 0 && (
              <p className="muted small">{grade.unsorted} graded {grade.unsorted === 1 ? 'item is' : 'items are'} not in a category, so {grade.unsorted === 1 ? 'it counts' : 'they count'} towards nothing. Set a category on {grade.unsorted === 1 ? 'it' : 'them'} in the <Link to="/planner">Planner</Link>.</p>
            )}
            <table className="plan-table">
              <thead><tr><th scope="col">Category</th><th scope="col">Weight</th><th scope="col">Your marks</th><th scope="col">Score</th><th scope="col">Waiting</th><th scope="col"><span className="sr-only">Actions</span></th></tr></thead>
              <tbody>
                {grade.categories.map((result) => (
                  <tr key={result.category.id}>
                    <th scope="row">{result.category.name}</th>
                    <td>{result.category.weight}%</td>
                    <td>{result.gradedCount === 0 ? '—' : `${round1(result.earned)} of ${round1(result.possible)}`}</td>
                    <td>{result.percent === null ? 'Not graded yet' : `${result.percent}%`}</td>
                    <td>{result.ungradedCount === 0 ? '—' : `${result.ungradedCount} to come`}</td>
                    <td>
                      <button
                        className="text-button danger-text"
                        onClick={() => void attempt(() => deleteGradeCategory(result.category.id))}
                        aria-label={`Remove the ${result.category.name} category`}
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="what-if" data-testid="what-if">
              <label>
                If everything left scores
                <input
                  inputMode="decimal"
                  value={assumed}
                  onChange={(event) => setAssumed(event.target.value)}
                  aria-label="If everything left scores this percentage"
                />
                %
              </label>
              <p className="muted" data-testid="projection">
                {projected === null
                  ? 'Enter a number between 0 and 100 to see where that would leave you.'
                  : <>you would finish around <b>{projected}%</b>. <span className="muted">A projection, not a grade you have.</span></>}
              </p>
            </div>
          </>
        )}

      <form
        className="inline-form"
        onSubmit={(event) => {
          event.preventDefault();
          const share = Number(weight);
          if (!name.trim() || !Number.isFinite(share) || share < 0) {
            setFailure('Give the category a name and a weight of 0 or more.');
            return;
          }
          void attempt(async () => {
            await addGradeCategory(courseId, name, share);
            setName('');
            setWeight('');
          });
        }}
      >
        <label>Category<input value={name} onChange={(event) => setName(event.target.value)} placeholder="Exams" /></label>
        <label>Weight %<input inputMode="decimal" value={weight} onChange={(event) => setWeight(event.target.value)} placeholder="40" /></label>
        <button className="button" type="submit">Add category</button>
      </form>
      {data.categories.length > 0 && (
        <p className="muted small">
          To change a category, remove it and add it again. Removing one never deletes the work in it — that work just
          stops counting towards a category.
        </p>
      )}
    </section>
  );
}

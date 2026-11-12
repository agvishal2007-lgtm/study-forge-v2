import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Breadcrumbs } from '../components/Breadcrumbs';
import { listCalendarEvents, saveCalendarEvents } from '../data/calendar';
import { BUILT_IN_TEMPLATES, templateFromCourse } from '../data/courseTemplateRules';
import { applyTemplate, listMyTemplates } from '../data/courseTemplates';
import { formatDay } from '../data/dateFormat';
import { listAllGradeCategories } from '../data/grades';
import { listNotes } from '../data/notes';
import { listPlannerItems, setPlannerStatus } from '../data/planner';
import { hasChanges, planChanges, reviewCourses, type NewCourse, type SemesterChoices } from '../data/semesterRules';
import { createCourse, listCourses, listMaterials, listTopicsAnyStatus, setCourseStatus, updateCourse } from '../data/store';
import { useLive } from '../data/useLive';

const STEPS = ['Your courses', 'Unfinished work', 'Next semester', 'Review'] as const;
const today = () => new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

/**
 * Semester transition assistant: review the term that's ending, decide what to archive, and set up
 * the next one. Nothing changes until the last step, where every change is listed and confirmed.
 * Nothing is ever deleted, and official deadlines are never moved.
 */
export function SemesterPage() {
  const { data } = useLive(async () => {
    const [courses, planner, events, materials, notes, myTemplates] = await Promise.all([listCourses(), listPlannerItems(), listCalendarEvents(), listMaterials(), listNotes(), listMyTemplates()]);
    const files = new Map<string, number>();
    for (const material of materials) if (material.courseId) files.set(material.courseId, (files.get(material.courseId) ?? 0) + 1);
    const noteCount = new Map<string, number>();
    for (const note of notes) if (note.courseId) noteCount.set(note.courseId, (noteCount.get(note.courseId) ?? 0) + 1);
    return { reviews: reviewCourses(courses, planner, events, { files, notes: noteCount }, today()), myTemplates };
  });
  const [step, setStep] = useState(0);
  const [archive, setArchive] = useState<Set<string>>(new Set());
  const [complete, setComplete] = useState<Set<string>>(new Set());
  const [hideEvents, setHideEvents] = useState<Set<string>>(new Set());
  const [term, setTerm] = useState('');
  const [newCourses, setNewCourses] = useState<NewCourse[]>([{ name: '', code: '', start: '' }]);
  const [working, setWorking] = useState(false);
  const [done, setDone] = useState<string[] | null>(null);
  const [failure, setFailure] = useState('');

  if (!data) return <div className="page"><h1>New semester</h1><p className="muted">Loading your courses…</p></div>;
  const { reviews, myTemplates } = data;
  const toggle = (set: Set<string>, id: string, on: boolean) => { const next = new Set(set); if (on) next.add(id); else next.delete(id); return next; };
  const archiving = reviews.filter((review) => archive.has(review.course.id));
  const startLabel = (start: string) => {
    if (start.startsWith('copy:')) return `the topics and categories of ${reviews.find((review) => review.course.id === start.slice(5))?.course.name ?? 'an old course'}`;
    return `the ${[...BUILT_IN_TEMPLATES, ...myTemplates].find((template) => template.id === start)?.name ?? 'chosen'} template`;
  };
  const choices: SemesterChoices = { archive, complete, hideEvents, term, newCourses };
  const changes = planChanges(reviews, choices, startLabel);

  const apply = async () => {
    setWorking(true);
    setFailure('');
    const report: string[] = [];
    try {
      for (const review of archiving) {
        for (const item of review.unfinished) {
          if (complete.has(item.id)) { await setPlannerStatus(item.id, 'Completed'); report.push(`Marked “${item.title}” Completed.`); }
        }
        if (hideEvents.has(review.course.id) && review.futureEvents.length) {
          await saveCalendarEvents(review.futureEvents.map((event) => ({ ...event, hidden: true })));
          report.push(`Hid ${review.futureEvents.length} upcoming events for ${review.course.name}.`);
        }
        await setCourseStatus(review.course.id, 'archived');
        report.push(`Archived ${review.course.name}.`);
      }
      const categories = await listAllGradeCategories();
      for (const draft of newCourses.filter((item) => item.name.trim())) {
        const course = await createCourse(draft.name, draft.code);
        if (term.trim()) await updateCourse(course.id, { term: term.trim() });
        let template = null;
        if (draft.start.startsWith('copy:')) {
          const oldId = draft.start.slice(5);
          template = templateFromCourse('copy', await listTopicsAnyStatus(oldId), categories.filter((category) => category.courseId === oldId), false, 'copy', Date.now());
        } else if (draft.start) {
          template = [...BUILT_IN_TEMPLATES, ...myTemplates].find((item) => item.id === draft.start) ?? null;
        }
        const added = template ? await applyTemplate(course.id, template) : null;
        report.push(`Created ${course.name}${added ? ` with ${added.topics} topics and ${added.categories} grade categories` : ''}.`);
      }
      setDone(report);
    } catch (error) {
      setFailure(`Stopped partway. ${(error as Error).message} These changes were made: ${report.join(' ') || 'none'}`);
    } finally {
      setWorking(false);
    }
  };

  if (done) {
    return (
      <div className="page semester" data-testid="semester">
        <h1>New semester</h1>
        <p role="status" className="success-note">All done. Here’s what changed:</p>
        <ul data-testid="semester-done">{done.map((line) => <li key={line}>{line}</li>)}</ul>
        <p className="muted">Archived courses can be put back in use from Courses at any time. Nothing was deleted.</p>
        <p><Link className="button primary" to="/courses">Go to Courses</Link></p>
      </div>
    );
  }

  return (
    <div className="page semester" data-testid="semester">
      <Breadcrumbs trail={[{ label: 'Courses', to: '/courses' }, { label: 'New semester' }]} />
      <h1>New semester</h1>
      <p className="muted">Wrap up the term that’s ending and set up the next one. Nothing changes until you review everything and confirm on the last step. Nothing is ever deleted.</p>
      <ol className="semester-steps" aria-label="Steps">
        {STEPS.map((label, index) => <li key={label} aria-current={index === step ? 'step' : undefined} className={index === step ? 'current' : index < step ? 'done' : ''}>{index + 1}. {label}</li>)}
      </ol>

      {step === 0 && (
        <section aria-labelledby="semester-courses">
          <h2 id="semester-courses">Which courses are finished?</h2>
          {reviews.length === 0 && <p className="muted">You have no courses in use. Go to the next step to set up new ones.</p>}
          <ul className="plain-list semester-list">
            {reviews.map((review) => (
              <li key={review.course.id} className="semester-course">
                <div>
                  <b>{review.course.name}</b>{review.course.term && <span className="muted"> · {review.course.term}</span>}
                  <p className="muted small">{review.files} files, {review.notes} notes, {review.unfinished.length} unfinished in Planner, {review.futureEvents.length} upcoming calendar events</p>
                </div>
                <fieldset className="choice-pair">
                  <legend className="sr-only">{review.course.name}</legend>
                  <label><input type="radio" name={`c-${review.course.id}`} checked={!archive.has(review.course.id)} onChange={() => setArchive(toggle(archive, review.course.id, false))} /> Keep using</label>
                  <label><input type="radio" name={`c-${review.course.id}`} checked={archive.has(review.course.id)} onChange={() => setArchive(toggle(archive, review.course.id, true))} /> Finished: archive</label>
                </fieldset>
              </li>
            ))}
          </ul>
        </section>
      )}

      {step === 1 && (
        <section aria-labelledby="semester-unfinished">
          <h2 id="semester-unfinished">Unfinished work and upcoming events</h2>
          {archiving.length === 0 && <p className="muted">You’re not archiving any courses, so there’s nothing to check here.</p>}
          {archiving.map((review) => (
            <div key={review.course.id} className="semester-block">
              <h3>{review.course.name}</h3>
              {review.unfinished.length === 0
                ? <p className="muted small">Nothing unfinished.</p>
                : (
                  <>
                    <p className="small">These aren’t marked done. They stay in your Planner unless you tick them. Their due dates are never changed.</p>
                    <ul className="plain-list">
                      {review.unfinished.map((item) => (
                        <li key={item.id}>
                          <label className="check-label">
                            <input type="checkbox" checked={complete.has(item.id)} onChange={(event) => setComplete(toggle(complete, item.id, event.target.checked))} />
                            Mark “{item.title}” Completed{item.dueDate ? <span className="muted small"> (due {formatDay(item.dueDate, { month: 'short', day: 'numeric', year: 'numeric' })})</span> : null}
                          </label>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              {review.futureEvents.length > 0 && (
                <label className="check-label">
                  <input type="checkbox" checked={hideEvents.has(review.course.id)} onChange={(event) => setHideEvents(toggle(hideEvents, review.course.id, event.target.checked))} />
                  Hide its {review.futureEvents.length} upcoming calendar {review.futureEvents.length === 1 ? 'event' : 'events'} (first: {review.futureEvents[0].title}, {formatDay(review.futureEvents[0].date, { month: 'short', day: 'numeric' })})
                </label>
              )}
            </div>
          ))}
        </section>
      )}

      {step === 2 && (
        <section aria-labelledby="semester-next">
          <h2 id="semester-next">Set up the next semester</h2>
          <label>Semester name<input value={term} onChange={(event) => setTerm(event.target.value)} placeholder="Spring 2027" /></label>
          <p className="muted small">Add the courses you’re taking. Leave a row empty to skip it. You can add more later from Courses.</p>
          <ul className="plain-list semester-new">
            {newCourses.map((draft, index) => (
              <li key={index} className="inline-form">
                <label>Course name<input value={draft.name} onChange={(event) => setNewCourses(newCourses.map((item, i) => (i === index ? { ...item, name: event.target.value } : item)))} /></label>
                <label>Code (optional)<input value={draft.code} onChange={(event) => setNewCourses(newCourses.map((item, i) => (i === index ? { ...item, code: event.target.value } : item)))} /></label>
                <label>Start from
                  <select value={draft.start} onChange={(event) => setNewCourses(newCourses.map((item, i) => (i === index ? { ...item, start: event.target.value } : item)))}>
                    <option value="">Blank course</option>
                    <optgroup label="Templates">{[...BUILT_IN_TEMPLATES, ...myTemplates].map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}</optgroup>
                    {reviews.length > 0 && <optgroup label="Same shape as">{reviews.map((review) => <option key={review.course.id} value={`copy:${review.course.id}`}>{review.course.name}</option>)}</optgroup>}
                  </select>
                </label>
                {newCourses.length > 1 && <button type="button" className="text-button" onClick={() => setNewCourses(newCourses.filter((_, i) => i !== index))} aria-label={`Remove row ${index + 1}`}>Remove</button>}
              </li>
            ))}
          </ul>
          <button type="button" className="button" onClick={() => setNewCourses([...newCourses, { name: '', code: '', start: '' }])}>Add another course</button>
          <p className="muted small">“Same shape as” copies an old course’s topic names and grade category names only. Its files, notes, grades and deadlines stay with the old course.</p>
        </section>
      )}

      {step === 3 && (
        <section aria-labelledby="semester-review">
          <h2 id="semester-review">Review before anything changes</h2>
          {hasChanges(changes)
            ? <ul data-testid="semester-plan">{changes.map((change) => <li key={change.text}>{change.text}</li>)}</ul>
            : <p className="muted">Nothing to change. Go back to choose courses to archive or add new ones.</p>}
          <p className="muted small">Nothing is deleted. Archived courses can be put back in use from Courses at any time.</p>
          {failure && <p className="error" role="alert">{failure}</p>}
        </section>
      )}

      <div className="session-actions">
        {step > 0 && <button type="button" className="button" onClick={() => setStep(step - 1)} disabled={working}>Back</button>}
        {step < STEPS.length - 1 && <button type="button" className="button primary" onClick={() => setStep(step + 1)}>Next</button>}
        {step === STEPS.length - 1 && <button type="button" className="button primary" disabled={!hasChanges(changes) || working} onClick={() => void apply()}>{working ? 'Making the changes…' : 'Make these changes'}</button>}
        <Link className="text-button" to="/courses">Cancel</Link>
      </div>
    </div>
  );
}

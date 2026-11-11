import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { listCourses, listTopics } from '../data/store';
import { useLive } from '../data/useLive';
import { lastPlace, rememberPlace } from '../data/addPlace';
import { ADD_CHOICES, destination, suggestPlace, type AddKind, type Place } from '../data/smartAddRules';
import { AddFiles } from './AddFiles';
import { SaveLinkForm } from './SaveLinkForm';
import { NewNoteButton } from './NoteList';

function PlusIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

/** Smart Add. One button that starts anything, from wherever the student already is. */
export function SmartAdd() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="icon-button" data-tour="smart-add" aria-label="Add" title="Add" onClick={() => setOpen(true)}><PlusIcon /></button>
      {open && <SmartAddDialog onClose={() => setOpen(false)} />}
    </>
  );
}

function SmartAddDialog({ onClose }: { onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { data: courses } = useLive(() => listCourses(), []);
  const [chosen, setChosen] = useState<AddKind | null>(null);
  const [place, setPlace] = useState<Place | null>(null);
  const { data: topics } = useLive(() => (place?.courseId ? listTopics(place.courseId) : Promise.resolve([])), [place?.courseId]);

  const openedAt = useRef(pathname);
  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);
  // Anything that takes the student to another screen has finished with this dialog.
  useEffect(() => {
    if (pathname !== openedAt.current) onClose();
  }, [pathname, onClose]);
  // The suggestion waits for the courses, so a real course is never replaced by a blank.
  useEffect(() => {
    if (!courses || place) return;
    setPlace(suggestPlace({ pathname, remembered: lastPlace(), courses, topics: [] }));
  }, [courses, place, pathname]);

  const here: Place = place ?? { courseId: null, topicId: null };
  const update = (next: Place) => { setPlace(next); rememberPlace(next); };

  const start = (kind: AddKind) => {
    const to = destination(kind, here);
    if (!to) { setChosen(kind); return; }
    onClose();
    navigate(to);
  };

  const chosenLabel = ADD_CHOICES.find((choice) => choice.kind === chosen)?.label ?? '';

  return (
    <dialog ref={ref} className="dialog add-dialog" aria-labelledby="add-title" onCancel={onClose}>
      <h2 id="add-title">{chosen ? `Add a ${chosenLabel.toLowerCase()}` : 'Add to Study Forge'}</h2>
      <div className="add-place">
        <label>
          Course
          <select
            value={here.courseId ?? ''}
            onChange={(event) => update({ courseId: event.target.value || null, topicId: null })}
          >
            <option value="">No course</option>
            {(courses ?? []).map((course) => <option key={course.id} value={course.id}>{course.name}</option>)}
          </select>
        </label>
        {here.courseId && (topics ?? []).length > 0 && (
          <label>
            Topic
            <select value={here.topicId ?? ''} onChange={(event) => update({ ...here, topicId: event.target.value || null })}>
              <option value="">No topic</option>
              {(topics ?? []).map((topic) => <option key={topic.id} value={topic.id}>{topic.name}</option>)}
            </select>
          </label>
        )}
        <p className="muted">Suggested from where you are. Change it if it's wrong.</p>
      </div>

      {!chosen && (
        <ul className="add-kinds">
          {ADD_CHOICES.map((choice) => (
            <li key={choice.kind}>
              <button
                className="add-kind"
                onClick={() => start(choice.kind)}
                disabled={choice.needsCourse && !here.courseId}
              >
                <strong>{choice.label}</strong>
                <span className="muted">{choice.needsCourse && !here.courseId ? 'Choose a course first.' : choice.hint}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {chosen === 'file' && <AddFiles courseId={here.courseId} topicId={here.topicId} />}
      {chosen === 'link' && <SaveLinkForm courseId={here.courseId} topicId={here.topicId} />}
      {chosen === 'note' && (
        <p className="add-note">
          <NewNoteButton courseId={here.courseId} topicId={here.topicId} label="Write the note" primary />
        </p>
      )}

      <div className="dialog-actions">
        {chosen
          ? <button className="button" onClick={() => setChosen(null)}>Add something else</button>
          : <span />}
        <button className="button" onClick={onClose}>Done</button>
      </div>
    </dialog>
  );
}

import { Link, useNavigate } from 'react-router-dom';
import { formatDate } from '../data/format';
import { noteLabel } from '../data/notes';
import type { Course, Note } from '../data/types';

export function NoteList({ notes, courses }: { notes: Note[]; courses?: Course[] }) {
  return (
    <ul className="files">
      {notes.map((note) => {
        const course = courses?.find((candidate) => candidate.id === note.courseId);
        return (
          <li key={note.id} style={{ '--spine': course?.color ?? 'var(--line)' } as React.CSSProperties}>
            <Link to={`/notes/${note.id}`}>{noteLabel(note)}</Link>
            <span className="muted file-meta">
              {[`Edited ${formatDate(note.updatedAt)}`, courses && (course?.name ?? 'No course')].filter(Boolean).join(', ')}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

interface NewNoteProps {
  courseId?: string | null;
  topicId?: string | null;
  materialId?: string | null;
  label?: string;
  primary?: boolean;
}

/** Opens a blank note. Nothing is saved until the student actually types. */
export function NewNoteButton({ courseId, topicId, materialId, label = 'New note', primary }: NewNoteProps) {
  const navigate = useNavigate();
  return (
    <button
      className={primary ? 'button primary' : 'button'}
      onClick={() => {
        const params = new URLSearchParams();
        if (courseId) params.set('course', courseId);
        if (topicId) params.set('topic', topicId);
        if (materialId) params.set('file', materialId);
        navigate(`/notes/${crypto.randomUUID()}?${params}`);
      }}
    >
      {label}
    </button>
  );
}

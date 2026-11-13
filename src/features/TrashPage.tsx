import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { deleteCourse, deleteMaterial, deleteTopic, listAllCourses, listTrash, setCourseStatus, setMaterialStatus, setTopicStatus } from '../data/store';
import { deleteTrashEntry, listTrashEntries, restoreFromTrash, type TrashKind } from '../data/trash';
import { useLive } from '../data/useLive';

type Kind = 'course' | 'topic' | 'file' | 'link' | TrashKind;

export const TRASH_KIND_LABEL: Record<Kind, string> = {
  course: 'Course', topic: 'Topic', file: 'File', link: 'Link', note: 'Note', deck: 'Flashcard deck',
  practiceSet: 'Practice set', lesson: 'Lesson', plannerItem: 'Planner item',
};

interface Row {
  key: string;
  kind: Kind;
  name: string;
  from: string;
  deletedAt: number;
  restore: () => Promise<string | void>;
  remove: () => Promise<void>;
  /** What permanently deleting it means, in plain words. */
  warning: string;
}

const when = (time: number) => (time > 0 ? new Date(time).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '');

async function loadRows(): Promise<Row[]> {
  const [{ courses, topics, materials }, entries, allCourses] = await Promise.all([listTrash(), listTrashEntries(), listAllCourses()]);
  const courseName = (id: string | null | undefined) => allCourses.find((course) => course.id === id)?.name ?? '';
  const rows: Row[] = [
    ...courses.map((course): Row => ({
      key: `course-${course.id}`, kind: 'course', name: course.name, from: 'Courses', deletedAt: course.statusAt,
      restore: () => setCourseStatus(course.id, 'active'), remove: () => deleteCourse(course.id),
      warning: 'This can’t be undone, but nothing you made is lost. Its files stay in your Library, its notes stay in Notes, any lessons stay in Study, any assignments stay in Planner, any flashcards stay in Flashcards, any practice sets stay in Practice, and exam scores stay in Exam Hall.',
    })),
    ...topics.map((topic): Row => ({
      key: `topic-${topic.id}`, kind: 'topic', name: topic.name, from: courseName(topic.courseId) || 'A course', deletedAt: topic.statusAt,
      restore: () => setTopicStatus(topic.id, 'active'), remove: () => deleteTopic(topic.id),
      warning: 'This can’t be undone. Its files and notes stay in the course.',
    })),
    ...materials.map((material): Row => ({
      key: `file-${material.id}`, kind: material.kind === 'link' ? 'link' : 'file', name: material.name, from: courseName(material.courseId) || 'Library', deletedAt: material.statusAt,
      restore: () => setMaterialStatus(material.id, 'active'), remove: () => deleteMaterial(material.id),
      warning: material.kind === 'link' ? 'This can’t be undone.' : 'This deletes the file itself. It can’t be undone, and it isn’t in your backups unless you made one.',
    })),
    ...entries.map((entry): Row => ({
      key: entry.id, kind: entry.kind, name: entry.name, from: courseName(entry.courseId) || ({ note: 'Notes', deck: 'Flashcards', practiceSet: 'Practice', lesson: 'Study', plannerItem: 'Planner' } as const)[entry.kind], deletedAt: entry.deletedAt,
      restore: () => restoreFromTrash(entry.id), remove: () => deleteTrashEntry(entry.id),
      warning: entry.kind === 'deck' ? 'This deletes the deck, its cards and their review history. It can’t be undone.'
        : entry.kind === 'practiceSet' ? 'This deletes the set, its questions and your answers. It can’t be undone.'
          : entry.kind === 'lesson' ? 'This deletes the lesson, its steps and your progress. It can’t be undone.'
            : 'This can’t be undone.',
    })),
  ];
  return rows.sort((a, b) => b.deletedAt - a.deletedAt);
}

/** Everything moved to Trash, from every part of Study Forge. Nothing here is gone until the student says so. */
export function TrashPage() {
  const { data: rows, error } = useLive(loadRows);
  const [kind, setKind] = useState<'all' | Kind>('all');
  const [query, setQuery] = useState('');
  const [doomed, setDoomed] = useState<Row | 'all' | null>(null);
  const [message, setMessage] = useState('');

  const shown = useMemo(() => (rows ?? []).filter((row) => (kind === 'all' || row.kind === kind) && (!query.trim() || `${row.name} ${row.from}`.toLowerCase().includes(query.trim().toLowerCase()))), [rows, kind, query]);
  const kinds = useMemo(() => [...new Set((rows ?? []).map((row) => row.kind))], [rows]);

  const attempt = async (work: () => Promise<string | void>, done: string) => {
    setMessage('');
    try {
      const note = await work();
      setMessage(note ? `${done} ${note}` : done);
    } catch (problem) {
      setMessage(`That didn’t work. ${(problem as Error).message}`);
    }
  };

  if (error) return <div className="page"><h1>Trash</h1><p className="error" role="alert">Trash couldn’t be loaded. {error.message}</p></div>;
  if (!rows) return <p className="page muted">Loading…</p>;

  return (
    <div className="page trash-page">
      <h1>Trash</h1>
      <p className="muted">Things you delete from anywhere in Study Forge wait here. Restore puts them back where they were. Nothing is gone until you delete it permanently.</p>
      {message && <p className="notice" role="status" data-testid="trash-message">{message}</p>}
      {rows.length === 0
        ? <p className="muted" data-testid="trash-empty">Trash is empty.</p>
        : (
          <>
            <div className="trash-tools">
              <label>Show
                <select value={kind} onChange={(event) => setKind(event.target.value as typeof kind)} data-testid="trash-filter">
                  <option value="all">Everything ({rows.length})</option>
                  {kinds.map((option) => <option key={option} value={option}>{TRASH_KIND_LABEL[option]} ({rows.filter((row) => row.kind === option).length})</option>)}
                </select>
              </label>
              <label>Search Trash<input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Name or place" /></label>
              <button type="button" className="button danger" onClick={() => setDoomed('all')}>Empty Trash</button>
            </div>
            {shown.length === 0 && <p className="muted">Nothing in Trash matches.</p>}
            <ul className="plain-list trash-list" data-testid="trash-list">
              {shown.map((row) => (
                <li key={row.key} className="trash-row" data-testid="trash-row">
                  <span className="trash-what">
                    <b className="trash-name">{row.name}</b>
                    <span className="muted small">{TRASH_KIND_LABEL[row.kind]} · from {row.from}{row.deletedAt ? ` · deleted ${when(row.deletedAt)}` : ''}</span>
                  </span>
                  <span className="row-actions">
                    <button className="button" onClick={() => void attempt(row.restore, `Restored “${row.name}”.`)} aria-label={`Restore ${row.name}`}>Restore</button>
                    <button className="text-button danger-text" onClick={() => setDoomed(row)} aria-label={`Permanently delete ${row.name}`}>Permanently delete</button>
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
      <p className="muted small"><Link to="/">Back to Today</Link></p>

      {doomed && (
        <ConfirmDialog
          title={doomed === 'all' ? `Permanently delete all ${rows.length} ${rows.length === 1 ? 'item' : 'items'} in Trash?` : `Permanently delete “${doomed.name}”?`}
          confirmLabel={doomed === 'all' ? 'Empty Trash' : 'Permanently delete'}
          onCancel={() => setDoomed(null)}
          onConfirm={() => {
            const target = doomed;
            setDoomed(null);
            if (target === 'all') {
              void attempt(async () => { for (const row of rows) await row.remove(); }, 'Trash is empty.');
            } else {
              void attempt(target.remove, `Permanently deleted “${target.name}”.`);
            }
          }}
        >
          {doomed === 'all'
            ? <p>This can’t be undone. Files are deleted from this device for good. Courses and topics you delete this way don’t take their notes, files or other work with them; those stay where they are.</p>
            : <p>{doomed.warning}</p>}
        </ConfirmDialog>
      )}
    </div>
  );
}

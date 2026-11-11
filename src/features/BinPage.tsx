import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { deleteCourse, deleteMaterial, deleteTopic, listTrash, setCourseStatus, setMaterialStatus, setTopicStatus } from '../data/store';
import { useLive } from '../data/useLive';

type Doomed = { kind: 'course' | 'topic' | 'file'; id: string; name: string };

/** Everything the student moved to the bin. Nothing here is gone until they say so. */
export function BinPage() {
  const [doomed, setDoomed] = useState<Doomed | null>(null);
  const [failure, setFailure] = useState('');
  const { data, error } = useLive(() => listTrash());

  const attempt = async (action: () => Promise<void>) => {
    setFailure('');
    try {
      await action();
    } catch (problem) {
      setFailure(`That didn't work. ${(problem as Error).message}`);
    }
  };

  const removeForGood = async (target: Doomed) => {
    if (target.kind === 'course') await deleteCourse(target.id);
    else if (target.kind === 'topic') await deleteTopic(target.id);
    else await deleteMaterial(target.id);
    setDoomed(null);
  };

  if (error) return <div className="page"><h1>Bin</h1><p className="error" role="alert">The bin couldn't be loaded. {error.message}</p></div>;
  if (!data) return <p className="page muted">Loading…</p>;
  const { courses, topics, materials } = data;
  const empty = courses.length === 0 && topics.length === 0 && materials.length === 0;

  const row = (kind: Doomed['kind'], id: string, name: string, restore: () => Promise<void>, note: string) => (
    <li key={`${kind}-${id}`}>
      <span className="bin-name">{name}</span>
      <span className="muted small">{note}</span>
      <span className="head-actions">
        <button className="text-button" onClick={() => void attempt(restore)} aria-label={`Restore ${name}`}>Restore</button>
        <button className="text-button danger-text" onClick={() => setDoomed({ kind, id, name })} aria-label={`Remove ${name} for good`}>Remove for good</button>
      </span>
    </li>
  );

  return (
    <div className="page">
      <h1>Bin</h1>
      <p className="muted">Nothing here has been deleted. Restore it, or remove it for good — which cannot be undone.</p>
      {failure && <p className="error" role="alert">{failure}</p>}
      {empty && <p className="muted">The bin is empty.</p>}

      {courses.length > 0 && (
        <section aria-labelledby="bin-courses" data-testid="bin-courses">
          <h2 id="bin-courses">Courses</h2>
          <ul className="plain-list">
            {courses.map((course) => row('course', course.id, course.name, () => setCourseStatus(course.id, 'active'),
              'Removing it for good keeps its files, notes, lessons, assignments and results — they just stop belonging to a course.'))}
          </ul>
        </section>
      )}
      {topics.length > 0 && (
        <section aria-labelledby="bin-topics" data-testid="bin-topics">
          <h2 id="bin-topics">Topics</h2>
          <ul className="plain-list">
            {topics.map((topic) => row('topic', topic.id, topic.name, () => setTopicStatus(topic.id, 'active'),
              'Removing it for good keeps its files and notes in the course.'))}
          </ul>
        </section>
      )}
      {materials.length > 0 && (
        <section aria-labelledby="bin-files" data-testid="bin-files">
          <h2 id="bin-files">Files</h2>
          <ul className="plain-list">
            {materials.map((material) => row('file', material.id, material.name, () => setMaterialStatus(material.id, 'active'),
              'Removing it for good deletes the file itself. This cannot be undone.'))}
          </ul>
        </section>
      )}
      <p className="muted small"><Link to="/courses">Back to Courses</Link></p>

      {doomed && (
        <ConfirmDialog
          title={`Remove ${doomed.name} for good?`}
          confirmLabel="Remove for good"
          onCancel={() => setDoomed(null)}
          onConfirm={() => void attempt(() => removeForGood(doomed))}
        >
          <p>{doomed.kind === 'file'
            ? 'This deletes the file itself. It cannot be undone, and it is not in your backups unless you made one.'
            : 'This cannot be undone. Your files and notes are kept — they just stop belonging to it.'}</p>
        </ConfirmDialog>
      )}
    </div>
  );
}

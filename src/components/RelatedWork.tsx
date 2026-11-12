import { useState } from 'react';
import { Link } from 'react-router-dom';
import { listPlannerItems } from '../data/planner';
import { isDone } from '../data/plannerRules';
import { setAssignmentLink } from '../data/reading';
import { listAllMaterials } from '../data/store';
import { useLive } from '../data/useLive';

/** On a file: the assignments it's linked to, and a way to link it to another. Dates are never touched. */
export function RelatedAssignments({ materialId, courseId }: { materialId: string; courseId: string | null }) {
  const { data: items } = useLive(listPlannerItems);
  const [pick, setPick] = useState('');
  if (!items) return null;
  const linked = items.filter((item) => item.materialIds?.includes(materialId));
  const candidates = items.filter((item) => !item.materialIds?.includes(materialId) && !isDone(item))
    .sort((a, b) => Number(b.courseId === courseId) - Number(a.courseId === courseId) || (a.dueDate || '9').localeCompare(b.dueDate || '9'));
  return (
    <section className="related-work" aria-labelledby="related-heading" data-testid="related-assignments">
      <h2 id="related-heading">Related assignments</h2>
      {linked.length === 0
        ? <p className="muted small">Not linked to any assignment yet.</p>
        : (
          <ul className="plain-list">
            {linked.map((item) => (
              <li key={item.id} className="bookmark-row">
                <Link to={`/planner/${item.id}`}>{item.title}</Link>
                <button className="text-button" onClick={() => void setAssignmentLink(item.id, materialId, false)} aria-label={`Unlink ${item.title}`}>Unlink</button>
              </li>
            ))}
          </ul>
        )}
      {candidates.length > 0 && (
        <div className="inline-form">
          <label>Link to an assignment
            <select value={pick} onChange={(event) => setPick(event.target.value)}>
              <option value="">Choose one</option>
              {candidates.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
            </select>
          </label>
          <button className="button" disabled={!pick} onClick={() => { void setAssignmentLink(pick, materialId, true); setPick(''); }}>Link</button>
        </div>
      )}
    </section>
  );
}

/** On an assignment: the files and links tied to it. */
export function LinkedFiles({ itemId }: { itemId: string }) {
  const { data } = useLive(async () => ({ items: await listPlannerItems(), materials: await listAllMaterials() }));
  const item = data?.items.find((entry) => entry.id === itemId);
  const files = data?.materials.filter((material) => item?.materialIds?.includes(material.id) && material.status !== 'trashed') ?? [];
  if (!item) return null;
  return (
    <section className="related-work" aria-labelledby="linked-files-heading" data-testid="linked-files">
      <h2 id="linked-files-heading">Linked files and readings</h2>
      {files.length === 0
        ? <p className="muted small">None yet. Open a file or link and use Link to an assignment.</p>
        : <ul className="plain-list">{files.map((file) => <li key={file.id}><Link to={`/files/${file.id}`}>{file.name}</Link></li>)}</ul>}
    </section>
  );
}

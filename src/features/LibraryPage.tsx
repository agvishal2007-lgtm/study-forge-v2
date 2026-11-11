import { useMemo, useState } from 'react';
import { AddFiles } from '../components/AddFiles';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { MaterialList } from '../components/MaterialList';
import { SaveLinkForm } from '../components/SaveLinkForm';
import { report, runBulk, type BulkAction } from '../data/bulk';
import { listAllCourses, listMaterials, listTopics } from '../data/store';
import type { Material } from '../data/types';
import { useLive } from '../data/useLive';

/** Pinned things lead, most recently pinned first; the rest keep their usual order. */
const pinnedFirst = (list: Material[]) => [
  ...list.filter((item) => item.pinnedAt).sort((a, b) => (b.pinnedAt ?? 0) - (a.pinnedAt ?? 0)),
  ...list.filter((item) => !item.pinnedAt),
];

export function LibraryPage() {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirming, setConfirming] = useState<BulkAction | null>(null);
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<{ text: string; partial: boolean } | null>(null);
  const [moveCourse, setMoveCourse] = useState('');
  const [moveTopic, setMoveTopic] = useState('');
  const { data, error } = useLive(async () => {
    const [courses, materials, archived] = await Promise.all([listAllCourses(), listMaterials(), listMaterials('archived')]);
    return { courses, materials, archived };
  });
  const { data: topics } = useLive(() => (moveCourse ? listTopics(moveCourse) : Promise.resolve([])), [moveCourse]);

  const needle = query.trim().toLowerCase();
  const shown = useMemo(() => pinnedFirst(data?.materials.filter((material) =>
    material.name.toLowerCase().includes(needle) || material.url.toLowerCase().includes(needle)) ?? []), [data, needle]);
  // Only what is on screen can be selected, so a search never acts on things the student can't see.
  const picked = shown.filter((item) => selected.has(item.id));
  const allShownPicked = shown.length > 0 && picked.length === shown.length;

  const toggle = (id: string) => setSelected((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });

  const run = async (action: BulkAction, items: Material[]) => {
    setConfirming(null);
    setBusy(true);
    const result = await runBulk(items, action);
    setOutcome({ text: report(action, items.length, result), partial: result.failed.length > 0 });
    // Whatever failed stays selected, so it can be tried again or looked at.
    setSelected(new Set(items.filter((item) => result.failed.some((entry) => entry.name === item.name)).map((item) => item.id)));
    setBusy(false);
  };

  const courseName = (id: string) => data?.courses.find((course) => course.id === id)?.name ?? 'that course';
  const moveAction = (): BulkAction => {
    if (!moveCourse) return { kind: 'move', courseId: null, topicId: null, place: 'No course' };
    const topic = topics?.find((entry) => entry.id === moveTopic);
    return { kind: 'move', courseId: moveCourse, topicId: topic?.id ?? null, place: topic ? `${courseName(moveCourse)}, ${topic.name}` : courseName(moveCourse) };
  };

  return (
    <div className="page">
      <h1>Library</h1>
      <p className="muted">Every file and saved link, across all your courses.</p>
      <AddFiles />
      <details className="link-adder">
        <summary>Save a link instead</summary>
        <SaveLinkForm />
      </details>
      {error && <p className="error" role="alert">Your files couldn't be loaded. {error.message}</p>}
      {data && data.materials.length > 0 && (
        <label className="search">Find a file or link<input type="search" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
      )}

      {data && shown.length > 0 && (
        <div className="bulk-bar" role="region" aria-label="Act on several at once">
          <label className="bulk-all">
            <input
              type="checkbox"
              checked={allShownPicked}
              onChange={() => setSelected(allShownPicked ? new Set() : new Set(shown.map((item) => item.id)))}
            />
            {allShownPicked
              ? `All ${shown.length} ${needle ? 'matching your search' : 'in the Library'} selected`
              : `Select all ${shown.length}${needle ? ' matching your search' : ''}`}
          </label>
          <span className="bulk-count" aria-live="polite">{picked.length ? `${picked.length} selected` : 'None selected'}</span>
          {picked.length > 0 && (
            <div className="bulk-actions">
              <button className="button" disabled={busy} onClick={() => void run({ kind: 'pin' }, picked)}>Pin</button>
              <button className="button" disabled={busy} onClick={() => void run({ kind: 'unpin' }, picked)}>Unpin</button>
              <span className="bulk-move">
                <select aria-label="Move to course" value={moveCourse} onChange={(event) => { setMoveCourse(event.target.value); setMoveTopic(''); }}>
                  <option value="">No course</option>
                  {data.courses.filter((course) => course.status === 'active').map((course) => <option key={course.id} value={course.id}>{course.name}</option>)}
                </select>
                {moveCourse && (topics ?? []).length > 0 && (
                  <select aria-label="Move to topic" value={moveTopic} onChange={(event) => setMoveTopic(event.target.value)}>
                    <option value="">No topic</option>
                    {(topics ?? []).map((topic) => <option key={topic.id} value={topic.id}>{topic.name}</option>)}
                  </select>
                )}
                <button className="button" disabled={busy} onClick={() => void run(moveAction(), picked)}>Move</button>
              </span>
              <button className="button" disabled={busy} onClick={() => setConfirming({ kind: 'archive' })}>Put away</button>
              <button className="button danger" disabled={busy} onClick={() => setConfirming({ kind: 'trash' })}>Move to bin</button>
              <button className="text-button" onClick={() => setSelected(new Set())}>Clear</button>
            </div>
          )}
        </div>
      )}
      {outcome && <p className={outcome.partial ? 'error' : 'notice'} role={outcome.partial ? 'alert' : 'status'}>{outcome.text}</p>}

      {data && (shown.length > 0
        ? <MaterialList materials={shown} courses={data.courses} selected={selected} onToggle={toggle} />
        : <p className="muted">{data.materials.length ? 'Nothing matches that search.' : 'Nothing here yet. Add a file or save a link above.'}</p>)}

      {data && data.archived.length > 0 && (
        <details className="put-away">
          <summary>Put away ({data.archived.length})</summary>
          <p className="muted">Kept whole, just out of your way. Put something back to see it in the Library and its course again.</p>
          <ul className="files">
            {data.archived.map((item) => (
              <li key={item.id}>
                <span className="row-main">{item.name}</span>
                <button className="text-button" aria-label={`Put back ${item.name}`} onClick={() => void run({ kind: 'restore' }, [item])}>Put back</button>
              </li>
            ))}
          </ul>
        </details>
      )}

      {confirming && (
        <ConfirmDialog
          title={confirming.kind === 'trash' ? `Move ${picked.length} to the bin?` : `Put away ${picked.length}?`}
          confirmLabel={confirming.kind === 'trash' ? `Move ${picked.length} to the bin` : `Put away ${picked.length}`}
          onCancel={() => setConfirming(null)}
          onConfirm={() => void run(confirming, picked)}
        >
          <p>
            {confirming.kind === 'trash'
              ? 'They stay in the bin, restorable, until you remove them for good. You can also press Undo straight after.'
              : 'They are kept whole and stay searchable, just out of your Library list. You can put them back any time.'}
          </p>
          <ul className="confirm-list">
            {picked.slice(0, 8).map((item) => <li key={item.id}>{item.name}</li>)}
            {picked.length > 8 && <li>and {picked.length - 8} more</li>}
          </ul>
        </ConfirmDialog>
      )}
    </div>
  );
}

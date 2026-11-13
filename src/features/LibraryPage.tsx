import { useMemo, useState } from 'react';
import { AddFiles } from '../components/AddFiles';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { MaterialList } from '../components/MaterialList';
import { SaveLinkForm } from '../components/SaveLinkForm';
import { report, runBulk, type BulkAction } from '../data/bulk';
import { listAllCourses, listMaterials, listTopics } from '../data/store';
import { looseItems, shelfChoices, shelvesOf } from '../data/shelfRules';
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
  const [view, setView] = useState<'all' | 'personal'>('all');
  const [shelfName, setShelfName] = useState('');
  const { data, error } = useLive(async () => {
    const [courses, materials, archived] = await Promise.all([listAllCourses(), listMaterials(), listMaterials('archived')]);
    return { courses, materials, archived };
  });
  const { data: topics } = useLive(() => (moveCourse ? listTopics(moveCourse) : Promise.resolve([])), [moveCourse]);

  const needle = query.trim().toLowerCase();
  const shown = useMemo(() => pinnedFirst(data?.materials.filter((material) =>
    (view === 'all' || (material.shelf ?? '').trim() || !material.courseId)
    && (material.name.toLowerCase().includes(needle) || material.url.toLowerCase().includes(needle) || (material.shelf ?? '').toLowerCase().includes(needle))) ?? []), [data, needle, view]);
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
      <div className="calc-tabs library-views" role="tablist" aria-label="Library view">
        <button type="button" role="tab" className="button" aria-selected={view === 'all'} onClick={() => setView('all')}>Everything</button>
        <button type="button" role="tab" className="button" aria-selected={view === 'personal'} onClick={() => setView('personal')}>Personal library</button>
      </div>
      <p className="muted">{view === 'all'
        ? 'Every file and saved link, across all your courses.'
        : 'Things worth keeping beyond one course, on shelves you name: research papers, career information, writing guides, references. Shelving never copies or moves anything; a shelved item stays in its courses too.'}</p>
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
              <span className="bulk-move">
                <input aria-label="Shelf name" list="shelf-choices" value={shelfName} onChange={(event) => setShelfName(event.target.value)} placeholder="Shelf, e.g. Research papers" maxLength={60} />
                <datalist id="shelf-choices">{shelfChoices(data.materials).map((name) => <option key={name} value={name} />)}</datalist>
                <button className="button" disabled={busy || !shelfName.trim()} onClick={() => void run({ kind: 'shelf', shelf: shelfName.trim() }, picked)}>Put on shelf</button>
                {picked.some((item) => item.shelf) && <button className="button" disabled={busy} onClick={() => void run({ kind: 'shelf', shelf: null }, picked)}>Take off shelf</button>}
              </span>
              <button className="button" disabled={busy} onClick={() => setConfirming({ kind: 'archive' })}>Put away</button>
              <button className="button danger" disabled={busy} onClick={() => setConfirming({ kind: 'trash' })}>Move to Trash</button>
              <button className="text-button" onClick={() => setSelected(new Set())}>Clear</button>
            </div>
          )}
        </div>
      )}
      {outcome && <p className={outcome.partial ? 'error' : 'notice'} role={outcome.partial ? 'alert' : 'status'}>{outcome.text}</p>}

      {data && view === 'all' && (shown.length > 0
        ? <MaterialList materials={shown} courses={data.courses} selected={selected} onToggle={toggle} />
        : <p className="muted">{data.materials.length ? 'Nothing matches that search.' : 'Nothing here yet. Add a file or save a link above.'}</p>)}

      {data && view === 'personal' && (
        <div data-testid="personal-library">
          {shelvesOf(shown).map((shelf) => (
            <section key={shelf.name} className="shelf-group" aria-label={shelf.name}>
              <h2>{shelf.name} <span className="muted small">({shelf.items.length})</span></h2>
              <MaterialList materials={shelf.items} courses={data.courses} selected={selected} onToggle={toggle} />
            </section>
          ))}
          {looseItems(shown).length > 0 && (
            <section className="shelf-group" aria-label="Not in a course or on a shelf">
              <h2>Not in a course or on a shelf <span className="muted small">({looseItems(shown).length})</span></h2>
              <MaterialList materials={looseItems(shown)} courses={data.courses} selected={selected} onToggle={toggle} />
            </section>
          )}
          {shown.length === 0 && (
            <p className="muted">{needle ? 'Nothing on your shelves matches that search.' : 'No shelves yet. Tick files or links (in Everything or here), type a shelf name such as “Research papers”, and press Put on shelf.'}</p>
          )}
        </div>
      )}

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
          title={confirming.kind === 'trash' ? `Move ${picked.length} to Trash?` : `Put away ${picked.length}?`}
          confirmLabel={confirming.kind === 'trash' ? `Move ${picked.length} to Trash` : `Put away ${picked.length}`}
          onCancel={() => setConfirming(null)}
          onConfirm={() => void run(confirming, picked)}
        >
          <p>
            {confirming.kind === 'trash'
              ? 'They stay in Trash, restorable, until you permanently delete them. You can also press Undo straight after.'
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

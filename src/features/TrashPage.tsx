import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { TRASH_KIND_LABEL, trashRows, type Kind, type Row } from '../data/trashRows';
import { useRetention } from '../data/trashPolicy';
import { retentionWords, timeLeftWords } from '../data/trashRules';

const when = (time: number) => (time > 0 ? new Date(time).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '');
import { useLive } from '../data/useLive';

/** Everything moved to Trash, from every part of Study Forge. Nothing here is gone until the student says so. */
export function TrashPage() {
  const { data: rows, error } = useLive(trashRows);
  const [kind, setKind] = useState<'all' | Kind>('all');
  const [query, setQuery] = useState('');
  const [doomed, setDoomed] = useState<Row | 'all' | null>(null);
  const [message, setMessage] = useState('');
  const policy = useRetention();

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
      {/* The rule in force, where a student looking at their Trash will actually see it, with one tap to change it. */}
      <p className="muted small trash-policy" data-testid="trash-policy">
        {retentionWords(policy)} <Link to="/settings/account">Change this</Link>
      </p>
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
                    <span className="muted small">{TRASH_KIND_LABEL[row.kind]} · from {row.from}{row.deletedAt ? ` · deleted ${when(row.deletedAt)}` : ''}{(() => { const left = timeLeftWords(row.deletedAt, policy, Date.now()); return left ? ` · ${left}` : ''; })()}</span>
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

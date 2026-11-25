import { useMemo, useState } from 'react';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { useLive } from '../data/useLive';
import { setRetention, useRetention } from '../data/trashPolicy';
import { RETENTION_CHOICES, RECOMMENDED, dueAtOnce, retentionWords, type Retention } from '../data/trashRules';
import { trashRows } from '../data/trashRows';

/**
 * How long Trash keeps things.
 *
 * Choosing a shorter time can mean something goes immediately, so this works out exactly what
 * would go and names it before anything happens. Nothing is deleted from this screen: the choice
 * is saved, and the sweep happens the next time Study Forge opens. The wording says that rather
 * than promising a time it cannot keep, because there is no server here to do it while the app is
 * closed.
 */
export function TrashKeepSection() {
  const chosen = useRetention();
  const { data: rows } = useLive(trashRows);
  const [asking, setAsking] = useState<Retention | null>(null);

  const atRisk = useMemo(() => (asking === null || !rows ? [] : dueAtOnce(rows, asking, Date.now())), [asking, rows]);

  const choose = (value: Retention) => {
    const now = Date.now();
    const would = rows ? dueAtOnce(rows, value, now) : [];
    if (would.length > 0) setAsking(value);
    else setRetention(value);
  };

  return (
    <section aria-labelledby="keep-heading">
      <h2 id="keep-heading">Automatically delete items from Trash after</h2>
      <div className="tool-choices" data-testid="setting-retention">
        {RETENTION_CHOICES.map((choice) => (
          <label key={String(choice.value)} className="check-line">
            <input
              type="radio"
              name="trash-retention"
              checked={chosen === choice.value}
              onChange={() => choose(choice.value)}
            />
            {choice.label}{choice.value === RECOMMENDED ? ' (recommended)' : ''}
          </label>
        ))}
      </div>
      <p className="muted small" data-testid="retention-effect">{retentionWords(chosen)}</p>
      <p className="muted small">
        Study Forge has no server doing this while it is closed, so anything past its date is deleted the next
        time you open Study Forge. Restoring something stops it; putting it back in Trash starts the time again.
      </p>
      {asking !== null && (
        <ConfirmDialog
          title="This would delete things now"
          confirmLabel="Delete them and save this"
          onCancel={() => setAsking(null)}
          onConfirm={() => { const value = asking; setAsking(null); setRetention(value); }}
        >
          <p>
            {atRisk.length === 1 ? 'One thing in your Trash is' : `${atRisk.length} things in your Trash are`} already older than that,
            so {atRisk.length === 1 ? 'it' : 'they'} would be deleted for good the next time Study Forge opens. This can’t be undone.
          </p>
          <ul>
            {atRisk.slice(0, 8).map((row) => <li key={row.key}>{row.name}</li>)}
            {atRisk.length > 8 && <li className="muted">and {atRisk.length - 8} more</li>}
          </ul>
          <p className="muted">Restore anything you want to keep from Trash first, then come back.</p>
        </ConfirmDialog>
      )}
    </section>
  );
}

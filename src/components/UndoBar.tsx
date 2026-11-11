import { useEffect, useRef, useState } from 'react';
import { lastAction, undoLast, watchUndo, type UndoAction } from '../data/undo';

/**
 * Offers to put the last change back. It appears only when there is something to undo, says what
 * it would reverse, and gets out of the way once the student dismisses it or moves on.
 */
export function UndoBar() {
  const [action, setAction] = useState<UndoAction | null>(null);
  const [dismissed, setDismissed] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const read = () => setAction(lastAction());
    read();
    return watchUndo(read);
  }, []);
  // A new change clears the last outcome. Undoing one does not, or the result of pressing Undo
  // would be wiped out by the very change it made to the stack.
  const shown = useRef<string | null>(null);
  useEffect(() => {
    if (action && action.id !== shown.current) setMessage('');
    if (action) shown.current = action.id;
  }, [action]);

  const run = async () => {
    setBusy(true);
    const result = await undoLast();
    setMessage(result.message);
    setBusy(false);
  };

  if (!action || action.id === dismissed) {
    return message ? <p className="undo-bar" role="status">{message}</p> : null;
  }
  return (
    <div className="undo-bar" role="status">
      <span>{action.label}.</span>
      <button className="button" onClick={() => void run()} disabled={busy}>{busy ? 'Undoing…' : 'Undo'}</button>
      <button className="icon-button" aria-label="Dismiss" title="Dismiss" onClick={() => setDismissed(action.id)}>×</button>
    </div>
  );
}

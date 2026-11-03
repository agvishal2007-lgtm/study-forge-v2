import { useEffect, useRef, type ReactNode } from 'react';

interface Props {
  title: string;
  children: ReactNode;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Destructive actions always pass through here, and focus starts on Cancel. */
export function ConfirmDialog({ title, children, confirmLabel, onConfirm, onCancel }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);
  return (
    <dialog ref={ref} className="dialog" aria-labelledby="dialog-title" onCancel={onCancel}>
      <h2 id="dialog-title">{title}</h2>
      <div>{children}</div>
      <div className="dialog-actions">
        <button className="button" autoFocus onClick={onCancel}>Cancel</button>
        <button className="button danger" onClick={onConfirm}>{confirmLabel}</button>
      </div>
    </dialog>
  );
}

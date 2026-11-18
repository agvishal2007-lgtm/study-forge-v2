import { useEffect, useState } from 'react';

/**
 * A checkbox that moves the moment it is tapped, with the save following.
 *
 * Everything in Study Forge saves to this device's database and then on to the student's other
 * devices, which takes a moment. A box driven straight from what is stored springs back while that
 * happens, and a box that springs back looks exactly like a tap that was missed — the single most
 * common complaint there has been about this app. So the shown state leads, the save follows, and
 * a save that genuinely fails puts the box back where it was and says so rather than losing the
 * change quietly.
 */
export function InstantCheck({
  checked,
  label,
  children,
  onSet,
  testId,
}: {
  checked: boolean;
  label: string;
  children?: React.ReactNode;
  onSet: (value: boolean) => Promise<unknown>;
  testId?: string;
}) {
  const [pending, setPending] = useState<boolean | null>(null);
  const [failure, setFailure] = useState('');
  const shown = pending ?? checked;
  // Once what is stored agrees with what was shown, there is nothing left to hold on to.
  useEffect(() => { if (pending !== null && pending === checked) setPending(null); }, [pending, checked]);

  return (
    <>
      <label className="check-line">
        <input
          type="checkbox"
          checked={shown}
          aria-label={label}
          data-testid={testId}
          onChange={(event) => {
            const wanted = event.target.checked;
            setFailure('');
            setPending(wanted);
            void Promise.resolve(onSet(wanted)).catch((error: Error) => {
              setPending(null);
              setFailure(`That wasn't saved, so it's back as it was. ${error.message}`);
            });
          }}
        />
        {children ?? label}
      </label>
      {failure && <p className="error small" role="alert">{failure}</p>}
    </>
  );
}

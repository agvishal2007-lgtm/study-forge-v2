import { useEffect, useState } from 'react';
import { ACCESS_LABEL, describeAccess, readAccess, watchAccess, type DeviceAccess } from '../data/permissions';

const THINGS = [
  { name: 'microphone' as const, title: 'Microphone', thing: 'microphone', usedFor: 'Recording a lecture in person, and your own questions during a virtual one.' },
  { name: 'camera' as const, title: 'Camera', thing: 'camera', usedFor: 'Nothing yet. Study Forge has never asked for it.' },
  { name: 'notifications' as const, title: 'Notifications', thing: 'notifications', usedFor: 'Nothing yet. Reminders would use it, once they exist.' },
];

const NOTIFY_LABEL: Record<DeviceAccess, string> = { granted: 'Allowed', denied: 'Blocked', prompt: 'Not yet enabled', unknown: 'Unsupported' };

/** Where this browser keeps the switch, once it has been blocked. A site can't flip it back itself. */
function unblockSteps(): string {
  const agent = navigator.userAgent;
  if (/iPhone|iPad/.test(agent)) return 'On iPhone or iPad, notifications work once Study Forge is added to your Home Screen. Then open Settings, Notifications, Study Forge, and turn on Allow Notifications.';
  if (/Android/.test(agent)) return 'Tap the icon at the left of the address bar, then Permissions, then Notifications, and choose Allow. Then come back here.';
  if (/Firefox/.test(agent)) return 'Click the icon at the left of the address bar, find Send notifications, and remove the Blocked setting. Then tap this again.';
  if (/Safari/.test(agent) && !/Chrome|Edg/.test(agent)) return 'In Safari, open Settings, Websites, Notifications, and set this site to Allow. Then come back here.';
  return 'Click the icon at the left of the address bar, then turn Notifications on (or choose Reset permission). Then come back here.';
}

/** The status is the control: tapping it asks the browser, or shows how to unblock. */
function NotificationControl({ state, onChange }: { state: DeviceAccess; onChange: (next: DeviceAccess) => void }) {
  const [help, setHelp] = useState('');
  const supported = typeof Notification !== 'undefined';
  const read = (): DeviceAccess => (!supported ? 'unknown' : Notification.permission === 'default' ? 'prompt' : Notification.permission === 'granted' ? 'granted' : 'denied');
  // Coming back from the browser's settings shows the new answer without a reload.
  useEffect(() => {
    const refresh = () => { const next = read(); onChange(next); if (next === 'granted') setHelp(''); };
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => { window.removeEventListener('focus', refresh); document.removeEventListener('visibilitychange', refresh); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const shown: DeviceAccess = supported ? state : 'unknown';
  const press = async () => {
    const now = read();
    if (now === 'prompt') {
      try { await Notification.requestPermission(); } catch { /* the browser declined to ask */ }
      const next = read();
      onChange(next);
      setHelp(next === 'granted' ? '' : next === 'denied' ? unblockSteps() : 'Your browser closed the question without an answer. Tap again to be asked.');
    } else if (now === 'denied') {
      onChange('denied');
      setHelp(help ? '' : unblockSteps());
    } else if (now === 'granted') {
      onChange('granted');
      setHelp(help ? '' : 'Notifications are allowed. To turn them off, use the icon at the left of the address bar.');
    }
  };
  const words = shown === 'granted' ? 'Your browser allows notifications from Study Forge.'
    : shown === 'denied' ? 'Your browser is blocking notifications for this site. Tap Blocked to see how to turn them on.'
      : shown === 'prompt' ? 'Tap Not yet enabled and your browser will ask.' : "This browser doesn't support notifications for websites.";
  return (
    <>
      <button
        type="button"
        className="status-tag status-button"
        data-testid="notification-control"
        data-state={shown}
        data-status={shown === 'granted' ? 'done' : shown === 'denied' ? 'overdue' : shown === 'prompt' ? 'todo' : 'none'}
        disabled={!supported}
        aria-label={`Notifications: ${NOTIFY_LABEL[shown]}${shown === 'prompt' ? '. Tap to turn on' : shown === 'denied' ? '. Tap to see how to turn on' : ''}`}
        onClick={() => void press()}
      >
        <span aria-hidden="true">{shown === 'granted' ? '✓' : shown === 'denied' ? '✕' : shown === 'prompt' ? '○' : '–'}</span>{NOTIFY_LABEL[shown]}
      </button>
      <span className="muted small permission-wide">{words}</span>
      {help && <span className="notice permission-wide" role="status" data-testid="notification-help">{help}</span>}
    </>
  );
}

/**
 * One place to see what the browser has decided. These are the browser's switches, not Study Forge's,
 * and the wording says so — a site that pretends otherwise just sends students hunting in the wrong menu.
 */
export function PermissionsSection() {
  const [states, setStates] = useState<Record<string, DeviceAccess>>({});

  useEffect(() => {
    let live = true;
    const stops: (() => void)[] = [];
    for (const { name } of THINGS) {
      void readAccess(name).then((state) => { if (live) setStates((all) => ({ ...all, [name]: state })); });
      stops.push(watchAccess(name, (state) => { if (live) setStates((all) => ({ ...all, [name]: state })); }));
    }
    return () => {
      live = false;
      for (const stop of stops) stop();
    };
  }, []);

  return (
    <section aria-labelledby="permissions-heading" data-testid="permissions">
      <h2 id="permissions-heading">Device permissions</h2>
      <p className="muted">
        These belong to your browser, not to Study Forge. Study Forge asks once, when you start something that needs
        one, and never asks again on its own. It can't grant or revoke anything from here, but you can tap the Notifications status to have your browser ask, or to see how to unblock it.
      </p>
      <ul className="plain-list permission-list">
        {THINGS.map(({ name, title, thing, usedFor }) => {
          const state = states[name] ?? 'unknown';
          return (
            <li key={name} data-testid={`permission-${name}`}>
              <span className="permission-head">
                <b>{title}</b>
                {name === 'notifications' ? (
                  <NotificationControl state={state} onChange={(next) => setStates((all) => ({ ...all, notifications: next }))} />
                ) : (
                  <span className="status-tag" data-status={state === 'granted' ? 'done' : state === 'denied' ? 'overdue' : 'todo'}>
                    {ACCESS_LABEL[state]}
                  </span>
                )}
              </span>
              {name !== 'notifications' && <span className="muted small">{describeAccess(state, thing)}</span>}
              <span className="muted small">Used for: {usedFor}</span>
            </li>
          );
        })}
      </ul>
      <p className="muted small">
        Sharing your screen is different: browsers make you choose the window or tab every time, for your safety, so
        that one can't be remembered.
      </p>
    </section>
  );
}

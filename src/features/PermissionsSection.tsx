import { currentBrowser } from '../data/browser';
import { unblockNotificationSteps } from '../data/browserRules';
import { useEffect, useState } from 'react';
import { ACCESS_LABEL, describeAccess, readAccess, watchAccess, type DeviceAccess } from '../data/permissions';

const THINGS = [
  { name: 'microphone' as const, title: 'Microphone', thing: 'microphone', usedFor: 'Recording a lecture in person, and your own questions during a virtual one.' },
  { name: 'camera' as const, title: 'Camera', thing: 'camera', usedFor: 'Nothing yet. Study Forge has never asked for it.' },
  { name: 'notifications' as const, title: 'Notifications', thing: 'notifications', usedFor: 'Nothing yet. Reminders would use it, once they exist.' },
];

const NOTIFY_LABEL: Record<DeviceAccess, string> = { granted: 'Allowed', denied: 'Blocked', prompt: 'Not yet enabled', unknown: 'Unsupported' };
const APPLE_LABEL = 'Add to Home Screen first';

/** Where this browser keeps the switch, once it has been blocked. A site can't flip it back itself. */
function unblockSteps(): string {
  return unblockNotificationSteps(currentBrowser(), /Android/.test(navigator.userAgent), /Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints <= 1);
}

/** iPhone or iPad in an ordinary browser tab, where Apple only allows notifications from the Home Screen. */
function appleTab(): boolean {
  const apple = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const fromHomeScreen = window.matchMedia?.('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return apple && !fromHomeScreen;
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
      : shown === 'prompt' ? 'Tap Not yet enabled and your browser will ask.'
        : appleTab() ? 'On iPhone and iPad, websites can only send notifications once added to the Home Screen. In Safari, tap Share, then Add to Home Screen, then open Study Forge from that icon and come back here.'
          : "This browser doesn't support notifications for websites.";
  return (
    <>
      <button
        type="button"
        className="status-tag status-button"
        data-testid="notification-control"
        data-state={shown}
        data-status={shown === 'granted' ? 'done' : shown === 'denied' ? 'overdue' : shown === 'prompt' ? 'todo' : 'none'}
        disabled={!supported}
        aria-label={`Notifications: ${shown === 'unknown' && appleTab() ? APPLE_LABEL : NOTIFY_LABEL[shown]}${shown === 'prompt' ? '. Tap to turn on' : shown === 'denied' ? '. Tap to see how to turn on' : ''}`}
        onClick={() => void press()}
      >
        <span aria-hidden="true">{shown === 'granted' ? '✓' : shown === 'denied' ? '✕' : shown === 'prompt' ? '○' : '–'}</span>{shown === 'unknown' && appleTab() ? APPLE_LABEL : NOTIFY_LABEL[shown]}
      </button>
      <span className="muted small permission-wide">{words}</span>
      {shown === 'granted' && (
        <button type="button" className="text-button permission-wide" data-testid="notification-test" onClick={() => {
          try {
            new Notification('Study Forge', { body: 'Notifications are working.' });
            setHelp(/Macintosh/.test(navigator.userAgent)
              ? "A test was sent. If nothing appeared, your Mac may be blocking this browser's notifications: open System Settings, Notifications, choose your browser, and turn on Allow notifications."
              : 'A test was sent. If nothing appeared, check your device\'s notification settings for this browser, and that Do Not Disturb or Focus is off.');
          } catch {
            setHelp("This browser allows notifications but couldn't show one from here. Try again from Study Forge installed as an app.");
          }
        }}>Send a test notification</button>
      )}
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

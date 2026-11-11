import { useEffect, useState } from 'react';
import { ACCESS_LABEL, describeAccess, readAccess, watchAccess, type DeviceAccess } from '../data/permissions';

const THINGS = [
  { name: 'microphone' as const, title: 'Microphone', thing: 'microphone', usedFor: 'Recording a lecture in person, and your own questions during a virtual one.' },
  { name: 'camera' as const, title: 'Camera', thing: 'camera', usedFor: 'Nothing yet. Study Forge has never asked for it.' },
  { name: 'notifications' as const, title: 'Notifications', thing: 'notifications', usedFor: 'Nothing yet. Reminders would use it, once they exist.' },
];

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
        one, and never asks again on its own. It can't grant or revoke anything from here.
      </p>
      <ul className="plain-list permission-list">
        {THINGS.map(({ name, title, thing, usedFor }) => {
          const state = states[name] ?? 'unknown';
          return (
            <li key={name} data-testid={`permission-${name}`}>
              <span className="permission-head">
                <b>{title}</b>
                <span className="status-tag" data-status={state === 'granted' ? 'done' : state === 'denied' ? 'overdue' : 'todo'}>
                  {ACCESS_LABEL[state]}
                </span>
              </span>
              <span className="muted small">{describeAccess(state, thing)}</span>
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

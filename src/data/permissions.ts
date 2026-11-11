/**
 * What the browser has actually decided about a device permission.
 *
 * Study Forge never asks for anything twice on its own, and never pretends to control these.
 * A permission belongs to the browser: the site can ask once, when the student starts something
 * that needs it, and must then live with the answer. "unknown" is honest — some browsers won't say.
 */

export type DeviceAccess = 'granted' | 'denied' | 'prompt' | 'unknown';

export const ACCESS_LABEL: Record<DeviceAccess, string> = {
  granted: 'Allowed',
  denied: 'Blocked',
  prompt: 'Will ask when needed',
  unknown: "Your browser won't say",
};

/** Student-facing wording. It always points at the browser, because that is where the switch is. */
export function describeAccess(state: DeviceAccess, thing: string): string {
  if (state === 'granted') return `Your browser allows Study Forge to use your ${thing}. You won't be asked again unless you change it.`;
  if (state === 'denied') return `Your browser is blocking the ${thing} for this site. Study Forge can't ask again — turn it back on in your browser's site settings for this page.`;
  if (state === 'prompt') return `Your browser will ask the first time you start something that needs the ${thing}.`;
  return `This browser won't tell a site whether the ${thing} is allowed. You'll find out when you first use it.`;
}

type Named = 'microphone' | 'camera' | 'notifications';

/** Reads the browser's current answer. Never throws, and never asks for anything. */
export async function readAccess(name: Named): Promise<DeviceAccess> {
  if (name === 'notifications' && typeof Notification !== 'undefined') {
    const current = Notification.permission;
    return current === 'default' ? 'prompt' : current === 'granted' ? 'granted' : 'denied';
  }
  try {
    const query = navigator.permissions?.query;
    if (!query) return 'unknown';
    const status = await navigator.permissions.query({ name: name as PermissionName });
    return status.state as DeviceAccess;
  } catch {
    // Firefox and Safari refuse some of these outright. Not knowing is a fine answer.
    return 'unknown';
  }
}

/** Follows a permission while the page is open, so a change in browser settings shows up here. */
export function watchAccess(name: Named, onChange: (state: DeviceAccess) => void): () => void {
  let stop = () => {};
  void (async () => {
    try {
      if (name === 'notifications' || !navigator.permissions?.query) return;
      const status = await navigator.permissions.query({ name: name as PermissionName });
      const listener = () => onChange(status.state as DeviceAccess);
      status.addEventListener('change', listener);
      stop = () => status.removeEventListener('change', listener);
    } catch {
      // Nothing to follow; the state simply stays as first read.
    }
  })();
  return () => stop();
}

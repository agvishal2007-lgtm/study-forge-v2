/*
 * Which browser the student is using, so instructions name the real menus. Detection is only ever
 * used for wording; features are always checked directly, never guessed from the browser's name.
 * Pure, so it can be tested with any browser's details.
 */

export type BrowserName = 'arc' | 'brave' | 'edge' | 'opera' | 'vivaldi' | 'samsung' | 'chrome' | 'firefox' | 'safari' | 'ios' | 'other';

export interface BrowserClues {
  userAgent: string;
  /** Arc adds its colour palette to every page as CSS variables. */
  arcPalette?: boolean;
  /** Brave says so through navigator.brave. */
  isBrave?: boolean;
  touchMac?: boolean;
}

export function detectBrowser(clues: BrowserClues): BrowserName {
  const agent = clues.userAgent;
  if (/iPhone|iPad|iPod/.test(agent) || clues.touchMac) return 'ios';
  if (clues.arcPalette) return 'arc';
  if (clues.isBrave) return 'brave';
  if (/Edg\//.test(agent)) return 'edge';
  if (/OPR\/|Opera/.test(agent)) return 'opera';
  if (/Vivaldi/.test(agent)) return 'vivaldi';
  if (/SamsungBrowser/.test(agent)) return 'samsung';
  if (/Firefox\//.test(agent)) return 'firefox';
  if (/Chrome\//.test(agent)) return 'chrome';
  if (/Safari\//.test(agent)) return 'safari';
  return 'other';
}

export const BROWSER_LABEL: Record<BrowserName, string> = {
  arc: 'Arc', brave: 'Brave', edge: 'Microsoft Edge', opera: 'Opera', vivaldi: 'Vivaldi', samsung: 'Samsung Internet',
  chrome: 'Chrome', firefox: 'Firefox', safari: 'Safari', ios: 'your iPhone or iPad browser', other: 'this browser',
};

/** Browsers built on Chrome's engine, which can all record a tab's sound. */
export const CHROMIUM: BrowserName[] = ['arc', 'brave', 'edge', 'opera', 'vivaldi', 'samsung', 'chrome'];

/** How to turn notifications back on once a browser has blocked them for this site. */
export function unblockNotificationSteps(browser: BrowserName, android: boolean, mac: boolean): string {
  const macTip = mac ? ` If it then says Allowed but nothing appears, open your Mac's System Settings, Notifications, ${browser === 'safari' ? 'Safari' : BROWSER_LABEL[browser]}, and turn on Allow notifications.` : '';
  switch (browser) {
    case 'ios':
      return 'On iPhone or iPad, notifications work once Study Forge is added to your Home Screen. Then open Settings, Notifications, Study Forge, and turn on Allow Notifications.';
    case 'arc':
      return `In Arc, open the address bar (Cmd+L), type arc://settings/content/notifications and press Enter. If that page doesn't open, type chrome://settings/content/notifications instead. Find this site under Not allowed to send notifications and change it to Allow. Arc also asks your Mac: open System Settings, Notifications, Arc, and turn on Allow notifications. Then come back here.`;
    case 'brave':
      return `In Brave, click the icon at the left of the address bar, then Site settings, and set Notifications to Allow. Or type brave://settings/content/notifications in the address bar. Then come back here.${macTip}`;
    case 'edge':
      return `In Edge, click the lock icon at the left of the address bar, then Permissions for this site, and set Notifications to Allow. Or type edge://settings/content/notifications. Then come back here.${macTip}`;
    case 'opera':
      return `In Opera, click the lock icon at the left of the address bar, then Site settings, and set Notifications to Allow. Or type opera://settings/content/notifications. Then come back here.${macTip}`;
    case 'vivaldi':
      return `In Vivaldi, click the icon at the left of the address bar and set Notifications to Allow. Or type vivaldi://settings/content/notifications. Then come back here.${macTip}`;
    case 'samsung':
      return 'In Samsung Internet, open the menu, Settings, Sites and downloads, Notifications, and allow this site. Then come back here.';
    case 'firefox':
      return `In Firefox, click the icon at the left of the address bar, find Send notifications, and remove the Blocked setting. Then tap this again.${macTip}`;
    case 'safari':
      return `In Safari, open Settings, Websites, Notifications, and set this site to Allow. Then come back here.${macTip}`;
    case 'chrome':
      return android
        ? 'Tap the icon at the left of the address bar, then Permissions, then Notifications, and choose Allow. Then come back here.'
        : `In Chrome, click the icon at the left of the address bar, then turn Notifications on (or choose Reset permission). Or type chrome://settings/content/notifications. Then come back here.${macTip}`;
    default:
      return android
        ? 'Tap the icon at the left of the address bar, then Permissions, then Notifications, and choose Allow. Then come back here.'
        : `Click the icon at the left of the address bar, then turn Notifications on for this site. Then come back here.${macTip}`;
  }
}

/** The settings page for notifications, in browsers that have one you can type in. */
export function notificationSettingsPage(browser: BrowserName): string | null {
  const scheme: Partial<Record<BrowserName, string>> = { arc: 'arc', brave: 'brave', edge: 'edge', opera: 'opera', vivaldi: 'vivaldi', chrome: 'chrome' };
  return scheme[browser] ? `${scheme[browser]}://settings/content/notifications` : null;
}

/**
 * When the browser closes its question without an answer. Chrome-based browsers do this on
 * purpose after a site's question was dismissed a few times: they ask quietly with a bell in the
 * address bar, or not at all for a while. Allowing the site directly always works.
 */
export function quietPromptSteps(browser: BrowserName, origin: string): string {
  const page = notificationSettingsPage(browser);
  const direct = page
    ? ` Or allow it directly: type ${page} in the address bar, click Add next to Allowed to send notifications, paste ${origin}, and click Add.`
    : '';
  return `Your browser closed the question without showing it. Look for a small bell in the address bar and choose Allow, or tap again to be asked.${direct}`;
}

/** When an extension has taken over the notification setting, so neither the browser nor this site can change it. */
export function extensionBlockSteps(browser: BrowserName): string {
  const page = browser === 'arc' ? 'arc://extensions' : browser === 'edge' ? 'edge://extensions' : browser === 'brave' ? 'brave://extensions' : 'your browser\'s extensions page';
  return `If your browser says this setting is controlled by an extension, one of your extensions is blocking notifications. Pop-up blockers, ad blockers and security extensions are the usual cause. Open ${page}, switch them off one at a time (restarting the browser after each), and when notifications work, look in that extension\'s settings for an option like block notification requests.`;
}

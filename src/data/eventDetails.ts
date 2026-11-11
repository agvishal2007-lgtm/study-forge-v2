// Everything useful inside one Google Calendar event, read from every place Google keeps it.
// Pure, so it can be tested with real event shapes. Nothing is invented: a field Google didn't
// send stays empty, and no meeting link is ever built from a meeting ID.
import { categorize, LINK_CATEGORY_LABEL, siteOf, tidyUrl } from './linkRules.ts';

export type MeetingProvider = 'zoom' | 'meet' | 'teams' | 'webex' | 'other';

export const PROVIDER_ACTION: Record<MeetingProvider, string> = {
  zoom: 'Join Zoom meeting',
  meet: 'Join Google Meet',
  teams: 'Join Microsoft Teams meeting',
  webex: 'Join Webex meeting',
  other: 'Join online meeting',
};

export interface Meeting {
  provider: MeetingProvider;
  url: string;
  /** Dial-in numbers, meeting IDs and passcodes as Google gave them, for anyone who can't click. */
  extras: string[];
}

export interface EventLink {
  url: string;
  /** What it is, when that can be told reliably: "Canvas", "Google Doc", or the site's name. */
  label: string;
  /** Where it was found, so nothing looks more official than it is. */
  from: 'description' | 'location';
}

export interface EventAttachment {
  title: string;
  url: string;
}

export interface EventDetails {
  /** The description as readable text: Google sends HTML, and none of it is ever run. */
  notes: string;
  /** A real place, with any web address taken out. Empty when the location was only a link. */
  place: string;
  meeting: Meeting | null;
  /** Meeting links beyond the main one, when an event carries more than one. */
  otherMeetings: Meeting[];
  links: EventLink[];
  attachments: EventAttachment[];
  organizer: string;
  timeZone: string;
  /** The event itself in Google Calendar. */
  googleUrl: string;
}

export const EMPTY_DETAILS: EventDetails = {
  notes: '', place: '', meeting: null, otherMeetings: [], links: [], attachments: [], organizer: '', timeZone: '', googleUrl: '',
};

/** Which meeting service a link belongs to, or null if it isn't a meeting link. */
export function meetingProvider(url: string): MeetingProvider | null {
  let host: string;
  let path: string;
  try {
    const parsed = new URL(url);
    host = parsed.hostname.toLowerCase();
    path = parsed.pathname;
  } catch {
    return null;
  }
  const on = (domain: string) => host === domain || host.endsWith(`.${domain}`);
  if ((on('zoom.us') || on('zoomgov.com')) && /^\/(j|my|w|s|wc)\//.test(path)) return 'zoom';
  if (host === 'meet.google.com' && path.length > 1) return 'meet';
  if ((on('teams.microsoft.com') || on('teams.live.com')) && /meet|l\/meetup-join/i.test(path)) return 'teams';
  if (on('webex.com') && /\/(meet|join|j\.php|wbxmjs|m)\b|\/[^/]+\/j\.php/i.test(path)) return 'webex';
  if (on('gotomeeting.com') || on('goto.com') && /\/join/.test(path) || on('bluejeans.com') || on('whereby.com') || on('chime.aws')) return 'other';
  return null;
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
const decode = (text: string) => text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, code: string) => {
  if (code[0] === '#') {
    const value = code[1].toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
    return Number.isFinite(value) ? String.fromCodePoint(value) : whole;
  }
  return ENTITIES[code.toLowerCase()] ?? whole;
});

/** Google's description is HTML. This turns it into plain lines without running or showing any of it. */
export function plainText(html: string): string {
  return decode(html
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<\s*\/\s*(p|div|li|h[1-6]|tr)\s*>/gi, '\n')
    .replace(/<\s*li[^>]*>/gi, '• ')
    .replace(/<[^>]*>/g, ''))
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Every web address in some text, in the order it appears, including ones only present as a link's target. */
function urlsIn(text: string): string[] {
  const found: string[] = [];
  for (const match of text.matchAll(/href\s*=\s*["']([^"']+)["']|https?:\/\/[^\s<>"')\]]+/gi)) {
    found.push(match[1] !== undefined ? decode(match[1]) : decode(match[0]).replace(/[.,;:!?]+$/, ''));
  }
  return found;
}

/** Two spellings of the same address count once: no trailing slash, case-insensitive host. */
const sameKey = (url: string) => {
  try {
    const parsed = new URL(url);
    return `${parsed.protocol}//${parsed.host.toLowerCase()}${parsed.pathname.replace(/\/$/, '')}${parsed.search}`;
  } catch {
    return url;
  }
};

/** A name for a link only where it can be told reliably; otherwise the site it goes to. */
function labelFor(url: string): string {
  const site = siteOf(url);
  if (/docs\.google\.com\/document/.test(url)) return 'Google Doc';
  if (/docs\.google\.com\/spreadsheets/.test(url)) return 'Google Sheet';
  if (/docs\.google\.com\/presentation/.test(url)) return 'Google Slides';
  if (/drive\.google\.com/.test(url)) return 'Google Drive';
  if (/instructure\.com|canvas\./.test(site)) return 'Canvas';
  const category = categorize(url);
  return category === 'other' ? site : `${LINK_CATEGORY_LABEL[category]}: ${site}`;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export function readEventDetails(raw: any): EventDetails {
  const seen = new Set<string>();
  const take = (candidate: string): string | null => {
    const url = tidyUrl(candidate);
    if (!url || !/^https?:/i.test(url)) return null;
    const key = sameKey(url);
    if (seen.has(key)) return null;
    seen.add(key);
    return url;
  };

  const meetings: Meeting[] = [];
  // 1. Google's own record of the meeting: the most reliable place, used by Meet and by the Zoom
  //    and Teams add-ons. Phone numbers and passcodes come with it.
  const entryPoints: any[] = Array.isArray(raw?.conferenceData?.entryPoints) ? raw.conferenceData.entryPoints : [];
  const video = entryPoints.find((entry) => entry?.entryPointType === 'video' && typeof entry.uri === 'string');
  if (video) {
    const url = take(video.uri);
    if (url) {
      const extras: string[] = [];
      for (const entry of entryPoints) {
        if (entry === video) continue;
        if (entry?.entryPointType === 'phone' && entry.label) extras.push(`Phone: ${entry.label}${entry.pin ? `, PIN ${entry.pin}` : ''}`);
      }
      if (video.meetingCode) extras.push(`Meeting ID: ${video.meetingCode}`);
      if (video.passcode || video.password) extras.push(`Passcode: ${video.passcode ?? video.password}`);
      meetings.push({ provider: meetingProvider(url) ?? (raw.conferenceData?.conferenceSolution?.key?.type === 'hangoutsMeet' ? 'meet' : 'other'), url, extras });
    }
  }
  // 2. The older Meet field.
  if (typeof raw?.hangoutLink === 'string') {
    const url = take(raw.hangoutLink);
    if (url) meetings.push({ provider: 'meet', url, extras: [] });
  }

  const location = String(raw?.location ?? '');
  const description = String(raw?.description ?? '');
  const links: EventLink[] = [];
  // 3. Links typed into the location, then the description: meeting links join the meetings,
  //    everything else is kept as a link. Nothing is dropped for not being Zoom or Meet.
  for (const [text, from] of [[location, 'location'], [description, 'description']] as const) {
    for (const candidate of urlsIn(text)) {
      const url = take(candidate);
      if (!url) continue;
      const provider = meetingProvider(url);
      if (provider) meetings.push({ provider, url, extras: [] });
      else links.push({ url, label: labelFor(url), from });
    }
  }

  // 4. Files attached to the event. Their links are kept; whether they open depends on the
  //    student's own access to them, which isn't assumed.
  const attachments: EventAttachment[] = (Array.isArray(raw?.attachments) ? raw.attachments : [])
    .filter((file: any) => typeof file?.fileUrl === 'string')
    .flatMap((file: any) => {
      const url = take(file.fileUrl);
      return url ? [{ title: String(file.title || siteOf(url)), url }] : [];
    });

  // A location that was only a web address is not a place.
  const place = location.replace(/https?:\/\/\S+/gi, '').replace(/^[\s,;:-]+|[\s,;:-]+$/g, '').trim();
  const organizer = raw?.organizer?.displayName || (raw?.organizer?.self ? '' : raw?.organizer?.email) || '';

  return {
    notes: plainText(description),
    place,
    meeting: meetings[0] ?? null,
    otherMeetings: meetings.slice(1),
    links,
    attachments,
    organizer: String(organizer),
    timeZone: String(raw?.start?.timeZone ?? ''),
    googleUrl: typeof raw?.htmlLink === 'string' && /^https:\/\/www\.google\.com\/calendar\//.test(raw.htmlLink) ? raw.htmlLink : '',
  };
}

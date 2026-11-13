/**
 * Saving a link is not the same as uploading a file. These pure rules decide whether a link is safe
 * to save, what kind of thing it points at, and what to call it, so the student can find it later.
 */

export const LINK_CATEGORIES = ['textbook', 'research', 'portal', 'cloud', 'video', 'reference', 'other'] as const;
export type LinkCategory = (typeof LINK_CATEGORIES)[number];

export const LINK_CATEGORY_LABEL: Record<LinkCategory, string> = {
  textbook: 'Online textbook',
  research: 'Research',
  portal: 'School portal',
  cloud: 'Cloud document',
  video: 'Video',
  reference: 'Reference',
  other: 'Other',
};

/**
 * Only ordinary web addresses are saved. Anything else — a script, a file on the device, a mail
 * link — is refused, because those can do things a saved link should never do.
 */
export function tidyUrl(raw: string): string | null {
  const text = raw.trim();
  if (!text) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(text) ? text : `https://${text}`;
  let parsed: URL;
  try {
    parsed = new URL(withScheme);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
  if (!parsed.hostname.includes('.')) return null;
  return parsed.toString();
}

const HOSTS: { category: LinkCategory; match: (host: string, url: string) => boolean }[] = [
  // Paid course textbooks and homework platforms, checked first so wiley.com research doesn't catch WileyPLUS.
  { category: 'textbook', match: (host) => /(^|\.)(mheducation\.com|mcgrawhill\.com|aleks\.com|pearson\.com|pearsoned\.com|pearsonmylabandmastering\.com|mylabmastering\.com|masteringchemistry\.com|cengage\.com|cengagenow\.com|cengagebrain\.com|aplia\.com|webassign\.net|wileyplus\.com|macmillanlearning\.com|vitalsource\.com|redshelf\.com|zybooks\.com|perusall\.com|kortext\.com|openstax\.org|bartleby\.com)$/.test(host) || host === 'education.wiley.com' },
  { category: 'cloud', match: (host) => /^(docs|sheets|slides|drive)\.google\.com$/.test(host) || host.endsWith('onedrive.live.com') || host.endsWith('sharepoint.com') },
  { category: 'video', match: (host) => /(^|\.)(youtube\.com|youtu\.be|vimeo\.com|panopto\.com|echo360\.org)$/.test(host) },
  { category: 'portal', match: (host) => /(^|\.)(instructure\.com|blackboard\.com|moodle\.org|moodlecloud\.com|brightspace\.com|d2l\.com|schoology\.com)$/.test(host) || host === 'classroom.google.com' || /(^|\.)canvas\./.test(host) },
  { category: 'research', match: (host) => /(^|\.)(jstor\.org|pubmed\.ncbi\.nlm\.nih\.gov|ncbi\.nlm\.nih\.gov|arxiv\.org|doi\.org|sciencedirect\.com|springer\.com|wiley\.com|tandfonline\.com|sagepub\.com|proquest\.com)$/.test(host) || host === 'scholar.google.com' || host.endsWith('.gov') },
  { category: 'reference', match: (host) => /(^|\.)(wikipedia\.org|quizlet\.com|khanacademy\.org|britannica\.com|investopedia\.com)$/.test(host) },
];

/** A reasonable guess at what a link is, from its address. The student can always change it. */
export function categorize(url: string): LinkCategory {
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return 'other';
  }
  // A university site that mentions a known portal still reads as a portal.
  for (const { category, match } of HOSTS) if (match(host, url)) return category;
  return 'other';
}

/** A sensible default name for a saved link: the page's path, or its site. */
export function nameFromUrl(url: string): string {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return url;
  }
  const host = parsed.hostname.replace(/^www\./, '');
  const last = parsed.pathname.split('/').filter(Boolean).pop();
  if (!last) return host;
  const cleaned = decodeURIComponent(last).replace(/\.(html?|php|aspx?)$/i, '').replace(/[-_]+/g, ' ').trim();
  return cleaned ? `${cleaned} — ${host}` : host;
}

/** The site a link points at, for showing next to its name. */
export function siteOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

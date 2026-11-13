import type { ReactElement } from 'react';

// One clean line icon per section, so the sidebar reads at a glance. Decorative: labels carry the meaning.
const svg = (...children: ReactElement[]): ReactElement => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>
);

export const NAV_ICONS: Record<string, ReactElement> = {
  '/': svg(<path key="a" d="M3 11.5 12 4l9 7.5" />, <path key="b" d="M5 10v9a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-9" />),
  '/courses': svg(<path key="a" d="M4 5.5A1.5 1.5 0 0 1 5.5 4H10a2 2 0 0 1 2 2v14a2 2 0 0 0-2-2H5.5A1.5 1.5 0 0 1 4 16.5Z" />, <path key="b" d="M20 5.5A1.5 1.5 0 0 0 18.5 4H14a2 2 0 0 0-2 2v14a2 2 0 0 1 2-2h4.5a1.5 1.5 0 0 0 1.5-1.5Z" />),
  '/library': svg(<path key="a" d="M3 7h18" />, <path key="b" d="M5 7v12a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V7" />, <path key="c" d="M8 7V5a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2" />, <path key="d" d="M10 12h4" />),
  '/planner': svg(<rect key="a" x="4" y="5" width="16" height="16" rx="2" />, <path key="b" d="M8 3v4M16 3v4M4 10h16" />, <path key="c" d="m9 15 2 2 4-4" />),
  '/calendar': svg(<rect key="a" x="4" y="5" width="16" height="16" rx="2" />, <path key="b" d="M8 3v4M16 3v4M4 10h16" />),
  '/cards': svg(<rect key="a" x="3" y="6" width="14" height="12" rx="2" />, <path key="b" d="M8 6V5a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-1" />),
  '/practice': svg(<circle key="a" cx="12" cy="12" r="8" />, <circle key="b" cx="12" cy="12" r="3.5" />, <circle key="c" cx="12" cy="12" r="0.4" fill="currentColor" />),
  '/exams': svg(<path key="a" d="M8 4h8v3a4 4 0 0 1-8 0Z" />, <path key="b" d="M8 5H5.5A1.5 1.5 0 0 0 6 8.9M16 5h2.5A1.5 1.5 0 0 1 18 8.9" />, <path key="c" d="M12 11v4M9 20h6M10 20a2 2 0 0 1 4 0" />),
  '/progress': svg(<path key="a" d="M4 20V4" />, <path key="b" d="M4 20h16" />, <path key="c" d="M8 16v-3M12 16V9M16 16v-5" />),
  '/study': svg(<path key="a" d="m3 8 9-4 9 4-9 4Z" />, <path key="b" d="M7 10.5V15c0 1.1 2.2 2.5 5 2.5s5-1.4 5-2.5v-4.5" />, <path key="c" d="M21 8v4.5" />),
  '/notes': svg(<path key="a" d="M5 4h10l4 4v12a0 0 0 0 1 0 0H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1Z" />, <path key="b" d="M14 4v4h4M8 13h8M8 17h5" />),
  '/trash': svg(<path key="a" d="M4 7h16M10 7V4.5h4V7" />, <path key="b" d="M6 7l1 12.5a1.5 1.5 0 0 0 1.5 1.5h7a1.5 1.5 0 0 0 1.5-1.5L18 7" />, <path key="c" d="M10 11v6M14 11v6" />),
  '/record': svg(<rect key="a" x="9" y="3" width="6" height="11" rx="3" />, <path key="b" d="M6 11a6 6 0 0 0 12 0M12 17v3M9 20h6" />),
};

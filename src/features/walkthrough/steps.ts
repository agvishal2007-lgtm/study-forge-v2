import { getDb } from '../../data/db';

export interface TourAction {
  /** Checks saved data. If this is already true, the student isn't asked again. */
  isDone: () => Promise<boolean>;
  /** Shown while Next is locked. */
  instruction: string;
  /** Shown once it's done. */
  doneMessage: string;
  /** Later screens this action passes through, and what to highlight on them. */
  follow?: { match: RegExp; target: string[] }[];
}

export interface TourStep {
  id: string;
  /** The screen to open for this step. Leave out to stay on the current screen. */
  route?: string;
  /** What to spotlight, first match wins. Leave out for a message in the middle of the screen. */
  target?: string[];
  title: string;
  body: string;
  /** Something the student must really do before moving on. */
  action?: TourAction;
}

const hasAny = (store: 'courses' | 'lessons' | 'notes') => async () => (await (await getDb()).count(store)) > 0;

/**
 * Each step describes only what really exists on the site today. Keep each one short: what the
 * highlighted part does and why a student would use it. Details belong on the screens themselves.
 * Targets point at the actual control where there is one, so the highlight fits it closely.
 */
export const TOUR_STEPS: TourStep[] = [
  {
    id: 'welcome',
    route: '/',
    title: 'Welcome to Study Forge',
    body: 'Your one place for courses, files, lectures, notes and studying. This short tour shows you around. Close it anytime with the X, and it remembers where you were.',
  },
  {
    id: 'sections',
    route: '/',
    target: ['.nav-links'],
    title: 'Your sections',
    body: 'Use these to move between the parts of Study Forge.',
  },
  {
    id: 'add',
    route: '/',
    target: ['[data-tour=smart-add]'],
    title: 'Create or Add Something',
    body: 'Use the + button to add study materials, create notes or flashcards, record lectures, and organize your courses and topics. Study Forge helps you place everything where it belongs.',
  },
  {
    id: 'account',
    route: '/',
    target: ['[data-tour=account]', '.topbar'],
    title: 'Your account',
    body: 'Signing in is optional. Log in with email, Google, Microsoft or Yahoo, and your work syncs to your other devices by itself. Once you’re signed in, the badge here shows whether everything is synced.',
  },
  {
    id: 'today',
    route: '/',
    target: ['[data-testid=start-studying]', '#content .page h1'],
    title: 'Today',
    body: 'Your starting point. Start studying picks the most useful thing to do next and says why. Below it are the next 7 days, any study time you missed, and a look back at your week.',
  },
  {
    id: 'courses',
    route: '/courses',
    target: ['[data-tour="add-course"]'],
    title: 'Courses',
    body: 'Add each of your classes. Inside a course you can make topics, like chapters, and keep its files, notes and recordings together.',
    action: {
      isDone: hasAny('courses'),
      instruction: 'Try it: add one of your real classes, then press Create course.',
      doneMessage: 'Nice, you have a course. You can add more anytime.',
    },
  },
  {
    id: 'library',
    route: '/library',
    target: ['[data-tour="add-files"]'],
    title: 'Add your files',
    body: 'Add slides, readings, recordings and other files from your device or Google Drive, even very large ones. Each file shows its progress and only says Saved once it’s safely stored.',
  },
  {
    id: 'viewer',
    route: '/library',
    target: ['#content .files', '#content .page h1'],
    title: 'Open your files',
    body: 'Every file you save is listed here. Open one to read, watch or listen right in Study Forge, with your notes beside it. You can always download the original, and anything you delete waits in the Trash, with Undo right after a change.',
  },
  {
    id: 'planner',
    route: '/planner',
    target: ['[data-tour="add-planner"]'],
    title: 'Planner',
    body: 'Add assignments and exams with their due dates. Sort them the way that suits you, such as by due date or grade impact, and enter grades to see how each course is going.',
  },
  {
    id: 'study',
    route: '/study',
    target: ['[data-tour="study-intro"]'],
    title: 'Study',
    body: 'Learn one small idea at a time: read the explanation and an example, practice it, then explain it in your own words.',
  },
  {
    id: 'mastery',
    route: '/study',
    target: ['[data-tour="sample-lesson"]'],
    title: 'Mastery is earned',
    body: 'Clicking through or guessing never counts. A topic is mastered only after you answer questions, apply the idea and explain it.',
    action: {
      isDone: hasAny('lessons'),
      instruction: 'Try it: press Add sample lesson. It stays in Study for when you’re ready, and you can delete it anytime.',
      doneMessage: 'The sample lesson is ready for you in Study.',
    },
  },
  {
    id: 'write-lesson',
    route: '/study',
    target: ['[data-tour="new-lesson"]'],
    title: 'Write your own lessons',
    body: 'Turn any class into lessons by writing the explanation, practice questions and key points yourself.',
  },
  {
    id: 'flashcards',
    route: '/cards',
    target: ['[data-tour="new-deck"]'],
    title: 'Flashcards',
    body: 'Make decks of cards and test yourself. Cards you find hard come back sooner, so your time goes where it’s needed.',
  },
  {
    id: 'practice',
    route: '/practice',
    target: ['[data-tour="new-practice"]'],
    title: 'Practice',
    body: 'Write your own questions, answer them without your notes, and check your work. Study Forge keeps track of what you miss and shows your weak topics. The calculator is here when a question needs working out.',
  },
  {
    id: 'exams',
    route: '/exams',
    target: ['[data-tour="exam-start"]'],
    title: 'Exam Hall',
    body: 'Take timed mock exams built from your practice questions, and use Cram Mode when time is short.',
  },
  {
    id: 'calendar',
    route: '/calendar',
    target: ['[data-tour="calendar-add"]'],
    title: 'Your calendar',
    body: 'See your classes, events and deadlines in one place. Add your class schedule from a picture or text, or connect Google Calendar to bring in classes and Canvas work.',
  },
  {
    id: 'progress',
    route: '/progress',
    target: ['[data-tour="progress-streak"] > :first-child', '[data-tour="progress-streak"]'],
    title: 'See your progress',
    body: 'Your study streak, the days you studied and how each course is going, all counted from work you’ve saved. It never guesses a grade.',
  },
  {
    id: 'notes',
    route: '/notes',
    target: ['[data-tour="new-note"]'],
    title: 'Notes',
    body: 'Notes save as you type. The buttons above a note add headings, lists that continue when you press Enter, checklists, and equations picked from a menu. Calculator opens a scientific or TI-84-style graphing calculator; it’s a study tool, not an exam calculator.',
    action: {
      isDone: hasAny('notes'),
      instruction: 'Try it: press New note and type anything. It saves by itself.',
      doneMessage: 'Your note is saved. You can find it in Notes anytime.',
      follow: [{ match: /^\/notes\/.+/, target: ['.note-body-label'] }],
    },
  },
  {
    id: 'record-type',
    route: '/record',
    target: ['[data-tour="record-source"]', '#content .page h1'],
    title: 'Record lectures',
    body: 'Choose In person to record the room, or Virtual to record your screen and the lecture’s sound. A live transcript appears as you record, and you can take notes tied to the exact moment.',
  },
  {
    id: 'record-safe',
    route: '/record',
    target: ['[data-tour="record-start"]', '#content .page h1'],
    title: 'Recordings stay safe',
    body: 'Recordings save every few seconds, so a crash loses almost nothing. Afterwards, open a recording to play it, read its transcript or download it as an MP3.',
  },
  {
    id: 'backup',
    route: '/settings',
    target: ['[data-tour="backup-actions"]', '[data-tour="backup"]'],
    title: 'Back up your work',
    body: 'A backup saves everything in one file you can keep anywhere and restore on any computer. Without an account, your files live only on this device, so back up regularly.',
  },
  {
    id: 'sync-files',
    route: '/settings',
    target: ['[data-testid=drive-backup]', '[data-tour=account]', '[data-tour="sync-files"]'],
    title: 'Files on all your devices',
    body: 'When you’re signed in, you can sync your files and recordings through your own Google Drive, so they’re on every device you use.',
  },
  {
    id: 'offline',
    route: '/settings',
    target: ['[data-testid=offline-status]', '[data-tour="offline"]'],
    title: 'Study without internet',
    body: 'After your first visit, Study Forge opens without internet and keeps saving your work. You can also install it like an app.',
  },
  {
    id: 'appearance',
    route: '/settings',
    target: ['.segmented[aria-labelledby="appearance-heading"]', '[aria-labelledby="appearance-heading"]'],
    title: 'Light, dark, or automatic',
    body: 'Choose Light, Dark, Match Device or Sunrise/Sunset. The sun or moon button at the top switches in one tap. Below this you can also set how dates and times look, plus text size and motion.',
  },
  {
    id: 'permissions',
    route: '/settings',
    target: ['[data-testid=permission-notifications]', '[data-testid=permissions]'],
    title: 'Permissions and notifications',
    body: 'Study Forge asks for your microphone, camera or notifications only when you need them. Tap the Notifications status to turn them on. If they’re blocked, it shows the steps for your browser.',
  },
  {
    id: 'search',
    route: '/search',
    target: ['[data-tour="search-box"]'],
    title: 'Search everything',
    body: 'Search your notes, files, flashcards, practice, planner and lessons, including the words inside PDFs, documents and pictures.',
  },
  {
    id: 'finish',
    route: '/',
    title: 'You’re ready',
    body: 'A good first step is to add a course, then try the sample lesson in Study. The ? at the top opens this tour again, or Study Forge Academy for step-by-step help with every feature.',
  },
];

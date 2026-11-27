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
  /**
   * What this step says and points at where there is no side menu — a phone, or a narrow window.
   *
   * One tour, not two: the steps, their order and the student's place in them are the same on every
   * device, and only the parts that are really different are written twice. Two separate tours
   * would drift apart, and the one nobody was looking at would be the one that broke.
   */
  phone?: Partial<Pick<TourStep, 'title' | 'body' | 'target' | 'route'>>;
}

/** The width where the side menu goes away. The same number as the stylesheet's. */
export const NO_SIDEBAR = 720;

/** The step as this device should see it. */
export const stepFor = (step: TourStep, phone: boolean): TourStep => (phone && step.phone ? { ...step, ...step.phone } : step);

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
    body: 'Use the menu down the side to move between the parts of Study Forge. Trash sits at the bottom of it.',
    phone: {
      body: 'Tap along this bar to move between the parts of Study Forge. It slides sideways, so swipe it to reach the rest.',
    },
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
    phone: {
      body: 'Signing in is optional. Tap here to log in with email, Google, Microsoft or Yahoo, and your work syncs to your other devices by itself. Once you’re signed in, this is also where Trash lives.',
    },
  },
  {
    id: 'today',
    route: '/',
    target: ['[data-testid=start-studying]', '#content .page h1'],
    title: 'Today',
    body: 'Your starting point. Start studying picks the most useful thing to do next and says why. Also worth doing lists a few more ideas, each with its reason; hide any for today. Below are the next 7 days, missed study time, and a look back at your week.',
  },
  {
    id: 'courses',
    route: '/courses',
    target: ['[data-tour="add-course"]'],
    title: 'Courses',
    body: 'Add each of your classes, starting blank or from a template such as Lecture, Lab, Writing or Math. Inside a course, topics hold its files, notes and recordings together. Edit course can say what kind of thing it is, which sets the word for its parts — Chapters, Modules, Sections. If Courses is empty, a short setup can name your term and add your classes for you.',
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
    body: 'Every file you save is listed here, and the Personal library keeps things worth saving beyond one course on shelves you name. Open a file to read, watch or listen right here, with your notes beside it. Anything you delete waits in the Trash.',
  },
  {
    id: 'planner',
    route: '/planner',
    target: ['[data-tour="add-planner"]'],
    title: 'Planner',
    body: 'Add assignments and exams with their due dates. Tick a box to finish something and it saves itself; everything ticked off stays in Done. Open one to break it into steps with your own target dates; the due date stays the same. Sort work your way, such as by due date or grade impact.',
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
    body: 'Clicking through or guessing never counts. A topic is mastered only after you answer questions, apply the idea and explain it — and once it is, reviewing it later never takes that away.',
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
    id: 'trash',
    route: '/settings',
    target: ['[data-testid=nav-trash]', '[aria-labelledby=trash-heading]'],
    title: 'Nothing is deleted straight away',
    body: 'Anything you delete anywhere in Study Forge waits in Trash, at the bottom of the menu down the side. Restore puts it back where it was, and you can have Trash empty itself after a time you choose.',
    phone: {
      target: ['[aria-labelledby=trash-heading]', '[data-tour=account]'],
      body: 'Anything you delete anywhere in Study Forge waits in Trash. On a phone you reach it with Open Trash here in Settings, or from your account menu at the top once you are signed in. Restore puts it back where it was, and you can have Trash empty itself after a time you choose.',
    },
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
    body: 'Study Forge asks for your microphone, camera or notifications only when you need them. After the tour, tap the Notifications status to turn them on. If they’re blocked, it shows the steps for your browser.',
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
    body: 'A good first step is to add a course, then try the sample lesson in Study. The ? at the top opens this tour again, or Study Forge Academy for hands-on lessons on every feature.',
  },
];

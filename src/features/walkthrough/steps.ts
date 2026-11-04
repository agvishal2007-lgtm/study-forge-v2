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

/** Each step describes only what really exists on the site today. */
export const TOUR_STEPS: TourStep[] = [
  {
    id: 'welcome',
    route: '/',
    title: 'Welcome to Study Forge',
    body: 'This is your one place for courses, files, lectures, notes, and studying. This walkthrough shows you each part. It takes about two minutes. Use the X to leave anytime, and it remembers your place.',
  },
  {
    id: 'sections',
    route: '/',
    target: ['.nav-links'],
    title: 'Your sections',
    body: 'These buttons take you to each part of Study Forge. This is how you get around.',
  },
  {
    id: 'account',
    route: '/',
    target: ['.topbar'],
    title: 'Your account',
    body: 'Sign in here with Google, including a college account if your school allows it. Your courses, notes, lessons, and progress then follow you between devices. Signing in is optional.',
  },
  {
    id: 'today',
    route: '/',
    target: ['#content .page'],
    title: 'Today',
    body: 'Your starting point. Today is your dashboard. It counts what needs attention, then lists what is due, your flashcards, what to study next and why, and your recent work.',
  },
  {
    id: 'courses',
    route: '/courses',
    target: ['[data-tour="add-course"]'],
    title: 'Courses',
    body: 'Add each class here. Inside a course, you can make topics, like chapters, and keep its files, notes, and recordings together.',
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
    body: 'Add slides, readings, and other files here. Choose them or drag them in. Files stay on this device, and if you add the same file twice, Study Forge notices.',
  },
  {
    id: 'viewer',
    route: '/library',
    target: ['#content .page'],
    title: 'Open your files',
    body: 'The Library holds every file you\'ve saved. Open one to read it right here, including PDFs, images, audio, and video. You can download the original anytime.',
  },
  {
    id: 'planner',
    route: '/planner',
    target: ['[data-tour="add-planner"]'],
    title: 'Planner',
    body: 'Add assignments and exams with their due dates. Anything due soon shows up on Today, so you can see what needs attention first.',
  },
  {
    id: 'study',
    route: '/study',
    target: ['[data-tour="study-intro"]'],
    title: 'Study',
    body: 'This is where you actually learn. You go one small idea at a time: first the explanation and an example, then practice, then you explain it in your own words.',
  },
  {
    id: 'mastery',
    route: '/study',
    target: ['[data-tour="sample-lesson"]'],
    title: 'Mastery is earned',
    body: 'Clicking through or guessing never counts. A topic is only mastered once you\'ve answered questions, applied the idea, and explained it.',
    action: {
      isDone: hasAny('lessons'),
      instruction: 'Try it: press Add sample lesson. It stays in Study for when you\'re ready, and you can delete it anytime.',
      doneMessage: 'The sample lesson is ready for you in Study.',
    },
  },
  {
    id: 'write-lesson',
    route: '/study',
    target: ['[data-tour="new-lesson"]'],
    title: 'Write your own lessons',
    body: 'Turn any class into lessons by writing the explanation, the practice questions, and the key points yourself.',
  },
  {
    id: 'flashcards',
    route: '/cards',
    target: ['[data-tour="new-deck"]'],
    title: 'Flashcards',
    body: 'Group cards into decks, then test yourself. How well you remembered decides when each card comes back, so you spend your time on the ones you find hard.',
  },
  {
    id: 'practice',
    route: '/practice',
    target: ['[data-tour="new-practice"]'],
    title: 'Practice',
    body: 'Write your own questions, answer them without your notes, and check your work. Study Forge tracks what you missed and shows your weak topics, so you know what to repeat.',
  },
  {
    id: 'notes',
    route: '/notes',
    target: ['[data-tour="new-note"]'],
    title: 'Notes',
    body: 'Notes save as you type. You can file them under a course or topic, attach them to a file or recording, and search them all.',
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
    target: ['[data-tour="record-source"]', '#content .page'],
    title: 'Record lectures',
    body: 'Choose In person to record the room with your microphone, or Virtual to record your screen and the lecture\'s sound. Virtual works best in Chrome or Edge on a computer.',
  },
  {
    id: 'record-safe',
    route: '/record',
    target: ['[data-tour="record-start"]', '#content .page'],
    title: 'Recordings stay safe',
    body: 'Audio saves every 5 seconds, so if something crashes, you lose only a few seconds. On a phone, keep the screen on while recording.',
  },
  {
    id: 'backup',
    route: '/settings',
    target: ['[data-tour="backup"]'],
    title: 'Back up your work',
    body: 'Your files and recordings live only on this device. Create a backup regularly and keep it somewhere safe. You can restore it on any computer.',
  },
  {
    id: 'finish',
    route: '/',
    title: 'You\'re ready',
    body: 'A good first step is to add a course, then try the sample lesson in Study. You can reopen this walkthrough anytime with the question mark at the top right.',
  },
];

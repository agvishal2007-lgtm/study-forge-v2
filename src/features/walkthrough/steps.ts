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
    id: 'add',
    route: '/',
    target: ['[data-tour=smart-add]'],
    title: 'Adding anything',
    body: 'This button starts anything: a file, a link, a note, flashcards, a question set, a recording, a topic or a course. It suggests the course and topic you are looking at, and you can change that before it saves. If you make a mistake, Undo appears at the bottom, and deleted things wait in the Trash until you empty it.',
  },
  {
    id: 'account',
    route: '/',
    target: ['.topbar'],
    title: 'Your account',
    body: 'Log In / Sign Up opens a page of its own, away from your work. There you can use an email and password, Google, or Microsoft, including a college account if your school allows it. Once you\'re signed in, your courses, notes, planner, flashcards, practice, settings and study in progress sync to your other devices by themselves, within seconds. The badge beside your picture shows Synced (green), Syncing (blue), Offline or Pending (amber), or Sync failed (red). Tap it for details such as the last sync time. It only shows information and never takes you anywhere. Signing in is optional, and every page has a link back here.',
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
    body: 'Add slides, readings, and other files here. Choose them or drag them in. If you add the same file twice, Study Forge notices. Their names and places sync when you\'re signed in, and the files themselves can sync through your Google Drive. You can add them from your device or Google Drive.',
  },
  {
    id: 'viewer',
    route: '/library',
    target: ['#content .page'],
    title: 'Open your files',
    body: 'The Library holds every file you\'ve saved. Open one to read it right here, including PDFs, Word, Excel, PowerPoint, LibreOffice files, EPUB books, code, images, audio, and video, and write notes beside it while you read. Tick several to pin, move, put away, or bin them at once. You can download the original anytime.',
  },
  {
    id: 'planner',
    route: '/planner',
    target: ['[data-tour="add-planner"]'],
    title: 'Planner',
    body: 'Add assignments and exams with their due dates, points and how long they will take. Choose how they are ordered, such as earliest due, biggest grade impact, quickest, or your own weighting, and pin anything to the top. Overdue and due-soon work always stays visible, and Today uses the same order. Enter your grades to see where each course stands.',
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
    body: 'Write your own questions, answer them without your notes, and check your work. Choose 5, 10, 20 or all, save a question for later, and say how hard it felt. Stop whenever you like: practice and flashcard reviews pick up where you left off. Study Forge tracks what you missed and shows your weak topics, so you know what to repeat.',
  },
  {
    id: 'exams',
    route: '/exams',
    target: ['[data-tour="exam-start"]'],
    title: 'Exam Hall',
    body: 'Take timed mock exams from your practice questions, check your final revision list, and use Cram Mode when you are short on time.',
  },
  {
    id: 'calendar',
    route: '/calendar',
    target: ['[data-tour="calendar-add"]'],
    title: 'Your calendar',
    body: 'Today\'s Plan shows what\'s left today. Plan Calendar shows when things happen, and Deadline Calendar shows when work is due. Add your class schedule from a picture or pasted text, or connect Google Calendar to bring in your classes and Canvas work. Events from Google keep their meeting links, descriptions, and attachments, and a Join button opens a Zoom, Meet, or Teams meeting in one tap.',
  },
  {
    id: 'progress',
    route: '/progress',
    target: ['[data-tour="progress-streak"]'],
    title: 'See your progress',
    body: 'Your study streak, the days you studied, and how each course is going. Every number comes from work you\'ve saved, and it never guesses a grade.',
  },
  {
    id: 'notes',
    route: '/notes',
    target: ['[data-tour="new-note"]'],
    title: 'Notes',
    body: 'Notes save as you type, with bold, headings, lists, and checklists. You can file them under a course or topic, and attach them to a file or recording.',
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
    body: 'Audio saves every 5 seconds, so if something crashes, you lose only a few seconds. On a phone, keep the screen on while recording. When it\'s finished, open the recording to download it as an MP3 (or an MP4 for video), or in another format your browser can make.',
  },
  {
    id: 'backup',
    route: '/settings',
    target: ['[data-tour="backup"]'],
    title: 'Back up your work',
    body: 'Without an account, your files and recordings live only on this device. Create a backup regularly and keep it somewhere safe. You can restore it on any computer.',
  },
  {
    id: 'sync-files',
    route: '/settings',
    target: ['[data-testid=drive-backup]', '[data-tour="sync-files"]'],
    title: 'Files on all your devices',
    body: 'Signed in, you can tap Sync files with my Google Drive once on each device. Your files and recordings then go to a Study Forge folder in your own Drive, and a file counts as synced only after Drive confirms it arrived intact. On another device, open the file and tap Get it from Google Drive. Study Forge only sees the files it puts there.',
  },
  {
    id: 'offline',
    route: '/settings',
    target: ['[data-tour="offline"]'],
    title: 'Study without internet',
    body: 'After your first visit, Study Forge opens with no internet, and your work on this device keeps saving. You can also install it on your phone or computer like an app.',
  },
  {
    id: 'appearance',
    route: '/settings',
    target: ['[aria-labelledby="appearance-heading"]'],
    title: 'Light, dark, or automatic',
    body: 'The sun or moon button at the top switches straight between light and dark, in one tap. Here in Settings you choose the preference: Light, Dark, Match Device, or Sunrise/Sunset, which is light by day and dark at night for the city you pick. If you tap the button while an automatic option is on, your choice stays until you pick an option here again. Text size, motion and spacing are here too.',
  },
  {
    id: 'permissions',
    route: '/settings',
    target: ['[data-testid=permissions]'],
    title: 'Permissions and notifications',
    body: 'This shows what your browser allows: microphone, camera and notifications. Study Forge asks only when you start something that needs one, and never nags. To turn on notifications, tap the Notifications status itself. Your browser asks, and the status changes to Allowed. If it says Blocked, tapping it shows how to unblock it in your browser.',
  },
  {
    id: 'search',
    route: '/search',
    target: ['[data-tour="search-box"]'],
    title: 'Search everything',
    body: 'The magnifying glass at the top searches your notes, files, flashcards, practice, planner, and lessons, including the words inside PDFs, Office files, scanned pages, and images.',
  },
  {
    id: 'finish',
    route: '/',
    title: 'You\'re ready',
    body: 'A good first step is to add a course, then try the sample lesson in Study. You can reopen this walkthrough anytime with the question mark at the top right.',
  },
];

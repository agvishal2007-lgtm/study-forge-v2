/*
 * Academy lessons. Each teaches one skill in a few short parts: a sentence or two, a look at where
 * it lives, a hands-on activity in a practice copy (never the student's real work), and feedback.
 * A lesson is finished only when its activity is done. Every lesson is about something that exists
 * and works today; the longer explanations stay in the reference guide, linked from each lesson.
 */

/** A pretend screen for "find it" activities: a menu down the side, a top bar, and the page's buttons. */
export interface MockScreen {
  page: string;
  nav: string[];
  top: string[];
  buttons: string[];
}

const NAV = ['Today', 'Courses', 'Library', 'Planner', 'Calendar', 'Flashcards', 'Practice', 'Study', 'Notes', 'Record'];
const TOP = ['+', 'Search', 'Light / dark', '?'];
export const screen = (page: string, buttons: string[]): MockScreen => ({ page, nav: NAV, top: TOP, buttons });

export type Activity =
  | { type: 'find'; screen: MockScreen; target: string; prompt: string; hint: string }
  | { type: 'choice'; question: string; options: { text: string; correct: boolean; why: string }[] }
  | { type: 'course' }
  | { type: 'topic' }
  | { type: 'flashcard' }
  | { type: 'note' }
  | { type: 'trash' }
  | { type: 'steps' }
  | { type: 'rename' };

export interface Lesson {
  id: string;
  title: string;
  /** One or two sentences: what this is. */
  intro: string;
  /** Where it lives, shown on a pretend screen with the part highlighted. */
  demo?: { screen: MockScreen; highlight: string; caption: string };
  activity: Activity;
  /** What just happened, shown once the activity is done. */
  feedback: string;
  /** The reference guide section with the full details. */
  learnMore: string;
}

export interface Module {
  id: string;
  title: string;
  description: string;
  level: 'Start here' | 'Everyday' | 'Going further';
  icon: string;
  lessons: Lesson[];
}

export const MODULES: Module[] = [
  {
    id: 'getting-started',
    title: 'Getting started',
    description: 'Find your way around and set up your first course.',
    level: 'Start here',
    icon: '/',
    lessons: [
      {
        id: 'today',
        title: 'Your Today dashboard',
        intro: 'Today is your home screen. Start studying picks the most useful next thing and tells you why.',
        demo: { screen: screen('Today', ['Start studying', 'Also worth doing', 'Next 7 days']), highlight: 'Start studying', caption: 'Start studying sits at the top of Today.' },
        activity: { type: 'find', screen: screen('Today', ['Next 7 days', 'Start studying', 'Your last 7 days', 'Also worth doing']), target: 'Start studying', prompt: 'Tap the button that picks your next study task.', hint: 'It’s the one that starts studying for you.' },
        feedback: 'That’s it. Press it whenever you’re not sure what to do next; it says why it chose each thing.',
        learnMore: 'today',
      },
      {
        id: 'navigation',
        title: 'Getting around',
        intro: 'Every section is in the menu: down the side on a computer, along the bottom on a phone. The + at the top adds anything from anywhere.',
        demo: { screen: screen('Today', ['Start studying']), highlight: 'Planner', caption: 'Planner holds your assignments and exams.' },
        activity: { type: 'find', screen: screen('Today', ['Start studying']), target: 'Planner', prompt: 'You have an essay due Friday. Where do you add it? Tap that section.', hint: 'Assignments and exams live in the section named after planning.' },
        feedback: 'Right: assignments, exams and their due dates go in Planner. The + at the top can add one too.',
        learnMore: 'getting-started',
      },
      {
        id: 'create-course',
        title: 'Create a course',
        intro: 'A course holds everything for one class: its topics, files, notes, recordings and assignments.',
        demo: { screen: screen('Courses', ['Arrange courses', 'Create course', 'Start a new semester']), highlight: 'Create course', caption: 'On Courses, type the class name, then press Create course.' },
        activity: { type: 'course' },
        feedback: 'You made a practice course. In your real Courses page it works the same way, and you can start from a template such as Lecture or Lab.',
        learnMore: 'courses',
      },
      {
        id: 'add-topic',
        title: 'Add a topic',
        intro: 'Topics split a course into parts, such as chapters or units. Files, notes and recordings can sit in a topic.',
        activity: { type: 'topic' },
        feedback: 'Topics appear inside the course in the order you add them. You can rename, move or put them in Trash later.',
        learnMore: 'courses',
      },
    ],
  },
  {
    id: 'study-tools',
    title: 'Study tools',
    description: 'Flashcards, notes with lists, practice questions and the calculator.',
    level: 'Everyday',
    icon: '/cards',
    lessons: [
      {
        id: 'flashcards',
        title: 'Make and review a flashcard',
        intro: 'A flashcard has a front and a back. After you answer, you say how it went, and Study Forge schedules the next review.',
        activity: { type: 'flashcard' },
        feedback: 'Good moves a card one step along its schedule (1, 5, 10, then 15 days). Again brings it back today, Hard tomorrow, and Easy skips a step.',
        learnMore: 'studying',
      },
      {
        id: 'notes-lists',
        title: 'Notes with bullet lists',
        intro: 'Notes save as you type. Bullets and Numbering start a list, and Enter continues it.',
        activity: { type: 'note' },
        feedback: 'Enter added the next bullet for you, and pressing Enter on an empty bullet ends the list. Numbered lists work the same way.',
        learnMore: 'notes',
      },
      {
        id: 'practice-answer',
        title: 'Answering a practice question',
        intro: 'Practice shows one question at a time. Nothing is picked for you, and nothing is checked until you press Submit.',
        activity: {
          type: 'choice',
          question: 'Practice: assets are $50,000 and liabilities are $20,000. What is owner’s equity?',
          options: [
            { text: '$30,000', correct: true, why: 'Assets = Liabilities + Equity, so equity is $50,000 − $20,000 = $30,000.' },
            { text: '$70,000', correct: false, why: 'That adds them. Equity is what’s left after liabilities: $50,000 − $20,000.' },
            { text: '$20,000', correct: false, why: 'That’s the liabilities. Equity is assets minus liabilities.' },
          ],
        },
        feedback: 'That’s how Practice works: choose, press Submit, then read why. Your latest answer to each question is what counts.',
        learnMore: 'studying',
      },
      {
        id: 'calculator',
        title: 'Using the calculator honestly',
        intro: 'The calculator has a Scientific mode and a Graphing mode, and opens from notes and Practice.',
        activity: {
          type: 'choice',
          question: 'Your professor allows a calculator in tomorrow’s exam. Can you use Study Forge’s?',
          options: [
            { text: 'Only if your instructor’s and exam provider’s rules allow it', correct: true, why: 'It is a study tool, not an officially approved exam calculator. Their rules decide.' },
            { text: 'Yes, any calculator is fine if one is allowed', correct: false, why: 'Exams often allow only approved models. Check your instructor’s and exam provider’s rules.' },
            { text: 'Yes, it closes itself during exams', correct: false, why: 'It closes itself in a Study Forge mock exam, not in your school’s exams. Follow your school’s rules.' },
          ],
        },
        feedback: 'Right. You are responsible for using it honestly, and Study Forge isn’t responsible for any use that breaks a school or exam rule.',
        learnMore: 'calculator',
      },
    ],
  },
  {
    id: 'recording',
    title: 'Recording and transcripts',
    description: 'Record lectures, take notes tied to the moment, and understand transcripts.',
    level: 'Everyday',
    icon: '/record',
    lessons: [
      {
        id: 'record-lecture',
        title: 'Recording a lecture',
        intro: 'Record works for lectures in person (your microphone) and virtual ones (your screen and the lecture’s sound).',
        demo: { screen: screen('Record', ['In person', 'Virtual', 'Start recording']), highlight: 'In person', caption: 'In person records the room with your microphone.' },
        activity: { type: 'find', screen: screen('Record', ['Virtual', 'Start recording', 'In person']), target: 'Virtual', prompt: 'Your lecture is on Zoom. Which choice records it with its sound?', hint: 'The lecture is on your screen, not in the room.' },
        feedback: 'Right. Virtual records your screen and the lecture audio; when the browser asks, share the lecture and turn on its sound. It needs a Chrome-based browser on a computer.',
        learnMore: 'recording',
      },
      {
        id: 'transcripts',
        title: 'Understanding transcripts',
        intro: 'A transcript is made on your device, so nothing is uploaded. It’s searchable, and moment notes stay tied to the time in the lecture.',
        activity: {
          type: 'choice',
          question: 'Your transcript says “the balance cheat” where the professor said “the balance sheet”. What’s going on?',
          options: [
            { text: 'Transcripts can contain mistakes, so check anything important against the recording', correct: true, why: 'Speech recognition makes mistakes, especially with noise or new terms. The recording is the real source.' },
            { text: 'The recording is damaged', correct: false, why: 'The recording is fine. The transcript is a best guess at the words, and guesses can be wrong.' },
            { text: 'Study Forge changed what was said', correct: false, why: 'Nothing is changed on purpose. Speech recognition just misheard it.' },
          ],
        },
        feedback: 'Right. Tap a moment note to jump to that point in the recording and hear it for yourself.',
        learnMore: 'recording',
      },
    ],
  },
  {
    id: 'planning',
    title: 'Planning',
    description: 'Assignments, steps, the calendar and grades.',
    level: 'Everyday',
    icon: '/planner',
    lessons: [
      {
        id: 'assignment-steps',
        title: 'Break an assignment into steps',
        intro: 'Open any Planner item to split it into steps with your own target dates. The real due date never changes.',
        activity: { type: 'steps' },
        feedback: 'Each tick moved the progress on. Finishing every step only offers to mark the item done; it never does it by itself.',
        learnMore: 'planner',
      },
      {
        id: 'calendar',
        title: 'Using the calendar',
        intro: 'Calendar shows classes, events and deadlines together. A class schedule can come from a picture or from Google Calendar.',
        demo: { screen: screen('Calendar', ['Add to calendar', 'Add class schedule', 'Google Calendar']), highlight: 'Add class schedule', caption: 'Add class schedule can read a picture of your timetable.' },
        activity: { type: 'find', screen: screen('Calendar', ['Google Calendar', 'Add to calendar', 'Add class schedule']), target: 'Add to calendar', prompt: 'You have a study group on Thursday at 6 pm. Tap the button to put it on your calendar.', hint: 'A one-off thing you want on your calendar is an event.' },
        feedback: 'Right. Events can belong to a course, and deadlines from the Planner show on the calendar by themselves.',
        learnMore: 'calendar',
      },
      {
        id: 'reminders',
        title: 'What reminders can and can’t do',
        intro: 'Study Forge shows what’s due on Today and the calendar. It can’t promise reminders while the site is closed.',
        activity: {
          type: 'choice',
          question: 'You close Study Forge on Monday. An essay is due Wednesday. What happens?',
          options: [
            { text: 'Nothing until you open it again; then Today shows the essay', correct: true, why: 'A free website can’t reliably send reminders while it’s closed. Today shows everything due when you open it.' },
            { text: 'Study Forge texts you on Tuesday', correct: false, why: 'Study Forge doesn’t send texts or emails.' },
            { text: 'A notification always arrives the day before', correct: false, why: 'Background reminders aren’t offered, because they can’t be promised while the site is closed.' },
          ],
        },
        feedback: 'Right. For a reminder that must arrive, also put the deadline in a calendar app that alerts you.',
        learnMore: 'today',
      },
    ],
  },
  {
    id: 'organization',
    title: 'Organizing',
    description: 'Rename and move things, use Trash, and get deleted things back.',
    level: 'Everyday',
    icon: '/library',
    lessons: [
      {
        id: 'rename-move',
        title: 'Rename and move a file',
        intro: 'Any file or link can be renamed and moved to another course or topic. Undo appears straight after.',
        activity: { type: 'rename' },
        feedback: 'Renaming and moving never change the file itself, and Undo puts things back if you change your mind.',
        learnMore: 'organizing',
      },
      {
        id: 'trash',
        title: 'Using Trash and restoring',
        intro: 'Deleting something moves it to Trash. Nothing is gone until you permanently delete it.',
        activity: { type: 'trash' },
        feedback: 'Restore put it back where it was. Permanently delete always asks first, because it can’t be undone.',
        learnMore: 'organizing',
      },
    ],
  },
  {
    id: 'account',
    title: 'Account and sync',
    description: 'What the sync badge means, using other devices, and working offline.',
    level: 'Going further',
    icon: '/progress',
    lessons: [
      {
        id: 'sync-status',
        title: 'Reading the sync badge',
        intro: 'When you’re signed in, a badge by your picture shows whether your work is saved online.',
        activity: {
          type: 'choice',
          question: 'The badge says “Offline (waiting to sync)”. What should you do?',
          options: [
            { text: 'Keep working; it saves online by itself when you’re back online', correct: true, why: 'Changes wait on the device and sync as soon as there’s a connection.' },
            { text: 'Stop, or your work will be lost', correct: false, why: 'Work is kept on the device while offline, and syncs later.' },
            { text: 'Sign out and back in', correct: false, why: 'Not needed. It retries by itself.' },
          ],
        },
        feedback: 'Right. The badge says Synced across devices when everything is saved online, and Sync failed (retrying) if something is still being retried.',
        learnMore: 'sync',
      },
      {
        id: 'devices-offline',
        title: 'Other devices and offline',
        intro: 'Sign in with the same account on each device. Without internet, Study Forge still opens and works.',
        activity: {
          type: 'choice',
          question: 'You edit the same note on your laptop and your phone before they sync. What happens?',
          options: [
            { text: 'Both versions are kept, so nothing you wrote is lost', correct: true, why: 'When two devices change the same note, Study Forge keeps both versions.' },
            { text: 'The laptop’s version always wins', correct: false, why: 'Neither device simply wins for notes; both versions are kept.' },
            { text: 'The note is deleted', correct: false, why: 'Nothing is deleted. Both versions are kept.' },
          ],
        },
        feedback: 'Right. File contents travel through your own Google Drive if you turn that on in Settings.',
        learnMore: 'sync',
      },
    ],
  },
];

export const ALL_LESSONS = MODULES.flatMap((module) => module.lessons.map((lesson) => ({ ...lesson, moduleId: module.id })));
export const lessonById = (id: string) => ALL_LESSONS.find((lesson) => lesson.id === id) ?? null;

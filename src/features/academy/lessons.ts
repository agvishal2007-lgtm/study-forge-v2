/*
 * Academy lessons. Each teaches one skill in a few short parts: a sentence or two, a look at where
 * it lives, a hands-on activity in a practice copy (never the student's real work), and feedback.
 * A lesson is finished only when its activity is done. Every lesson is about something that exists
 * and works today, and its honest limits are in its tip rather than in a long article.
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
  /** One honest limit or tip, shown when the lesson is finished. */
  tip?: string;
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
      },
      {
        id: 'navigation',
        title: 'Getting around',
        intro: 'Every section is in the menu: down the side on a computer, along the bottom on a phone. The + at the top adds anything from anywhere.',
        demo: { screen: screen('Today', ['Start studying']), highlight: 'Planner', caption: 'Planner holds your assignments and exams.' },
        activity: { type: 'find', screen: screen('Today', ['Start studying']), target: 'Planner', prompt: 'You have an essay due Friday. Where do you add it? Tap that section.', hint: 'Assignments and exams live in the section named after planning.' },
        feedback: 'Right: assignments, exams and their due dates go in Planner. The + at the top can add one too.',
      },
      {
        id: 'school-level',
        title: 'Your school and your first term',
        intro: 'The first time Courses is empty, Study Forge asks which school you are in and what your first term is called. It changes the wording and what it offers. Skip it, or change it later in Settings.',
        demo: { screen: screen('Courses', ['Set up your first term', 'Create course', 'Start a new semester']), highlight: 'Set up your first term', caption: 'Three short steps: your school, your term, then your classes.' },
        activity: {
          type: 'choice',
          question: 'You pick Middle school. What happens?',
          options: [
            { text: 'Everything stays on this device, with no account and no syncing', correct: true, why: 'Right. Elementary and Middle school keep all your work on the one device, so there is no sign-in and Google and Dropbox stay off. Study Forge never asks your age.' },
            { text: 'Your classes and marks are deleted and set up again', correct: false, why: 'No. Changing your school only changes wording and what is offered. Nothing you have made is touched.' },
            { text: 'You have to enter your age first', correct: false, why: 'No. Study Forge never asks anyone\u2019s age. The school you pick is all it goes by.' },
          ],
        },
        feedback: 'Your classes are grouped under the term you name, so next year\u2019s stay apart from this year\u2019s. Change your school any time in Settings.',
        tip: 'Elementary and Middle school cannot sync, so make a backup from Settings to keep a copy of your work.',
      },
      {
        id: 'create-course',
        title: 'Create a course',
        intro: 'A course holds everything for one class: its topics, files, notes, recordings and assignments.',
        demo: { screen: screen('Courses', ['Arrange courses', 'Create course', 'Start a new semester']), highlight: 'Create course', caption: 'On Courses, type the class name, then press Create course.' },
        activity: { type: 'course' },
        feedback: 'You made a practice course. In your real Courses page it works the same way, and you can start from a template such as Lecture or Lab.',
      },
      {
        id: 'add-topic',
        title: 'Add a topic',
        intro: 'Topics split a course into parts, such as chapters or units. Files, notes and recordings can sit in a topic.',
        activity: { type: 'topic' },
        feedback: 'Topics appear inside the course in the order you add them. You can rename, move or put them in Trash later.',
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
      },
      {
        id: 'notes-lists',
        title: 'Notes with bullet lists',
        intro: 'Notes save as you type. Bullets and Numbering start a list, and Enter continues it.',
        activity: { type: 'note' },
        feedback: 'Enter added the next bullet for you, and pressing Enter on an empty bullet ends the list. Numbered lists work the same way.',
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
      },
      {
        id: 'focus-sounds',
        title: 'Sound to study to',
        intro: 'Settings has steady background sound: brown, pink and white noise, a fan and wind. Your browser makes each one as it plays, so none of it is downloaded and there are no words in any of it.',
        demo: { screen: screen('Settings', ['Focus sounds', 'Play Brown noise', 'Overall volume', 'Stop after a while']), highlight: 'Play Brown noise', caption: 'Press a sound to start it. Play more than one to mix them.' },
        activity: {
          type: 'choice',
          question: 'You start Brown noise, then go to your notes. What happens to the sound?',
          options: [
            { text: 'It keeps playing, the same one, until you stop it', correct: true, why: 'Right. Moving around Study Forge never restarts it or starts a second copy.' },
            { text: 'It stops, because you left the page', correct: false, why: 'It carries on, so you can study while it plays.' },
            { text: 'It starts again from the beginning', correct: false, why: 'Nothing restarts. It is one sound, playing once.' },
          ],
        },
        feedback: 'Each sound has its own volume, and there is one overall volume. The timer fades out rather than cutting off.',
        tip: 'It never starts on its own when you open Study Forge, and it comes out of your speakers, so stop it before recording a lecture.',
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
        id: 'tick-tasks',
        title: 'Ticking things off',
        intro: 'Every task has a real checkbox. Tapping it is the save: there is no Save button anywhere, and it is kept on this device and sent to your other devices on its own.',
        demo: { screen: screen('Planner', ['Add item', 'Everything', 'Still to do', 'Done']), highlight: 'Done', caption: 'Everything you tick off is always in Done, whatever else you choose.' },
        activity: {
          type: 'choice',
          question: 'In Settings you choose "Steps aside" for finished tasks. You tick off "Read chapter 4". Where is it?',
          options: [
            { text: 'In Done, still ticked and still readable', correct: true, why: 'Right. Stepping aside only takes it out of the active list. The task itself is unchanged and Done always has it.' },
            { text: 'Deleted', correct: false, why: 'No. None of the three choices ever deletes or changes a task.' },
            { text: 'Crossed out in the list', correct: false, why: 'That is the "Crossed out" choice. "Steps aside" takes it out of the list instead.' },
          ],
        },
        feedback: 'Three choices in Settings and no more: a ticked task stays put and readable, stays and is crossed out, or steps aside. Un-ticking it anywhere puts it straight back.',
        tip: 'Your checklist shows no score on purpose. The Progress section has the numbers if you want them.',
      },
      {
        id: 'assignment-steps',
        title: 'Break an assignment into steps',
        intro: 'Open any Planner item to split it into steps with your own target dates. The real due date never changes.',
        activity: { type: 'steps' },
        feedback: 'Each tick moved the progress on. Finishing every step only offers to mark the item done; it never does it by itself.',
      },
      {
        id: 'calendar',
        title: 'Using the calendar',
        intro: 'Calendar shows classes, events and deadlines together. A class schedule can come from a picture or from Google Calendar.',
        demo: { screen: screen('Calendar', ['Add to calendar', 'Add class schedule', 'Google Calendar']), highlight: 'Add class schedule', caption: 'Add class schedule can read a picture of your timetable.' },
        activity: { type: 'find', screen: screen('Calendar', ['Google Calendar', 'Add to calendar', 'Add class schedule']), target: 'Add to calendar', prompt: 'You have a study group on Thursday at 6 pm. Tap the button to put it on your calendar.', hint: 'A one-off thing you want on your calendar is an event.' },
        feedback: 'Right. Events can belong to a course, and deadlines from the Planner show on the calendar by themselves.',
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
      },
      {
        id: 'own-sections',
        title: 'Your own sections',
        intro: 'Your list can be grouped by when things are due, or by sections you make up yourself, like Morning routine or Wellness. Group by switches between the two.',
        demo: { screen: screen('Planner', ['Group by', 'Morning routine', 'Wellness', 'No section']), highlight: 'Group by', caption: 'Group by swaps between due dates and your own sections.' },
        activity: {
          type: 'choice',
          question: 'You tick off a task that sits in your Morning routine section. What happens to it?',
          options: [
            { text: 'It stays in Morning routine, ticked and still easy to read', correct: true, why: 'Right. Ticking a box never moves a task or crosses it out, unless you ask for that in Settings.' },
            { text: 'It moves out to a finished list and leaves its section', correct: false, why: 'Only if you choose Steps aside in Settings. Normally it stays exactly where it was.' },
            { text: 'It is copied, so it is in two places at once', correct: false, why: 'Nothing is ever copied. A task is one record however many ways you look at it.' },
          ],
        },
        feedback: 'Sections are yours to name. Type a new one on any task, and it is offered on the next one. In the to-do list, + New list makes one straight away — College, Family, Work, whatever you keep track of.',
        tip: 'Changing Group by never changes a task — it only changes how the same list is gathered.',
      },
      {
        id: 'measurable-goal',
        title: 'A goal you can measure',
        intro: 'Some tasks are not just done or not done. A task can carry a goal, like 15 minutes on the walking pad, and you record what you actually did.',
        demo: { screen: screen('Planner', ['Use the walking pad', '15 minutes goal, 30 done']), highlight: 'Use the walking pad', caption: 'The goal sits under the task in plain words.' },
        activity: {
          type: 'choice',
          question: 'Your goal is 15 minutes and you did 30. How does Study Forge put it?',
          options: [
            { text: '15 minutes goal, 30 done', correct: true, why: 'Reaching the goal is done, and going past it is a bonus. It is never counted against you.' },
            { text: '200% of your goal', correct: false, why: 'There are no percentages on your checklist. Plain words only.' },
            { text: 'You went 15 minutes over your goal', correct: false, why: 'Nothing nags you about the difference. The goal is a baseline, not a limit.' },
          ],
        },
        feedback: 'Goals are optional. Leave them empty and a task is an ordinary tick box.',
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
        id: 'course-names',
        title: 'Courses that came in as codes',
        intro: 'Canvas and most school calendars send only a code, like ACC 211, so an imported course can arrive with that as its name. Courses offers to name those for you.',
        activity: {
          type: 'choice',
          question: 'You rename "ACC 211" to "Managerial Accounting", then get the latest from your calendar again next week. What happens to the name?',
          options: [
            { text: 'It stays "Managerial Accounting"', correct: true, why: 'Right. The code is kept separately, and it is the code that an update matches on, so your name is never written over.' },
            { text: 'It goes back to "ACC 211"', correct: false, why: 'No. That was the old problem. Your name is kept from now on.' },
            { text: 'A second course called "ACC 211" appears', correct: false, why: 'No. The code matches the course you already have, so nothing is added twice.' },
          ],
        },
        feedback: 'The code is kept separately, and it is the code that later updates match on. So the name you give stays, and you will not be asked again.',
        tip: 'Study Forge never guesses a course name from a code: the same code means different classes at different schools.',
      },
      {
        id: 'rename-move',
        title: 'Rename and move a file',
        intro: 'Any file or link can be renamed and moved to another course or topic. Undo appears straight after.',
        activity: { type: 'rename' },
        feedback: 'Renaming and moving never change the file itself, and Undo puts things back if you change your mind.',
      },
      {
        id: 'trash',
        title: 'Using Trash and restoring',
        intro: 'Deleting something moves it to Trash. Nothing is gone until you permanently delete it, or until the time you chose runs out.',
        activity: { type: 'trash' },
        feedback: 'Restore put it back where it was. Permanently delete always asks first, because it can’t be undone.',
      },
      {
        id: 'trash-keeps',
        title: 'How long Trash keeps things',
        intro: 'In Settings, Trash can empty itself after 7, 14, 30, 60 or 90 days — or never. The time starts when you put something in, and restoring it stops the clock.',
        activity: {
          type: 'choice',
          question: 'You have had Study Forge for months, and this setting has just appeared. What happens to what is already in your Trash?',
          options: [
            { text: 'Nothing. It stays until you delete it, or until you choose a time yourself', correct: true, why: 'Right. Your Trash was filled when nothing went until you said so, and an update is not permission to start deleting it.' },
            { text: 'Anything older than 30 days is deleted the next time you open Study Forge', correct: false, why: 'No. 30 days is only the starting point for a brand-new account. Nothing is chosen for you.' },
            { text: 'It is emptied, because the setting is on by default', correct: false, why: 'No. Nothing in your Trash is ever deleted because of an update.' },
          ],
        },
        feedback: 'And if you pick a shorter time that would delete something straight away, Study Forge names what would go and asks first.',
        tip: 'There is no server doing this while Study Forge is closed, so anything past its date goes the next time you open it. That is also why it stays free.',
      },
    ],
  },
  {
    id: 'account',
    title: 'Account, sync and privacy',
    description: 'Accounts across devices, backups, notifications, appearance and privacy.',
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
      },
    ],
  },
];

/** A question with one right answer; the right answer's place varies so it can't be guessed by position. */
const ask = (question: string, right: [string, string], ...wrong: [string, string][]): Activity => {
  const options = wrong.map(([text, why]) => ({ text, correct: false, why }));
  options.splice(question.length % (wrong.length + 1), 0, { text: right[0], correct: true, why: right[1] });
  return { type: 'choice', question, options };
};
const find = (page: string, buttons: string[], target: string, prompt: string, hint: string): Activity => ({ type: 'find', screen: screen(page, buttons), target, prompt, hint });

// Honest limits for the first lessons, shown when each is finished.
const TIPS: Record<string, string> = {
  today: 'Today only uses what you’ve saved. Only your own study blocks can be moved; class deadlines never move.',
  'create-course': 'Archived courses are hidden but kept. A course moved to Trash waits there until you permanently delete it.',
  flashcards: 'Cards are written by you. Nothing is generated by AI.',
  'notes-lists': 'Notes are plain text with simple marks, not a word processor, and nothing in a note can run as code.',
  'record-lecture': 'Ask permission before recording where your class requires it. Audio is saved every 5 seconds, so a crash loses only a few seconds.',
  transcripts: 'Transcripts work best in clear English. They are made on your device, so nothing is uploaded.',
  calendar: 'Google Calendar is read-only: Study Forge never changes your Google events. Day and week grids aren’t built yet; there are month and plan views.',
  trash: 'Courses, topics and files you delete stay where they were but hidden, so restoring is instant. The Trash page itself says how long things are kept, with one tap to change it.',
  'sync-status': 'Signing in, syncing and Google Drive need the internet; everything else works offline after your first visit.',
};
for (const module of MODULES) for (const lesson of module.lessons) if (TIPS[lesson.id]) lesson.tip = TIPS[lesson.id];

const MORE: Record<string, Lesson[]> = {
  'getting-started': [
    {
      id: 'accounts',
      title: 'Do you need an account?',
      intro: 'Accounts are optional. Signing in with email, Google, Microsoft or Yahoo turns on sync between your devices.',
      activity: ask('You use Study Forge without signing in. Where is your work kept?',
        ['Only on this device, so make backups', 'Without an account nothing goes online. A backup file in Settings protects you if the device is lost.'],
        ['Online, in your school account', 'Nothing goes online unless you sign in.'],
        ['Nowhere: it disappears when you close the tab', 'It stays on the device between visits. It just isn’t copied anywhere else.']),
      feedback: 'Right. Sign in when you want your work on more than one device.',
      tip: 'Some school accounts block sign-in with Google or Microsoft. You can still use Study Forge without signing in.',
    },
    {
      id: 'smart-add',
      title: 'The + button',
      intro: 'The + at the top adds anything from anywhere: a file, link, note, flashcards, questions, a recording, a topic or a course.',
      activity: find('Notes', ['New note'], '+', 'You’re reading notes and want to save a web link for this course. Tap the quickest way to add it.', 'It’s at the top, and it adds anything.'),
      feedback: 'Right. The + suggests the course and topic you’re looking at, and you can change them before saving.',
    },
    {
      id: 'templates',
      title: 'Course templates',
      intro: 'A template starts a course with topics and grade categories already in place: Lecture, Lab, Writing, Math or Independent study, or your own.',
      activity: ask('What does a template add to a new course?',
        ['Topic names and grade category names', 'That’s all. You set the weights from your own syllabus.'],
        ['Deadlines from your professor', 'Templates never invent deadlines or requirements.'],
        ['Files and notes from an old course', 'Templates never copy files, notes or grades.']),
      feedback: 'Right. Save any course as your own template from Edit course, and reuse it next term.',
      tip: 'Applying a template only adds what’s missing, so using it twice never makes duplicates.',
    },
    {
      id: 'new-semester',
      title: 'Starting a new semester',
      intro: 'Start a new semester, on Courses, walks you through ending one term and setting up the next.',
      activity: ask('You press Start a new semester. When does anything actually change?',
        ['Only after you review the full list and press Make these changes', 'Every step just collects your choices. Nothing happens until you confirm.'],
        ['As soon as you open it', 'Opening it changes nothing.'],
        ['After each step', 'The steps only gather choices. You confirm everything at the end.']),
      feedback: 'Right. Finished courses are archived, never deleted, and official deadlines are never moved.',
    },
  ],
  'study-tools': [
    {
      id: 'equations',
      title: 'Writing equations',
      intro: 'Notes can draw real equations: fractions, roots, integrals, matrices, chemistry and more.',
      activity: find('Notes', ['Bold', 'Heading', 'Bullets', 'Equation', 'Calculator', 'Preview'], 'Equation', 'You need to write a fraction in your note. Tap the button that adds one.', 'It’s the button named after maths writing.'),
      feedback: 'Right. Equation opens over 50 kinds. The highlighted blank is ready to type over, and Preview shows it drawn.',
    },
    {
      id: 'guided-lessons',
      title: 'Guided lessons in Study',
      intro: 'Study teaches one idea at a time: an explanation, an example, then one question.',
      activity: ask('When does a checkpoint count as mastered?',
        ['After you answer, apply it and explain it in your own words', 'Mastery needs evidence. Opening or clicking through never counts.'],
        ['As soon as you read it', 'Reading isn’t evidence. You have to answer, apply and explain.'],
        ['After one right answer', 'One answer isn’t enough. It takes several answers, an application and an explanation.']),
      feedback: 'Right. Try Add sample lesson in Study to see how it works.',
    },
    {
      id: 'review-or-restart',
      title: 'Reviewing is not starting over',
      intro: 'A mastered checkpoint offers both. Review runs its questions again; Start over gives you a fresh attempt at the whole thing.',
      activity: ask('You mastered a checkpoint in September and want a refresher before an exam. What happens to that September if you press Review?',
        ['Nothing. Reviewing never changes what you mastered', 'Right. A review records only that it happened, even if you get everything wrong.'],
        ['It is cleared, because you are studying it again', 'No. That would make a refresher cost you the thing you were refreshing.'],
        ['It is replaced by today, if today goes better', 'No. Your mastery and its date stay exactly as they were.']),
      feedback: 'And if you do press Start over, what you did before is still kept — the lesson shows it, with the date.',
      tip: 'Once everything in a lesson is mastered, Today suggests the checkpoint you have not looked at for longest, to review.',
    },
    {
      id: 'picking-it-up',
      title: 'Picking up where you stopped',
      intro: 'Stop in the middle of a checkpoint and Study Forge keeps the exact place — the question, the step, even a half-written explanation.',
      activity: ask('How do you find out where you left off?',
        ['The lesson says so under the checkpoint', 'Right: "Paused at question 2 of 6 · 4 days ago", without opening anything.'],
        ['Open it and see', 'You can, but you should not have to. The lesson tells you before you open it.'],
        ['You cannot — you start that checkpoint again', 'No. Nothing you did is lost by stopping.']),
      feedback: 'Today says it too, on the Study next card, so the thing you were in the middle of is easy to start again.',
    },
    {
      id: 'exam-hall',
      title: 'Mock exams and Cram Mode',
      intro: 'Exam Hall times a mock exam made from your practice questions. Cram Mode helps when time is short.',
      activity: ask('You score 85% on a mock exam. What does that tell you?',
        ['How you did on your own questions today, not your real grade', 'Mock exams show what you attempted and got right. They can’t predict a real grade.'],
        ['You’ll get 85% on the real exam', 'It can’t predict your grade: the real exam has different questions.'],
        ['You’ve mastered the course', 'One mock exam isn’t mastery.']),
      feedback: 'Right. Unanswered questions count as wrong, and written answers are checked by you.',
      tip: 'The calculator closes itself during a timed mock exam.',
    },
  ],
};

const FILES: Module = {
  id: 'files',
  title: 'Files, links and textbooks',
  description: 'Add files, read them inside, save links, and keep your place in textbooks.',
  level: 'Everyday',
  icon: '/library',
  lessons: [
    {
      id: 'add-files',
      title: 'Adding files',
      intro: 'Add slides, readings, spreadsheets, pictures, audio and video, and open most of them right inside Study Forge.',
      demo: { screen: screen('Library', ['Add files', 'From Google Drive', 'Save a link instead']), highlight: 'Add files', caption: 'Add files is on the Library and on each course. On a computer you can also drag files straight in.' },
      activity: find('Library', ['Save a link instead', 'From Google Drive', 'Add files'], 'From Google Drive', 'Your reading is in your Google Drive. Tap the way to bring it in.', 'It’s named after where the file is.'),
      feedback: 'Right. A file only says Saved once every byte is on this device and checked, and Download always gives you the original.',
      tip: 'Without Google Drive sync, files live only on this device, so make backups.',
    },
    {
      id: 'file-types',
      title: 'What opens inside',
      intro: 'PDFs, Word, Excel, PowerPoint, EPUB, text, code, pictures, audio and video open inside Study Forge.',
      activity: ask('You add an old .doc file from 2003. What happens?',
        ['It’s kept safely and can be downloaded, but doesn’t open inside', 'Older .doc, .xls and .ppt files are kept, and the page explains how to convert them.'],
        ['It’s refused', 'Nothing is refused. It’s kept and downloadable.'],
        ['It opens as an editor', 'Office files open as reading views, and old .doc files don’t open inside at all.']),
      feedback: 'Right. Word, Excel and PowerPoint open as reading views, and nothing in a file is ever run.',
      tip: 'PowerPoint shows words, pictures and speaker notes rather than the exact slide design.',
    },
    {
      id: 'pdf-textbooks',
      title: 'Reading a PDF textbook',
      intro: 'PDFs have Contents, Go to page and bookmarks, and reopen on the page you stopped at.',
      activity: find('Chapter 4.pdf', ['Contents', 'Go to page', 'Bookmark page', 'Note this page', 'Notes beside it'], 'Bookmark page', 'You want to come back to page 112 later. Tap the button that keeps your place.', 'You’re marking a page to return to.'),
      feedback: 'Right. Name the bookmark if you like. Note this page writes a note tied to that page, with a jump back.',
      tip: 'Contents only appear when the PDF includes a table of contents. Scanned books often don’t, so use bookmarks there.',
    },
    {
      id: 'links',
      title: 'Saving links',
      intro: 'Save any web address, such as articles, Canvas, YouTube or Google Docs, next to the course it belongs to.',
      activity: ask('You save a link to a Google Doc. What does Study Forge keep?',
        ['A shortcut that opens the Doc in Google', 'A saved link is just a shortcut. To keep a copy, download it from Google and add the file.'],
        ['A full copy of the Doc', 'Links aren’t copied. Download the Doc if you want a copy.'],
        ['Your Google password', 'Never. You log in to Google yourself, as usual.']),
      feedback: 'Right. Deleting a link never deletes the page it points to.',
    },
    {
      id: 'online-textbooks',
      title: 'Online textbooks like Cengage',
      intro: 'Links to Cengage, Connect, MyLab, WebAssign, VitalSource and similar sites become Online textbooks.',
      activity: ask('Can Study Forge show your Cengage book’s pages?',
        ['No: the book opens on Cengage with your account, and Study Forge keeps your place in your own words', 'Paid sites need your own login, so the book always opens there. Type where you are, like “Chapter 4, page 112”.'],
        ['Yes, it copies the book', 'It never copies paid books or gets around logins.'],
        ['Only if you give it your password', 'Study Forge never asks for or sees your login.']),
      feedback: 'Right. Save spots like “Homework 5” with a direct address, and link the book to assignments.',
      tip: 'If a site isn’t recognised, set the link’s Kind to Online textbook on its page.',
    },
    {
      id: 'shelves',
      title: 'Your personal library',
      intro: 'Shelves keep things worth keeping beyond one course, such as research, career information and writing guides.',
      activity: find('Library', ['Everything', 'Personal library', 'Add files'], 'Personal library', 'Tap the tab that shows your shelves.', 'It’s your own library, apart from your courses.'),
      feedback: 'Right. Tick files, type a shelf name and press Put on shelf. Shelving never copies or moves a file.',
    },
    {
      id: 'search',
      title: 'Finding anything',
      intro: 'Search looks through notes, files, links, flashcards, practice, planner and lessons at once.',
      activity: ask('You search “mitosis”. Where can it find the word?',
        ['Inside PDFs, Office files, scanned pages, pictures and transcripts too', 'Search reads the words inside them, on your device.'],
        ['Only in file names', 'It reads inside files as well, not only names.'],
        ['Only in notes', 'It searches everything you’ve saved.']),
      feedback: 'Right. Every word has to match, and a PDF result opens on the right page.',
      tip: 'Files over 300 MB aren’t searched inside. Searching happens on your device, so nothing is sent anywhere.',
    },
  ],
};

const PLANNING_MORE: Lesson[] = [
  {
    id: 'priorities',
    title: 'Ordering your work',
    intro: 'The Planner can sort by due date, points, grade impact, quickest first, importance, or your own mix.',
    activity: ask('A 10-point quiz is in a category worth 40% of your grade. A 50-point homework is in a 10% category. Which matters more to your grade?',
      ['The quiz', 'Grade impact depends on the category weight, not just the points. The quiz is a bigger share of your grade.'],
      ['The homework', 'More points, but its category counts for far less of your grade.'],
      ['They’re the same', 'Points and grade impact are different things.']),
    feedback: 'Right. Greatest grade impact sorts this way for you, and Pin keeps anything at the top.',
    tip: 'Missing points or estimates are never made up; items without them say so.',
  },
  {
    id: 'grades',
    title: 'Tracking grades',
    intro: 'Each course has Grades: add categories and weights, enter scores, and try a what-if.',
    activity: ask('An assignment hasn’t been graded yet. How does it affect your grade in Study Forge?',
      ['It doesn’t count until it has a score', 'Work not yet graded never counts as a zero.'],
      ['It counts as zero', 'Never. Ungraded work is left out until you enter a score.'],
      ['It counts as full marks', 'It isn’t counted at all until you enter a score.']),
    feedback: 'Right. “If everything left scores…” shows a what-if without changing your real grades.',
  },
];

const RECORDING_MORE: Lesson[] = [
  {
    id: 'moment-notes',
    title: 'Notes tied to the moment',
    intro: 'While recording, notes can be tied to the exact moment in the lecture.',
    activity: find('Record', ['Stop', 'Note this moment', 'Pause'], 'Note this moment', 'The professor says “this will be on the exam”. Tap the button that marks this moment.', 'You want to remember this exact moment.'),
    feedback: 'Right. Later, tapping that note plays the lecture from that moment. Notes can be downloaded or printed.',
  },
];

const ACCOUNT_MORE: Lesson[] = [
  {
    id: 'drive-sync',
    title: 'Files across devices',
    intro: 'Notes and course details sync when you sign in. Files themselves travel through your own Google Drive, if you turn it on.',
    activity: ask('You turn on Sync files with my Google Drive. What can Study Forge see in your Drive?',
      ['Only the files it put there', 'It uses a permission limited to its own Study Forge folder.'],
      ['All your Drive files', 'No. It only sees the files it puts in its own folder.'],
      ['Nothing; it uses its own storage', 'Files go to your own Drive space, in a Study Forge folder.']),
    feedback: 'Right. A file counts as synced only after Drive confirms it arrived intact.',
  },
  {
    id: 'backups',
    title: 'Making a backup',
    intro: 'A backup saves everything, including your original files, to one .zip you keep.',
    activity: find('Settings', ['Appearance', 'Create backup', 'Restore from backup', 'Device permissions'], 'Create backup', 'You’re about to get a new laptop. Tap the button that saves everything to a file.', 'You’re making a backup.'),
    feedback: 'Right. Restore from backup on the new laptop only adds what’s missing, so nothing is overwritten.',
    tip: 'Appearance settings like light or dark aren’t in backups.',
  },
  {
    id: 'notifications',
    title: 'Notifications and permissions',
    intro: 'Your browser decides about the microphone, camera and notifications. Settings shows what it allows.',
    activity: ask('Notifications won’t turn on in Safari on your iPhone. What’s needed first?',
      ['Add Study Forge to your Home Screen and open it from there', 'On iPhone and iPad, notifications only work from the Home Screen.'],
      ['A paid account', 'Nothing is paid. It’s how Apple handles website notifications.'],
      ['Turning off Wi-Fi', 'That won’t help. Add it to the Home Screen.']),
    feedback: 'Right. If anything says Blocked in Settings, tap it for the exact steps for your browser.',
  },
  {
    id: 'appearance',
    title: 'Light, dark and text size',
    intro: 'Switch light and dark in one tap, and set text size, motion, spacing and date format in Settings.',
    activity: find('Today', ['Start studying'], 'Light / dark', 'It’s late and the screen is too bright. Tap the quickest way to switch to dark.', 'It’s the sun or moon at the top.'),
    feedback: 'Right. Settings also offers Match Device, or switching at sunrise and sunset.',
  },
  {
    id: 'privacy',
    title: 'Your privacy',
    intro: 'The Terms of Use and Privacy Policy are linked in Settings. You agreed to both before starting.',
    activity: ask('What does Study Forge use your information for?',
      ['Only to run Study Forge: no ads, tracking cookies or analytics, and it’s never sold', 'That’s what the Privacy Policy promises.'],
      ['Showing you ads', 'There are no ads.'],
      ['Selling it to schools', 'Your information is never sold.']),
    feedback: 'Right. Delete my online copy, in Settings, removes what’s saved online.',
  },
  {
    id: 'undo',
    title: 'Undo',
    intro: 'After renaming, moving or deleting something, Undo appears at the bottom of the screen.',
    activity: ask('You moved a file to the wrong course an hour ago and then closed Study Forge. Can Undo fix it now?',
      ['No: Undo lasts for your current visit, so move it back yourself', 'Undo is for straight after a change. Later, just move it back, or restore it from Trash if you deleted it.'],
      ['Yes, Undo works forever', 'Undo only lasts for your current visit.'],
      ['Only if you’re signed in', 'Signing in doesn’t change how long Undo lasts.']),
    feedback: 'Right. If something changed since, Undo explains why it can’t and changes nothing.',
  },
];

for (const [id, lessons] of Object.entries(MORE)) MODULES.find((module) => module.id === id)!.lessons.push(...lessons);
MODULES.find((module) => module.id === 'planning')!.lessons.push(...PLANNING_MORE);
MODULES.find((module) => module.id === 'recording')!.lessons.push(...RECORDING_MORE);
MODULES.find((module) => module.id === 'account')!.lessons.push(...ACCOUNT_MORE);
MODULES.splice(1, 0, FILES);

export const ALL_LESSONS = MODULES.flatMap((module) => module.lessons.map((lesson) => ({ ...lesson, moduleId: module.id })));
export const lessonById = (id: string) => ALL_LESSONS.find((lesson) => lesson.id === id) ?? null;

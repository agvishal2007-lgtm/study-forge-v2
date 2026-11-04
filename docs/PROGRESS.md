# Progress

## Milestone 1: "Save it, close it, find it"

**The goal:** a student can save a file, close the browser, come back, and open that same file.

### What works
- Courses and topics: create and delete them. Deleting either one keeps its files.
- Saving files: choose or drag several at once, with real progress and a Cancel button.
- Duplicates: the same file is recognized by its contents, even under a new name. The student can open the existing copy, move it here, or cancel.
- Library: every file in one place, with search by name.
- Opening files: PDFs with page turning and zoom, images, audio, video, and plain text. Anything else offers a download.
- Moving a file to another course or topic.
- Deleting a file: always asks first.
- Settings: shows how much space is used and asks the browser to keep files.
- A phone layout, and one screen can fail without taking down the rest of the app.

### How it was tested
`tests/app.test.cjs` drives a real Chromium browser, including fully closing and reopening it with the same profile. It checks that a downloaded file is byte-for-byte identical to the original, that audio and video actually advance when played, and that a cancelled 300 MB save leaves nothing behind.

### Not tested yet
- Safari, iPhone, Firefox, and real phones. Only Chromium was used, with phone-sized windows.
- MP4 and MOV playback. The test browser can't play those formats, so only a WebM video and a deliberately broken MP4 were tried.
- Files larger than 300 MB. The 10 GB goal is unproven.
- Real course files, such as a long scanned PDF.

### Not built yet
- Working offline after the first visit. Saved files stay on the device, but the site itself still has to load from the internet.
- Search inside PDFs, PDF outlines, and next/previous file buttons.
- Viewing Office files such as Word and PowerPoint. They can be saved and downloaded.
- Renaming courses and topics, and the course details in the blueprint, such as instructor and schedule.
- Automatic test runs on GitHub, and a code style checker.

## Milestone 2: Lecture recording

**The goal:** a student can record a lecture from the microphone, and a crash or a closed browser loses only the last few seconds.

### What works
- Recording with a name, course, and topic, plus pause and resume.
- A sound bar that shows the microphone is really hearing something.
- Audio is saved to the device every 5 seconds while recording.
- Recording continues across screens, with a bar on every other screen so it can't be forgotten.
- Closing the browser mid-recording: Today and Record offer to save or discard what was captured. Discarding asks first.
- Clear messages for a blocked microphone, no microphone, a lost microphone, a browser that can't record, and a full device.
- Replaying with a working seek bar. Recordings also appear in the course, topic, and Library.
- Adding recordings made in another app.
- Existing students' saved data is kept when the site updates.

### How it was tested
`tests/recording.test.cjs` uses Chromium's simulated microphone. It decodes the saved file to check for real sound in both halves, closes the browser mid-recording and recovers the audio, and upgrades an older saved database. `npm test` ran all 26 tests six times in a row without a failure.

Running the tests repeatedly also found and fixed two real bugs: deleting a file could send the student to the wrong place or out of the app, and progress redrew too often on large files.

### Not tested yet
- **A real microphone and a real lecture.** All testing used a simulated microphone and recordings under a minute.
- **iPhone and Safari.** Bug reports from 2023 say installed iPhone web apps lose the microphone when the screen locks, and Safari records in a different format. This is the biggest open risk.
- Recording for several hours, or until a device runs out of space. The space message itself was not triggered in a test.
- A true power loss or browser crash. The test closes the browser abruptly, which is close but not identical.

### Not built yet in recording
- Transcription, and summaries or flashcards from a lecture. These come later and are optional.
- MP3 output. Recordings are saved in the format the browser produces, usually WebM on laptops.

## Virtual lecture recording

**The goal:** a student watching a lecture online can capture the screen and all of its sound.

### What works
- The Record screen asks whether the lecture is in person or virtual.
- Virtual records the shared tab, window, or screen with its audio, about 500 MB per hour.
- An option adds the student's microphone, mixed into the same file.
- A clear warning if the lecture's sound isn't being captured, and a notice after 20 seconds of silence in either mode.
- The browser's own Stop sharing button saves the recording.
- Closing the browser mid-recording keeps what was captured, the same as in-person recording.
- Devices that can't share a screen see an explanation, and in-person recording still works.

### How it was tested
`tests/screen.test.cjs` uses Chromium's simulated screen and sound. It checks for a real picture in the saved file, and tests the lecture sound and microphone separately to prove each one reaches it. With the fixes below, all 39 tests across the three test files passed eight runs in a row.

Earlier repeat runs found a real bug, now fixed: a save cut off by a reload could leave an empty entry in storage. The Cancelled label also appeared before a save had actually stopped.

### Limits that come from browsers
- **Phones:** iPhones and Android browsers generally can't share their screen with a website, so virtual recording is for computers.
- **Sound:** Chrome and Edge capture a shared tab's sound on every computer type. Capturing the whole computer's sound, such as the Zoom or Teams app, is mainly a Windows and ChromeOS option. On a Mac, a browser tab is the reliable route.
- **Safari and Firefox:** these may record the picture with no sound. The app shows its warning when that happens.

### Not tested yet
- A real screen, real lecture, and real sharing choices. The picker itself was skipped in testing, so a person must check it.
- Long recordings. Several hours would be over 1 GB, and joining that many pieces hasn't been tried.
- Whether the saved video's seek bar works well on long recordings.

## Notes

**The goal:** a student's own writing lives with their courses and is never lost by accident.

### What works
- Notes save as you type, including when leaving the screen or the page right after typing.
- A note can be filed under a course and topic, and can be about a specific file or recording.
- Notes appear in Notes, on their course, under their topic, on their file, and on Today.
- Search covers titles and note text.
- A blank note saves nothing.
- If two tabs edit one note, the student chooses which version to keep. Leaving without choosing keeps both.
- If a save fails, the app says so, keeps the text on screen, and offers a retry.
- Deleting a note asks first. Deleting its course, topic, or file keeps the note.

### Not built yet
- Formatting, such as bold, headings, and lists. Notes are plain text.
- Jumping to a moment in a recording from a note.
- Turning notes into flashcards or practice questions.

## Backup and restore

**The goal:** losing a device doesn't mean losing everything.

### What works
- Settings creates one .zip file with folders a person can browse, so files and notes open without Study Forge.
- Browsers that allow it write straight to the chosen location, so a large backup doesn't have to be built in memory first. Others build it in browser storage, then download it.
- Each backup's contents are listed and checked after it's created. Files the browser has lost are named.
- Restore shows what's in the backup first and only ever adds. Nothing on the device is replaced or deleted.
- Every restored file is checked against the fingerprint saved in the backup. Damaged files are named and skipped, and the rest still restore.
- Restoring twice changes nothing. A note that differs from the device's version comes back as a copy marked "from backup".
- Cancelling is safe at any point, and restoring again finishes the job.
- Files that aren't Study Forge backups, are damaged, were recompressed, or came from a newer version are refused with a clear message.
- Today reminds the student if they've never backed up, or haven't in 14 days.

### How it was tested
`tests/backup.test.cjs` restores a real backup into a fresh browser and compares every file byte for byte, including a recording, a non-English file name, and two files with the same name. Python's zip tools independently confirm the file is a valid zip. Hand-damaged and deliberately unsafe backups are tried too. `tests/notes.test.cjs` covers notes.

All 73 tests that existed then passed six runs in a row. Every publish now runs the tests first, and a failure stops it.

### Not tested yet
- **Backups over 350 MB.** The format for zips over 4 GB was only tested with a small hand-built file, so a real multi-gigabyte backup still needs a try.
- Safari, Firefox, and real phones. Only Chromium was used. Browsers without a save-location choice may struggle with very large backups.
- Restoring until a device runs out of space.

### Not built yet
- Automatic or scheduled backups, and syncing between devices. A student makes each backup by hand.
- Backups don't include interrupted recordings, until they're saved. The app warns about this.

## Guided Study

**The goal:** students understand a topic, not just memorize answers. The sequence is teach, example, practice, explain, evaluate, mastery, progress, next topic.

### What works
- The Study screen, with a sample lesson and a way for students to write their own lessons. Lessons can be called lessons, chapters, modules, or units.
- Teaching always comes before practice, in small steps. A checkpoint with no teaching can't be started.
- One question at a time, with nothing preselected, an explicit Submit, and the answer kept out of the page until then.
- Multiple choice grades itself. Typed answers grade themselves on an exact match, and otherwise the student compares against a model answer.
- A miss gets targeted reteaching with a different example, then a new question. Earlier right answers are kept.
- Missing the same idea twice marks it Needs Review, with choices to try another example, review the source, or move on. Nobody is blocked.
- After practice, the student explains it in their own words, then compares that to the saved key points.
- Progress is shown throughout, and counts rise only from real evidence. Today and Study recommend what's next and why.
- Every action saves as it happens, so a reload or double-click can't lose or double-count anything.
- Lessons and progress are in backups.

### The mastery rule
`src/data/mastery.ts` holds these rules and numbers. All of them must be true:
1. Teaching was shown, or the student chose "I already know this".
2. At least 3 questions were answered, or all of them if there are fewer.
3. At least 80% of the latest answers are right.
4. At least one application question or worked problem is right, if the checkpoint has one.
5. The student's explanation covered every key point.

The numbers are starting values, not research findings, and should change after real use.

### How it was tested
`tests/mastery.test.cjs` tests the rules directly, and `tests/guided.test.cjs` follows the spec's acceptance tests in a real browser, including part of a session with the internet off. All 112 tests across the seven test files passed five runs in a row.

### Known limits
- **Without AI, explanations are self-checked.** Students compare their own work to the key points, so mastery depends on their honesty. The app labels this clearly.
- Typed answers need a model answer written in advance, and nothing judges a free-written answer.
- Lessons have to be written by hand, apart from the sample. Generating them from uploaded files needs AI.
- Spaced review isn't built, so a mastered checkpoint doesn't come back later yet.
- Checkpoints can't be reordered after they're created.
- The sample lesson hasn't been reviewed by an accounting instructor.

## Google sign-in and saving online

**The goal:** students can sign in with Google so their work follows them, and nobody can reach anyone else's work.

### What works
- Sign-in is optional. Students who don't sign in save nothing online, though every screen loads the sign-in code so Google's window can open on the first tap.
- Courses, topics, notes, lessons, and study progress save online a few seconds after changes. Files and recordings stay on the device.
- Each account has separate storage on the device, so a second student on a shared computer can't open the first student's work in the app.
- Sign out is one click, and the student's work stays on the device under their account. For shared computers, Settings has an option to remove it, which warns that files will be deleted and refuses unless the text saved online first.
- Work from before signing in is only added to an account if the student chooses.
- If two devices change a note or checkpoint, both versions are kept. Progress combines the answers from both devices. A course, topic, or lesson renamed on two devices keeps the name on the device that syncs last.
- Being offline, reaching the free daily limit, or being refused all show plain messages. Work stays safe on the device and catches up later.
- Students can delete their online copy.

### How privacy works
`firestore.rules` allows a signed-in student to reach only their own items and refuses everything else. It also limits what can be stored, so the free storage is harder to abuse.

Whoever owns the Firebase project can technically view stored data in its admin console, and the app says so. The data isn't end-to-end encrypted.

### How it was tested
- `tests/firebase.test.mjs` runs the real rules and sync code on Google's Auth and Firestore emulators on GitHub. Another student and someone not signed in are refused for reading, listing, changing, and deleting.
- `tests/account.test.cjs` runs two-device sync and shared-computer separation in real browsers, using a stand-in for the online service.
- All 128 browser and rule tests passed four runs in a row here, and GitHub's full run passed, including all 11 emulator tests.

### Not tested yet
- **Real Google sign-in, and any TCNJ account.** Automated tests skip Google's real sign-in window, so the owner must try it. TCNJ may block unapproved apps, and accounts marked under 18 may need the school's approval.
- The real Firebase project, including whether its rules were saved correctly.
- Sign-in on phones. Google's window can behave differently there, and pop-up blockers may interfere.

### Limits
- Saving online shares Firebase's free daily limits across all students: about 50,000 reads, 20,000 writes, and 1 GB of storage. On the free plan, it stops rather than charging, so the project must stay on the free plan unless the owner chooses otherwise.
- On a new device, notes keep their text, but links to files that aren't on that device don't open.
- A single note or checkpoint over about 900 KB stays on the device, and the app names it.
- A Google account's data is separate from the student's backups, which are still the only protection for files and recordings.

## Walkthrough

**The goal:** a new student learns what each part of the site does, on the real screens.

### What works
- It never opens by itself. Students start it with the question mark at the top right, or a link on the welcome screen.
- There are 15 steps, covering only what exists today. Planner, Exam Hall, and Tutor aren't built, so they aren't included.
- Everything goes dark except a box around the part being explained, and nothing outside the walkthrough can be clicked or reached by keyboard.
- It opens each real screen by itself and scrolls to the right spot.
- An X closes it at any time, as does Esc. Back, Next, Start over, and Finish are there where they apply.
- It starts at 0%, and only finished steps count.
- Reopening it resumes at the same step, unless it was finished, which starts it over.
- If a part isn't on screen, it says so and carries on instead of crashing.
- Starting it from the lesson editor warns first, because moving between screens would lose unsaved changes.

### How it was tested
`tests/walkthrough.test.cjs` checks every step in a real browser: the right screen, a box matching the section, and the explanation on screen. It also covers blocked clicks, keyboard use, resuming, cleanup, and phone size.

### Known limits
- Three steps are hands-on so far, and Next stays locked until they're done: adding a course, adding the sample lesson, and writing a note. Work already done isn't asked for again, and what students make is real and stays. Other parts, such as adding a file or recording, are only explained, because not everyone has a file or a microphone ready.
- Its place is remembered per device, not across devices.
- On small phones, the explanation can cover part of a tall highlighted section.
- It hasn't been tried on a real phone yet.

## Look and feel

The owner asked to replace the yellow and square buttons. The site now uses a sky blue accent on navy, fully rounded bubble buttons, and softer corners throughout. Older courses with the yellow color update automatically, including when restored from a backup.

## Planner

Students add assignments, exams, quizzes, projects, presentations, readings, and study sessions, each with an optional course, due date, due time, priority, estimated hours, and details. Each item has one of six statuses, from Not Started through Completed.

What it does:
- The Planner groups items into Overdue, Today, Tomorrow, Next 7 days, Later, No due date, and Done, with the soonest first and importance breaking ties.
- Today shows a Due soon list covering anything overdue or due within 7 days, above the existing study recommendation.
- Submitted, Waiting for Grade, and Completed count as done, so finished work never shows as overdue.
- Dates are kept as the calendar date the student wrote, so they don't shift between time zones.
- Study Forge never makes up assignments or dates. It shows only what the student entered.
- Deleting a course keeps its planner items, with no course attached. Deleting an item asks first.
- Items are included in backups and saved online. If two devices change the same item, the most recent change wins.

Tested with a real browser and a fixed clock: the groups and wording, month and year changes, the US clock change, the form's checks, marking done from Today, filtering by course, backup and restore into a fresh browser, updating from the previous version's database, a phone-sized screen, and two devices syncing. Syncing is tested against a stand-in server and the Firebase emulator, not two real devices.

Not built yet:
- Reminders or notifications.
- Linking an item to specific files or notes.
- A calendar view, repeating items, and completion percentage.
- Weak-topic recommendations mixed into one queue. Today shows Due soon and Study next side by side, and there's no time-based ranking between them.

## Flashcards

Students write cards in decks, optionally filed under a course and topic, then review them. The answer isn't in the page until Reveal answer is pressed. After that, Again, Hard, Good, and Easy each show when the card will come back.

The schedule, from the blueprint's 1, 5, 10, and 15 day steps:
- Good moves a card to the next step. Easy skips a step. A new card's first Good is 1 day, and Easy is 5 days.
- Hard brings it back tomorrow without moving it forward.
- Again starts it over and shows it again in the same session.
- Weak means Again was the last answer, or Again came up twice or more and Good hasn't followed twice in a row since.
- These numbers are starting values, to adjust after real use.

Practice all and Practice weak cards never change the schedule. Keyboard: Space reveals, and 1 to 4 rate. Deleting a course keeps its decks. Deleting a deck or card asks first. Cards and their schedule are in backups and saved online, and the most recent change wins if two devices differ.

Tested in a real browser with a fixed clock: the answer hidden until revealed, ratings and dates, resuming after a reload, a double key press counting once, practice leaving the schedule alone, editing, deleting, backup and restore, updating from the previous database, and a phone-sized screen. Syncing is tested against a stand-in server and the Firebase emulator, not two real devices.

Not built yet:
- Making cards from documents, notes, or lecture transcripts, which needs AI.
- Importing cards, pictures on cards, and text formatting.
- A smarter schedule that adapts to each student.

## Dashboard

Today now follows the owner's Daily Dashboard format: a dated title, a one-line summary, a row of count tiles, then cards listing what needs attention. A course shelf, recent work, and shortcut buttons from the blueprint are included too.

- The tiles count items due in 7 days, overdue items, flashcards due, weak cards, and lessons needing review.
- Each deadline shows when it's due, its next step, its priority, and its course, with a one-tap Done button.
- The next step comes only from the item's type and status, such as Start studying or Submit it.
- Overdue work sits in Still open from before, as in the Daily Dashboard format. It also appears in the tiles and the summary, so it can't be missed at the top.
- What this counts explains every number on the page.

Tested in a real browser with a fixed clock: the welcome screen for new students, honest zeros, tiles and lists matching saved work, numbers updating after changes, and a phone-sized screen.

Not built yet: study streaks, practice accuracy, exam readiness, and AI usage from the blueprint's dashboard list, because the features behind them don't exist yet. Exams aren't separated from other deadlines yet.

## Practice

Students write question sets by course and topic, then answer without their notes. Types are multiple choice, short answer, fill in the blank, definition, formula application, worked problem, and concept explanation.

- Nothing is selected at the start, an empty answer can't be submitted, and the answer isn't in the page until after submitting.
- Multiple choice grades itself, and typed answers matching an accepted answer do too. Other typed answers are compared with the model answer and labelled self-checked.
- An optional "How sure are you?" lets feedback call out being sure and wrong as a likely misunderstanding.
- A reload restores the same question and any draft. Each presented question counts once.
- Accuracy uses the latest answer to each question, with partly right counting as half. Under 70% is a weak topic, which is a starting value.
- Review mistakes and weak-topic practice repeat what was missed. Accuracy and weak topics appear on Today.
- Sets, questions, and answers are in backups and saved online.

Not built yet: making questions with AI, timed mock exams, and Cram Mode. Practice on a phone uses small section buttons, since nine now share the bottom bar.

## Sign up, email login, and recovery

- A Sign up button sits beside Sign in, and both open a page with email and password plus Google. Microsoft is on. Facebook was removed, because Meta asked for legal business documents that Study Forge doesn't have.
- Password accounts get a confirmation email, with a reminder and resend in Settings. Confirming isn't required to use the account.
- Forgot password sends Firebase's reset email and never reveals whether an account exists.
- Forgot email shows shortened hints of accounts used in this browser, plus places to look. It can't search by name, because that would reveal who has an account.
- A Privacy page says what's kept and how to remove it.

Tested with a stand-in server, plus the real sign-in code against Firebase's emulator for email accounts. Real Microsoft sign-in and real emails arriving haven't been tried. Texted codes aren't on the free plan, emailed sign-in links stop at 5 a day, and Firebase has no Instagram login.

## Adding files from other services

Files can come from the device, Google Drive, or Dropbox. Picked files are copied to the device and saved like any other file. Google's own Docs, Sheets, and Slides are saved as PDFs. Drive access only reaches files the student picks. Each source appears once its key is added to `src/data/cloudSetup.ts`.

The buttons and saving are tested with a stand-in for each service. On 2026-11-04 the owner confirmed the real Google Drive window worked on the live site. The Dropbox button stays hidden until its key is added, and the real Dropbox window hasn't been tried. OneDrive isn't built yet.

## Works offline

After one visit, a service worker keeps a copy of the site on the device, so it opens with no internet. It holds only the site's own files. Students' work stays in the browser's storage as before.

- A notice says when the device is offline. Courses, files, notes, the planner, flashcards, practice, lessons, and recording keep working, and online saving catches up later.
- Signing in, saving online, and adding files from Google Drive need the internet, and say so.
- A new version waits until the student presses Refresh now, so nothing changes in the middle of their work.
- Settings shows whether the site is saved for offline use, with an Install button where the browser offers one and instructions where it doesn't.

Tested in a real browser with the network turned off: opening, reloading on an inner screen, saving work, viewing a PDF, the sign-in message, and a new version being offered. Not tried yet on a real phone, in Safari or Firefox, or as an installed app.

## Reading Office files in the app

Word (.docx), Excel (.xlsx), and PowerPoint (.pptx) files now open right in the viewer, with no link or download, and work offline. These are reading views, and each says so:

- Word shows the text, headings, lists, tables, and pictures. Anything risky in the file is removed before it's shown.
- Excel shows each sheet in a table with tabs. Formulas show their last saved result, and very long sheets stop at 2,000 rows with a message.
- PowerPoint shows each slide's title, text, pictures, and speaker notes in order, but not the slide design.
- Older .doc, .xls, and .ppt files can't be read in a browser, so they explain how to convert them. Anything that can't be read offers the download instead.

Tested in a real browser using small test files. Not tried yet with real, complicated Office files.

## Exam Hall and Cram Mode

Exam Hall gathers exam preparation in one place. It has one button: in the sidebar on computers, and in the sliding bottom bar on phones.

- Mock exams pull shuffled questions from practice sets, by course, with a question count and an optional time limit. The clock keeps running if the page closes, and time running out submits the exam.
- Answers and feedback stay hidden until the end. Unanswered questions count as wrong. Written answers that don't match an accepted answer wait for the student to check them, and no score shows until they're checked.
- Results feed Practice's mistakes and weak topics. Scores are saved, with first-to-latest improvement once there are two scored exams.
- There's no readiness percentage, as the blueprint warns against arbitrary ones. Exam Hall shows counts from saved work, and says it can't predict a grade.
- The final revision checklist updates from saved work.
- Cram Mode has Exam Tomorrow, Last Hour, Quick Review, and Weak Topics Only. Each builds an ordered plan from saved work that fits the time, with rough time estimates of 2 minutes a question and 30 seconds a card.

Tested in a real browser, including timing, reloads, and a clock that runs out. Not built yet: choosing exams by topic, or printing an exam.

## Formatted notes and search

**Notes** have a toolbar for bold, italics, headings, bullets, numbers, and checklists, plus Cmd or Ctrl with B or I, and a Preview. Notes stay plain text with simple marks, such as `**bold**`. That keeps every older note unchanged, keeps saving online and backups the same, and means a note can't run code on the site. It isn't a word-processor view, so formatting shows in Preview rather than as you type.

**Search** is the magnifying glass at the top. It looks through notes, files, flashcards, practice questions, the planner, lessons, and courses, and every word has to match, ignoring capitals and accents. It also reads the words inside PDFs, Word, Excel, PowerPoint, and text files, on the device only. A PDF result opens on the matching page.

Limits: scanned PDFs have no words to read, and Study Forge says so. Files over 300 MB are searched by name only. The words read from files aren't backed up or saved online, because each device can read them again. Search is built for a student's own files, and hasn't been tried with thousands of large PDFs.

## How the code is organized

- `src/data/` holds saved data, and nothing else talks to storage directly.
  - `db.ts` is the browser database, the one source of truth for courses, topics, and file records.
  - `blobs.ts` stores the original files.
  - `store.ts` holds the actions, such as "create course" and "delete file".
  - `recordings.ts` saves recordings in small pieces and turns them into finished files.
  - `notes.ts` saves notes and catches changes from another tab.
  - `backup.ts` and `zipReader.ts` create and restore backups.
  - `mastery.ts` holds the Guided Study rules, and `guided.ts` saves lessons and progress.
  - `flashcards.ts` saves decks, cards, and reviews, and `flashcardRules.ts` holds the schedule.
  - `dashboard.ts` writes the dashboard's summary and next steps.
  - `practice.ts` saves practice work, and `practiceRules.ts` holds its rules.
  - `cloudImport.ts` picks files from Google Drive and Dropbox.
  - `authMessages.ts` and `knownAccounts.ts` support signing in and recovery.
  - `offline.ts` tracks offline status and updates, and `sw-template.js` is the service worker.
  - `pptxReader.ts` reads PowerPoint files.
  - `exams.ts` saves mock exams, and `examRules.ts` holds their scoring and Cram Mode's plans.
  - `noteFormat.ts` handles note formatting, `searchRules.ts` handles matching, and `fileText.ts` reads words from files.
  - `planner.ts` saves planner items, and `plannerRules.ts` holds the date rules.
  - `account.ts` keeps each account's storage separate, and `sync.ts` holds the saving-online rules.
- `src/components/` holds pieces used on several screens, such as the saving panel and the recorder.
- `src/features/` holds one file per screen.
- `tests/` holds the browser tests.

This split answers the old prototype's problems: one 8,000-line file, four competing data stores, and uploads stuck at 99%. A file here counts as saved only after the whole original is stored, and AI has no part in it.

## Calendar and schedule

The Calendar section follows the owner's Notion calendar: **Today's Plan** (today's unfinished items, in order), **Plan Calendar** (the whole month), plus a **Deadline Calendar** (Planner due dates), so when work happens stays separate from when it's due.

- Each meeting of a class is its own saved item, so one can be marked completed or changed without touching the rest. Editing can also apply to later meetings.
- Add class schedule reads a pasted schedule (MWF, TR, TTh, MoWeFr, Mon/Wed, and whole day names), shows it for checking, and saves every meeting between the first and last day of classes. Lines it can't read are shown, never guessed. Saving again updates rather than copies.
- Connect Google Calendar is read-only. The student picks calendars and checks first guesses before anything is saved. Canvas comes through when it's added to Google Calendar, and its work goes in the Planner with the course tag tidied away. Get the latest updates what changed and keeps the student's course, type, notes, and status. Things they removed stay removed.
- Older deadlines from Google aren't added. A deadline that disappears from Google stays in the Planner. A class already saved from the schedule isn't added twice.
- Not automatic: updates happen when the student presses Get the latest, because Study Forge has no server.
- Tested with a stand-in for Google, not yet against the real one. Until Google verifies the app, students see a warning, and there's a limit of 100 new users.

After signing in with Google, a one-tap offer connects that same account's calendar, using first guesses that can be changed later. It reads the main calendar plus anything that looks like school or Canvas. Calendar has a Get the latest button. While Google's permission lasts, about an hour, opening Calendar also updates by itself. Asking inside the sign-in window itself would show every Google user the unverified warning, so that waits for Google's verification.

## Progress and streaks

Progress shows the current and longest streak, a 12-week activity grid, and each course's lessons, flashcards, practice, planner, and latest mock exam. A study day means a flashcard review, a practice answer, a finished mock exam, or lesson work. It doesn't track study time or predict grades. Each device keeps its own daily counts, so two devices never overwrite each other.

## Schedule pictures

Add class schedule also takes a picture: a file, a dragged picture, or a pasted screenshot. It's read in the browser with Tesseract, so nothing is uploaded and it's free. Table lines are erased and dark screenshots are flipped first. The text goes in the box to fix, and the classes go through the usual check. The reader is about 7 MB, downloads on first use, and then works offline. Weekly-grid pictures aren't understood yet, because the days come from column positions. Tested with generated pictures, not real school schedules or real phone photos.

## Look

Clean and light by default, with a dark mode. The moon or sun button at the top switches modes, and Settings also has Match my device. On small phones the switch is only in Settings. Colors are tokens at the top of `src/styles.css`, so both modes stay matched. The font is Figtree. Buttons stay rounded bubbles and blue is the one accent, as the owner chose earlier. The bookshelf stays as the signature.

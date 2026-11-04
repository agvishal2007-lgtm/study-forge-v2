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

All 73 tests across the five test files passed six runs in a row. Every publish now runs the tests first, and a failure stops it.

### Not tested yet
- **Backups over 350 MB.** The format for zips over 4 GB was only tested with a small hand-built file, so a real multi-gigabyte backup still needs a try.
- Safari, Firefox, and real phones. Only Chromium was used. Browsers without a save-location choice may struggle with very large backups.
- Restoring until a device runs out of space.

### Not built yet
- Automatic or scheduled backups, and syncing between devices. A student makes each backup by hand.
- Backups don't include interrupted recordings, until they're saved. The app warns about this.

## How the code is organized

- `src/data/` holds saved data, and nothing else talks to storage directly.
  - `db.ts` is the browser database, the one source of truth for courses, topics, and file records.
  - `blobs.ts` stores the original files.
  - `store.ts` holds the actions, such as "create course" and "delete file".
  - `recordings.ts` saves recordings in small pieces and turns them into finished files.
  - `notes.ts` saves notes and catches changes from another tab.
  - `backup.ts` and `zipReader.ts` create and restore backups.
- `src/components/` holds pieces used on several screens, such as the saving panel and the recorder.
- `src/features/` holds one file per screen.
- `tests/` holds the browser tests.

This split answers the old prototype's problems: one 8,000-line file, four competing data stores, and uploads stuck at 99%. A file here counts as saved only after the whole original is stored, and AI has no part in it.

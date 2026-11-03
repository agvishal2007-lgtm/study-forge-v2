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
- Notes and backup export.
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
`tests/screen.test.cjs` uses Chromium's simulated screen and sound. It checks for a real picture in the saved file, and tests the lecture sound and microphone separately to prove each one reaches it. 

### Limits that come from browsers
- **Phones:** iPhones and Android browsers generally can't share their screen with a website, so virtual recording is for computers.
- **Sound:** Chrome and Edge capture a shared tab's sound on every computer type. Capturing the whole computer's sound, such as the Zoom or Teams app, is mainly a Windows and ChromeOS option. On a Mac, a browser tab is the reliable route.
- **Safari and Firefox:** these may record the picture with no sound. The app shows its warning when that happens.

### Not tested yet
- A real screen, real lecture, and real sharing choices. The picker itself was skipped in testing, so a person must check it.
- Long recordings. Several hours would be over 1 GB, and joining that many pieces hasn't been tried.
- Whether the saved video's seek bar works well on long recordings.

## How the code is organized

- `src/data/` holds saved data, and nothing else talks to storage directly.
  - `db.ts` is the browser database, the one source of truth for courses, topics, and file records.
  - `blobs.ts` stores the original files.
  - `store.ts` holds the actions, such as "create course" and "delete file".
  - `recordings.ts` saves recordings in small pieces and turns them into finished files.
- `src/components/` holds pieces used on several screens, such as the saving panel and the recorder.
- `src/features/` holds one file per screen.
- `tests/` holds the browser tests.

This split answers the old prototype's problems: one 8,000-line file, four competing data stores, and uploads stuck at 99%. A file here counts as saved only after the whole original is stored, and AI has no part in it.

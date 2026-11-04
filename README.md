# Study Forge

A free study website where students keep their courses, files, notes, and lecture recordings in one place, and study from them.

Files stay in the student's own browser on their own device. There's no account and nothing is uploaded to a server.

**Status:** Courses, files, lecture recording, notes, and backup are built. See [docs/PROGRESS.md](docs/PROGRESS.md) for what works, what doesn't yet, and how it was tested.

## Run it on your computer

1. Install [Node.js](https://nodejs.org) version 22 or newer.
2. In this folder, run `npm install` once to download the libraries.
3. Run `npm run dev`, then open the address it prints.

## Test it

`npm test` builds the site and drives a real browser through it. It needs Playwright with Chromium and ffmpeg installed on your computer. The same tests run on GitHub before every publish, and a failure stops the publish.

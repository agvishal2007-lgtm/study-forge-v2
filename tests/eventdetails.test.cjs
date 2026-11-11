// What a Google Calendar event carries, read from every place Google keeps it. These are shaped
// like real Google Calendar API responses.
const { test } = require('node:test');
const assert = require('node:assert/strict');

const rules = () => import('../src/data/eventDetails.ts');

test('1. a Zoom link in the description becomes the Join button', async () => {
  const { readEventDetails } = await rules();
  const details = readEventDetails({
    description: 'Hi! Join here: <a href="https://us02web.zoom.us/j/81234567890?pwd=abc123">https://us02web.zoom.us/j/81234567890?pwd=abc123</a><br>Meeting ID: 812 3456 7890',
  });
  assert.equal(details.meeting.provider, 'zoom');
  assert.equal(details.meeting.url, 'https://us02web.zoom.us/j/81234567890?pwd=abc123');
  // The same address as both the link and its text counts once.
  assert.equal(details.links.length, 0);
  assert.equal(details.otherMeetings.length, 0);
  assert.match(details.notes, /Meeting ID: 812 3456 7890/);
  assert.doesNotMatch(details.notes, /<a|<br/);
});

test('2. a link in the location is a meeting, not an address', async () => {
  const { readEventDetails } = await rules();
  const details = readEventDetails({ location: 'https://teams.microsoft.com/l/meetup-join/19%3ameeting_abc/0' });
  assert.equal(details.meeting.provider, 'teams');
  assert.equal(details.place, '', 'a web address is not a place');
});

test('3. Google Meet conference data, with its dial-in kept for anyone who cannot click', async () => {
  const { readEventDetails } = await rules();
  const details = readEventDetails({
    hangoutLink: 'https://meet.google.com/abc-defg-hij',
    conferenceData: {
      conferenceSolution: { key: { type: 'hangoutsMeet' }, name: 'Google Meet' },
      entryPoints: [
        { entryPointType: 'video', uri: 'https://meet.google.com/abc-defg-hij', label: 'meet.google.com/abc-defg-hij' },
        { entryPointType: 'phone', uri: 'tel:+1-555-0100', label: '+1 555-0100', pin: '123456789' },
      ],
    },
  });
  assert.equal(details.meeting.provider, 'meet');
  assert.equal(details.meeting.url, 'https://meet.google.com/abc-defg-hij');
  assert.deepEqual(details.meeting.extras, ['Phone: +1 555-0100, PIN 123456789']);
  assert.equal(details.otherMeetings.length, 0, 'hangoutLink and conference data are the same meeting');
});

test('3b. a Zoom meeting added through the Zoom add-on is found in conference data', async () => {
  const { readEventDetails } = await rules();
  const details = readEventDetails({
    conferenceData: {
      conferenceSolution: { key: { type: 'addOn' }, name: 'Zoom Meeting' },
      entryPoints: [{ entryPointType: 'video', uri: 'https://zoom.us/j/99887766554', meetingCode: '998 8776 6554', passcode: 'study' }],
    },
  });
  assert.equal(details.meeting.provider, 'zoom');
  assert.deepEqual(details.meeting.extras, ['Meeting ID: 998 8776 6554', 'Passcode: study']);
});

test('4. Teams and Webex are recognised', async () => {
  const { meetingProvider } = await rules();
  assert.equal(meetingProvider('https://teams.microsoft.com/l/meetup-join/19%3a123/0'), 'teams');
  assert.equal(meetingProvider('https://teams.live.com/meet/9876543210'), 'teams');
  assert.equal(meetingProvider('https://acme.webex.com/meet/jsmith'), 'webex');
  assert.equal(meetingProvider('https://acme.webex.com/acme/j.php?MTID=m123'), 'webex');
  // The Zoom home page, or a Google Meet landing page, is not a meeting.
  assert.equal(meetingProvider('https://zoom.us/'), null);
  assert.equal(meetingProvider('https://meet.google.com/'), null);
  assert.equal(meetingProvider('https://www.google.com/'), null);
});

test('5. several website links are all kept, named where that is reliable', async () => {
  const { readEventDetails } = await rules();
  const details = readEventDetails({
    description: 'Reading: https://docs.google.com/document/d/abc/edit<br>Submit at https://tcnj.instructure.com/courses/1/assignments/2.<br>More: <a href="https://www.jstor.org/stable/123">JSTOR</a> and https://example.org/info',
  });
  assert.equal(details.meeting, null);
  assert.deepEqual(details.links.map((link) => link.label), ['Google Doc', 'Canvas', details.links[2].label, 'example.org']);
  assert.match(details.links[2].label, /jstor\.org/);
  // The full stop after a link is not part of it.
  assert.equal(details.links[1].url, 'https://tcnj.instructure.com/courses/1/assignments/2');
});

test('6. a real place and a separate meeting link stay separate', async () => {
  const { readEventDetails } = await rules();
  const details = readEventDetails({
    location: 'Armstrong Hall 101, 2000 Pennington Rd, Ewing, NJ',
    description: 'Or join online: https://zoom.us/j/1234567890',
  });
  assert.equal(details.place, 'Armstrong Hall 101, 2000 Pennington Rd, Ewing, NJ');
  assert.equal(details.meeting.url, 'https://zoom.us/j/1234567890');
});

test('7. attachments are kept as links, never assumed to be downloadable', async () => {
  const { readEventDetails } = await rules();
  const details = readEventDetails({
    attachments: [
      { fileUrl: 'https://drive.google.com/open?id=abc', title: 'Syllabus.pdf', mimeType: 'application/pdf' },
      { title: 'No link given' },
    ],
  });
  assert.deepEqual(details.attachments, [{ title: 'Syllabus.pdf', url: 'https://drive.google.com/open?id=abc' }]);
});

test('8. when the meeting link changes, the details say so', async () => {
  const { readEventDetails } = await rules();
  const before = readEventDetails({ description: 'https://zoom.us/j/111' });
  const after = readEventDetails({ description: 'https://zoom.us/j/222' });
  assert.notDeepEqual(before, after);
  assert.equal(after.meeting.url, 'https://zoom.us/j/222');
});

test('9. each occurrence of a repeating event keeps its own link', async () => {
  // Google sends every occurrence separately; a moved or changed one carries its own fields.
  const { fromGoogleEvent } = await import('../src/data/calendarRules.ts');
  const usual = fromGoogleEvent({ id: 'abc_20261110T150000Z', recurringEventId: 'abc', summary: 'Office hours', start: { dateTime: '2026-11-10T10:00:00-05:00', timeZone: 'America/New_York' }, end: { dateTime: '2026-11-10T11:00:00-05:00' }, description: 'https://zoom.us/j/111' }, 'cal', 'School')[0];
  const moved = fromGoogleEvent({ id: 'abc_20261117T150000Z', recurringEventId: 'abc', summary: 'Office hours', start: { dateTime: '2026-11-17T10:00:00-05:00', timeZone: 'America/New_York' }, end: { dateTime: '2026-11-17T11:00:00-05:00' }, description: 'This week only: https://meet.google.com/xyz-abcd-efg' }, 'cal', 'School')[0];
  assert.equal(usual.seriesKey, moved.seriesKey);
  assert.equal(usual.details.meeting.provider, 'zoom');
  assert.equal(moved.details.meeting.provider, 'meet');
  assert.equal(usual.details.timeZone, 'America/New_York');
});

test('10. an event with no meeting has no Join button, and nothing is made up', async () => {
  const { readEventDetails, EMPTY_DETAILS } = await rules();
  assert.deepEqual(readEventDetails({ summary: 'Study group', location: 'Library, 2nd floor' }), { ...EMPTY_DETAILS, place: 'Library, 2nd floor' });
  // A meeting ID on its own is not turned into a link.
  assert.equal(readEventDetails({ description: 'Zoom meeting ID 812 3456 7890' }).meeting, null);
});

test('only web addresses are kept, and nothing in a description is ever treated as code', async () => {
  const { readEventDetails, plainText } = await rules();
  const details = readEventDetails({ description: '<a href="javascript:alert(1)">click</a> <script>alert(2)</script> mailto:x@y.z' });
  assert.equal(details.links.length, 0);
  assert.equal(details.meeting, null);
  assert.equal(plainText('A &amp; B<br>C &lt;3'), 'A & B\nC <3');
});

test('a Google Calendar link back to the event is kept only if it really is Google Calendar', async () => {
  const { readEventDetails } = await rules();
  assert.equal(readEventDetails({ htmlLink: 'https://www.google.com/calendar/event?eid=abc' }).googleUrl, 'https://www.google.com/calendar/event?eid=abc');
  assert.equal(readEventDetails({ htmlLink: 'https://evil.example/calendar/event' }).googleUrl, '');
});

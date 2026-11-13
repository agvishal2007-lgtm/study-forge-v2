// Roadmap 1: course templates, from the rules to the screens.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { chromium } = require('playwright');
const returningStudent = require('./returningStudent.cjs');

const URL_BASE = 'http://localhost:4228/';
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'sf-templates-'));
let server;
let browser;
let context;
let page;
const pageErrors = [];

before(async () => {
  server = spawn('npx', ['vite', 'preview', '--port', '4228', '--strictPort'], { cwd: path.join(__dirname, '..'), stdio: 'ignore', detached: true });
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(URL_BASE)).ok) break; } catch { /* starting */ }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  browser = await chromium.launch();
  context = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block' });
  await returningStudent(context);
  page = await context.newPage();
  page.on('pageerror', (error) => pageErrors.push(error.message));
});

after(async () => {
  await context?.close();
  await browser?.close();
  try { if (server) process.kill(-server.pid); } catch { /* stopped */ }
  fs.rmSync(work, { recursive: true, force: true });
});

test('templates never invent deadlines or weights, and a course becomes a template faithfully', async () => {
  const { BUILT_IN_TEMPLATES, templateFromCourse, describeTemplate, cleanTemplate } = await import('../src/data/courseTemplateRules.ts');
  assert.deepEqual(BUILT_IN_TEMPLATES.map((t) => t.name), ['Lecture course', 'Lab course', 'Writing course', 'Math course', 'Independent study']);
  for (const template of BUILT_IN_TEMPLATES) {
    assert.ok(template.categories.every((category) => category.weight === null), `${template.name}: no invented weights`);
    assert.ok(!JSON.stringify(template).match(/due|deadline|\d{4}-\d{2}-\d{2}/i), `${template.name}: no deadlines`);
  }
  const made = templateFromCourse('  Bio  ', [
    { name: 'Cells', heading: 'Unit 1', position: 1, status: 'active' },
    { name: 'Intro', heading: 'Unit 1', position: 0, status: 'active' },
    { name: 'Old', heading: '', position: 2, status: 'archived' },
  ], [{ name: 'Exams', weight: 60, position: 1 }, { name: 'Labs', weight: 40, position: 0 }], false, 'x', 5);
  assert.deepEqual(made.topics, [{ heading: 'Unit 1', name: 'Intro' }, { heading: 'Unit 1', name: 'Cells' }], 'order kept, archived topics left out');
  assert.deepEqual(made.categories, [{ name: 'Labs', weight: null }, { name: 'Exams', weight: null }], 'weights dropped unless asked');
  assert.equal(made.name, 'Bio');
  assert.equal(templateFromCourse('B', [], [{ name: 'Exams', weight: 60, position: 0 }], true, 'y', 5).categories[0].weight, 60);
  assert.equal(describeTemplate(BUILT_IN_TEMPLATES[0]), '6 topics and 5 grade categories (weights left for you to set)');
  assert.equal(cleanTemplate({ id: 1 }), null, 'broken records from another device are ignored');
  assert.deepEqual(cleanTemplate({ id: 'a', name: 'A', topics: [{ name: '' }, { name: 'T' }], categories: [{ name: 'C', weight: -3 }] }).topics, [{ heading: '', name: 'T' }]);
});

test('a new course can start from a starter template, and says exactly what it adds', async () => {
  await page.goto(`${URL_BASE}#/courses`);
  await page.getByLabel('Course name').fill('Chemistry 101');
  await page.getByTestId('template-select').selectOption({ label: 'Lab course' });
  const preview = await page.getByTestId('template-preview').innerText();
  assert.match(preview, /Adds 6 topics and 4 grade categories \(weights left for you to set\)/);
  assert.match(preview, /No deadlines or requirements are added/);
  await page.getByRole('button', { name: 'Create course' }).click();
  await page.getByRole('heading', { name: 'Chemistry 101', level: 1 }).waitFor();
  for (const topic of ['Lab 1', 'Lab 4', 'Safety and procedures']) await page.getByRole('heading', { name: topic, exact: true, level: 4 }).waitFor();
  const grades = await page.locator('section', { has: page.getByRole('heading', { name: 'Grades', exact: true }) }).innerText();
  for (const category of ['Lab reports', 'Pre-lab work', 'Lab practical', 'Exams']) assert.ok(grades.includes(category), category);
});

test('a course saves as a template, which can start the next course; applying twice adds nothing twice', async () => {
  await page.getByRole('button', { name: 'Edit course' }).click();
  const tools = page.getByTestId('course-template-tools');
  await tools.getByLabel('Save this course as a template').fill('My chem lab');
  await tools.getByRole('button', { name: 'Save as template' }).click();
  await tools.getByText(/Saved “My chem lab”: 6 topics and 4 grade categories.*This course wasn’t changed/).waitFor();
  // Applying a template the course already matches changes nothing.
  await tools.getByTestId('template-select').selectOption({ label: 'My chem lab' });
  await tools.getByRole('button', { name: 'Add to this course' }).click();
  await tools.getByText(/already has everything/).waitFor();
  await tools.getByTestId('template-select').selectOption({ label: 'Math course' });
  await tools.getByRole('button', { name: 'Add to this course' }).click();
  await tools.getByText(/Added 6 topics and 3 grade categories/).waitFor(); // Exams already existed, so only 3 are new.

  await page.goto(`${URL_BASE}#/courses`);
  const mine = page.getByTestId('my-templates');
  assert.match(await mine.innerText(), /My chem lab/);
  await mine.getByRole('button', { name: 'Rename My chem lab' }).click();
  await mine.getByLabel('Template name').fill('Lab science');
  await mine.getByRole('button', { name: 'Save' }).click();
  await mine.getByText('Lab science').waitFor();
  await page.getByLabel('Course name').fill('Physics 110');
  await page.getByTestId('template-select').selectOption({ label: 'Lab science' });
  await page.getByRole('button', { name: 'Create course' }).click();
  await page.getByRole('heading', { name: 'Physics 110', level: 1 }).waitFor();
  await page.getByRole('heading', { name: 'Lab 3', exact: true, level: 4 }).waitFor();

  await page.goto(`${URL_BASE}#/courses`);
  await mine.getByRole('button', { name: 'Delete Lab science' }).click();
  await page.getByRole('button', { name: 'Delete template' }).click();
  await page.waitForFunction(() => !document.querySelector('[data-testid=my-templates]'));
  await page.getByRole('link', { name: /Physics 110/ }).first().click();
  await page.getByRole('heading', { name: 'Lab 3', exact: true, level: 4 }).waitFor();
  assert.deepEqual(pageErrors, []);
});

test('templates fit a phone', async () => {
  await page.setViewportSize({ width: 360, height: 740 });
  await page.goto(`${URL_BASE}#/courses`);
  await page.getByTestId('template-select').selectOption({ label: 'Writing course' });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
  const select = await page.getByTestId('template-select').boundingBox();
  assert.ok(select.height >= 40 && select.x + select.width <= 360);
});

test('semester plan: lists every change in words, keeps unfinished work unless ticked, and never deletes', async () => {
  const { reviewCourses, planChanges, hasChanges } = await import('../src/data/semesterRules.ts');
  const course = (id, name, status = 'active') => ({ id, name, code: '', color: '', term: 'Fall 2026', position: 0, status, statusAt: 0, createdAt: 0, updatedAt: 0 });
  const item = (id, courseId, status, dueDate = '2026-12-10') => ({ id, title: id, courseId, type: 'Homework', dueDate, dueTime: '', status, priority: 'Normal', estimateHours: null, points: null, earnedPoints: null, categoryId: null, details: '', createdAt: 0, updatedAt: 0 });
  const event = (id, courseId, date, hidden = false) => ({ id, title: id, courseId, kind: 'Class', date, startTime: '09:00', endTime: '10:00', location: '', whatToDo: '', priority: 'Normal', completed: false, seriesId: '', plannerItemId: null, source: 'manual', sourceCalendar: '', hidden, createdAt: 0, updatedAt: 0 });
  const reviews = reviewCourses(
    [course('a', 'Bio'), course('b', 'Art'), course('z', 'Old', 'archived')],
    [item('essay', 'a', 'In Progress'), item('quiz', 'a', 'Completed'), item('draft', 'a', 'Not Started', '')],
    [event('past', 'a', '2026-11-01'), event('next', 'a', '2026-12-01'), event('gone', 'a', '2026-12-02', true)],
    { files: new Map([['a', 3]]), notes: new Map() },
    '2026-11-12',
  );
  assert.deepEqual(reviews.map((r) => r.course.id), ['a', 'b'], 'only courses in use are reviewed');
  assert.deepEqual(reviews[0].unfinished.map((i) => i.id), ['essay', 'draft'], 'finished work is left out; undated work last');
  assert.deepEqual(reviews[0].futureEvents.map((e) => e.id), ['next'], 'past and hidden events are left out');
  const none = planChanges(reviews, { archive: new Set(), complete: new Set(), hideEvents: new Set(), term: '', newCourses: [{ name: ' ', code: '', start: '' }] }, () => '');
  assert.equal(hasChanges(none), false, 'nothing chosen, nothing to confirm');
  const plan = planChanges(reviews, { archive: new Set(['a']), complete: new Set(['essay']), hideEvents: new Set(['a']), term: 'Spring 2027', newCourses: [{ name: 'Bio 2', code: 'BIO 102', start: 'builtin-lab' }] }, () => 'the Lab course template').map((c) => c.text);
  assert.deepEqual(plan, [
    'Archive Bio. Its files, notes, grades and history stay, and it stays searchable.',
    'Mark “essay” (Bio) as Completed.',
    'Keep 1 unfinished item from Bio in your Planner as they are.',
    'Hide 1 upcoming calendar event for Bio. They can be shown again.',
    'Create Bio 2 (BIO 102) in Spring 2027, starting from the Lab course template.',
  ]);
  assert.ok(!plan.join(' ').match(/delete|due date (moved|changed)/i));
});

test('the New semester assistant changes nothing until the student confirms the full list', async () => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`${URL_BASE}#/courses`);
  await page.getByTestId('new-semester').click();
  const semester = page.getByTestId('semester');
  await semester.getByRole('heading', { name: 'Which courses are finished?' }).waitFor();
  const chem = semester.locator('.semester-course', { hasText: 'Chemistry 101' });
  assert.equal(await chem.getByLabel('Keep using').isChecked(), true, 'keeping is the default');
  await chem.getByLabel('Finished: archive').check();
  await semester.getByRole('button', { name: 'Next' }).click();
  await semester.getByRole('heading', { name: 'Chemistry 101', level: 3 }).waitFor();
  await semester.getByRole('button', { name: 'Next' }).click();
  await semester.getByLabel('Semester name').fill('Spring 2027');
  await semester.getByLabel('Course name').fill('Biology 2');
  await semester.getByLabel('Start from').selectOption({ label: 'Physics 110' });
  // Leaving now changes nothing.
  await page.goto(`${URL_BASE}#/courses`);
  await page.getByRole('link', { name: /Chemistry 101/ }).first().waitFor();
  assert.equal(await page.getByTestId('archived-courses').count(), 0, 'cancelling changed nothing');

  await page.getByTestId('new-semester').click();
  await semester.locator('.semester-course', { hasText: 'Chemistry 101' }).getByLabel('Finished: archive').check();
  for (let i = 0; i < 2; i++) await semester.getByRole('button', { name: 'Next' }).click();
  await semester.getByLabel('Semester name').fill('Spring 2027');
  await semester.getByLabel('Course name').fill('Biology 2');
  await semester.getByLabel('Start from').selectOption({ label: 'Physics 110' });
  await semester.getByRole('button', { name: 'Next' }).click();
  const plan = await semester.getByTestId('semester-plan').innerText();
  assert.match(plan, /Archive Chemistry 101\. Its files, notes, grades and history stay/);
  assert.match(plan, /Create Biology 2 in Spring 2027, starting from the topics and categories of Physics 110/);
  await semester.getByRole('button', { name: 'Make these changes' }).click();
  const doneList = await semester.getByTestId('semester-done').innerText();
  assert.match(doneList, /Archived Chemistry 101\./);
  assert.match(doneList, /Created Biology 2 with 6 topics and 4 grade categories\./);
  await semester.getByRole('link', { name: 'Go to Courses' }).click();
  assert.match(await page.getByTestId('archived-courses').innerText(), /Chemistry 101/);
  await page.getByRole('heading', { name: 'Spring 2027' }).waitFor();
  await page.getByRole('link', { name: /Biology 2/ }).first().click();
  await page.getByRole('heading', { name: 'Lab 3', exact: true, level: 4 }).waitFor();
  assert.deepEqual(pageErrors, []);
});

test('personal library shelves group things beyond one course, without copying or moving them', async () => {
  const { shelvesOf, shelfChoices, looseItems } = await import('../src/data/shelfRules.ts');
  const m = (id, shelf, courseId = null, createdAt = 0) => ({ id, name: id, shelf, courseId, createdAt });
  const items = [m('a', 'Career', 'c1', 1), m('b', 'career', null, 2), m('c', '', null), m('d', ' Research papers ', 'c1'), m('e', undefined, 'c2')];
  assert.deepEqual(shelvesOf(items).map((s) => [s.name, s.items.map((i) => i.id)]), [['Career', ['b', 'a']], ['Research papers', ['d']]]);
  assert.deepEqual(looseItems(items).map((i) => i.id), ['c']);
  assert.ok(shelfChoices(items).includes('Writing and citation'));
  assert.equal(shelfChoices(items).filter((name) => name.toLowerCase() === 'research papers').length, 1, 'no repeats');

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`${URL_BASE}#/library`);
  await page.getByText('Save a link instead').click();
  await page.getByLabel('Web address').fill('https://owl.purdue.edu/owl/research_and_citation/apa_style/apa_formatting_and_style_guide/general_format.html');
  await page.getByLabel('Name it (optional)').fill('APA guide');
  await page.getByRole('button', { name: 'Save link' }).click();
  await page.getByRole('link', { name: 'APA guide' }).waitFor();
  await page.getByLabel('Select APA guide').check();
  await page.getByLabel('Shelf name').fill('Writing and citation');
  await page.getByRole('button', { name: 'Put on shelf' }).click();
  await page.getByRole('status').getByText('Put 1 item on Writing and citation.').first().waitFor();
  assert.match(await page.locator('.files li', { hasText: 'APA guide' }).innerText(), /Shelf: Writing and citation/);
  await page.getByRole('tab', { name: 'Personal library' }).click();
  const personal = page.getByTestId('personal-library');
  await personal.getByRole('heading', { name: /Writing and citation/ }).waitFor();
  assert.match(await personal.locator('section', { hasText: 'Writing and citation' }).innerText(), /APA guide/);
  // Undo puts it back off the shelf.
  await page.locator('.undo-bar').getByRole('button', { name: 'Undo' }).click();
  await personal.getByRole('heading', { name: 'Not in a course or on a shelf (1)' }).waitFor();
  assert.deepEqual(pageErrors, []);
});

/** A small textbook: 6 pages and a table of contents with two chapters and a section. */
function makeBook() {
  const pages = 6;
  const objects = [];
  // 1 catalog, 2 pages, then page/content pairs, then the outline.
  const pageRef = (i) => 3 + i * 2;
  const outlineRoot = 3 + pages * 2;
  objects[0] = `<< /Type /Catalog /Pages 2 0 R /Outlines ${outlineRoot} 0 R /PageMode /UseOutlines >>`;
  objects[1] = `<< /Type /Pages /Kids [${Array.from({ length: pages }, (_, i) => `${pageRef(i)} 0 R`).join(' ')}] /Count ${pages} >>`;
  for (let i = 0; i < pages; i++) {
    const stream = `BT /F1 24 Tf 72 700 Td (Textbook page ${i + 1}) Tj ET`;
    objects[pageRef(i) - 1] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents ${pageRef(i) + 1} 0 R /Resources << /Font << /F1 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> >> >> >>`;
    objects[pageRef(i)] = `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`;
  }
  const ch1 = outlineRoot + 1; const ch2 = outlineRoot + 2; const sec = outlineRoot + 3;
  objects[outlineRoot - 1] = `<< /Type /Outlines /First ${ch1} 0 R /Last ${ch2} 0 R /Count 3 >>`;
  objects[ch1 - 1] = `<< /Title (Chapter 1: Assets) /Parent ${outlineRoot} 0 R /Next ${ch2} 0 R /First ${sec} 0 R /Last ${sec} 0 R /Count 1 /Dest [${pageRef(0)} 0 R /Fit] >>`;
  objects[ch2 - 1] = `<< /Title (Chapter 2: Liabilities) /Parent ${outlineRoot} 0 R /Prev ${ch1} 0 R /Dest [${pageRef(3)} 0 R /Fit] >>`;
  objects[sec - 1] = `<< /Title (1.2 Current assets) /Parent ${ch1} 0 R /Dest [${pageRef(1)} 0 R /Fit] >>`;
  let out = '%PDF-1.4\n';
  const offsets = [];
  objects.forEach((body, i) => { offsets.push(out.length); out += `${i + 1} 0 obj\n${body}\nendobj\n`; });
  const xref = out.length;
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.forEach((o) => { out += `${String(o).padStart(10, '0')} 00000 n \n`; });
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
}

test('reading rules: bookmarks, starting page and sections', async () => {
  const { cleanReading, addBookmark, removeBookmark, startingPage, flattenOutline, currentSection } = await import('../src/data/readingRules.ts');
  let r = cleanReading({ page: 4, bookmarks: [{ page: 2, label: 'x' }, { page: -1 }, { page: 2, label: 'y' }] });
  assert.deepEqual(r.bookmarks.map((b) => [b.page, b.label]), [[2, 'y']], 'bad and repeated bookmarks are cleaned');
  r = addBookmark(r, 5, '  Ratios ', 9);
  r = addBookmark(r, 1, '', 9);
  assert.deepEqual(r.bookmarks.map((b) => b.page), [1, 2, 5]);
  assert.equal(r.bookmarks[2].label, 'Ratios');
  assert.deepEqual(removeBookmark(r, 2).bookmarks.map((b) => b.page), [1, 5]);
  assert.equal(startingPage(null, r, 10), 4, 'opens where they stopped');
  assert.equal(startingPage(7, r, 10), 7, 'a page asked for wins');
  assert.equal(startingPage(null, cleanReading(null), 10), 1);
  assert.equal(startingPage(null, { ...r, page: 40 }, 10), 10, 'never past the end');
  const outline = flattenOutline([{ title: 'Ch 1', page: 1, items: [{ title: 'Sec', page: 2, items: [] }] }, { title: 'Ch 2', page: 4, items: [] }]);
  assert.deepEqual(outline.map((e) => [e.title, e.depth]), [['Ch 1', 0], ['Sec', 1], ['Ch 2', 0]]);
  assert.equal(currentSection(outline, 3).title, 'Sec');
  assert.equal(currentSection(outline, 5).title, 'Ch 2');
});

test('a textbook PDF has contents, go to page, bookmarks, the page you stopped on, page notes and related work', async () => {
  const book = path.join(work, 'Accounting textbook.pdf');
  fs.writeFileSync(book, makeBook());
  await page.goto(`${URL_BASE}#/planner/new`);
  await page.getByLabel('Name', { exact: true }).fill('Read chapter 2');
  await page.getByRole('button', { name: 'Save item' }).click();
  await page.waitForURL(/#\/planner$/);
  await page.goto(`${URL_BASE}#/library`);
  await page.locator('input[type=file]').first().setInputFiles(book);
  await page.getByRole('link', { name: 'Accounting textbook.pdf' }).click();
  const tools = page.getByTestId('book-tools');
  await tools.getByTestId('book-outline').waitFor();
  assert.deepEqual(await tools.getByTestId('book-outline').getByRole('button').allInnerTexts(), ['Chapter 1: Assets p. 1', '1.2 Current assets p. 2', 'Chapter 2: Liabilities p. 4']);
  await tools.getByRole('button', { name: /Chapter 2: Liabilities/ }).click();
  await page.getByText('Page 4 of 6').waitFor();
  assert.equal(await tools.getByTestId('book-section').innerText(), 'In: Chapter 2: Liabilities');
  await tools.getByLabel('Bookmark name').fill('Bonds');
  await tools.getByRole('button', { name: 'Bookmark page 4' }).click();
  await tools.getByTestId('bookmarks').getByText('Page 4: Bonds').waitFor();
  await page.getByLabel('Go to page').fill('6');
  await page.getByRole('button', { name: 'Go', exact: true }).click();
  await page.getByText('Page 6 of 6').waitFor();
  await tools.getByTestId('bookmarks').getByRole('button', { name: 'Page 4: Bonds' }).click({ timeout: 5000 }).catch(async (e) => { await page.screenshot({ path: '/tmp/claude-0/book-fail.png', fullPage: true }); console.log(await tools.innerHTML()); throw e; });
  await page.getByText('Page 4 of 6').waitFor();
  // A note for this page opens beside the file and can jump back to it.
  await tools.getByRole('button', { name: 'Note this page' }).click();
  const beside = page.getByRole('complementary', { name: 'Notes beside this file' });
  await beside.getByRole('button', { name: 'Go to page 4' }).waitFor();
  await page.getByRole('button', { name: 'Previous page' }).click();
  await page.getByText('Page 3 of 6').waitFor();
  await beside.getByRole('button', { name: 'Go to page 4' }).click();
  await page.getByText('Page 4 of 6').waitFor();
  // Linking it to an assignment never changes the assignment's dates.
  const related = page.getByTestId('related-assignments');
  await related.getByLabel('Link to an assignment').selectOption({ label: 'Read chapter 2' });
  await related.getByRole('button', { name: 'Link', exact: true }).click();
  await related.getByRole('link', { name: 'Read chapter 2' }).waitFor();
  // Leaving and coming back opens on the page they stopped on.
  await page.waitForTimeout(1500);
  const fileUrl = page.url();
  await page.goto(`${URL_BASE}#/library`);
  await page.goto(fileUrl);
  await page.getByTestId('resumed').getByText('Picked up where you left off, on page 4.').waitFor();
  await page.getByText('Page 4 of 6').waitFor();
  await page.getByTestId('related-assignments').getByRole('link', { name: 'Read chapter 2' }).click();
  await page.getByTestId('linked-files').getByRole('link', { name: 'Accounting textbook.pdf' }).waitFor();
  assert.deepEqual(pageErrors, []);
});


test('school-level setup is optional, age and school level are separate, and starting courses are chosen explicitly', async () => {
  const isolated = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block' });
  try {
    await returningStudent(isolated);
    const student = await isolated.newPage();
    await student.goto(`${URL_BASE}#/courses`);
    const setup = student.getByTestId('school-setup');
    await setup.getByRole('heading', { name: 'Set up your courses' }).waitFor();
    await setup.getByRole('button', { name: 'Skip for now' }).click();
    await student.reload();
    assert.equal(await student.getByRole('heading', { name: 'Set up your courses' }).count(), 0);
    await setup.getByRole('button', { name: 'School level and course setup' }).click();
    await setup.getByLabel('School level').selectOption('elementary');
    await setup.getByLabel('13 or older').check();
    await setup.getByLabel('Reading').check();
    await setup.getByRole('button', { name: 'Save setup' }).click();
    await student.getByText('Reading', { exact: true }).first().waitFor();
    await student.reload();
    await student.getByRole('heading', { name: 'Add a subject' }).waitFor();
    assert.equal(await student.getByRole('heading', { name: 'Set up your courses' }).count(), 0);
    assert.equal(await student.getByText('Writing', { exact: true }).count(), 0, 'unselected subjects are not created');
    await student.goto(`${URL_BASE}#/settings`);
    assert.equal(await student.getByLabel('Choose your school level').inputValue(), 'elementary');
    await student.getByLabel('Choose your school level').selectOption('college');
    await student.goto(`${URL_BASE}#/courses`);
    await student.getByText('Reading', { exact: true }).first().waitFor();
  } finally {
    await isolated.close();
  }
});

test('under-13 setup cannot sign into a Study Forge account', async () => {
  const isolated = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block' });
  try {
    await returningStudent(isolated);
    const student = await isolated.newPage();
    await student.goto(`${URL_BASE}#/courses`);
    const setup = student.getByTestId('school-setup');
    await setup.getByLabel('School level').selectOption('middle');
    await setup.getByLabel('Under 13').check();
    await setup.getByRole('button', { name: 'Save setup' }).click();
    await student.reload();
    await student.getByRole('heading', { name: 'Courses', exact: true }).waitFor();
    await student.getByTestId('school-setup').waitFor();
    await student.goto(`${URL_BASE}#/library`);
    await student.getByRole('button', { name: /From Google Drive/ }).waitFor({ state: 'detached' });
    await student.goto(`${URL_BASE}#/settings`);
    await student.getByText('Account and cloud syncing are unavailable in local-only mode.').waitFor();
    assert.equal(await student.getByRole('link', { name: 'Log In / Sign Up' }).count(), 0);
    await student.goto(`${URL_BASE}#/calendar/google`);
    await student.getByRole('heading', { name: 'Local-only mode' }).waitFor();
    await student.goto(`${URL_BASE}#/signup`);
    await student.getByRole('heading', { name: 'Local-only mode' }).waitFor();
    assert.equal(await student.getByRole('button', { name: 'Continue with Google' }).count(), 0);
  } finally {
    await isolated.close();
  }
});

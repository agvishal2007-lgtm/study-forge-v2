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

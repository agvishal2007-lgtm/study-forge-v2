// Where a course stands, worked out only from the student's own weights and marks.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { chromium } = require('playwright');

const rules = () => import('../src/data/gradeRules.ts');

const category = (id, name, weight, position = 0) => ({ id, courseId: 'c', name, weight, position, createdAt: position, updatedAt: 0 });
const work = (title, extra = {}) => ({
  id: title.toLowerCase().replace(/\s+/g, '-'),
  title,
  courseId: 'c',
  type: 'Assignment',
  dueDate: '',
  dueTime: '',
  status: 'Not Started',
  priority: 'Normal',
  estimateHours: null,
  points: null,
  earnedPoints: null,
  categoryId: null,
  details: '',
  createdAt: 0,
  updatedAt: 0,
  ...extra,
});

test('a grade is the weighted average of the categories that have marks', async () => {
  const { courseGrade } = await rules();
  const grade = courseGrade(
    [category('exams', 'Exams', 60), category('hw', 'Homework', 40, 1)],
    [
      work('Midterm', { categoryId: 'exams', points: 100, earnedPoints: 90 }),
      work('Set 1', { categoryId: 'hw', points: 10, earnedPoints: 8 }),
      work('Set 2', { categoryId: 'hw', points: 10, earnedPoints: 7 }),
    ],
  );
  // Exams 90%, homework 75%, weighted 60/40.
  assert.equal(grade.percent, 84);
  assert.equal(grade.weightCounted, 100);
  assert.equal(grade.categories[1].percent, 75);
});

test('work that has not been marked is never counted as a zero', async () => {
  const { courseGrade } = await rules();
  const grade = courseGrade(
    [category('exams', 'Exams', 60), category('hw', 'Homework', 40, 1)],
    [
      work('Midterm', { categoryId: 'exams', points: 100, earnedPoints: 90 }),
      work('Final', { categoryId: 'exams', points: 100 }),
      work('Set 1', { categoryId: 'hw', points: 10 }),
    ],
  );
  assert.equal(grade.percent, 90, 'only the marked exam counts');
  assert.equal(grade.weightCounted, 60, 'and it says it is 60% of the course');
  assert.equal(grade.categories[0].ungradedCount, 1);
  assert.equal(grade.categories[1].percent, null, 'an unmarked category has no score');
});

test('nothing graded means no grade, not zero', async () => {
  const { courseGrade } = await rules();
  const grade = courseGrade([category('exams', 'Exams', 100)], [work('Final', { categoryId: 'exams', points: 100 })]);
  assert.equal(grade.percent, null);
  assert.equal(grade.weightCounted, 0);
});

test('weights that do not add to 100 are reported, not silently fixed', async () => {
  const { courseGrade } = await rules();
  const grade = courseGrade(
    [category('exams', 'Exams', 50), category('hw', 'Homework', 30, 1)],
    [work('Midterm', { categoryId: 'exams', points: 100, earnedPoints: 80 })],
  );
  assert.equal(grade.weightTotal, 80);
  assert.equal(grade.percent, 80, 'the graded part is still scaled properly');
});

test('graded work in no category is counted and flagged', async () => {
  const { courseGrade } = await rules();
  const grade = courseGrade(
    [category('exams', 'Exams', 100)],
    [
      work('Midterm', { categoryId: 'exams', points: 100, earnedPoints: 70 }),
      work('Stray', { points: 10, earnedPoints: 10 }),
    ],
  );
  assert.equal(grade.unsorted, 1);
  assert.equal(grade.percent, 70, 'and it does not quietly change the grade');
});

test('grade impact is a share of the category weight, not of raw points', async () => {
  const { gradeImpact } = await rules();
  const categories = [category('exams', 'Exams', 60), category('hw', 'Homework', 10, 1)];
  const items = [
    work('Midterm', { categoryId: 'exams', points: 100 }),
    work('Final', { categoryId: 'exams', points: 100 }),
    work('Homework pile', { categoryId: 'hw', points: 400 }),
  ];
  assert.equal(gradeImpact(items[0], categories, items), 30, 'half of a 60% category');
  assert.equal(gradeImpact(items[2], categories, items), 10, 'all of a 10% category, despite 400 points');
  assert.equal(gradeImpact(work('Loose', { points: 50 }), categories, items), null, 'no category, no impact');
  assert.equal(gradeImpact(work('No worth', { categoryId: 'exams' }), categories, items), null);
});

test('a projection says where you would finish', async () => {
  const { projectGrade } = await rules();
  const categories = [category('exams', 'Exams', 100)];
  const items = [
    work('Midterm', { categoryId: 'exams', points: 100, earnedPoints: 90 }),
    work('Final', { categoryId: 'exams', points: 100 }),
  ];
  assert.equal(projectGrade(categories, items, 70), 80, '90 and 70 average to 80');
  assert.equal(projectGrade(categories, items, 100), 95);
});

const PORT = 4208;
const URL_BASE = `http://localhost:${PORT}/`;
let server;
let context;
let page;
let workDir;
const pageErrors = [];

before(async () => {
  workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'study-forge-grades-'));
  server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { cwd: path.join(__dirname, '..'), stdio: 'ignore', detached: true });
  for (let attempt = 0; attempt < 100; attempt++) {
    try { await fetch(URL_BASE); break; } catch { await new Promise((resolve) => setTimeout(resolve, 150)); }
  }
  context = await chromium.launchPersistentContext(path.join(workDir, 'main'), { viewport: { width: 1280, height: 900 }, timezoneId: 'America/New_York', serviceWorkers: 'block' });
  page = context.pages()[0] ?? (await context.newPage());
  page.setDefaultTimeout(15000);
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.goto(URL_BASE);
});

after(async () => {
  await context?.close();
  try { process.kill(-server.pid); } catch { /* already stopped */ }
  fs.rmSync(workDir, { recursive: true, force: true });
});

const addCategory = async (name, weight) => {
  await page.getByLabel('Category', { exact: true }).fill(name);
  await page.getByLabel('Weight %').fill(weight);
  await page.getByRole('button', { name: 'Add category' }).click();
  await page.getByRole('row', { name: new RegExp(name) }).waitFor();
};

test('a course starts by saying it needs the syllabus', async () => {
  await page.goto(`${URL_BASE}#/courses`);
  await page.getByLabel('Course name').fill('Accounting');
  await page.getByRole('button', { name: 'Create course' }).click();
  await page.getByRole('heading', { name: 'Accounting', level: 1 }).waitFor();
  await page.getByTestId('grades').waitFor();
  assert.match(await page.getByTestId('grades').innerText(), /never guesses/);
});

test('categories can be added, and uneven weights are flagged', async () => {
  await addCategory('Exams', '60');
  await page.getByTestId('weights-warning').waitFor();
  assert.match(await page.getByTestId('weights-warning').innerText(), /add up to 60%/);
  await addCategory('Homework', '40');
  assert.equal(await page.getByTestId('weights-warning').count(), 0, 'adding to 100 clears the warning');
});

test('a grade appears once work is marked, and only counts what is marked', async () => {
  const add = async (name, points, earned, categoryName) => {
    await page.goto(`${URL_BASE}#/planner`);
    await page.getByRole('button', { name: 'Add item' }).click();
    await page.getByLabel('Name', { exact: true }).fill(name);
    await page.getByLabel('Course').selectOption({ label: 'Accounting' });
    await page.getByLabel('Points it is worth (optional)').fill(points);
    if (earned) await page.getByLabel('Marks you got (optional)').fill(earned);
    if (categoryName) await page.getByLabel('Grading category').selectOption({ label: categoryName });
    await page.getByRole('button', { name: 'Save item' }).click();
    await page.getByRole('heading', { name: 'Planner', exact: true }).waitFor();
  };
  await add('Midterm', '100', '90', 'Exams (60%)');
  await add('Final', '100', '', 'Exams (60%)');

  await page.goto(`${URL_BASE}#/courses`);
  await page.getByRole('link', { name: /Accounting/ }).first().click();
  await page.getByTestId('grade-now').waitFor();
  const now = await page.getByTestId('grade-now').innerText();
  assert.match(now, /90%/, 'the unmarked final is not a zero');
  assert.match(now, /60% of the course/, 'and it says how much has been graded');
});

test('a projection is shown as a projection', async () => {
  await page.getByTestId('what-if').waitFor();
  await page.getByLabel('If everything left scores this percentage').fill('70');
  await page.waitForFunction(() => {
    const el = document.querySelector('[data-testid="projection"]');
    return el && el.innerText.includes('%');
  });
  const projection = await page.getByTestId('projection').innerText();
  assert.match(projection, /A projection, not a grade you have/);
});

test('no uncaught errors happened during the whole run', () => {
  assert.deepEqual(pageErrors, []);
});

// The calculator: opening it, its Scientific and TI-84-style Graphing modes, in a real browser.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { chromium } = require('playwright');
const returningStudent = require('./returningStudent.cjs');

const URL_BASE = 'http://localhost:4227/';
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'sf-calc-'));
const shots = path.join(__dirname, '..', 'test-output');
fs.mkdirSync(shots, { recursive: true });
let server;
let browser;
let context;
let page;
const pageErrors = [];

async function open({ viewport = { width: 1280, height: 800 }, mobile = false, theme = 'light' } = {}) {
  await context?.close().catch(() => undefined);
  context = await browser.newContext({ viewport, isMobile: mobile, hasTouch: mobile, colorScheme: theme, serviceWorkers: 'block' });
  await returningStudent(context);
  await context.addInitScript((t) => { try { localStorage.setItem('study-forge-theme', t); } catch { /* private */ } }, theme);
  page = await context.newPage();
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.goto(`${URL_BASE}#/notes`);
  await page.getByRole('button', { name: 'New note' }).first().click();
  await page.locator('textarea.note-body').fill('Working: ');
}
const win = () => page.getByTestId('calc-window');
const key = (id) => win().locator(`[data-key="${id}"]`).click();
const keys = async (...ids) => { for (const id of ids) await key(id); };
const lcd = (id) => win().getByTestId(id);
const toggle = () => page.getByRole('button', { name: 'Calculator', exact: true }).click();

before(async () => {
  server = spawn('npx', ['vite', 'preview', '--port', '4227', '--strictPort'], { cwd: path.join(__dirname, '..'), stdio: 'ignore', detached: true });
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(URL_BASE)).ok) break; } catch { /* starting */ }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  browser = await chromium.launch();
});

after(async () => {
  await context?.close().catch(() => undefined);
  await browser?.close();
  try { if (server) process.kill(-server.pid); } catch { /* already stopped */ }
  fs.rmSync(work, { recursive: true, force: true });
});

test('graph maths: zeros, turning points, intersections and tables', async () => {
  const g = await import('../src/data/graphRules.ts');
  const sq = (x) => x * x - 2;
  assert.deepEqual(g.findZeros(sq, -10, 10).map((x) => Number(x.toFixed(6))), [-1.414214, 1.414214]);
  assert.deepEqual(g.findZeros((x) => 1 / x, -10, 10), [], 'a break is not a zero');
  assert.ok(g.findZeros(Math.tan, -3, 3).every((x) => Math.abs(Math.tan(x)) < 1e-6), 'tan has no false zeros at its gaps');
  const [min] = g.findExtrema(sq, -10, 10, 'minimum');
  assert.equal(Number(min.x.toFixed(6)), 0);
  assert.equal(Number(min.y.toFixed(6)), -2);
  assert.deepEqual(g.findExtrema((x) => 4 - (x - 3) ** 2, -10, 10, 'maximum').map((p) => [Number(p.x.toFixed(5)), Number(p.y.toFixed(5))]), [[3, 4]]);
  const meet = g.findIntersections(sq, (x) => x, -10, 10).map((p) => Number(p.x.toFixed(6)));
  assert.deepEqual(meet, [-1, 2]);
  assert.deepEqual(g.tableRows([sq], 0, 1, 3), [{ x: 0, ys: [-2] }, { x: 1, ys: [-1] }, { x: 2, ys: [2] }]);
  assert.deepEqual(g.zoomWindow(g.STANDARD_WINDOW, 'in', 'deg'), { ...g.STANDARD_WINDOW, xmin: -2.5, xmax: 2.5, ymin: -2.5, ymax: 2.5 });
  assert.equal(g.zoomWindow(g.STANDARD_WINDOW, 'trig', 'deg').xscl, 90);
  assert.equal(g.windowProblem({ ...g.STANDARD_WINDOW, xmin: 5, xmax: 1 }), 'Xmin must be less than Xmax.');
  assert.equal(g.screenNumber(1 / 3), '0.3333333333');
  assert.equal(g.screenNumber(123456789012), '1.23456789E11');
  assert.equal(g.screenNumber(2.5, 2), '2.50');
});

test('the Calculator button opens a visible calculator, closes it, and reopens the same one', async () => {
  await open();
  await toggle();
  await win().getByTestId('scientific').waitFor();
  const box = await win().boundingBox();
  assert.ok(box.x >= 0 && box.y >= 0 && box.x + box.width <= 1280 && box.y + box.height <= 800, 'fully on screen');
  // Nothing sits on top of it: the element at its middle is part of the calculator.
  assert.equal(await page.evaluate(() => {
    const r = document.querySelector('[data-testid=calc-window]').getBoundingClientRect();
    return !!document.elementFromPoint(r.left + r.width / 2, r.top + 40)?.closest('[data-testid=calc-window]');
  }), true, 'not hidden behind anything');
  assert.match(await win().getByTestId('calc-warning').innerText(), /^Study Forge Calculator is a study tool and is not an officially approved examination calculator\. Follow your instructor’s and examination provider’s calculator rules\. You are responsible for using it honestly\. Study Forge is not responsible for any use that breaks a school, exam or academic-integrity rule, including cheating\.\s+Terms of Use$/);
  await win().getByLabel('Expression').fill('12+30');
  await win().getByRole('button', { name: 'Close calculator' }).click();
  assert.equal(await win().isVisible(), false);
  await toggle();
  assert.equal(await page.getByTestId('calc-window').count(), 1, 'never two calculators');
  assert.equal(await win().getByLabel('Expression').inputValue(), '12+30', 'what was typed is still there');
  await toggle();
  assert.equal(await win().isVisible(), false, 'the toolbar button closes it too');
  await toggle();
  await page.keyboard.press('Escape');
  assert.equal(await win().isVisible(), false, 'Escape closes it');
  assert.equal(await page.locator('textarea.note-body').inputValue(), 'Working: ', 'the note is untouched');
});

test('Scientific mode: order of operations, functions, notation, percent, history', async () => {
  await toggle();
  const calc = win();
  const run = async (text) => {
    await calc.getByLabel('Expression').fill(text);
    await calc.getByRole('button', { name: 'Work it out' }).click();
    return (await calc.getByTestId('calc-answer').first().innerText()).replace(/^= /, '');
  };
  assert.equal(await run('2+3×4'), '14');
  assert.equal(await run('(2+3)×4'), '20');
  assert.equal(await run('2^3^2'), '512');
  assert.equal(await run('sin(30)+cos(60)'), '1');
  assert.equal(await run('sin⁻¹(1)'), '90');
  assert.equal(await run('log(1000)+ln(e)'), '4');
  assert.equal(await run('√(16)+5!'), '124');
  assert.equal(await run('1.5ᴇ3'), '1500');
  assert.equal(await run('20%×50'), '10');
  assert.equal(await run('π'), '3.14159265359');
  assert.match(await calc.getByTestId('calc-history').innerText(), /2\+3×4\s*= 14/, 'earlier answers stay listed');
  await calc.getByLabel('Expression').fill('');
  await calc.getByRole('button', { name: 'square root' }).click();
  await calc.getByRole('button', { name: '9', exact: true }).click();
  await calc.getByRole('button', { name: 'close bracket' }).click();
  await calc.getByRole('button', { name: 'Work it out' }).click();
  assert.equal(await calc.getByTestId('calc-answer').first().innerText(), '= 3', 'the keys work as well as typing');
  await calc.getByLabel('Expression').fill('2+*3');
  await calc.getByRole('button', { name: 'Work it out' }).click();
  assert.match(await calc.getByRole('alert').innerText(), /wrong place/);
  await calc.getByRole('button', { name: 'Radians' }).click();
  assert.equal(await run('sin(π/2)'), '1');
  await calc.getByRole('button', { name: 'Degrees' }).click();
});

test('switching modes keeps the calculator open and carries what was being typed', async () => {
  const calc = win();
  await calc.getByLabel('Expression').fill('7×6');
  await calc.getByRole('tab', { name: 'Graphing' }).click();
  assert.equal(await calc.isVisible(), true);
  assert.match(await lcd('lcd-entry').innerText(), /^7×6/);
  await key('enter');
  assert.equal(await lcd('lcd-answer').last().innerText(), '42');
  await calc.getByRole('tab', { name: 'Scientific' }).click();
  await calc.getByRole('tab', { name: 'Graphing' }).click();
  assert.equal(await lcd('lcd-answer').last().innerText(), '42', 'the graphing screen keeps its work');
});

test('Graphing mode works like the handheld: home screen, 2nd, ALPHA, STO and errors', async () => {
  await keys('2', 'add', '3', 'mul', '4', 'enter');
  assert.equal(await lcd('lcd-answer').last().innerText(), '14');
  await keys('2nd', 'pow', 'enter');
  assert.equal(await lcd('lcd-answer').last().innerText(), '3.141592654', '2nd ^ is π, shown to 10 digits');
  await keys('2nd', 'sq', '8', '1', 'rp', 'enter');
  assert.equal(await lcd('lcd-answer').last().innerText(), '9', '2nd x² is √');
  await keys('5', 'sto', 'alpha', 'math', 'enter');
  await keys('alpha', 'math', 'mul', '2', 'enter');
  assert.equal(await lcd('lcd-answer').last().innerText(), '10', 'STO→ ALPHA A stores 5 in A');
  await keys('mul', '3', 'enter');
  assert.equal(await lcd('lcd-answer').last().innerText(), '30', 'starting with an operator continues from Ans');
  await keys('2nd', 'enter');
  assert.match(await lcd('lcd-entry').innerText(), /Ans×3/, '2nd ENTER recalls the last entry');
  await keys('clear', 'lp', 'add', 'enter');
  assert.match(await win().getByRole('alert').first().innerText(), /ERR:SYNTAX/);
  await key('enter');
  assert.equal(await lcd('lcd-home').isVisible(), true, 'any key goes back');
  await keys('math', '1');
  await keys('clear', '0', 'dot', '7', '5', 'math', '1', 'enter');
  assert.equal(await lcd('lcd-answer').last().innerText(), '3/4', 'MATH ▶Frac');
});

test('Y=, GRAPH, TRACE, CALC, TABLE, WINDOW, ZOOM and MODE', async () => {
  await key('yeq');
  await keys('xt', 'sq', 'sub', '2', 'down', 'xt');
  assert.equal(await lcd('lcd-y1').innerText(), 'X²−2');
  await key('graph');
  assert.match(await lcd('lcd-canvas').getAttribute('aria-label'), /Y1 = X²−2; Y2 = X\. X from -10 to 10/);
  await page.screenshot({ path: path.join(shots, 'calc-graph.png') });
  // A real graph is drawn: the canvas has coloured dots.
  assert.ok(await lcd('lcd-canvas').evaluate((canvas) => {
    const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
    let coloured = 0;
    for (let i = 0; i < data.length; i += 4) if (data[i + 3] > 0 && Math.abs(data[i] - data[i + 2]) > 60) coloured++;
    return coloured > 200;
  }), 'lines are drawn');

  await key('trace');
  assert.match(await lcd('lcd-coords').innerText(), /^X=0\s*Y=-2$/);
  await key('right');
  assert.match(await lcd('lcd-coords').innerText(), /^X=0\.07575757576\s*Y=-1\.99426079$/, 'one dot along');
  await key('down');
  assert.match(await lcd('lcd-coords').innerText(), /Y=0\.07575757576$/, '▼ moves to Y2');
  await keys('3', 'enter');
  assert.match(await lcd('lcd-coords').innerText(), /^X=3\s*Y=3$/, 'typing a number jumps to that X');
  await key('up');

  await keys('2nd', 'trace');
  assert.match(await lcd('lcd-calc').innerText(), /1:value\s+2:zero\s+3:minimum\s+4:maximum\s+5:intersect/);
  await key('2');
  assert.match(await lcd('lcd-coords').innerText(), /Zero X=1\.414213562 Y=0/);
  await keys('2nd', 'trace', '3');
  assert.match(await lcd('lcd-coords').innerText(), /Minimum X=0 Y=-2/);
  await keys('2nd', 'trace', '5');
  assert.match(await lcd('lcd-coords').innerText(), /Intersection X=-1 Y=-1/, 'the meeting point nearest the cursor (at the minimum, X=0)');
  await keys('2nd', 'trace', '4');
  assert.match(await lcd('lcd-coords').innerText(), /no maximum of Y1 in this window/, 'honest when there is none');
  await keys('2nd', 'trace', '1', '1', 'enter');
  assert.match(await lcd('lcd-coords').innerText(), /^X=1\s*Y=-1$/, 'value');

  await keys('2nd', 'graph');
  assert.match(await lcd('lcd-table').innerText(), /X\s+Y1\s+Y2\s+0\s+-2\s+0\s+1\s+-1\s+1/);
  await key('down');
  assert.match(await lcd('lcd-table').innerText(), /^X\s+Y1\s+Y2\s+1\s+-1\s+1/, '▼ scrolls');
  await keys('2nd', 'window', '5', 'enter', '2');
  await keys('2nd', 'graph');
  assert.match(await lcd('lcd-table').innerText(), /^X\s+Y1\s+Y2\s+5\s+23\s+5\s+7\s+47\s+7/, 'TBLSET start and step');

  await key('window');
  await keys('clear', 'neg', '5', 'enter', '5', 'enter');
  await key('graph');
  assert.match(await lcd('lcd-canvas').getAttribute('aria-label'), /X from -5 to 5/);
  await key('window');
  await keys('clear', '9', '9', 'enter');
  assert.match(await win().getByRole('alert').first().innerText(), /ERR:WINDOW RANGE.*Xmin must be less than Xmax/s);
  await key('enter');
  await keys('zoom', '6');
  assert.match(await lcd('lcd-canvas').getAttribute('aria-label'), /X from -10 to 10, Y from -10 to 10/, 'ZStandard');
  await keys('zoom', '2');
  assert.match(await lcd('lcd-canvas').getAttribute('aria-label'), /X from -2\.5 to 2\.5/, 'Zoom In');
  await keys('zoom', '0');
  assert.match(await lcd('lcd-canvas').getAttribute('aria-label'), /Y from -2\.5 to 4\.25/, 'ZoomFit');

  await key('mode');
  await key('left');
  assert.match(await win().getByText(/RADIAN/).first().innerText(), /RADIAN/);
  await keys('2nd', 'mode');
  await keys('clear', 'sin', '2nd', 'pow', 'div', '2', 'rp', 'enter');
  assert.equal(await lcd('lcd-answer').last().innerText(), '1', 'radian mode');
  await key('mode');
  await key('right');
  await keys('2nd', 'mode');

  await key('yeq');
  await keys('down', 'down', 'xt', 'xt', 'xt');
  await key('graph');
  assert.match(await lcd('lcd-canvas').getAttribute('aria-label'), /Y3 = XXX/, 'implied multiplication still graphs');
  await key('yeq');
  await keys('clear');
  await keys('alpha', '7', 'lp', 'enter');
  await key('graph');
  await key('yeq');
  assert.match(await win().getByTestId('lcd-yeq').innerText(), /can’t graph/, 'an invalid function says so instead of drawing nothing quietly');
  await keys('clear', '2nd', 'mode');
});

test('every key is visible and can be pressed without breaking anything', async () => {
  const ids = await win().locator('.ti-keys [data-key]').evaluateAll((buttons) => buttons.map((b) => b.dataset.key));
  assert.ok(ids.length >= 45, `${ids.length} keys`);
  for (const id of ids) {
    const button = win().locator(`.ti-keys [data-key="${id}"]`);
    await button.scrollIntoViewIfNeeded();
    assert.ok(await button.isVisible(), `${id} is visible`);
    await button.click();
  }
  // Whatever happened, the calculator still answers: leave any message, quit to the home screen, clear.
  await keys('enter', '2nd', 'mode', 'clear', 'clear');
  const state = await win().locator('.ti-screen').getAttribute('data-screen');
  assert.equal(state, 'home', 'back on the home screen');
  await keys('1', 'add', '1', 'enter');
  assert.equal(await lcd('lcd-answer').last().innerText(), '2');
  assert.deepEqual(pageErrors, []);
});

test('a computer keyboard types on the graphing screen', async () => {
  await win().locator('.ti-screen').focus();
  await page.keyboard.type('6*7');
  await page.keyboard.press('Enter');
  assert.equal(await lcd('lcd-answer').last().innerText(), '42');
});

test('Put in note adds the answer to the note as an equation', async () => {
  await win().getByRole('button', { name: 'Put the last answer in the note' }).click();
  assert.match(await page.locator('textarea.note-body').inputValue(), /^Working: \$.*= 42\$$/);
});

for (const [name, view, mobile] of [['phone', { width: 390, height: 844 }, true], ['tablet', { width: 820, height: 1180 }, true], ['small laptop', { width: 1024, height: 640 }, false]]) {
  for (const theme of ['light', 'dark']) {
    test(`${name}, ${theme}: the calculator fits, its screen stays in view, and its keys are big enough`, async () => {
      await open({ viewport: view, mobile, theme });
      await toggle();
      await win().getByRole('tab', { name: 'Graphing' }).click();
      const fit = await page.evaluate(() => {
        const w = document.querySelector('[data-testid=calc-window]').getBoundingClientRect();
        const keysTall = [...document.querySelectorAll('.ti-keys .ti-key:not(.ti-arrow)')].map((k) => k.getBoundingClientRect().height);
        return { inside: w.left >= 0 && w.top >= 0 && w.right <= innerWidth + 0.5 && w.bottom <= innerHeight + 0.5, sideways: document.documentElement.scrollWidth > innerWidth, smallest: Math.min(...keysTall) };
      });
      assert.ok(fit.inside, 'the whole window is on screen');
      assert.equal(fit.sideways, false, 'no sideways scrolling');
      assert.ok(fit.smallest >= 38, `keys are at least 38px tall (${fit.smallest})`);
      await keys('yeq', 'xt', 'sq', 'graph');
      // Pressing the bottom keys never hides the screen.
      await key('enter');
      const screenSeen = await page.evaluate(() => {
        const s = document.querySelector('.ti-screen').getBoundingClientRect();
        return s.top >= 0 && s.bottom <= innerHeight;
      });
      assert.ok(screenSeen, 'the screen is visible while pressing the bottom row');
      await page.screenshot({ path: path.join(shots, `calc-${name.replace(' ', '-')}-${theme}.png`) });
      await win().getByRole('tab', { name: 'Scientific' }).click();
      await page.screenshot({ path: path.join(shots, `calc-${name.replace(' ', '-')}-${theme}-scientific.png`) });
    });
  }
}

test('it opens beside practice too, and closes itself for a timed mock exam', async () => {
  await open();
  await page.goto(`${URL_BASE}#/exams/run`);
  await page.goto(`${URL_BASE}#/notes`);
  await page.getByRole('button', { name: 'New note' }).first().click();
  await toggle();
  await win().getByTestId('scientific').waitFor();
  await page.evaluate(() => { location.hash = '#/exams/run'; });
  await page.waitForFunction(() => document.querySelector('[data-testid=calc-window]')?.hidden === true);
  assert.equal(await win().isVisible(), false);
  assert.deepEqual(pageErrors, []);
});

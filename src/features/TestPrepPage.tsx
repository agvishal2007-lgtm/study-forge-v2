import { useState } from 'react';
import { Breadcrumbs } from '../components/Breadcrumbs';
import { PrepRunner } from '../components/PrepRunner';
import {
  DOMAINS, SECTION_LABEL, TESTS, addScore, daysUntil, deleteScore, describeCountdown, domainLabel,
  domainsIn, getPrepSetup, inOrder, listAttempts, listScores, nextFocus, pickQuestions, progressOf,
  savePrepSetup, selectionIndex, standings, testFacts, totalOf, totalRange, validSection, weakAreas,
  type PrepSetup, type Section, type TestId,
} from '../data/testPrep';
import { localNow } from '../data/plannerRules';
import { useLive } from '../data/useLive';

/**
 * SAT and PSAT preparation.
 *
 * Practice is the main thing here, and the questions are Study Forge's own — written to the shape
 * of each published content domain, never copied from anywhere. That is said on the screen rather
 * than buried, along with the other honest limit: practice at home shows which topics need work
 * and cannot forecast a test-day score. The score log is the smaller part beside it, for the real
 * practice tests a student sits elsewhere.
 */
export function TestPrepPage() {
  const [running, setRunning] = useState<{ section: Section | 'both'; domain: string } | null>(null);
  const [problem, setProblem] = useState('');
  /*
   * What is on screen leads, and the save follows. These three fields are driven by stored data, and
   * stored data arrives a moment after the write — so changing the test and moving on quickly could
   * lose the change, and a date being typed could spring back mid-keystroke.
   */
  const [chosen, setChosen] = useState<PrepSetup | null>(null);
  const { data, error } = useLive(async () => ({
    setup: await getPrepSetup(),
    scores: await listScores(),
    attempts: await listAttempts(),
  }));

  if (error) return <div className="page"><h1>SAT and PSAT practice</h1><p className="error" role="alert">This couldn't be loaded. {error.message}</p></div>;
  if (!data) return <p className="page muted">Loading…</p>;
  const { scores, attempts } = data;
  const setup = chosen ?? data.setup;
  const facts = testFacts(setup.test);
  const [lowTotal, highTotal] = totalRange(setup.test);
  const change = (next: Partial<PrepSetup>) => {
    const wanted = { ...setup, ...next };
    setChosen(wanted);
    void savePrepSetup(wanted).catch((failure: Error) => {
      setProblem(`That wasn't saved, so it is only on this screen. ${failure.message}`);
    });
  };

  if (running) {
    const questions = pickQuestions({ test: setup.test, section: running.section, domain: running.domain });
    return (
      <div className="page">
        <Breadcrumbs trail={[{ label: 'SAT and PSAT practice', to: '/test-prep' }, { label: 'Practice' }]} />
        <h1>Practice</h1>
        <PrepRunner questions={questions} onDone={() => setRunning(null)} />
      </div>
    );
  }

  const progress = progressOf(scores, setup.goalTotal);
  const focus = nextFocus(attempts);
  const weak = weakAreas(attempts);
  const marks = standings(attempts);
  const countdown = describeCountdown(daysUntil(setup.testDate || null, localNow().date));

  const addPractice = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    // Held on to before anything is awaited: React clears the event's target once the handler
    // returns, so reaching for it after the save throws and the form is never cleared.
    const element = event.currentTarget;
    const form = new FormData(element);
    const rw = Number(form.get('rw'));
    const math = Number(form.get('math'));
    if (!validSection(setup.test, rw) || !validSection(setup.test, math)) {
      setProblem(`Each section is from ${facts.sectionLow} to ${facts.sectionHigh}, in steps of ten.`);
      return;
    }
    setProblem('');
    await addScore({
      test: setup.test,
      date: String(form.get('date') ?? '') || localNow().date,
      source: String(form.get('source') ?? ''),
      rw,
      math,
    });
    element.reset();
    // The date is the one field worth keeping, since scores are usually entered for a known day.
    const date = element.querySelector<HTMLInputElement>('[name=date]');
    if (date) date.value = localNow().date;
  };

  return (
    <div className="page">
      <Breadcrumbs trail={[{ label: 'Today', to: '/' }, { label: 'SAT and PSAT practice' }]} />
      <h1>SAT and PSAT practice</h1>

      <p className="muted" data-testid="prep-honesty">
        The practice questions here are Study Forge's own, written to the shape of each part of the
        test. They are not College Board questions and are not copied from anywhere. Practice here
        shows you which topics to spend time on; it cannot tell you what you would score on the day.
        The official practice tests are still the best thing to sit alongside this —{' '}
        <a href="https://satsuite.collegeboard.org/" target="_blank" rel="noreferrer">the College Board's own site</a>{' '}
        has them free.
      </p>

      <section aria-labelledby="prep-which">
        <h2 id="prep-which">Which test are you preparing for?</h2>
        <div className="field-row">
          <label>
            Test
            <select value={setup.test} data-testid="prep-test" onChange={(event) => change({ test: event.target.value as TestId })}>
              {TESTS.map((one) => <option key={one.id} value={one.id}>{one.label} · {one.who}</option>)}
            </select>
          </label>
          <label>
            Test date, if you know it
            <input type="date" value={setup.testDate} data-testid="prep-date" onChange={(event) => change({ testDate: event.target.value })} />
          </label>
          <label>
            A total you're aiming for
            <input
              type="number"
              step={10}
              min={lowTotal}
              max={highTotal}
              value={setup.goalTotal ?? ''}
              placeholder={`${lowTotal}–${highTotal}`}
              data-testid="prep-goal"
              onChange={(event) => change({ goalTotal: event.target.value === '' ? null : Number(event.target.value) })}
            />
          </label>
        </div>
        <p className="muted small" data-testid="prep-scale">
          {facts.label}: total {lowTotal} to {highTotal}, each section {facts.sectionLow} to {facts.sectionHigh}, in steps of ten.
          {facts.selectionIndex && ' It also has a National Merit Selection Index, which is twice Reading and Writing plus Math, divided by ten: 48 to 228.'}
        </p>
        <p className="muted small" data-testid="prep-countdown">{countdown}</p>
      </section>

      <section aria-labelledby="prep-practise">
        <h2 id="prep-practise">Practise</h2>
        {focus && (
          <p data-testid="prep-focus">
            {focus.tried === 0
              ? <>Nothing tried in <b>{focus.label}</b> yet — that's the most useful place to start.</>
              : <>Weakest so far: <b>{focus.label}</b>, {focus.accuracy}% right.</>}
            {' '}
            <button className="button" type="button" data-testid="prep-start-focus" onClick={() => setRunning({ section: 'both', domain: focus.domain })}>
              Practise {focus.label}
            </button>
          </p>
        )}
        <div className="prep-domains">
          {(['rw', 'math'] as Section[]).map((section) => (
            <div key={section}>
              <h3>{SECTION_LABEL[section]}</h3>
              <ul className="plain-list">
                {domainsIn(section).map((domain) => {
                  const count = pickQuestions({ test: setup.test, domain: domain.id }).length;
                  const mark = marks.find((one) => one.domain === domain.id);
                  return (
                    <li key={domain.id} className="prep-domain-row">
                      <span>
                        {domain.label}{' '}
                        <span className="muted small">
                          {count} question{count === 1 ? '' : 's'}
                          {mark && mark.tried > 0 ? ` · ${mark.right} of ${mark.tried} right` : ''}
                        </span>
                      </span>
                      <button
                        className="button"
                        type="button"
                        disabled={count === 0}
                        data-testid={`practise-${domain.id}`}
                        onClick={() => setRunning({ section, domain: domain.id })}
                      >
                        Practise
                      </button>
                    </li>
                  );
                })}
              </ul>
              <button
                className="button"
                type="button"
                data-testid={`practise-all-${section}`}
                onClick={() => setRunning({ section, domain: 'all' })}
              >
                All of {SECTION_LABEL[section]}
              </button>
            </div>
          ))}
        </div>
        {setup.test === 'psat-8-9' && (
          <p className="muted small" data-testid="prep-level-note">
            The hardest questions are left out for the PSAT 8/9, since they are pitched at a test you
            aren't sitting.
          </p>
        )}
      </section>

      {weak.length > 0 && (
        <section aria-labelledby="prep-weak">
          <h2 id="prep-weak">Worth working on</h2>
          <ul className="plain-list" data-testid="prep-weak">
            {weak.map((one) => (
              <li key={one.domain}>
                <b>{one.label}</b> — {one.right} of {one.tried} right ({one.accuracy}%)
              </li>
            ))}
          </ul>
          <p className="muted small">
            From your own answers here, and only where you've tried enough of a topic for it to mean
            anything. A topic you haven't touched is unknown, never counted as zero.
          </p>
        </section>
      )}

      <section aria-labelledby="prep-scores">
        <h2 id="prep-scores">Practice test scores</h2>
        <p className="muted small">
          For the real practice tests you sit elsewhere. Enter the two section scores and the total
          follows from them, the way the test reports it.
        </p>
        {problem && <p className="error" role="alert">{problem}</p>}
        <form className="prep-score-form" onSubmit={addPractice}>
          <label>Date<input type="date" name="date" defaultValue={localNow().date} data-testid="score-date" /></label>
          <label>Which one?<input name="source" placeholder="Official practice 3" data-testid="score-source" /></label>
          <label>
            {SECTION_LABEL.rw}
            <input type="number" name="rw" step={10} min={facts.sectionLow} max={facts.sectionHigh} data-testid="score-rw" />
          </label>
          <label>
            {SECTION_LABEL.math}
            <input type="number" name="math" step={10} min={facts.sectionLow} max={facts.sectionHigh} data-testid="score-math" />
          </label>
          <button className="button primary" type="submit">Add this score</button>
        </form>

        {scores.length === 0 ? (
          <p className="muted">No scores yet.</p>
        ) : (
          <>
            <ul className="plain-list" data-testid="score-list">
              {inOrder(scores).map((score) => {
                const index = selectionIndex(score.test, score.rw, score.math);
                return (
                  <li key={score.id} className="prep-score-row">
                    <span>
                      <b>{totalOf(score.rw, score.math)}</b> on {score.date}
                      {score.source.trim() ? ` · ${score.source.trim()}` : ''}
                      <span className="muted small">
                        {' '}({SECTION_LABEL.rw} {score.rw}, {SECTION_LABEL.math} {score.math}
                        {index !== null ? `, Selection Index ${index}` : ''})
                      </span>
                    </span>
                    <button className="text-button danger-text" type="button" onClick={() => void deleteScore(score.id)}>
                      Remove
                    </button>
                  </li>
                );
              })}
            </ul>
            <p data-testid="prep-progress">
              {progress.latest && <>Latest: <b>{totalOf(progress.latest.rw, progress.latest.math)}</b>. </>}
              {progress.best && <>Best: <b>{totalOf(progress.best.rw, progress.best.math)}</b>. </>}
              {progress.change !== null && (
                <>{progress.change === 0 ? 'No change' : progress.change > 0 ? `Up ${progress.change}` : `Down ${Math.abs(progress.change)}`} since your first. </>
              )}
              {progress.toGoal !== null && (
                <>{progress.toGoal === 0 ? 'You are at your goal.' : `${progress.toGoal} short of your goal.`}</>
              )}
            </p>
          </>
        )}
      </section>

      <p className="muted small" data-testid="prep-trademark">
        SAT, PSAT/NMSQT, PSAT 10 and PSAT 8/9 are trademarks of the College Board, which is not
        affiliated with Study Forge and does not endorse it. Score ranges quoted here come from the
        College Board's own published score explanations.
      </p>
      <p className="muted small">
        Domains covered: {DOMAINS.map((domain) => domainLabel(domain.id)).join(', ')}.
      </p>
    </div>
  );
}

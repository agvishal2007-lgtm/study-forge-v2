import { useState } from 'react';
import { addAttempt, typedAnswerMatches, type PrepQuestion } from '../data/testPrep';

/**
 * One practice question at a time, with the explanation afterwards.
 *
 * The explanation is the point. A score out of ten teaches nothing; knowing why the answer was the
 * answer, and why the tempting wrong one was tempting, is the thing that moves a real score. So
 * nothing is marked until the student commits, and once it is, the working is there whether they
 * got it right or not.
 */
export function PrepRunner({ questions, onDone }: { questions: PrepQuestion[]; onDone: () => void }) {
  const [at, setAt] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [typed, setTyped] = useState('');
  const [marked, setMarked] = useState(false);
  const [right, setRight] = useState(0);
  const [problem, setProblem] = useState('');

  const question = questions[at];
  if (!question) {
    return (
      <section className="prep-runner" data-testid="prep-done">
        <h3>Done for now</h3>
        <p>
          {right} of {questions.length} right.
        </p>
        <p className="muted small">
          This is practice, not a prediction. It says which topics to spend time on, and nothing
          about what you would score on the day.
        </p>
        <button className="button primary" onClick={onDone}>Back to practice</button>
      </section>
    );
  }

  const isTyped = !question.choices;
  const correct = isTyped ? typedAnswerMatches(question, typed) : picked === question.answer;

  const mark = async () => {
    if (!isTyped && picked === null) { setProblem('Choose an answer first.'); return; }
    if (isTyped && typed.trim() === '') { setProblem('Type your answer first.'); return; }
    setProblem('');
    setMarked(true);
    if (correct) setRight((count) => count + 1);
    // Recorded so weak areas come from real work. A failure here must not lose the question.
    await addAttempt(question.id, question.domain, correct).catch(() => undefined);
  };

  const next = () => {
    setAt((index) => index + 1);
    setPicked(null);
    setTyped('');
    setMarked(false);
    setProblem('');
  };

  return (
    <section className="prep-runner" data-testid="prep-runner" aria-labelledby="prep-q">
      <p className="muted small">
        Question {at + 1} of {questions.length}
      </p>
      {question.passage && (
        <div className="prep-passage" data-testid="prep-passage">
          {question.passage.split('\n\n').map((part, index) => <p key={index}>{part}</p>)}
        </div>
      )}
      <h3 id="prep-q" data-testid="prep-prompt">{question.prompt}</h3>

      {isTyped ? (
        <label>
          Your answer
          <input
            value={typed}
            disabled={marked}
            data-testid="prep-typed"
            onChange={(event) => setTyped(event.target.value)}
          />
        </label>
      ) : (
        <ul className="plain-list prep-choices" data-testid="prep-choices">
          {question.choices?.map((choice, index) => (
            <li key={index}>
              <label className="check-line">
                <input
                  type="radio"
                  name={`q-${question.id}`}
                  checked={picked === index}
                  disabled={marked}
                  onChange={() => setPicked(index)}
                />
                {choice}
              </label>
            </li>
          ))}
        </ul>
      )}

      {problem && <p className="error" role="alert">{problem}</p>}

      {!marked ? (
        <button className="button primary" onClick={() => void mark()} data-testid="prep-check">Check my answer</button>
      ) : (
        <div className="prep-answer" data-testid="prep-answer">
          <p className={correct ? 'prep-right' : 'prep-wrong'}>
            <b>{correct ? 'Right.' : 'Not this time.'}</b>{' '}
            {!correct && (isTyped
              ? `The answer is ${question.accepts?.[0]}.`
              : `The answer is ${question.choices?.[question.answer ?? 0]}.`)}
          </p>
          <p data-testid="prep-why">{question.why}</p>
          <button className="button primary" onClick={next} data-testid="prep-next">
            {at + 1 === questions.length ? 'Finish' : 'Next question'}
          </button>
        </div>
      )}
    </section>
  );
}

import { useRef, useState } from 'react';
import { applyEdit, continueList, formatEdit } from '../../data/noteFormat';
import { describeInterval, outcome } from '../../data/flashcardRules';
import { CARD_RATINGS } from '../../data/types';
import type { Activity, MockScreen } from './lessons';

/*
 * Hands-on activities for Academy lessons. Every one works on a practice copy held only in this
 * page, so nothing here ever touches the student's real courses, notes or files.
 */
type Done = () => void;

/** A small pretend Study Forge screen. In "find" mode the student taps the part they're asked for. */
export function MockApp({ screen, highlight, onPick, picked }: { screen: MockScreen; highlight?: string; onPick?: (label: string) => void; picked?: string | null }) {
  const part = (label: string, className: string) => {
    const state = picked === label ? ' picked' : '';
    const lit = highlight === label ? ' lit' : '';
    return onPick
      ? <button key={label} type="button" className={`${className}${state}`} onClick={() => onPick(label)}>{label}</button>
      : <span key={label} className={`${className}${lit}`} aria-current={highlight === label ? 'true' : undefined}>{label}</span>;
  };
  return (
    <div className="mock-app" role={onPick ? 'group' : 'img'} aria-label={onPick ? `Practice screen: ${screen.page}` : `Picture of the ${screen.page} screen${highlight ? `, with ${highlight} highlighted` : ''}`}>
      <div className="mock-nav">{screen.nav.map((label) => part(label, `mock-nav-item${label === screen.page ? ' current' : ''}`))}</div>
      <div className="mock-body">
        <div className="mock-top">{screen.top.map((label) => part(label, 'mock-top-item'))}</div>
        <p className="mock-title">{screen.page}</p>
        <div className="mock-buttons">{screen.buttons.map((label) => part(label, 'mock-button'))}</div>
      </div>
    </div>
  );
}

function Feedback({ tone, children }: { tone: 'good' | 'try'; children: React.ReactNode }) {
  return <p className={`academy-feedback ${tone}`} role="status" data-testid="activity-feedback">{tone === 'good' ? '✓ ' : ''}{children}</p>;
}

function Find({ activity, onDone }: { activity: Extract<Activity, { type: 'find' }>; onDone: Done }) {
  const [picked, setPicked] = useState<string | null>(null);
  const right = picked === activity.target;
  return (
    <div>
      <p className="academy-task">{activity.prompt}</p>
      <MockApp screen={activity.screen} picked={picked} onPick={(label) => { setPicked(label); if (label === activity.target) onDone(); }} />
      {picked && (right ? <Feedback tone="good">That’s {activity.target}.</Feedback> : <Feedback tone="try">Not quite: that’s {picked}. {activity.hint}</Feedback>)}
    </div>
  );
}

function Choice({ activity, onDone }: { activity: Extract<Activity, { type: 'choice' }>; onDone: Done }) {
  const [chosen, setChosen] = useState<number | null>(null);
  const [submitted, setSubmitted] = useState<number | null>(null);
  const answer = submitted === null ? null : activity.options[submitted];
  return (
    <form onSubmit={(event) => {
      event.preventDefault();
      if (chosen === null) return;
      setSubmitted(chosen);
      if (activity.options[chosen].correct) onDone();
    }}>
      <fieldset className="academy-choice">
        <legend>{activity.question}</legend>
        {activity.options.map((option, index) => (
          <label key={option.text} className="option">
            <input type="radio" name="academy-choice" checked={chosen === index} onChange={() => setChosen(index)} />
            <span>{option.text}</span>
          </label>
        ))}
      </fieldset>
      <button className="button primary" type="submit" disabled={chosen === null}>Submit</button>
      {answer && (answer.correct ? <Feedback tone="good">{answer.why}</Feedback> : <Feedback tone="try">{answer.why} Try another answer.</Feedback>)}
    </form>
  );
}

function CourseForm({ onDone }: { onDone: Done }) {
  const [name, setName] = useState('');
  const [problem, setProblem] = useState('');
  const [made, setMade] = useState<string[]>(['Practice: Biology']);
  return (
    <div>
      <p className="academy-task">Make a practice course for one of your classes. It stays in this lesson only.</p>
      <form className="inline-form" onSubmit={(event) => {
        event.preventDefault();
        if (!name.trim()) { setProblem('Type a course name first, such as “Financial Accounting”.'); return; }
        setProblem('');
        setMade((list) => [...list, name.trim()]);
        setName('');
        onDone();
      }}>
        <label>Course name (practice)<input value={name} onChange={(event) => setName(event.target.value)} placeholder="Financial Accounting" /></label>
        <button className="button primary" type="submit">Create course</button>
      </form>
      {problem && <Feedback tone="try">{problem}</Feedback>}
      <ul className="academy-sandbox" aria-label="Practice courses">{made.map((course) => <li key={course}>{course}</li>)}</ul>
      {made.length > 1 && <Feedback tone="good">“{made[made.length - 1]}” was added to the practice list.</Feedback>}
    </div>
  );
}

function TopicForm({ onDone }: { onDone: Done }) {
  const [topics, setTopics] = useState(['Chapter 1: Introduction']);
  const [name, setName] = useState('');
  return (
    <div>
      <p className="academy-task">The practice course “Biology” has one topic. Add a second one, such as “Chapter 2: Cells”.</p>
      <div className="academy-sandbox-card">
        <b>Biology (practice)</b>
        <ol>{topics.map((topic) => <li key={topic}>{topic}</li>)}</ol>
        <form className="inline-form" onSubmit={(event) => {
          event.preventDefault();
          if (!name.trim()) return;
          setTopics((list) => [...list, name.trim()]);
          setName('');
          onDone();
        }}>
          <label>New topic<input value={name} onChange={(event) => setName(event.target.value)} placeholder="Chapter 2: Cells" /></label>
          <button className="button primary" type="submit" disabled={!name.trim()}>Add topic</button>
        </form>
      </div>
      {topics.length > 1 && <Feedback tone="good">“{topics[topics.length - 1]}” is now topic {topics.length}.</Feedback>}
    </div>
  );
}

function Flashcard({ onDone }: { onDone: Done }) {
  const [front, setFront] = useState('');
  const [back, setBack] = useState('');
  const [card, setCard] = useState<{ front: string; back: string } | null>(null);
  const [flipped, setFlipped] = useState(false);
  const [rated, setRated] = useState<string | null>(null);
  if (!card) {
    return (
      <div>
        <p className="academy-task">Write a practice card. Try “Assets =” on the front and “Liabilities + Equity” on the back.</p>
        <form className="academy-card-form" onSubmit={(event) => { event.preventDefault(); if (front.trim() && back.trim()) setCard({ front: front.trim(), back: back.trim() }); }}>
          <label>Front<textarea value={front} onChange={(event) => setFront(event.target.value)} rows={2} /></label>
          <label>Back<textarea value={back} onChange={(event) => setBack(event.target.value)} rows={2} /></label>
          <button className="button primary" type="submit" disabled={!front.trim() || !back.trim()}>Add card</button>
        </form>
      </div>
    );
  }
  return (
    <div>
      <p className="academy-task">{flipped ? 'How did it go? Pick one.' : 'Think of the answer, then show the back.'}</p>
      <div className="academy-flashcard" aria-live="polite">{flipped ? card.back : card.front}</div>
      {!flipped
        ? <button className="button primary" type="button" onClick={() => setFlipped(true)}>Show answer</button>
        : (
          <div className="session-actions">
            {CARD_RATINGS.map((rating) => (
              <button key={rating} type="button" className="button" onClick={() => {
                const { days } = outcome(null, rating);
                setRated(`${rating}: next review ${days === 0 ? 'later today' : `in ${describeInterval(days)}`}.`);
                onDone();
              }}>{rating}</button>
            ))}
          </div>
        )}
      {rated && <Feedback tone="good">{rated}</Feedback>}
    </div>
  );
}

function NoteLists({ onDone }: { onDone: Done }) {
  const [text, setText] = useState('Shopping for the lab\n');
  const box = useRef<HTMLTextAreaElement>(null);
  const bullets = text.split('\n').filter((line) => line.startsWith('• ') && line.length > 2).length;
  const apply = (next: string, start: number, end: number) => {
    setText(next);
    requestAnimationFrame(() => box.current?.setSelectionRange(start, end));
  };
  return (
    <div>
      <p className="academy-task">Press Bullets, type “Goggles”, press Enter, then type “Gloves”. Two bullet points finish the activity.</p>
      <div className="note-toolbar">
        <button type="button" className="button" onClick={() => {
          const area = box.current; if (!area) return;
          const edit = formatEdit(text, area.selectionStart, area.selectionEnd, 'bullet');
          apply(applyEdit(text, edit), edit.selectionStart, edit.selectionEnd);
          area.focus();
        }}>Bullets</button>
      </div>
      <label className="sr-only" htmlFor="academy-note">Practice note</label>
      <textarea id="academy-note" ref={box} className="note-body" rows={5} value={text}
        onChange={(event) => { setText(event.target.value); if (event.target.value.split('\n').filter((line) => line.startsWith('• ') && line.length > 2).length >= 2) onDone(); }}
        onKeyDown={(event) => {
          if (event.key !== 'Enter' || event.shiftKey) return;
          const edit = continueList(event.currentTarget.value, event.currentTarget.selectionStart, event.currentTarget.selectionEnd);
          if (edit) { event.preventDefault(); apply(applyEdit(text, edit), edit.selectionStart, edit.selectionEnd); }
        }} />
      {bullets >= 2 && <Feedback tone="good">Two bullet points. Enter carried the list on for you.</Feedback>}
    </div>
  );
}

function Steps({ onDone }: { onDone: Done }) {
  const [done, setDone] = useState<Set<number>>(new Set());
  const steps = ['Choose a topic', 'Research', 'Outline', 'Draft'];
  return (
    <div>
      <p className="academy-task">This practice essay is due May 20. Tick its first two steps.</p>
      <div className="academy-sandbox-card">
        <b>History essay (practice)</b> <span className="muted small">Due May 20</span>
        <ol className="step-list">
          {steps.map((step, index) => (
            <li key={step} className="step-row">
              <label className="check-label">
                <input type="checkbox" checked={done.has(index)} onChange={(event) => {
                  const next = new Set(done);
                  if (event.target.checked) next.add(index); else next.delete(index);
                  setDone(next);
                  if (next.has(0) && next.has(1)) onDone();
                }} />
                <span className={done.has(index) ? 'step-title done' : 'step-title'}>{step}</span>
              </label>
            </li>
          ))}
        </ol>
        <p data-testid="practice-step-progress">{done.size} of {steps.length} steps done. The due date is still May 20.</p>
      </div>
      {done.has(0) && done.has(1) && <Feedback tone="good">Two steps done. The Planner would now show “2 of 4 steps done. Next: Outline”.</Feedback>}
    </div>
  );
}

function Rename({ onDone }: { onDone: Done }) {
  const [name, setName] = useState('scan_0042.pdf');
  const [place, setPlace] = useState('No course');
  const [draft, setDraft] = useState('');
  const finished = name !== 'scan_0042.pdf' && place === 'Biology';
  return (
    <div>
      <p className="academy-task">Rename “scan_0042.pdf” to something useful, then move it to the practice course Biology.</p>
      <div className="academy-sandbox-card">
        <p><b>{name}</b> <span className="muted small">· {place}</span></p>
        <form className="inline-form" onSubmit={(event) => { event.preventDefault(); if (draft.trim()) { setName(draft.trim()); setDraft(''); if (place === 'Biology') onDone(); } }}>
          <label>New name<input value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Lab 3 handout.pdf" /></label>
          <button className="button" type="submit" disabled={!draft.trim()}>Rename</button>
        </form>
        <label>Move to
          <select value={place} onChange={(event) => { setPlace(event.target.value); if (event.target.value === 'Biology' && name !== 'scan_0042.pdf') onDone(); }}>
            <option>No course</option><option>Biology</option><option>Chemistry</option>
          </select>
        </label>
      </div>
      {finished && <Feedback tone="good">“{name}” is now in Biology. The file itself didn’t change.</Feedback>}
    </div>
  );
}

function Trash({ onDone }: { onDone: Done }) {
  const [library, setLibrary] = useState(['Lab 3 handout.pdf']);
  const [trash, setTrash] = useState(['Week 2 slides.pdf', 'Old notes']);
  const [asking, setAsking] = useState<string | null>(null);
  const restored = library.includes('Week 2 slides.pdf');
  return (
    <div>
      <p className="academy-task">You deleted “Week 2 slides.pdf” by mistake. Get it back from this practice Trash.</p>
      <div className="academy-two">
        <div className="academy-sandbox-card"><b>Library (practice)</b><ul>{library.map((item) => <li key={item}>{item}</li>)}</ul></div>
        <div className="academy-sandbox-card">
          <b>Trash (practice)</b>
          {trash.length === 0 ? <p className="muted small">Trash is empty.</p> : (
            <ul className="plain-list">
              {trash.map((item) => (
                <li key={item} className="trash-row">
                  <span>{item}</span>
                  <span className="row-actions">
                    <button type="button" className="button" aria-label={`Restore ${item} (practice)`} onClick={() => { setTrash((list) => list.filter((other) => other !== item)); setLibrary((list) => [...list, item]); if (item === 'Week 2 slides.pdf') onDone(); }}>Restore</button>
                    <button type="button" className="text-button danger-text" aria-label={`Permanently delete ${item} (practice)`} onClick={() => setAsking(item)}>Permanently delete</button>
                  </span>
                </li>
              ))}
            </ul>
          )}
          {asking && (
            <div className="academy-confirm" role="alertdialog" aria-label="Permanently delete?">
              <p>Permanently delete “{asking}”? This can’t be undone.</p>
              <button type="button" className="button danger" onClick={() => { setTrash((list) => list.filter((other) => other !== asking)); setAsking(null); }}>Permanently delete</button>
              <button type="button" className="button" onClick={() => setAsking(null)}>Cancel</button>
            </div>
          )}
        </div>
      </div>
      {restored && <Feedback tone="good">“Week 2 slides.pdf” is back in the Library.</Feedback>}
    </div>
  );
}

export function ActivityView({ activity, onDone }: { activity: Activity; onDone: Done }) {
  switch (activity.type) {
    case 'find': return <Find activity={activity} onDone={onDone} />;
    case 'choice': return <Choice activity={activity} onDone={onDone} />;
    case 'course': return <CourseForm onDone={onDone} />;
    case 'topic': return <TopicForm onDone={onDone} />;
    case 'flashcard': return <Flashcard onDone={onDone} />;
    case 'note': return <NoteLists onDone={onDone} />;
    case 'steps': return <Steps onDone={onDone} />;
    case 'rename': return <Rename onDone={onDone} />;
    case 'trash': return <Trash onDone={onDone} />;
  }
}

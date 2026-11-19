import { useState } from 'react';
import { Link } from 'react-router-dom';
import { belongsTo, listsFor } from '../data/listRules';
import { listPlannerItems, savePlannerItem } from '../data/planner';
import { listCourses } from '../data/store';
import { useLive } from '../data/useLive';

/**
 * Writing down a to-do, and nothing else.
 *
 * Before this, "To-do" in the + menu opened the full planner form — type, priority, points, grade
 * category, estimated hours — to write down "email Mr Harris". The owner's words: it "just takes us
 * to the planner interface to like select stuff, so it also gets very confusing". So this asks for
 * what it is, which list it belongs in, and a date only if there is one. Everything else is left
 * unset rather than filled in with guesses, and the full form is still a link away for anyone who
 * wants the rest of it.
 */
export function QuickTodo({ courseId, onAdded }: { courseId: string | null; onAdded?: () => void }) {
  const [text, setText] = useState('');
  const [listId, setListId] = useState<string | null>(null);
  const [due, setDue] = useState('');
  const [saved, setSaved] = useState('');
  const [problem, setProblem] = useState('');
  const { data } = useLive(async () => {
    const [courses, items] = await Promise.all([listCourses(), listPlannerItems()]);
    return { lists: listsFor(items, courses) };
  });

  const lists = data?.lists ?? [];
  // The class being looked at, else whatever the student last used, else Personal.
  const chosen = lists.find((one) => one.id === listId)
    ?? lists.find((one) => one.id === courseId)
    ?? lists.find((one) => one.kind === 'personal')
    ?? lists[0];

  const add = async (event: React.FormEvent) => {
    event.preventDefault();
    const title = text.trim();
    if (!title) { setProblem('Write what it is first.'); return; }
    if (!chosen) { setProblem('There is nowhere to put it yet.'); return; }
    setProblem('');
    try {
      const where = belongsTo(chosen);
      await savePlannerItem({
        id: crypto.randomUUID(),
        details: '',
        createdAt: Date.now(),
        title,
        courseId: where.courseId,
        section: where.section,
        dueDate: due || '',
        dueTime: '',
        // Its own kind, so a to-do never has to pretend to be an assignment.
        type: 'To-do',
        priority: 'Normal',
        status: 'Not Started',
        estimateHours: null,
        points: null,
        earnedPoints: null,
        categoryId: null,
      });
      setText('');
      setDue('');
      setSaved(`Added to ${chosen.name}.`);
      onAdded?.();
    } catch (failure) {
      setProblem(`That wasn't saved. ${(failure as Error).message}`);
    }
  };

  return (
    <form className="quick-todo" onSubmit={add} data-testid="quick-todo">
      <label>
        What do you need to do?
        <input value={text} data-testid="quick-todo-text" onChange={(event) => { setText(event.target.value); setSaved(''); }} />
      </label>
      <div className="field-row">
        <label>
          Which list?
          <select
            value={chosen?.id ?? ''}
            data-testid="quick-todo-list"
            onChange={(event) => setListId(event.target.value)}
          >
            {lists.map((one) => <option key={one.id} value={one.id}>{one.name}</option>)}
          </select>
        </label>
        <label>
          When, if there is a date
          <input type="date" value={due} data-testid="quick-todo-due" onChange={(event) => setDue(event.target.value)} />
        </label>
      </div>
      {problem && <p className="error" role="alert">{problem}</p>}
      {saved && <p className="muted small" role="status" data-testid="quick-todo-saved">{saved}</p>}
      <div className="row-actions">
        <button className="button primary" type="submit">Add it</button>
        <Link className="text-button" to="/planner/new">Need priority, points or steps? Use the full form</Link>
      </div>
    </form>
  );
}

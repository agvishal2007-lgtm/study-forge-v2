import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { listCourses } from '../data/store';
import { listPlannerItems, savePlannerItem, setPlannerStatus } from '../data/planner';
import type { PlannerItem } from '../data/types';
import { belongsTo, chooseList, flip, listsFor } from '../data/listRules';
import { addTodoList, getTodoLists, removeTodoList } from '../data/todoLists';
import { isDone, uncheckedStatus } from '../data/plannerRules';
import { useDisplayPrefs } from '../data/displayPrefs';
import { useLive } from '../data/useLive';

const OPEN_KEY = 'study-forge-todo-open';
const LIST_KEY = 'study-forge-todo-list';
const CHANGED = 'study-forge-todo-changed';

const read = (key: string) => { try { return localStorage.getItem(key); } catch { return null; } };
const write = (key: string, value: string | null) => {
  try { if (value === null) localStorage.removeItem(key); else localStorage.setItem(key, value); } catch { /* a private window just forgets */ }
};

export const todoPanelOpen = () => read(OPEN_KEY) === 'yes';
export function setTodoPanelOpen(open: boolean) {
  write(OPEN_KEY, open ? 'yes' : null);
  window.dispatchEvent(new CustomEvent(CHANGED));
}
export function subscribeTodoPanel(listener: () => void) {
  window.addEventListener(CHANGED, listener);
  return () => window.removeEventListener(CHANGED, listener);
}

/**
 * The to-do list, floating over whatever the student is doing, so it can be seen and ticked off
 * without leaving the page they're working on. Lists are the classes they have work in, their own
 * sections, and Personal — views of the one set of tasks, so nothing is ever in two places.
 */
export function TodoPanel() {
  const [open, setOpen] = useState(todoPanelOpen());
  const [wanted, setWanted] = useState(read(LIST_KEY));
  const [adding, setAdding] = useState('');
  const [problem, setProblem] = useState('');
  const [naming, setNaming] = useState(false);
  const [newList, setNewList] = useState('');
  const { completed } = useDisplayPrefs();
  useEffect(() => subscribeTodoPanel(() => setOpen(todoPanelOpen())), []);

  const { data } = useLive(async () => ({
    items: await listPlannerItems(),
    courses: await listCourses(),
    named: await getTodoLists(),
  }));
  if (!open || !data) return null;

  const lists = listsFor(data.items, data.courses, data.named);
  const list = chooseList(lists, wanted);
  if (!list) return null;
  const show = completed === 'hidden' ? list.items.filter((item) => !isDone(item)) : list.items;

  const go = (id: string) => { setWanted(id); write(LIST_KEY, id); };

  /** A list of their own — College, Family, chores, whatever they need it for. */
  const makeList = async () => {
    const problemFound = await addTodoList(newList, data.courses.map((course) => course.name));
    if (problemFound) { setProblem(problemFound); return; }
    setProblem('');
    setNaming(false);
    const made = newList.replace(/\s+/g, ' ').trim().slice(0, 40);
    setNewList('');
    go(`section:${made}`);
  };

  /**
   * Forgetting a list, without losing anything that was in it. Whatever is still there is moved to
   * Personal first and the student is told, because a list that took its tasks with it when it went
   * would be the worst kind of surprise.
   */
  const dropList = async (which: typeof list) => {
    try {
      for (const item of which.items) await savePlannerItem({ ...item, section: '' });
      await removeTodoList(which.name);
      go('personal');
      setProblem(which.items.length > 0
        ? `${which.name} is gone. ${which.items.length === 1 ? 'Its task' : `Its ${which.items.length} tasks`} moved to Personal — nothing was deleted.`
        : '');
    } catch (failure) {
      setProblem(`That didn't work. ${(failure as Error).message}`);
    }
  };

  const add = async () => {
    const title = adding.trim();
    if (!title) return;
    const { courseId, section } = belongsTo(list);
    try {
      await savePlannerItem({
        id: crypto.randomUUID(), title, details: '', dueDate: '', dueTime: '',
        status: 'Not Started', priority: 'Normal', courseId, section, createdAt: Date.now(),
        // Its own kind, so a to-do is never filed as coursework.
        type: 'To-do', estimateHours: null, points: null, earnedPoints: null, categoryId: null,
      });
      setAdding('');
      setProblem('');
    } catch (failure) {
      setProblem(`That wasn't added. ${(failure as Error).message}`);
    }
  };

  return (
    <aside className="todo-panel" data-testid="todo-panel" aria-label="Your to-do list">
      <div className="todo-head">
        <button className="icon-button todo-flip" onClick={() => go(flip(lists, list.id, -1))} aria-label="Previous list" disabled={lists.length < 2}>‹</button>
        <h2 data-testid="todo-list-name">
          {list.name}
          {list.left > 0 && <span className="muted small"> · {list.left} to do</span>}
        </h2>
        <button className="icon-button todo-flip" onClick={() => go(flip(lists, list.id, 1))} aria-label="Next list" disabled={lists.length < 2}>›</button>
        {/* Only a list the student made can be removed: a class's list belongs to the class. */}
        {data.named.some((one) => one.toLowerCase() === list.name.toLowerCase()) && (
          <button
            className="icon-button"
            onClick={() => void dropList(list)}
            aria-label={`Remove the ${list.name} list`}
            title={`Remove the ${list.name} list`}
            data-testid="todo-drop-list"
          >
            🗑
          </button>
        )}
        <button className="icon-button" onClick={() => setTodoPanelOpen(false)} aria-label="Close your to-do list" data-testid="todo-close">×</button>
      </div>

      {/* Always shown, even with one list, because this is where a new list is made from. */}
      {(
        <div className="todo-tabs" role="tablist" aria-label="Your lists">
          {lists.map((one) => (
            <button
              key={one.id}
              role="tab"
              aria-selected={one.id === list.id}
              className={one.id === list.id ? 'todo-tab on' : 'todo-tab'}
              onClick={() => go(one.id)}
            >
              {one.name}
            </button>
          ))}
          <button className="todo-tab todo-new-list" onClick={() => { setNaming(true); setProblem(''); }} data-testid="todo-add-list">
            + New list
          </button>
        </div>
      )}

      {naming && (
        <form
          className="todo-name-list"
          data-testid="todo-name-list"
          onSubmit={(event) => { event.preventDefault(); void makeList(); }}
        >
          <label htmlFor="todo-list-name-field">What is this list for?</label>
          <input
            id="todo-list-name-field"
            value={newList}
            placeholder="College, Family, Chores…"
            data-testid="todo-list-input"
            autoFocus
            onChange={(event) => setNewList(event.target.value)}
          />
          <button className="button primary" type="submit">Make the list</button>
          <button className="button" type="button" onClick={() => { setNaming(false); setNewList(''); setProblem(''); }}>Cancel</button>
        </form>
      )}

      {problem && <p className="error" role="alert">{problem}</p>}

      {show.length === 0
        ? <p className="muted small" data-testid="todo-empty">Nothing in {list.name} yet.</p>
        : (
          <ul className="plain-list todo-items" data-testid="todo-items">
            {show.map((item) => <PanelTick key={item.id} item={item} struck={completed === 'struck'} />)}
          </ul>
        )}

      <form
        className="todo-add"
        onSubmit={(event) => { event.preventDefault(); void add(); }}
      >
        <label className="sr-only" htmlFor="todo-new">Add to {list.name}</label>
        <input id="todo-new" value={adding} placeholder={`Add to ${list.name}`} onChange={(event) => setAdding(event.target.value)} />
        <button className="button" type="submit" disabled={!adding.trim()}>Add</button>
      </form>
      <p className="muted small"><Link to="/planner" onClick={() => setTodoPanelOpen(false)}>Open the full Planner</Link></p>
    </aside>
  );
}

/**
 * One task in the panel.
 *
 * The tick moves the instant it is tapped and the save follows, which is the same rule the Planner
 * list follows. Saving reaches this device's database and then the student's other devices, and a
 * box that sprang back while that happened would look exactly like a tap that was missed. If the
 * save genuinely fails the box returns to what is really stored and says so, so nothing is quietly
 * lost.
 */
function PanelTick({ item, struck }: { item: PlannerItem; struck: boolean }) {
  const saved = isDone(item);
  const [pending, setPending] = useState<boolean | null>(null);
  const [failure, setFailure] = useState('');
  const done = pending ?? saved;
  useEffect(() => { if (pending !== null && pending === saved) setPending(null); }, [pending, saved]);

  return (
    <li className={done && struck ? 'todo-item struck' : 'todo-item'}>
      <label>
        <input
          type="checkbox"
          checked={done}
          aria-label={item.title}
          onChange={(event) => {
            const wanted = event.target.checked;
            setFailure('');
            setPending(wanted);
            setPlannerStatus(item.id, wanted ? 'Completed' : uncheckedStatus(item.status)).catch((error: Error) => {
              setPending(null);
              setFailure(`That wasn't saved, so it's back as it was. ${error.message}`);
            });
          }}
        />
        <span>{item.title}</span>
      </label>
      {failure && <span className="error small" role="alert">{failure}</span>}
    </li>
  );
}

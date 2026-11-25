import { getDb, notifyChanged } from './db';
import { listNameProblem, tidyListName } from './listRules';

/*
 * The to-do lists a student makes for themselves — College, Family, Chores, whatever they need.
 *
 * Only the names live here. The tasks themselves stay where they always were, as planner items
 * with a section, so a task is still in exactly one place and nothing has to be kept in step. What
 * this record adds is the ability to make a list *before* putting anything in it, which is the one
 * thing a view-only list could never do.
 *
 * Kept in the same synced place the rest of this work uses, so the lists follow the student between
 * devices with no new collection and no change to what governs access.
 */
const ID = 'todo-lists';

export async function getTodoLists(): Promise<string[]> {
  const record = (await (await getDb()).get('studyState', ID)) as { value?: unknown } | undefined;
  const saved = record?.value;
  if (!Array.isArray(saved)) return [];
  const names: string[] = [];
  for (const entry of saved) {
    const tidy = typeof entry === 'string' ? tidyListName(entry) : '';
    if (tidy && !names.some((one) => one.toLowerCase() === tidy.toLowerCase())) names.push(tidy);
  }
  return names;
}

async function save(names: string[]): Promise<void> {
  const db = await getDb();
  await db.put('studyState', { id: ID, value: names, updatedAt: Date.now() });
  notifyChanged();
}

/** Adds a list. Returns the reason it couldn't be added, or an empty string when it was. */
export async function addTodoList(name: string, courseNames: string[]): Promise<string> {
  const lists = await getTodoLists();
  const problem = listNameProblem(name, { lists, courses: courseNames });
  if (problem) return problem;
  await save([...lists, tidyListName(name)]);
  return '';
}

/**
 * Forgets a list's name. Nothing is deleted here and nothing is moved: the caller moves whatever is
 * still in the list to Personal first, because the tasks are its to move and a list that quietly
 * took its tasks with it would be the worst kind of surprise.
 */
export async function removeTodoList(name: string): Promise<void> {
  const lists = await getTodoLists();
  await save(lists.filter((one) => one.toLowerCase() !== tidyListName(name).toLowerCase()));
}

/*
 * There is deliberately no rename here yet. A list's name is also what each task in it is filed
 * under, so renaming the one without moving the other would leave the tasks behind in a list the
 * student can no longer see. It needs the tasks moved in the same breath, and that is worth doing
 * properly rather than half.
 */

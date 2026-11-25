import { deleteCourse, deleteMaterial, deleteTopic, listAllCourses, listTrash, setCourseStatus, setMaterialStatus, setTopicStatus } from './store';
import { deleteTrashEntry, listTrashEntries, restoreFromTrash, type TrashKind } from './trash';
import { getRetention } from './trashPolicy';
import { dueAtOnce } from './trashRules';

/*
 * One list of everything in Trash, wherever it came from, and one way to restore or delete each
 * thing. It lives here rather than in the Trash page because the automatic cleanup needs exactly
 * the same list: two lists would mean the sweep could delete something the page never showed, or
 * miss something it did.
 */
export type Kind = 'course' | 'topic' | 'file' | 'link' | TrashKind;

export const TRASH_KIND_LABEL: Record<Kind, string> = {
  course: 'Course', topic: 'Topic', file: 'File', link: 'Link', note: 'Note', deck: 'Flashcard deck',
  practiceSet: 'Practice set', lesson: 'Lesson', plannerItem: 'Planner item',
};

export interface Row {
  key: string;
  kind: Kind;
  name: string;
  from: string;
  deletedAt: number;
  restore: () => Promise<string | void>;
  remove: () => Promise<void>;
  /** What permanently deleting it means, in plain words. */
  warning: string;
}

export async function trashRows(): Promise<Row[]> {
  const [{ courses, topics, materials }, entries, allCourses] = await Promise.all([listTrash(), listTrashEntries(), listAllCourses()]);
  const courseName = (id: string | null | undefined) => allCourses.find((course) => course.id === id)?.name ?? '';
  const rows: Row[] = [
    ...courses.map((course): Row => ({
      key: `course-${course.id}`, kind: 'course', name: course.name, from: 'Courses', deletedAt: course.statusAt,
      restore: () => setCourseStatus(course.id, 'active'), remove: () => deleteCourse(course.id),
      warning: 'This can’t be undone, but nothing you made is lost. Its files stay in your Library, its notes stay in Notes, any lessons stay in Study, any assignments stay in Planner, any flashcards stay in Flashcards, any practice sets stay in Practice, and exam scores stay in Exam Hall.',
    })),
    ...topics.map((topic): Row => ({
      key: `topic-${topic.id}`, kind: 'topic', name: topic.name, from: courseName(topic.courseId) || 'A course', deletedAt: topic.statusAt,
      restore: () => setTopicStatus(topic.id, 'active'), remove: () => deleteTopic(topic.id),
      warning: 'This can’t be undone. Its files and notes stay in the course.',
    })),
    ...materials.map((material): Row => ({
      key: `file-${material.id}`, kind: material.kind === 'link' ? 'link' : 'file', name: material.name, from: courseName(material.courseId) || 'Library', deletedAt: material.statusAt,
      restore: () => setMaterialStatus(material.id, 'active'), remove: () => deleteMaterial(material.id),
      warning: material.kind === 'link' ? 'This can’t be undone.' : 'This deletes the file itself. It can’t be undone, and it isn’t in your backups unless you made one.',
    })),
    ...entries.map((entry): Row => ({
      key: entry.id, kind: entry.kind, name: entry.name, from: courseName(entry.courseId) || ({ note: 'Notes', deck: 'Flashcards', practiceSet: 'Practice', lesson: 'Study', plannerItem: 'Planner' } as const)[entry.kind], deletedAt: entry.deletedAt,
      restore: () => restoreFromTrash(entry.id), remove: () => deleteTrashEntry(entry.id),
      warning: entry.kind === 'deck' ? 'This deletes the deck, its cards and their review history. It can’t be undone.'
        : entry.kind === 'practiceSet' ? 'This deletes the set, its questions and your answers. It can’t be undone.'
          : entry.kind === 'lesson' ? 'This deletes the lesson, its steps and your progress. It can’t be undone.'
            : 'This can’t be undone.',
    })),
  ];
  return rows.sort((a, b) => b.deletedAt - a.deletedAt);
}


/*
 * Deletes whatever has passed its date.
 *
 * This runs when Study Forge is opened and not on a timetable: there is no server here, so nothing
 * can be deleted while the app is closed, and the wording everywhere says so rather than promising
 * a time it cannot keep. Two sweeps never run at once, so nothing is deleted twice, and each thing
 * is deleted the same way the student's own "Permanently delete" would do it.
 */
let sweeping: Promise<number> | null = null;

/**
 * Runs the sweep once the browser has nothing better to do.
 *
 * Emptying Trash is never urgent — nothing a student is waiting for depends on it — so it has no
 * business competing with the app opening. On a browser without idle callbacks a short wait does
 * the same job.
 */
export function sweepTrashWhenIdle(): void {
  const run = () => { void sweepTrash().catch(() => undefined); };
  if (typeof requestIdleCallback === 'function') requestIdleCallback(run, { timeout: 4000 });
  else setTimeout(run, 2000);
}

export function sweepTrash(now = Date.now()): Promise<number> {
  sweeping ??= (async () => {
    try {
      const policy = getRetention();
      if (policy === 'never') return 0;
      const due = dueAtOnce(await trashRows(), policy, now);
      let gone = 0;
      for (const row of due) {
        try {
          await row.remove();
          gone += 1;
        } catch {
          // One thing refusing to go is no reason to leave the rest; it is tried again next time.
        }
      }
      return gone;
    } finally {
      sweeping = null;
    }
  })();
  return sweeping;
}

import { getDb, notifyChanged } from './db';
import { courseKeyFor, planImport, type ImportPlan } from './classroomRules';
import { noteImportedCourses } from './importReview';
import { listPlannerItems, savePlannerItem } from './planner';
import { createCourse, listCourses } from './store';
import type { PlannerItem } from './types';

export * from './classroomRules';

/*
 * Putting a Classroom import into Study Forge.
 *
 * The rule that matters here: an import may add and it may correct what it added, but it must never
 * undo the student's own work. A piece of coursework the student has ticked off stays ticked off; a
 * priority they set stays set; notes they wrote stay. Only the facts that belong to Classroom — the
 * title, the due date, the kind of work and the link back — are refreshed. An import that could
 * mark finished homework as outstanding again would be worse than no import at all.
 */

const ID = 'classroom-connection';

export interface ClassroomConnection {
  /** The account it was connected with, so the student can see which one. */
  email: string;
  connectedAt: number;
  lastImportAt: number;
}

export async function getClassroomConnection(): Promise<ClassroomConnection | null> {
  const record = (await (await getDb()).get('studyState', ID)) as { value?: Partial<ClassroomConnection> } | undefined;
  const saved = record?.value;
  if (!saved || typeof saved.email !== 'string') return null;
  return {
    email: saved.email,
    connectedAt: typeof saved.connectedAt === 'number' ? saved.connectedAt : 0,
    lastImportAt: typeof saved.lastImportAt === 'number' ? saved.lastImportAt : 0,
  };
}

export async function saveClassroomConnection(connection: ClassroomConnection): Promise<void> {
  const db = await getDb();
  await db.put('studyState', { id: ID, value: connection, updatedAt: Date.now() });
  notifyChanged();
}

export async function clearClassroomConnection(): Promise<void> {
  await (await getDb()).delete('studyState', ID);
  notifyChanged();
}

export interface ClassroomReport {
  coursesAdded: number;
  workAdded: number;
  workUpdated: number;
  /** Work left out, with the reason, so nothing disappears without explanation. */
  skipped: { title: string; because: string }[];
  /** Classes whose work the school or teacher would not share. */
  refused: string[];
}

/** Works out what an import would do, against the courses already here. */
export async function planClassroomImport(
  courses: Parameters<typeof planImport>[0],
  work: Parameters<typeof planImport>[1],
  today: string,
  options: { includePast?: boolean } = {},
): Promise<ImportPlan> {
  return planImport(courses, work, await listCourses(), today, options);
}

/**
 * Carries out a plan.
 *
 * Course records are created with the Classroom id as their code, which is what later imports match
 * on — so a class the student renames keeps that name for good. New courses are noted for the
 * review step, the same one a calendar import uses, because a Classroom name can be a code too.
 */
export async function applyClassroomImport(plan: ImportPlan, refused: string[] = []): Promise<ClassroomReport> {
  const report: ClassroomReport = { coursesAdded: 0, workAdded: 0, workUpdated: 0, skipped: plan.skipped, refused };
  const byClassroom = new Map<string, string>(plan.existing.map((one) => [one.classroomId, one.courseId]));

  const made: string[] = [];
  for (const wanted of plan.newCourses) {
    const course = await createCourse(wanted.name, courseKeyFor(wanted.classroomId));
    byClassroom.set(wanted.classroomId, course.id);
    made.push(course.id);
    report.coursesAdded += 1;
  }
  if (made.length > 0) await noteImportedCourses(made);

  const existing = new Map((await listPlannerItems()).map((item) => [item.id, item]));
  for (const piece of plan.work) {
    const courseId = byClassroom.get(piece.classroomId) ?? null;
    const already = existing.get(piece.id);
    if (already) {
      // Only what belongs to Classroom is refreshed. Everything the student decided is left alone,
      // above all whether it is finished.
      const changed: PlannerItem = {
        ...already,
        title: piece.title,
        dueDate: piece.due ?? already.dueDate,
        type: (piece.type as PlannerItem['type']) ?? already.type,
        courseId: already.courseId ?? courseId,
      };
      const same = changed.title === already.title && changed.dueDate === already.dueDate
        && changed.type === already.type && changed.courseId === already.courseId;
      if (!same) {
        await savePlannerItem(changed);
        report.workUpdated += 1;
      }
      continue;
    }
    await savePlannerItem({
      id: piece.id,
      title: piece.title,
      details: piece.link ? `In Google Classroom: ${piece.link}` : '',
      courseId,
      section: '',
      dueDate: piece.due ?? '',
      dueTime: '',
      type: piece.type as PlannerItem['type'],
      priority: 'Normal',
      status: 'Not Started',
      estimateHours: null,
      points: null,
      earnedPoints: null,
      categoryId: null,
      createdAt: Date.now(),
    });
    report.workAdded += 1;
  }

  const connection = await getClassroomConnection();
  if (connection) await saveClassroomConnection({ ...connection, lastImportAt: Date.now() });
  return report;
}

/** What an import did, in plain words, with nothing rounded up and nothing hidden. */
export function describeReport(report: ClassroomReport): string {
  const count = (many: number, one: string, more: string) => `${many} ${many === 1 ? one : more}`;
  const parts: string[] = [];
  if (report.coursesAdded > 0) parts.push(count(report.coursesAdded, 'class added', 'classes added'));
  if (report.workAdded > 0) parts.push(count(report.workAdded, 'assignment added', 'assignments added'));
  if (report.workUpdated > 0) parts.push(count(report.workUpdated, 'assignment updated', 'assignments updated'));
  if (parts.length === 0) parts.push('Nothing new');
  let said = `${parts.join(', ')}.`;
  if (report.skipped.length > 0) said += ` ${count(report.skipped.length, 'thing was', 'things were')} left out.`;
  if (report.refused.length > 0) said += ` ${count(report.refused.length, 'class', 'classes')} wouldn't share its work: ${report.refused.join(', ')}.`;
  return said;
}

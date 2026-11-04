import { downloadZip } from 'client-zip';
import { readBlob, SaveCancelled } from './blobs';
import { getDb, notifyChanged } from './db';
import { noteLabel } from './notes';
import { listUnfinished } from './recordings';
import { findByHash, getStorageStatus, hashFile, storeMaterial } from './store';
import {
  OLD_YELLOW, PLANNER_PRIORITIES, PLANNER_STATUSES, PLANNER_TYPES, SPINE_COLORS, type PlannerItem,
  type AnswerRecord, type Checkpoint, type CheckpointProgress, type Course, type ExplanationRecord, type GuidedQuestion,
  type KeyPointRating, type Lesson, type Material, type MasteryStatus, type Note, type QuestionKind, type Reteach, type Topic,
} from './types';
import { isValidDate } from './plannerRules';
import { NotAZip, readZipEntries, type ZipEntry } from './zipReader';

/**
 * A backup is an ordinary zip file with folders a person can browse, plus a manifest that
 * lets Study Forge rebuild everything. Files are stored uncompressed and passed through
 * piece by piece, so a large backup doesn't have to fit in memory.
 */
const MANIFEST_PATH = 'study-forge-backup.json';
const FORMAT = 'study-forge-backup';
const VERSION = 3;
const LAST_BACKUP_KEY = 'lastBackupAt';

export interface BackupManifest {
  format: typeof FORMAT;
  version: number;
  createdAt: number;
  courses: Course[];
  topics: Topic[];
  notes: Note[];
  materials: (Material & { path: string })[];
  lessons: Lesson[];
  checkpoints: Checkpoint[];
  progress: CheckpointProgress[];
  plannerItems: PlannerItem[];
}

export class BackupError extends Error {}

export interface BackupSummary {
  courses: number;
  topics: number;
  notes: number;
  files: number;
  bytes: number;
  interrupted: number;
  lessons: number;
}

export async function getBackupSummary(): Promise<BackupSummary> {
  const db = await getDb();
  const [courses, topics, notes, materials, unfinished, lessons] = await Promise.all([
    db.count('courses'), db.count('topics'), db.count('notes'), db.getAll('materials'), listUnfinished(), db.count('lessons'),
  ]);
  return {
    courses,
    topics,
    notes,
    files: materials.length,
    bytes: materials.reduce((total, material) => total + material.size, 0),
    interrupted: unfinished.length,
    lessons,
  };
}

export async function getLastBackupAt(): Promise<number | null> {
  const value = await (await getDb()).get('meta', LAST_BACKUP_KEY);
  return typeof value === 'number' ? value : null;
}

/** Makes a name safe as a folder or file name on every computer. */
function safeName(name: string, fallback: string): string {
  const cleaned = name.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '-').replace(/^[.\s]+|[.\s]+$/g, '').slice(0, 120);
  return cleaned || fallback;
}

function uniquePaths() {
  const used = new Set<string>();
  return (folder: string, name: string) => {
    const dot = name.lastIndexOf('.');
    const [stem, extension] = dot > 0 ? [name.slice(0, dot), name.slice(dot)] : [name, ''];
    let candidate = `${folder}/${name}`;
    for (let copy = 2; used.has(candidate.toLowerCase()); copy++) candidate = `${folder}/${stem} (${copy})${extension}`;
    used.add(candidate.toLowerCase());
    return candidate;
  };
}

export interface BackupResult {
  files: number;
  notes: number;
  /** Files with a record that the browser no longer has, so they couldn't be included. */
  missing: string[];
}

const pickerAvailable = () => typeof (window as unknown as { showSaveFilePicker?: unknown }).showSaveFilePicker === 'function';

function countBytes(signal: AbortSignal, onProgress: (bytes: number) => void) {
  let total = 0;
  return new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      if (signal.aborted) {
        controller.error(new DOMException('Cancelled', 'AbortError'));
        return;
      }
      total += chunk.byteLength;
      onProgress(total);
      controller.enqueue(chunk);
    },
  });
}

async function checkBackup(file: Blob, expected: string[]): Promise<void> {
  const entries = await readZipEntries(file);
  const absent = expected.filter((path) => !entries.has(path));
  if (absent.length > 0) throw new BackupError(`The backup is missing ${absent.length} item(s). Create it again.`);
}

/** Creates the backup. Before anything happens, the student picks where it goes, if the browser allows it. */
export async function createBackup(signal: AbortSignal, onProgress: (bytes: number, total: number) => void): Promise<BackupResult> {
  const name = `Study Forge backup ${new Date().toISOString().slice(0, 10)}.zip`;
  type Picker = (options: unknown) => Promise<FileSystemFileHandle>;
  const handle = pickerAvailable()
    ? await (window as unknown as { showSaveFilePicker: Picker }).showSaveFilePicker({
      suggestedName: name,
      types: [{ description: 'Zip file', accept: { 'application/zip': ['.zip'] } }],
    })
    : null;

  const db = await getDb();
  const [courses, topics, notes, materials, lessons, checkpoints, progress, plannerItems] = await Promise.all([
    db.getAll('courses'), db.getAll('topics'), db.getAll('notes'), db.getAll('materials'),
    db.getAll('lessons'), db.getAll('checkpoints'), db.getAll('checkpointProgress'), db.getAll('plannerItems'),
  ]);
  const courseFolder = (courseId: string | null, topicId: string | null) => {
    const course = courses.find((candidate) => candidate.id === courseId);
    const topic = topics.find((candidate) => candidate.id === topicId);
    return [course ? safeName(course.name, 'Course') : 'No course', ...(topic ? [safeName(topic.name, 'Topic')] : [])].join('/');
  };

  const pathFor = uniquePaths();
  const missing: string[] = [];
  const included: { material: BackupManifest['materials'][number]; blob: Blob }[] = [];
  for (const material of materials) {
    const blob = await readBlob(material.id);
    if (!blob) {
      missing.push(material.name);
      continue;
    }
    const path = pathFor(`Files/${courseFolder(material.courseId, material.topicId)}`, safeName(material.name, 'File'));
    included.push({ material: { ...material, path }, blob });
  }

  const manifest: BackupManifest = {
    format: FORMAT,
    version: VERSION,
    createdAt: Date.now(),
    courses,
    topics,
    notes,
    materials: included.map(({ material }) => material),
    lessons,
    checkpoints,
    progress,
    plannerItems,
  };
  const noteFiles = notes.map((note) => ({
    name: pathFor(`Notes/${courseFolder(note.courseId, note.topicId)}`, `${safeName(noteLabel(note), 'Note')}.txt`),
    input: `${note.title ? `${note.title}\n\n` : ''}${note.body}\n`,
    lastModified: new Date(note.updatedAt),
  }));
  const fileEntries = included.map(({ material, blob }) => ({
    name: material.path,
    input: blob,
    lastModified: new Date(material.createdAt),
  }));
  const expected = [MANIFEST_PATH, ...included.map(({ material }) => material.path), ...noteFiles.map((note) => note.name)];

  const total = included.reduce((sum, { material }) => sum + material.size, 0);
  const zip = downloadZip([
    { name: MANIFEST_PATH, input: JSON.stringify(manifest), lastModified: new Date(manifest.createdAt) },
    ...noteFiles,
    ...fileEntries,
  ]);
  if (!zip.body) throw new BackupError("This browser can't create backup files.");
  const counted = zip.body.pipeThrough(countBytes(signal, (bytes) => onProgress(bytes, total)));

  if (handle) {
    const writable = await handle.createWritable();
    // If this fails or is cancelled, the browser discards the partly written file.
    await counted.pipeTo(writable, { signal });
    await checkBackup(await handle.getFile(), expected);
  } else {
    const blob = await new Response(counted, { headers: { 'Content-Type': 'application/zip' } }).blob();
    await checkBackup(blob, expected);
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = name;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }

  await db.put('meta', manifest.createdAt, LAST_BACKUP_KEY);
  notifyChanged();
  return { files: included.length, notes: notes.length, missing };
}

// A backup file can come from anywhere, so nothing in it is trusted until it's been checked.
const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const isText = (value: unknown): value is string => typeof value === 'string';
const isTime = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0;
const isOptionalId = (value: unknown): value is string | null => value === null || typeof value === 'string';

function cleanCourse(raw: unknown): Course | null {
  if (!isObject(raw) || !isText(raw.id) || !raw.id || !isText(raw.name) || !isTime(raw.createdAt)) return null;
  const color = isText(raw.color) && /^#[0-9a-f]{6}$/i.test(raw.color) && raw.color !== OLD_YELLOW ? raw.color : SPINE_COLORS[0];
  return { id: raw.id, name: raw.name, code: isText(raw.code) ? raw.code : '', color, createdAt: raw.createdAt };
}

function cleanTopic(raw: unknown): Topic | null {
  if (!isObject(raw) || !isText(raw.id) || !raw.id || !isText(raw.courseId) || !isText(raw.name) || !isTime(raw.createdAt)) return null;
  return { id: raw.id, courseId: raw.courseId, name: raw.name, createdAt: raw.createdAt };
}

function cleanNote(raw: unknown): Note | null {
  if (!isObject(raw) || !isText(raw.id) || !raw.id || !isText(raw.title) || !isText(raw.body)) return null;
  if (!isOptionalId(raw.courseId) || !isOptionalId(raw.topicId) || !isOptionalId(raw.materialId)) return null;
  if (!isTime(raw.createdAt) || !isTime(raw.updatedAt)) return null;
  return { id: raw.id, title: raw.title, body: raw.body, courseId: raw.courseId, topicId: raw.topicId, materialId: raw.materialId, createdAt: raw.createdAt, updatedAt: raw.updatedAt };
}

function cleanMaterial(raw: unknown): BackupManifest['materials'][number] | null {
  if (!isObject(raw) || !isText(raw.id) || !raw.id || !isText(raw.name) || !isText(raw.path) || !isText(raw.mimeType)) return null;
  if (!isText(raw.hash) || !/^[0-9a-f]{64}$/.test(raw.hash) || !isTime(raw.size) || !isTime(raw.createdAt)) return null;
  if (!isOptionalId(raw.courseId) || !isOptionalId(raw.topicId)) return null;
  return { id: raw.id, name: raw.name, path: raw.path, mimeType: raw.mimeType, hash: raw.hash, size: raw.size, courseId: raw.courseId, topicId: raw.topicId, createdAt: raw.createdAt };
}

const isTextList = (value: unknown): value is string[] => Array.isArray(value) && value.every(isText);
const KINDS: QuestionKind[] = ['multiple', 'short', 'recall', 'worked', 'application'];
const STATUSES: MasteryStatus[] = ['not-started', 'learning', 'practicing', 'needs-review', 'mastered'];
const RATINGS: KeyPointRating[] = ['included', 'partly', 'missed'];

function cleanLesson(raw: unknown): Lesson | null {
  if (!isObject(raw) || !isText(raw.id) || !raw.id || !isText(raw.title) || !isOptionalId(raw.courseId) || !isTime(raw.createdAt)) return null;
  return { id: raw.id, title: raw.title, courseId: raw.courseId, label: isText(raw.label) ? raw.label : 'Lesson', order: isTime(raw.order) ? raw.order : raw.createdAt, createdAt: raw.createdAt };
}

function cleanQuestion(raw: unknown): GuidedQuestion | null {
  if (!isObject(raw) || !isText(raw.id) || !raw.id || !isText(raw.prompt) || !KINDS.includes(raw.kind as QuestionKind)) return null;
  const options = isTextList(raw.options) ? raw.options : [];
  const correct = typeof raw.correctOption === 'number' && raw.correctOption >= 0 && raw.correctOption < options.length ? raw.correctOption : null;
  return {
    id: raw.id, kind: raw.kind as QuestionKind, prompt: raw.prompt, options, correctOption: correct,
    accepted: isTextList(raw.accepted) ? raw.accepted : [],
    modelAnswer: isText(raw.modelAnswer) ? raw.modelAnswer : '',
    explanation: isText(raw.explanation) ? raw.explanation : '',
    idea: isText(raw.idea) ? raw.idea : '',
  };
}

function cleanCheckpoint(raw: unknown): Checkpoint | null {
  if (!isObject(raw) || !isText(raw.id) || !raw.id || !isText(raw.lessonId) || !isText(raw.title) || !isTime(raw.createdAt) || !isObject(raw.teaching)) return null;
  const t = raw.teaching;
  const text = (value: unknown) => (isText(value) ? value : '');
  const questions = Array.isArray(raw.questions) ? raw.questions.map(cleanQuestion) : [null];
  if (questions.some((question) => !question)) return null;
  const reteach: Reteach[] = Array.isArray(raw.reteach)
    ? raw.reteach.filter(isObject).map((item) => ({ idea: text(item.idea), explanation: text(item.explanation), example: text(item.example) }))
    : [];
  return {
    id: raw.id, lessonId: raw.lessonId, title: raw.title, order: isTime(raw.order) ? raw.order : raw.createdAt, createdAt: raw.createdAt,
    teaching: {
      intro: text(t.intro), meaning: text(t.meaning), why: text(t.why), example: text(t.example), keyIdea: text(t.keyIdea),
      parts: isTextList(t.parts) ? t.parts : [], walkthrough: isTextList(t.walkthrough) ? t.walkthrough : [],
    },
    questions: questions as GuidedQuestion[],
    explainPrompt: text(raw.explainPrompt),
    keyPoints: isTextList(raw.keyPoints) ? raw.keyPoints : [],
    reteach,
    sourceNote: text(raw.sourceNote),
    materialId: isText(raw.materialId) ? raw.materialId : null,
  };
}

/** Progress returns to the start of its stage, since a saved position can't be trusted from outside. */
function cleanProgress(raw: unknown): CheckpointProgress | null {
  if (!isObject(raw) || !isText(raw.checkpointId) || !raw.checkpointId || !STATUSES.includes(raw.status as MasteryStatus)) return null;
  const answers: AnswerRecord[] = Array.isArray(raw.answers) ? raw.answers.filter(isObject).flatMap((a) => (
    isText(a.attemptId) && isText(a.questionId) && isText(a.answer) && typeof a.correct === 'boolean' && isTime(a.at)
      ? [{ attemptId: a.attemptId, questionId: a.questionId, answer: a.answer, correct: a.correct, method: a.method === 'self-checked' ? 'self-checked' as const : 'automatic' as const, at: a.at }]
      : []
  )) : [];
  const explanations: ExplanationRecord[] = Array.isArray(raw.explanations) ? raw.explanations.filter(isObject).flatMap((e) => (
    isText(e.text) && typeof e.passed === 'boolean' && isTime(e.at) && Array.isArray(e.ratings) && e.ratings.every((r) => RATINGS.includes(r as KeyPointRating))
      ? [{ text: e.text, ratings: e.ratings as KeyPointRating[], passed: e.passed, method: 'self-checked' as const, at: e.at }]
      : []
  )) : [];
  const misses: Record<string, number> = {};
  if (isObject(raw.misses)) for (const [key, value] of Object.entries(raw.misses)) if (isTime(value)) misses[key] = value;
  const status = raw.status as MasteryStatus;
  return {
    checkpointId: raw.checkpointId,
    // Mastery is recalculated by continuing to study, except for a record already marked mastered.
    status,
    teachingFinished: raw.teachingFinished === true,
    teachingSkipped: raw.teachingSkipped === true,
    stage: status === 'mastered' ? { kind: 'mastered' } : { kind: 'teach', step: 0 },
    answers,
    misses,
    reteachCount: isTime(raw.reteachCount) ? raw.reteachCount : 0,
    explanations,
    draft: '',
    lastStudiedAt: isTime(raw.lastStudiedAt) ? raw.lastStudiedAt : 0,
    masteredAt: isTime(raw.masteredAt) ? raw.masteredAt : null,
  };
}

function cleanPlannerItem(raw: unknown): PlannerItem | null {
  if (!isObject(raw) || !isText(raw.id) || !raw.id || !isText(raw.title) || !isOptionalId(raw.courseId) || !isTime(raw.createdAt)) return null;
  const pick = <T extends string>(list: readonly T[], value: unknown, fallback: T): T => (list.includes(value as T) ? value as T : fallback);
  return {
    id: raw.id,
    title: raw.title,
    courseId: raw.courseId,
    type: pick(PLANNER_TYPES, raw.type, 'Assignment'),
    dueDate: isText(raw.dueDate) && isValidDate(raw.dueDate) ? raw.dueDate : '',
    dueTime: isText(raw.dueTime) && /^\d{2}:\d{2}$/.test(raw.dueTime) ? raw.dueTime : '',
    status: pick(PLANNER_STATUSES, raw.status, 'Not Started'),
    priority: pick(PLANNER_PRIORITIES, raw.priority, 'Normal'),
    estimateHours: typeof raw.estimateHours === 'number' && Number.isFinite(raw.estimateHours) && raw.estimateHours > 0 ? raw.estimateHours : null,
    details: isText(raw.details) ? raw.details : '',
    createdAt: raw.createdAt,
    updatedAt: isTime(raw.updatedAt) ? raw.updatedAt : raw.createdAt,
  };
}

function cleanList<T>(raw: unknown, clean: (item: unknown) => T | null): T[] {
  if (!Array.isArray(raw)) throw new BackupError('This backup is damaged, so it can\'t be restored.');
  return raw.map(clean).map((item) => {
    if (!item) throw new BackupError('This backup is damaged, so it can\'t be restored.');
    return item;
  });
}

export interface OpenedBackup {
  manifest: BackupManifest;
  entries: Map<string, ZipEntry>;
  /** Space needed for files this device doesn't already have. */
  neededBytes: number;
  newFiles: number;
  freeBytes: number | null;
}

/** Reads a chosen backup file and describes it. Nothing is changed yet. */
export async function openBackup(file: File): Promise<OpenedBackup> {
  let entries: Map<string, ZipEntry>;
  try {
    entries = await readZipEntries(file);
  } catch (error) {
    if (error instanceof NotAZip) throw new BackupError("This isn't a Study Forge backup. Choose the .zip file you created in Settings.");
    throw error;
  }
  const entry = entries.get(MANIFEST_PATH);
  if (!entry) throw new BackupError("This isn't a Study Forge backup. Choose the .zip file you created in Settings.");
  if (entry.method !== 0) throw new BackupError('Another program changed this backup, so it can\'t be restored. Use the original .zip file.');

  let raw: unknown;
  try {
    raw = JSON.parse(await (await entry.blob()).text());
  } catch {
    throw new BackupError('This backup is damaged, so it can\'t be restored.');
  }
  if (!isObject(raw) || raw.format !== FORMAT) throw new BackupError("This isn't a Study Forge backup. Choose the .zip file you created in Settings.");
  if (typeof raw.version !== 'number' || raw.version > VERSION) throw new BackupError('This backup was made by a newer version of Study Forge. Reload the site, then try again.');
  if (!isTime(raw.createdAt)) throw new BackupError('This backup is damaged, so it can\'t be restored.');

  const manifest: BackupManifest = {
    format: FORMAT,
    version: raw.version,
    createdAt: raw.createdAt,
    courses: cleanList(raw.courses, cleanCourse),
    topics: cleanList(raw.topics, cleanTopic),
    notes: cleanList(raw.notes, cleanNote),
    materials: cleanList(raw.materials, cleanMaterial),
    // Backups made before Guided Study don't have these.
    lessons: raw.lessons === undefined ? [] : cleanList(raw.lessons, cleanLesson),
    checkpoints: raw.checkpoints === undefined ? [] : cleanList(raw.checkpoints, cleanCheckpoint),
    progress: raw.progress === undefined ? [] : cleanList(raw.progress, cleanProgress),
    plannerItems: raw.plannerItems === undefined ? [] : cleanList(raw.plannerItems, cleanPlannerItem),
  };

  let neededBytes = 0;
  let newFiles = 0;
  for (const material of manifest.materials) {
    if (!(await findByHash(material.hash))) {
      neededBytes += material.size;
      newFiles += 1;
    }
  }
  const { usage, quota } = await getStorageStatus();
  return { manifest, entries, neededBytes, newFiles, freeBytes: usage !== null && quota !== null ? quota - usage : null };
}

export interface RestoreReport {
  coursesAdded: number;
  topicsAdded: number;
  filesAdded: number;
  filesAlreadyHere: number;
  notesAdded: number;
  notesAlreadyHere: number;
  /** Notes that differ from this device's version, so they came back as separate copies. */
  notesCopied: number;
  damaged: string[];
  stoppedEarly: string;
  lessonsAdded: number;
  plannerAdded: number;
}

/**
 * Adds what's missing and never replaces or deletes anything already on this device.
 * Running it twice is safe, so a restore that stops partway can simply be run again.
 */
export async function restoreBackup(
  { manifest, entries }: OpenedBackup,
  signal: AbortSignal,
  onProgress: (done: number, total: number) => void,
): Promise<RestoreReport> {
  const report: RestoreReport = {
    coursesAdded: 0, topicsAdded: 0, filesAdded: 0, filesAlreadyHere: 0,
    notesAdded: 0, notesAlreadyHere: 0, notesCopied: 0, damaged: [], stoppedEarly: '', lessonsAdded: 0, plannerAdded: 0,
  };
  const db = await getDb();

  const tx = db.transaction(['courses', 'topics'], 'readwrite');
  for (const course of manifest.courses) {
    if (!(await tx.objectStore('courses').getKey(course.id))) {
      await tx.objectStore('courses').put(course);
      report.coursesAdded += 1;
    }
  }
  const knownCourses = new Set(await tx.objectStore('courses').getAllKeys());
  for (const topic of manifest.topics) {
    if (knownCourses.has(topic.courseId) && !(await tx.objectStore('topics').getKey(topic.id))) {
      await tx.objectStore('topics').put(topic);
      report.topicsAdded += 1;
    }
  }
  const knownTopics = new Set(await tx.objectStore('topics').getAllKeys());
  await tx.done;
  notifyChanged();

  const courseOrNull = (id: string | null) => (id && knownCourses.has(id) ? id : null);
  const topicOrNull = (id: string | null, courseId: string | null) => (courseId && id && knownTopics.has(id) ? id : null);

  // A file's new id can differ from the backup's, so notes follow it through this map.
  const fileIds = new Map<string, string>();
  const total = manifest.materials.reduce((sum, material) => sum + material.size, 0);
  let done = 0;
  for (const material of manifest.materials) {
    if (signal.aborted) throw new DOMException('Cancelled', 'AbortError');
    const finished = done + material.size;
    const existing = await findByHash(material.hash);
    if (existing) {
      fileIds.set(material.id, existing.id);
      report.filesAlreadyHere += 1;
      done = finished;
      onProgress(done, total);
      continue;
    }
    try {
      const entry = entries.get(material.path);
      if (!entry || entry.method !== 0) throw new BackupError('missing');
      const blob = await entry.blob();
      // Reading it through once proves it's exactly the file that was backed up.
      const hash = await hashFile(blob, signal, () => undefined);
      if (hash !== material.hash || blob.size !== material.size) throw new BackupError('changed');
      const courseId = courseOrNull(material.courseId);
      const id = (await db.getKey('materials', material.id)) ? crypto.randomUUID() : material.id;
      const saved = await storeMaterial(
        new File([blob], material.name, { type: material.mimeType }),
        hash,
        { courseId, topicId: topicOrNull(material.topicId, courseId) },
        signal,
        (bytes) => onProgress(done + bytes, total),
        { id, createdAt: material.createdAt },
      );
      fileIds.set(material.id, saved.id);
      report.filesAdded += 1;
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') throw error;
      if (error instanceof DOMException && error.name === 'QuotaExceededError') {
        report.stoppedEarly = 'This device ran out of space. Free up some space and restore again. Files already restored stay, and nothing is duplicated.';
        break;
      }
      if (error instanceof SaveCancelled) throw new DOMException('Cancelled', 'AbortError');
      report.damaged.push(material.name);
    }
    done = finished;
    onProgress(done, total);
  }

  for (const note of manifest.notes) {
    const current = await db.get('notes', note.id);
    if (current && current.title === note.title && current.body === note.body) {
      report.notesAlreadyHere += 1;
      continue;
    }
    const courseId = courseOrNull(note.courseId);
    const restored: Note = {
      ...note,
      courseId,
      topicId: topicOrNull(note.topicId, courseId),
      materialId: note.materialId ? fileIds.get(note.materialId) ?? null : null,
    };
    if (current) {
      // The copy's id is fixed for this version, so restoring again doesn't pile up more copies.
      const copyId = `${note.id}-backup-${note.updatedAt}`;
      if (await db.getKey('notes', copyId)) {
        report.notesAlreadyHere += 1;
      } else {
        await db.put('notes', { ...restored, id: copyId, title: `${noteLabel(note)} (from backup)` });
        report.notesCopied += 1;
      }
    } else {
      await db.put('notes', restored);
      report.notesAdded += 1;
    }
  }

  // Lessons, like everything else, are only added. Progress only comes back with a checkpoint that's new here.
  const added = new Set<string>();
  for (const lesson of manifest.lessons) {
    if (!(await db.getKey('lessons', lesson.id))) {
      await db.put('lessons', { ...lesson, courseId: courseOrNull(lesson.courseId) });
      report.lessonsAdded += 1;
    }
  }
  for (const checkpoint of manifest.checkpoints) {
    if ((await db.getKey('lessons', checkpoint.lessonId)) && !(await db.getKey('checkpoints', checkpoint.id))) {
      await db.put('checkpoints', { ...checkpoint, materialId: checkpoint.materialId ? fileIds.get(checkpoint.materialId) ?? null : null });
      added.add(checkpoint.id);
    }
  }
  for (const progress of manifest.progress) {
    if (added.has(progress.checkpointId) && !(await db.getKey('checkpointProgress', progress.checkpointId))) {
      await db.put('checkpointProgress', progress);
    }
  }
  for (const item of manifest.plannerItems) {
    if (!(await db.getKey('plannerItems', item.id))) {
      await db.put('plannerItems', { ...item, courseId: courseOrNull(item.courseId) });
      report.plannerAdded += 1;
    }
  }
  notifyChanged();
  return report;
}

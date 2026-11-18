
/*
 * Which kind of school the student is in. It changes the words Study Forge uses, the classes it
 * offers to start with, how grades read, and which tools show.
 *
 * Nothing changes for anyone who never chooses: an unset level is College, which is how Study
 * Forge has always worked. Elementary and Middle school students are mostly under 13, so those
 * levels work on this device only: no account, no sync, and no Google or Dropbox connections,
 * since each of those signs in with an outside account. Study Forge never asks anyone's age.
 */
export type SchoolLevel = 'college' | 'high' | 'middle' | 'elementary';
export type TermKind = 'semester' | 'trimester' | 'quarter' | 'year';

export const SCHOOL_LEVELS: SchoolLevel[] = ['college', 'high', 'middle', 'elementary'];
export const TERM_KINDS: TermKind[] = ['semester', 'trimester', 'quarter', 'year'];

export const LEVEL_LABEL: Record<SchoolLevel, string> = {
  college: 'College',
  high: 'High school',
  middle: 'Middle school',
  elementary: 'Elementary school',
};
export const LEVEL_GRADES: Record<SchoolLevel, string> = {
  college: 'University or college',
  high: 'Grades 9 to 12',
  middle: 'Grades 6 to 8',
  elementary: 'Grades 1 to 5',
};
export const TERM_KIND_LABEL: Record<TermKind, string> = {
  semester: 'Semesters',
  trimester: 'Trimesters',
  quarter: 'Quarters or marking periods',
  year: 'One whole school year',
};

/** How most schools at each level split the year. The student can always pick another. */
export const DEFAULT_TERM_KIND: Record<SchoolLevel, TermKind> = {
  college: 'semester',
  high: 'semester',
  middle: 'year',
  elementary: 'year',
};

/**
 * What to say about grades at each level. Study Forge never invents a weight or a scale, so each
 * of these points at the rules the student's own school actually uses.
 */
export const LEVEL_GRADE_HELP: Record<SchoolLevel, string> = {
  college: 'Copy your grading categories from the syllabus — "Exams, 40%" — and Study Forge works out where you stand. It never guesses them.',
  high: 'Use the categories your teacher gives you. If your school grades on standards rather than percentages, keep track of the work in Planner instead.',
  middle: 'Use the grading your teacher gives you. Some schools use letters, some percentages, and some progress levels. Study Forge never guesses.',
  elementary: 'Your teacher may use progress levels instead of percentages. Keep track of what you finish in Planner, and only add percentages if your school really gives them.',
};

export interface SchoolWords {
  /** "course" or "class" */
  course: string;
  courses: string;
  Course: string;
  Courses: string;
  /** "semester", "trimester", "quarter" or "school year" */
  term: string;
  Term: string;
  /** "professor" or "teacher" */
  teacher: string;
}

const TERM_WORD: Record<TermKind, string> = { semester: 'semester', trimester: 'trimester', quarter: 'quarter', year: 'school year' };
const capital = (word: string) => word.charAt(0).toUpperCase() + word.slice(1);

export function wordsFor(level: SchoolLevel, termKind: TermKind): SchoolWords {
  const college = level === 'college';
  const course = college ? 'course' : 'class';
  const courses = college ? 'courses' : 'classes';
  return {
    course, courses, Course: capital(course), Courses: capital(courses),
    term: TERM_WORD[termKind], Term: capital(TERM_WORD[termKind]),
    teacher: college ? 'professor' : 'teacher',
  };
}

/** Elementary and Middle school work on this device only: no account, no sync, no outside sign-ins. */
export const allowsAccounts = (level: SchoolLevel) => level === 'college' || level === 'high';
/** The youngest students get a simpler app: no timed mock exams, cram sessions or live transcripts. */
export const showsExamTools = (level: SchoolLevel) => level !== 'elementary';
export const showsLiveTranscript = (level: SchoolLevel) => level !== 'elementary';
/** Letter grades and a GPA estimate are a high school and college idea. */
export const showsGpa = (level: SchoolLevel) => level === 'college' || level === 'high';
/** Saved course templates are more than younger students need. */
export const showsTemplates = (level: SchoolLevel) => level !== 'elementary';

/** A name for a term, worked out from today's date, that the student can change. */
export function suggestTermName(kind: TermKind, today = new Date()): string {
  const year = today.getFullYear();
  const month = today.getMonth(); // 0 = January
  // A school year runs from late summer, so January to July belong to the year that started before.
  const startYear = month >= 7 ? year : year - 1;
  const schoolYear = `${startYear}–${String(startYear + 1).slice(-2)}`;
  if (kind === 'year') return `${schoolYear} school year`;
  if (kind === 'semester') return month >= 7 ? `Fall ${year}` : month >= 5 ? `Summer ${year}` : `Spring ${year}`;
  if (kind === 'trimester') {
    const which = month >= 7 && month <= 10 ? 1 : month === 11 || month <= 2 ? 2 : 3;
    return `Trimester ${which}, ${schoolYear}`;
  }
  const quarter = month >= 7 && month <= 9 ? 1 : month >= 10 || month === 0 ? 2 : month <= 3 ? 3 : 4;
  return `Quarter ${quarter}, ${schoolYear}`;
}

/** Ready-made classes to tick, so nobody has to type the usual ones. College is left to the student. */
export const STARTER_CLASSES: Record<SchoolLevel, string[]> = {
  college: ['Writing', 'Mathematics', 'Biology', 'Economics', 'History', 'Psychology'],
  high: ['English', 'Algebra', 'Geometry', 'Biology', 'Chemistry', 'U.S. History', 'World History', 'Spanish', 'Health', 'Physical Education', 'Art'],
  middle: ['Language Arts', 'Math', 'Science', 'Social Studies', 'Reading', 'World Language', 'Health', 'Physical Education', 'Art', 'Music'],
  elementary: ['Reading', 'Writing', 'Math', 'Science', 'Social Studies', 'Spelling', 'Art', 'Music'],
};

/* ---- Grades by level ---- */

const LETTERS: [number, string, number][] = [
  [93, 'A', 4], [90, 'A-', 3.7], [87, 'B+', 3.3], [83, 'B', 3], [80, 'B-', 2.7], [77, 'C+', 2.3],
  [73, 'C', 2], [70, 'C-', 1.7], [67, 'D+', 1.3], [63, 'D', 1], [60, 'D-', 0.7], [0, 'F', 0],
];
export function letterFor(percent: number): { letter: string; points: number } {
  const row = LETTERS.find(([floor]) => percent >= floor) ?? LETTERS[LETTERS.length - 1];
  return { letter: row[1], points: row[2] };
}
export function plainMarkFor(percent: number): string {
  if (percent >= 90) return 'Doing great';
  if (percent >= 80) return 'Doing well';
  if (percent >= 70) return 'Getting there';
  return 'Needs some help';
}
/** How a grade reads at this level, e.g. "91.2% (A-)" or "Doing great (91%)". */
export function gradeWords(level: SchoolLevel, percent: number): string {
  if (level === 'elementary') return `${plainMarkFor(percent)} (${Math.round(percent)}%)`;
  return `${percent}% (${letterFor(percent).letter})`;
}
/**
 * A rough unweighted 4.0 GPA from the grades Study Forge can already see, counting each class once.
 * It is an estimate from the student's own figures, never an official number. Null until something
 * is graded.
 */
export function estimateGpa(percents: (number | null)[]): number | null {
  const graded = percents.filter((value): value is number => value !== null);
  if (!graded.length) return null;
  return Math.round((graded.reduce((sum, value) => sum + letterFor(value).points, 0) / graded.length) * 100) / 100;
}

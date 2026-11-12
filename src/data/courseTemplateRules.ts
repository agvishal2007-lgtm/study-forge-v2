/*
 * Course templates: a reusable shape for a course, made of topic structure and grade category
 * names, so a new class starts organized. A template never holds real deadlines or a professor's
 * requirements: built-in grade categories come without weights, for the student to fill in from
 * their own syllabus. Pure rules, so they can be tested directly.
 */

export interface TemplateTopic {
  /** A group heading such as "Unit 1" or "Labs". Empty means ungrouped. */
  heading: string;
  name: string;
}

export interface TemplateCategory {
  name: string;
  /** Share of the grade, or null when the student hasn't set one. Built-ins are always null. */
  weight: number | null;
}

export interface CourseTemplate {
  id: string;
  name: string;
  description: string;
  topics: TemplateTopic[];
  categories: TemplateCategory[];
  /** True for the starter templates that come with Study Forge; they can't be changed or deleted. */
  builtIn?: boolean;
  createdAt?: number;
}

const t = (heading: string, ...names: string[]): TemplateTopic[] => names.map((name) => ({ heading, name }));
const c = (...names: string[]): TemplateCategory[] => names.map((name) => ({ name, weight: null }));

/** Starter shapes for common kinds of class. Every name can be changed after the course is made. */
export const BUILT_IN_TEMPLATES: CourseTemplate[] = [
  {
    id: 'builtin-lecture',
    name: 'Lecture course',
    description: 'Units of lectures, with homework, quizzes and exams.',
    topics: [...t('Units', 'Unit 1', 'Unit 2', 'Unit 3', 'Unit 4'), ...t('Review', 'Midterm review', 'Final review')],
    categories: c('Homework', 'Quizzes', 'Midterm exam', 'Final exam', 'Participation'),
    builtIn: true,
  },
  {
    id: 'builtin-lab',
    name: 'Lab course',
    description: 'Lab sessions with reports, plus lectures and safety notes.',
    topics: [...t('Labs', 'Lab 1', 'Lab 2', 'Lab 3', 'Lab 4'), ...t('Course', 'Lecture notes', 'Safety and procedures')],
    categories: c('Lab reports', 'Pre-lab work', 'Lab practical', 'Exams'),
    builtIn: true,
  },
  {
    id: 'builtin-writing',
    name: 'Writing course',
    description: 'Essays from research to final draft, with readings.',
    topics: [...t('Essays', 'Essay 1', 'Essay 2', 'Essay 3'), ...t('Course', 'Readings', 'Research and sources', 'Writing guides')],
    categories: c('Essays', 'Drafts and peer review', 'Reading responses', 'Participation'),
    builtIn: true,
  },
  {
    id: 'builtin-math',
    name: 'Math course',
    description: 'Chapters of problems, with a place for formulas.',
    topics: [...t('Chapters', 'Chapter 1', 'Chapter 2', 'Chapter 3', 'Chapter 4'), ...t('Reference', 'Formulas and definitions', 'Practice problems')],
    categories: c('Homework', 'Quizzes', 'Exams', 'Final exam'),
    builtIn: true,
  },
  {
    id: 'builtin-independent',
    name: 'Independent study',
    description: 'Self-paced learning: goals, readings, notes and projects.',
    topics: t('', 'Goals and plan', 'Reading list', 'Notes and summaries', 'Projects'),
    categories: [],
    builtIn: true,
  },
];

/** The longest a template's name can be, and how many topics and categories it can hold. */
export const TEMPLATE_LIMITS = { name: 80, topics: 60, categories: 20 };

/**
 * A template made from a course the student already set up. Topics keep their order and headings.
 * Weights are kept only when the student asks, since next term's syllabus may differ.
 */
export function templateFromCourse(
  name: string,
  topics: { name: string; heading: string; position: number; status: string }[],
  categories: { name: string; weight: number; position: number }[],
  keepWeights: boolean,
  id: string,
  now: number,
): CourseTemplate {
  const activeTopics = topics.filter((topic) => topic.status === 'active').sort((a, b) => a.position - b.position);
  return {
    id,
    name: name.trim().slice(0, TEMPLATE_LIMITS.name) || 'My template',
    description: `${activeTopics.length} ${activeTopics.length === 1 ? 'topic' : 'topics'}, ${categories.length} grade ${categories.length === 1 ? 'category' : 'categories'}`,
    topics: activeTopics.slice(0, TEMPLATE_LIMITS.topics).map((topic) => ({ heading: topic.heading, name: topic.name })),
    categories: [...categories].sort((a, b) => a.position - b.position).slice(0, TEMPLATE_LIMITS.categories)
      .map((category) => ({ name: category.name, weight: keepWeights ? category.weight : null })),
    createdAt: now,
  };
}

/** What a template will add, in words, so nothing happens by surprise. */
export function describeTemplate(template: CourseTemplate): string {
  const topics = template.topics.length;
  const categories = template.categories.length;
  const parts = [`${topics} ${topics === 1 ? 'topic' : 'topics'}`];
  if (categories) parts.push(`${categories} grade ${categories === 1 ? 'category' : 'categories'}${template.categories.every((cat) => cat.weight === null) ? ' (weights left for you to set)' : ''}`);
  return parts.join(' and ');
}

/** Checks a template read back from storage or another device, keeping only well-formed parts. */
export function cleanTemplate(raw: unknown): CourseTemplate | null {
  if (!raw || typeof raw !== 'object') return null;
  const value = raw as Partial<CourseTemplate>;
  if (typeof value.id !== 'string' || typeof value.name !== 'string') return null;
  const topics = Array.isArray(value.topics) ? value.topics.filter((topic) => topic && typeof topic.name === 'string' && topic.name.trim()).map((topic) => ({ heading: typeof topic.heading === 'string' ? topic.heading : '', name: topic.name })) : [];
  const categories = Array.isArray(value.categories) ? value.categories.filter((cat) => cat && typeof cat.name === 'string' && cat.name.trim()).map((cat) => ({ name: cat.name, weight: typeof cat.weight === 'number' && cat.weight >= 0 ? cat.weight : null })) : [];
  return { id: value.id, name: value.name.slice(0, TEMPLATE_LIMITS.name), description: typeof value.description === 'string' ? value.description : '', topics: topics.slice(0, TEMPLATE_LIMITS.topics), categories: categories.slice(0, TEMPLATE_LIMITS.categories), createdAt: typeof value.createdAt === 'number' ? value.createdAt : 0 };
}

import { getDb, notifyChanged } from './db';
import { addGradeCategory, listGradeCategories } from './grades';
import { createTopic, listTopicsAnyStatus } from './store';
import { BUILT_IN_TEMPLATES, cleanTemplate, templateFromCourse, type CourseTemplate } from './courseTemplateRules.ts';

/*
 * The student's own course templates. They're kept as one synced setting, so they follow the
 * student to their other devices without a new kind of online record.
 */
const KEY = 'courseTemplates';

export async function listMyTemplates(): Promise<CourseTemplate[]> {
  const record = await (await getDb()).get('settings', KEY);
  const list = Array.isArray((record?.value as { templates?: unknown[] } | undefined)?.templates) ? (record!.value as { templates: unknown[] }).templates : [];
  return list.map(cleanTemplate).filter((item): item is CourseTemplate => item !== null).sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
}

export const listAllTemplates = async (): Promise<CourseTemplate[]> => [...BUILT_IN_TEMPLATES, ...(await listMyTemplates())];

async function saveMine(templates: CourseTemplate[]) {
  const db = await getDb();
  const before = await db.get('settings', KEY);
  await db.put('settings', { id: KEY, value: { templates: templates.map(({ builtIn: _builtIn, ...rest }) => rest) }, updatedAt: Math.max(Date.now(), (before?.updatedAt ?? 0) + 1) });
  notifyChanged();
}

/** Saves a course's topics and grade category names as a new template. The course is untouched. */
export async function saveCourseAsTemplate(courseId: string, name: string, keepWeights: boolean): Promise<CourseTemplate> {
  const [topics, categories, mine] = await Promise.all([listTopicsAnyStatus(courseId), listGradeCategories(courseId), listMyTemplates()]);
  const template = templateFromCourse(name, topics, categories, keepWeights, crypto.randomUUID(), Date.now());
  await saveMine([template, ...mine]);
  return template;
}

export async function renameTemplate(id: string, name: string): Promise<void> {
  const trimmed = name.trim();
  if (!trimmed) return;
  const mine = await listMyTemplates();
  await saveMine(mine.map((template) => (template.id === id ? { ...template, name: trimmed.slice(0, 80) } : template)));
}

export async function deleteTemplate(id: string): Promise<void> {
  const mine = await listMyTemplates();
  await saveMine(mine.filter((template) => template.id !== id));
}

/**
 * Adds a template's topics and grade categories to a course. Anything the course already has with
 * the same name is skipped, so applying twice never makes duplicates. Nothing is removed or changed.
 */
export async function applyTemplate(courseId: string, template: CourseTemplate): Promise<{ topics: number; categories: number }> {
  const [topics, categories] = await Promise.all([listTopicsAnyStatus(courseId), listGradeCategories(courseId)]);
  const haveTopic = new Set(topics.filter((topic) => topic.status === 'active').map((topic) => `${topic.heading.toLowerCase()}|${topic.name.toLowerCase()}`));
  const haveCategory = new Set(categories.map((category) => category.name.toLowerCase()));
  let addedTopics = 0;
  let addedCategories = 0;
  for (const topic of template.topics) {
    const key = `${topic.heading.toLowerCase()}|${topic.name.toLowerCase()}`;
    if (haveTopic.has(key)) continue;
    await createTopic(courseId, topic.name, topic.heading);
    haveTopic.add(key);
    addedTopics++;
  }
  for (const category of template.categories) {
    if (haveCategory.has(category.name.toLowerCase())) continue;
    await addGradeCategory(courseId, category.name, category.weight ?? 0);
    haveCategory.add(category.name.toLowerCase());
    addedCategories++;
  }
  return { topics: addedTopics, categories: addedCategories };
}

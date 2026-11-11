import type { GradeCategory, PlannerItem } from './types';

/**
 * Grade maths. Everything here works only from what the student entered: categories and weights
 * from their own syllabus, and marks they received. Nothing is estimated, and work that hasn't been
 * graded is never counted as a zero — a blank and a nought are very different things.
 */

export interface CategoryResult {
  category: GradeCategory;
  /** Marks received over marks available, across graded work only. Null when nothing is graded yet. */
  percent: number | null;
  earned: number;
  possible: number;
  gradedCount: number;
  ungradedCount: number;
}

export interface CourseGrade {
  categories: CategoryResult[];
  /** The grade so far, counting only categories with graded work. Null when nothing is graded. */
  percent: number | null;
  /** The share of the final grade the graded categories cover, as a percentage. */
  weightCounted: number;
  /** Weights as entered. They should add to 100; when they don't, the student is told. */
  weightTotal: number;
  /** Graded work that isn't in any category, so it counts towards nothing. */
  unsorted: number;
}

const isGraded = (item: PlannerItem) =>
  item.earnedPoints !== null && item.points !== null && item.points > 0;

/** Rounds to one decimal place without the floating-point noise. */
export const round1 = (value: number): number => Math.round(value * 10) / 10;

/**
 * Works out where a course stands. Only graded work counts, and the result is scaled to the
 * categories that actually have marks in them, so one graded quiz doesn't read as a 2% course grade.
 */
export function courseGrade(categories: GradeCategory[], items: PlannerItem[]): CourseGrade {
  const mine = [...categories].sort((a, b) => a.position - b.position || a.createdAt - b.createdAt);
  const results: CategoryResult[] = mine.map((category) => {
    const inCategory = items.filter((item) => item.categoryId === category.id);
    const graded = inCategory.filter(isGraded);
    const earned = graded.reduce((sum, item) => sum + (item.earnedPoints ?? 0), 0);
    const possible = graded.reduce((sum, item) => sum + (item.points ?? 0), 0);
    return {
      category,
      percent: possible > 0 ? round1((earned / possible) * 100) : null,
      earned,
      possible,
      gradedCount: graded.length,
      ungradedCount: inCategory.length - graded.length,
    };
  });

  const counted = results.filter((result) => result.percent !== null);
  const weightCounted = counted.reduce((sum, result) => sum + result.category.weight, 0);
  const percent = weightCounted > 0
    ? round1(counted.reduce((sum, result) => sum + (result.percent ?? 0) * result.category.weight, 0) / weightCounted)
    : null;

  return {
    categories: results,
    percent,
    weightCounted: round1(weightCounted),
    weightTotal: round1(mine.reduce((sum, category) => sum + category.weight, 0)),
    unsorted: items.filter((item) => isGraded(item) && !item.categoryId).length,
  };
}

/**
 * What a single piece of work is worth towards the final grade, as a percentage of it.
 * This is the honest meaning of grade impact: a 200-point final in a category worth 40% of the
 * course matters far more than a 200-point participation log in a category worth 5%.
 * Returns null when the course's categories or this item's share can't be known yet.
 */
export function gradeImpact(item: PlannerItem, categories: GradeCategory[], items: PlannerItem[]): number | null {
  if (!item.categoryId || item.points === null || item.points <= 0) return null;
  const category = categories.find((candidate) => candidate.id === item.categoryId);
  if (!category) return null;
  const sharedWith = items.filter((other) => other.categoryId === category.id && other.points !== null && other.points > 0);
  const total = sharedWith.reduce((sum, other) => sum + (other.points ?? 0), 0);
  if (total <= 0) return null;
  return round1((item.points / total) * category.weight);
}

/**
 * What the course grade would become if every ungraded piece of work scored a given percentage.
 * Clearly a projection, never presented as a real mark.
 */
export function projectGrade(categories: GradeCategory[], items: PlannerItem[], assumed: number): number | null {
  const pretend = items.map((item) => (
    isGraded(item) || item.points === null || item.points <= 0
      ? item
      : { ...item, earnedPoints: round1((item.points * assumed) / 100) }
  ));
  return courseGrade(categories, pretend).percent;
}

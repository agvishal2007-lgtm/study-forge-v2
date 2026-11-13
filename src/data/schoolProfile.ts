import { useSyncExternalStore } from 'react';
import { getActiveAccount } from './account';

/** School preferences are separate from age eligibility; grade level does not prove age. */
export type SchoolLevel = 'college' | 'high' | 'middle' | 'elementary';
export type AgeGroup = 'under13' | '13plus' | 'unanswered';
export interface SchoolProfile {
  level: SchoolLevel;
  age: AgeGroup;
  completed: boolean;
}
const storageKey = () => 'study-forge-school-profile:' + (getActiveAccount()?.uid ?? 'guest');
const defaults: SchoolProfile = { level: 'college', age: 'unanswered', completed: false };
const listeners = new Set<() => void>();
export const SCHOOL_LEVELS: { id: SchoolLevel; label: string; examples: string[]; gradeHelp: string }[] = [
  { id: 'college', label: 'College', examples: ['Writing', 'Mathematics', 'Biology', 'Economics', 'History'], gradeHelp: 'Use your syllabus to set category weights. Grades are not calculated until you enter real scores.' },
  { id: 'high', label: 'High school', examples: ['English', 'Algebra', 'Science', 'History', 'World Language'], gradeHelp: 'Your school may use percentages, letters or standards. Add categories only when you know your teacher’s rules.' },
  { id: 'middle', label: 'Middle school', examples: ['Language Arts', 'Math', 'Science', 'Social Studies', 'Reading'], gradeHelp: 'Your teacher may use letters, percentages or standards. Use the grading method your school provides.' },
  { id: 'elementary', label: 'Elementary school', examples: ['Reading', 'Writing', 'Math', 'Science', 'Social Studies'], gradeHelp: 'Focus on learning and completed work. Your teacher may use progress levels instead of percentages.' },
];
function load(): SchoolProfile {
  try {
    const item = JSON.parse(localStorage.getItem(storageKey()) ?? 'null');
    if (!item || !SCHOOL_LEVELS.some(level => level.id === item.level)) return defaults;
    return { level: item.level, age: ['under13', '13plus'].includes(item.age) ? item.age : 'unanswered', completed: item.completed === true };
  } catch { return defaults; }
}
let cached = typeof window === 'undefined' ? defaults : load();
export function getSchoolProfile(): SchoolProfile { return cached; }
export function saveSchoolProfile(next: SchoolProfile) {
  cached = { ...next };
  try { localStorage.setItem(storageKey(), JSON.stringify(cached)); } catch { /* session-only preference */ }
  listeners.forEach(listener => listener());
  window.dispatchEvent(new Event('study-forge-school-profile-changed'));
}
export function useSchoolProfile(): SchoolProfile {
  return useSyncExternalStore(callback => { listeners.add(callback); return () => { listeners.delete(callback); }; }, getSchoolProfile, () => defaults);
}
export const isChildMode = () => getSchoolProfile().age === 'under13';

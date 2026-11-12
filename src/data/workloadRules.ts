import { addDays, compareEvents, dayNumber } from './calendarRules.ts';
import { isDone } from './plannerRules.ts';
import type { CalendarEvent, PlannerItem } from './types';

/*
 * Today's Plan: the next seven days, what to start with, and an honest look back at the week.
 * Everything here is worked out only from saved records, so it can be tested directly.
 */

export interface WorkloadDay {
  date: string;
  /** Planner work due that day, in the student's own priority order. */
  deadlines: PlannerItem[];
  /** Classes, appointments, events and study blocks that day. A study block reserved for one of
   *  the deadlines above is listed with that deadline instead, so nothing is counted twice. */
  events: CalendarEvent[];
  /** Study blocks reserved for a deadline, by the deadline's id. */
  reserved: Map<string, CalendarEvent[]>;
  /** Hours the student estimated for that day's deadlines. Items with no estimate add nothing. */
  estimatedHours: number;
  /** How many deadlines that day have no estimate, so the hours aren't mistaken for the whole job. */
  unestimated: number;
  /** Minutes of study blocks planned that day, reserved ones included, each counted once. */
  plannedStudyMinutes: number;
}

const minutesBetween = (start: string, end: string) => {
  if (!start || !end) return 0;
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  return Math.max(0, eh * 60 + em - (sh * 60 + sm));
};

/**
 * Seven days from today. `ranked` is the open planner work already in the student's chosen order
 * (the same engine as the Planner), so each day keeps that order.
 */
export function weekWorkload(ranked: PlannerItem[], events: CalendarEvent[], today: string, days = 7): WorkloadDay[] {
  const result: WorkloadDay[] = [];
  const open = ranked.filter((item) => !isDone(item) && item.dueDate);
  const visible = events.filter((event) => !event.hidden && event.kind !== 'No classes');
  for (let offset = 0; offset < days; offset++) {
    const date = addDays(today, offset);
    const deadlines = open.filter((item) => item.dueDate === date);
    const dayEvents = visible.filter((event) => event.date === date).sort(compareEvents);
    const reserved = new Map<string, CalendarEvent[]>();
    const others: CalendarEvent[] = [];
    for (const event of dayEvents) {
      const forItem = event.plannerItemId ? open.find((item) => item.id === event.plannerItemId) : undefined;
      if (forItem && forItem.dueDate === date) reserved.set(forItem.id, [...(reserved.get(forItem.id) ?? []), event]);
      else others.push(event);
    }
    const plannedStudyMinutes = dayEvents
      .filter((event) => event.kind === 'Study block' && !event.completed)
      .reduce((sum, event) => sum + minutesBetween(event.startTime, event.endTime), 0);
    result.push({
      date,
      deadlines,
      events: others,
      reserved,
      estimatedHours: deadlines.reduce((sum, item) => sum + (item.estimateHours ?? 0), 0),
      unestimated: deadlines.filter((item) => item.estimateHours === null || item.estimateHours === undefined).length,
      plannedStudyMinutes,
    });
  }
  return result;
}

/**
 * The student's own study blocks that went by without being marked done. Only these can be moved:
 * classes, appointments, anything from Google or a school schedule, and every deadline stay put.
 */
export function missedStudyBlocks(events: CalendarEvent[], now: { date: string; time: string }, lookBackDays = 14): CalendarEvent[] {
  const earliest = dayNumber(now.date) - lookBackDays;
  return events
    .filter((event) => event.kind === 'Study block' && event.source === 'manual' && !event.completed && !event.hidden)
    .filter((event) => dayNumber(event.date) >= earliest)
    .filter((event) => event.date < now.date || (event.date === now.date && Boolean(event.endTime) && event.endTime <= now.time))
    .sort(compareEvents);
}

export const canReschedule = (event: CalendarEvent) => event.kind === 'Study block' && event.source === 'manual';

export interface StartChoice {
  to: string;
  label: string;
  /** Why this is the suggestion, in plain words. */
  reason: string;
}

export interface StartInputs {
  practice?: { url: string; position: number; total: number; endedEarly?: boolean } | null;
  review?: { url: string; left: number; savedAt?: number } | null;
  reviewResumeMs: number;
  nowMs: number;
  cardsDue: number;
  /** The top open deadline in the student's chosen order, and whether it's an exam or quiz. */
  topWork?: { id: string; title: string; isTest: boolean; group: string } | null;
  nextCheckpoint?: { id: string; title: string } | null;
  hasPracticeQuestions: boolean;
}

/** One tap to start: an unfinished session first, then what's due, then lessons. */
export function startStudying(input: StartInputs): StartChoice {
  if (input.practice && !input.practice.endedEarly && input.practice.position < input.practice.total) {
    return { to: input.practice.url, label: 'Resume practice', reason: `You stopped at question ${input.practice.position + 1} of ${input.practice.total}.` };
  }
  if (input.review && input.review.left > 0 && input.nowMs - (input.review.savedAt ?? 0) < input.reviewResumeMs) {
    return { to: input.review.url, label: 'Resume flashcards', reason: `${input.review.left} ${input.review.left === 1 ? 'card is' : 'cards are'} left in the review you started.` };
  }
  if (input.topWork && input.topWork.group === 'overdue') {
    return { to: `/planner/${input.topWork.id}`, label: `Start ${input.topWork.title}`, reason: 'It is overdue, and first in your order.' };
  }
  if (input.cardsDue > 0) {
    return { to: '/cards/review', label: `Review ${input.cardsDue} ${input.cardsDue === 1 ? 'flashcard' : 'flashcards'}`, reason: 'They are due today, and a short review keeps them from piling up.' };
  }
  if (input.topWork) {
    if (input.topWork.isTest && input.hasPracticeQuestions) {
      return { to: '/practice', label: `Practise for ${input.topWork.title}`, reason: 'It is first in your order, and practice questions help most before a test.' };
    }
    return { to: `/planner/${input.topWork.id}`, label: `Start ${input.topWork.title}`, reason: 'It is first in your order of what is due this week.' };
  }
  if (input.nextCheckpoint) {
    return { to: `/study/checkpoints/${input.nextCheckpoint.id}`, label: `Study ${input.nextCheckpoint.title}`, reason: 'Nothing is due, so this is the next lesson step.' };
  }
  return { to: '/study', label: 'Open Study', reason: 'Nothing is due or unfinished. Pick a lesson, deck or practice set.' };
}

export interface WeekLook {
  from: string;
  to: string;
  daysStudied: number;
  cardsReviewed: number;
  practiceAnswers: number;
  practiceCorrect: number;
  /** Planner work due in the last seven days: how much of it is done. */
  dueDone: number;
  dueTotal: number;
  studySeconds: number;
}

export interface WeekInputs {
  today: string;
  studiedDays: Set<string>;
  cardReviewsByDay: Map<string, number>;
  attempts: { at: string; result: string }[];
  plannerItems: PlannerItem[];
  secondsByDay: Map<string, number>;
}

/** The last seven days, today included, from saved records only. */
export function lastWeek(input: WeekInputs): WeekLook {
  const from = addDays(input.today, -6);
  const inWeek = (date: string) => date >= from && date <= input.today;
  const answers = input.attempts.filter((attempt) => inWeek(attempt.at));
  const due = input.plannerItems.filter((item) => item.dueDate && inWeek(item.dueDate));
  let cardsReviewed = 0;
  for (const [date, count] of input.cardReviewsByDay) if (inWeek(date)) cardsReviewed += count;
  let studySeconds = 0;
  for (const [date, seconds] of input.secondsByDay) if (inWeek(date)) studySeconds += seconds;
  return {
    from,
    to: input.today,
    daysStudied: [...input.studiedDays].filter(inWeek).length,
    cardsReviewed,
    practiceAnswers: answers.length,
    practiceCorrect: answers.filter((attempt) => attempt.result === 'correct').length,
    dueDone: due.filter(isDone).length,
    dueTotal: due.length,
    studySeconds,
  };
}

/** A progress bar's words always say what is counted, out of what, so 2 of 8 means one thing. */
export const barLabel = (done: number, total: number, unit: string) => `${done} of ${total} ${unit}`;
export const barPercent = (done: number, total: number) => (total > 0 ? Math.round((done / total) * 100) : 0);

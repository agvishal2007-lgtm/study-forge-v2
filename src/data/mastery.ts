import type {
  AnswerRecord, Checkpoint, CheckpointProgress, GuidedQuestion, KeyPointRating, Lesson, MasteryStatus, PastAttempt, ReviewRecord, StudyStage,
} from './types';

/**
 * The rules of Guided Study. This file only calculates, with no screens or storage, so
 * the rules can be tested directly. These numbers are starting values to adjust after real use.
 */
export const MASTERY_RULES = {
  minimumQuestions: 3,
  minimumAccuracy: 0.8,
  /** Misses of one idea before it's marked Needs Review. */
  missesBeforeReview: 2,
  /** Failed explanation checks before it's marked Needs Review. */
  explanationFailuresBeforeReview: 2,
};

export const STATUS_LABEL: Record<MasteryStatus, string> = {
  'not-started': 'Not started',
  learning: 'Learning',
  practicing: 'Practicing',
  'needs-review': 'Needs review',
  mastered: 'Mastered',
};

export function newProgress(checkpointId: string, now: number): CheckpointProgress {
  return {
    checkpointId,
    status: 'not-started',
    teachingFinished: false,
    teachingSkipped: false,
    stage: { kind: 'teach', step: 0 },
    answers: [],
    misses: {},
    reteachCount: 0,
    explanations: [],
    draft: '',
    lastStudiedAt: now,
    masteredAt: null,
  };
}

/**
 * Starts a checkpoint over while keeping what the earlier attempt showed.
 *
 * The student gets a fresh attempt — no answers carried forward, nothing counted twice, mastery to
 * be shown again rather than assumed — and the attempt they are leaving behind is folded into the
 * record as a line of its own. So "mastered on 12 September, restarted on 26 November" stays true,
 * and a restart never costs a student something they really did.
 *
 * A checkpoint that was never started has nothing to keep, so restarting it changes nothing.
 */
export function restartProgress(current: CheckpointProgress, now: number): CheckpointProgress {
  const fresh = newProgress(current.checkpointId, now);
  if (current.status === 'not-started' && current.answers.length === 0 && current.explanations.length === 0) {
    return { ...fresh, past: current.past };
  }
  const attempt: PastAttempt = {
    status: current.status,
    answered: current.answers.length,
    correct: current.answers.filter((answer) => answer.correct).length,
    explanations: current.explanations.length,
    masteredAt: current.masteredAt,
    // An older record from before attempts were kept has no start of its own; its last study is the
    // closest honest answer, and it is better than inventing one.
    startedAt: current.answers[0]?.at ?? current.lastStudiedAt,
    restartedAt: now,
  };
  return { ...fresh, past: [...(current.past ?? []), attempt] };
}

/** The most recent time this checkpoint was mastered, in an earlier attempt or in this one. */
export function everMasteredAt(progress: CheckpointProgress): number | null {
  const times = [progress.masteredAt, ...(progress.past ?? []).map((attempt) => attempt.masteredAt)].filter(
    (time): time is number => typeof time === 'number',
  );
  return times.length ? Math.max(...times) : null;
}

/** How many times this checkpoint has been started over. */
export const restartCount = (progress: CheckpointProgress): number => (progress.past ?? []).length;

/**
 * Records that a mastered checkpoint was practised again, without changing what was mastered.
 *
 * Deliberately separate from everything above. A review's answers are not practice answers: they do
 * not count toward the evidence for mastery, they cannot take mastery away, and a bad review does
 * not undo a good September. What it does do is say when the student last looked at this, which is
 * what decides what to suggest reviewing next.
 */
export function addReview(progress: CheckpointProgress, result: { answered: number; correct: number }, now: number): CheckpointProgress {
  const review: ReviewRecord = { at: now, answered: Math.max(0, result.answered), correct: Math.max(0, Math.min(result.correct, result.answered)) };
  return { ...progress, reviews: [...(progress.reviews ?? []), review] };
}

/** When this checkpoint was last gone over, whether by mastering it or by reviewing it since. */
export function lastLookedAt(progress: CheckpointProgress): number {
  return Math.max(progress.lastStudiedAt, ...(progress.reviews ?? []).map((review) => review.at), 0);
}

/** How a review went, in plain words, for the line under a checkpoint. */
export function reviewWords(progress: CheckpointProgress): string {
  const last = (progress.reviews ?? []).at(-1);
  if (!last) return '';
  const day = new Date(last.at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  if (last.answered === 0) return `Reviewed ${day}`;
  return `Reviewed ${day} · ${last.correct} of ${last.answered} right`;
}

/**
 * Where a student left off, in the words they would use about it.
 *
 * Study Forge already kept the exact place — the question, the step of the teaching, the
 * half-written explanation — and brought them back to it. What it never did was say so. A
 * checkpoint in the middle looked the same as one never opened, so the student had to open it to
 * find out, which is the opposite of being able to pick something up again.
 *
 * Returns an empty string for a checkpoint that is finished or has not been started, because there
 * is nothing to come back to in either case.
 */
export function whereYouLeftOff(checkpoint: Checkpoint, progress: CheckpointProgress): string {
  if (progress.status === 'not-started' || progress.status === 'mastered') return '';
  const stage = progress.stage;
  const numbered = (questionId: string) => {
    const at = checkpoint.questions.findIndex((question) => question.id === questionId);
    return at >= 0 ? `question ${at + 1} of ${checkpoint.questions.length}` : 'a question';
  };
  switch (stage.kind) {
    case 'teach':
      return 'Paused in the teaching';
    case 'question':
      return `Paused at ${numbered(stage.questionId)}`;
    case 'self-check':
      return `Paused marking your answer to ${numbered(stage.questionId)}`;
    case 'feedback':
      return 'Paused on the answer you just gave';
    case 'reteach':
      return `Paused going back over ${stage.idea || 'an idea'}`;
    case 'stuck':
      return `Paused on ${stage.idea || 'an idea'} that needs another look`;
    case 'explain':
    case 'explain-check':
      return 'Paused explaining it in your own words';
    case 'explain-result':
      return 'Paused on how your explanation went';
    default:
      return 'Paused part-way';
  }
}

/** How long ago, in the roughest words that are still true. */
export function howLongAgo(at: number, now: number): string {
  const days = Math.floor((now - at) / (24 * 60 * 60 * 1000));
  if (!Number.isFinite(at) || at <= 0 || now < at) return '';
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days} days ago`;
  if (days < 14) return 'last week';
  if (days < 62) return `${Math.round(days / 7)} weeks ago`;
  return new Date(at).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}

export const hasTeaching = (checkpoint: Checkpoint) =>
  [checkpoint.teaching.intro, checkpoint.teaching.meaning, checkpoint.teaching.keyIdea].some((text) => text.trim() !== '');

/** A checkpoint needs something to teach, to practice, and to explain before it can be studied. */
export function missingContent(checkpoint: Checkpoint): string[] {
  const missing: string[] = [];
  if (!hasTeaching(checkpoint)) missing.push('teaching');
  if (checkpoint.questions.length === 0) missing.push('at least one practice question');
  if (checkpoint.keyPoints.filter((point) => point.trim()).length === 0) missing.push('key points for the explanation check');
  return missing;
}

const ideaOf = (question: GuidedQuestion) => question.idea.trim() || question.id;
const appliesConcept = (question: GuidedQuestion) => question.kind === 'worked' || question.kind === 'application';

function latestByQuestion(checkpoint: Checkpoint, answers: AnswerRecord[]) {
  const known = new Set(checkpoint.questions.map((question) => question.id));
  const latest = new Map<string, AnswerRecord>();
  for (const answer of answers) if (known.has(answer.questionId)) latest.set(answer.questionId, answer);
  return latest;
}

export interface MasteryEvidence {
  teachingFinished: boolean;
  questionsAnswered: number;
  questionsNeeded: number;
  accuracy: number;
  accuracyMet: boolean;
  applicationNeeded: boolean;
  applicationMet: boolean;
  explanationPassed: boolean;
  practiceMet: boolean;
  mastered: boolean;
}

/** Decides mastery only from what the student actually did. Moving through screens adds nothing. */
export function evaluateMastery(checkpoint: Checkpoint, progress: CheckpointProgress): MasteryEvidence {
  const latest = latestByQuestion(checkpoint, progress.answers);
  const questionsNeeded = Math.min(MASTERY_RULES.minimumQuestions, checkpoint.questions.length);
  const questionsAnswered = latest.size;
  const correct = [...latest.values()].filter((answer) => answer.correct).length;
  const accuracy = questionsAnswered ? correct / questionsAnswered : 0;
  const accuracyMet = questionsAnswered > 0 && accuracy >= MASTERY_RULES.minimumAccuracy;
  const applied = checkpoint.questions.filter(appliesConcept);
  const applicationNeeded = applied.length > 0;
  const applicationMet = !applicationNeeded || applied.some((question) => latest.get(question.id)?.correct);
  const explanationPassed = progress.explanations.at(-1)?.passed === true;
  const practiceMet = questionsNeeded > 0 && questionsAnswered >= questionsNeeded && accuracyMet && applicationMet;
  return {
    teachingFinished: progress.teachingFinished,
    questionsAnswered,
    questionsNeeded,
    accuracy,
    accuracyMet,
    applicationNeeded,
    applicationMet,
    explanationPassed,
    practiceMet,
    mastered: progress.teachingFinished && practiceMet && explanationPassed && missingContent(checkpoint).length === 0,
  };
}

/** Prefers a new question on the idea just missed, and never repeats the question just missed unless it's the only one. */
export function nextQuestion(checkpoint: Checkpoint, progress: CheckpointProgress): GuidedQuestion | null {
  const latest = latestByQuestion(checkpoint, progress.answers);
  const unanswered = checkpoint.questions.filter((question) => !latest.has(question.id));
  const last = progress.answers.at(-1);
  const lastQuestion = checkpoint.questions.find((question) => question.id === last?.questionId);
  if (last && !last.correct && lastQuestion) {
    const sameIdea = unanswered.find((question) => ideaOf(question) === ideaOf(lastQuestion));
    if (sameIdea) return sameIdea;
  }
  const evidence = evaluateMastery(checkpoint, progress);
  if (unanswered.length > 0 && (!evidence.practiceMet || evidence.questionsAnswered < evidence.questionsNeeded || checkpoint.questions.length <= MASTERY_RULES.minimumQuestions + 2)) {
    return unanswered[0];
  }
  if (evidence.practiceMet) return null;
  const missed = checkpoint.questions.filter((question) => latest.get(question.id)?.correct === false);
  // Application questions come first when that's the part still missing.
  const ordered = evidence.applicationMet ? missed : [...missed.filter(appliesConcept), ...missed.filter((question) => !appliesConcept(question))];
  return ordered.find((question) => question.id !== last?.questionId) ?? ordered[0] ?? null;
}

const isCorrectTyped = (question: Pick<GuidedQuestion, 'accepted'>, answer: string) => {
  const clean = (text: string) => text.toLowerCase().replace(/[^\p{L}\p{N}.$%=+-]+/gu, ' ').trim();
  return question.accepted.some((accepted) => accepted.trim() && clean(accepted) === clean(answer));
};

export function canAutoGrade(question: GuidedQuestion, answer: string) {
  return question.options.length > 0 || isCorrectTyped(question, answer);
}

export function gradeAutomatically(question: Pick<GuidedQuestion, 'options' | 'correctOption' | 'accepted'>, answer: string): boolean {
  if (question.options.length > 0) return Number(answer) === question.correctOption;
  return isCorrectTyped(question, answer);
}

export type StudyAction =
  | { type: 'teach-step'; step: number }
  | { type: 'finish-teaching'; skipped: boolean; attemptId: string }
  | { type: 'answer'; attemptId: string; questionId: string; answer: string; correct: boolean; method: AnswerRecord['method'] }
  | { type: 'to-self-check'; attemptId: string; questionId: string; answer: string }
  | { type: 'continue'; attemptId: string }
  | { type: 'finish-reteach'; attemptId: string }
  | { type: 'try-another-example'; idea: string }
  | { type: 'explain-write'; text: string }
  | { type: 'explain-again' }
  | { type: 'explain-rate'; text: string; ratings: KeyPointRating[] }
  | { type: 'draft'; text: string };

function questionStage(question: GuidedQuestion, attemptId: string): StudyStage {
  return { kind: 'question', questionId: question.id, attemptId };
}

function withStatus(checkpoint: Checkpoint, progress: CheckpointProgress, now: number): CheckpointProgress {
  if (evaluateMastery(checkpoint, progress).mastered) {
    return { ...progress, status: 'mastered', stage: { kind: 'mastered' }, masteredAt: progress.masteredAt ?? now };
  }
  return progress;
}

/** Moves on from practice: another question, or the explanation check, or mastery. */
function afterPractice(checkpoint: Checkpoint, progress: CheckpointProgress, attemptId: string, now: number): CheckpointProgress {
  const question = nextQuestion(checkpoint, progress);
  if (question) return { ...progress, stage: questionStage(question, attemptId), status: 'practicing' };
  const finished = withStatus(checkpoint, progress, now);
  if (finished.status === 'mastered') return finished;
  return { ...finished, stage: { kind: 'explain' }, status: finished.status === 'needs-review' ? 'practicing' : finished.status };
}

/** Applies one student action and returns the new progress. Nothing here can mark mastery without evidence. */
export function applyStudyAction(
  checkpoint: Checkpoint,
  current: CheckpointProgress,
  action: StudyAction,
  now: number,
): CheckpointProgress {
  const progress: CheckpointProgress = { ...current, lastStudiedAt: now };
  switch (action.type) {
    case 'draft':
      return { ...progress, draft: action.text };
    case 'teach-step':
      return {
        ...progress,
        stage: { kind: 'teach', step: Math.max(0, action.step) },
        status: progress.status === 'not-started' ? 'learning' : progress.status,
      };
    case 'finish-teaching': {
      const started: CheckpointProgress = { ...progress, teachingFinished: true, teachingSkipped: action.skipped };
      return afterPractice(checkpoint, started, action.attemptId, now);
    }
    case 'to-self-check':
      return { ...progress, stage: { kind: 'self-check', questionId: action.questionId, attemptId: action.attemptId, answer: action.answer }, draft: '' };
    case 'answer': {
      if (progress.answers.some((answer) => answer.attemptId === action.attemptId)) return progress;
      const record: AnswerRecord = { attemptId: action.attemptId, questionId: action.questionId, answer: action.answer, correct: action.correct, method: action.method, at: now };
      const question = checkpoint.questions.find((candidate) => candidate.id === action.questionId);
      const misses = { ...progress.misses };
      if (!action.correct && question) misses[ideaOf(question)] = (misses[ideaOf(question)] ?? 0) + 1;
      return { ...progress, answers: [...progress.answers, record], misses, draft: '', stage: { kind: 'feedback', attemptId: action.attemptId }, status: 'practicing' };
    }
    case 'continue': {
      const last = progress.answers.at(-1);
      const question = checkpoint.questions.find((candidate) => candidate.id === last?.questionId);
      if (last && !last.correct && question) {
        const idea = ideaOf(question);
        if ((progress.misses[idea] ?? 0) >= MASTERY_RULES.missesBeforeReview) {
          return { ...progress, status: 'needs-review', stage: { kind: 'stuck', idea } };
        }
        return { ...progress, stage: { kind: 'reteach', idea } };
      }
      return afterPractice(checkpoint, progress, action.attemptId, now);
    }
    case 'finish-reteach':
      return afterPractice(checkpoint, { ...progress, reteachCount: progress.reteachCount + 1 }, action.attemptId, now);
    case 'try-another-example':
      return { ...progress, status: 'practicing', misses: { ...progress.misses, [action.idea]: 0 }, stage: { kind: 'reteach', idea: action.idea } };
    case 'explain-write':
      return { ...progress, draft: '', stage: { kind: 'explain-check', text: action.text } };
    case 'explain-again':
      return { ...progress, stage: { kind: 'explain' }, status: 'practicing' };
    case 'explain-rate': {
      const passed = action.ratings.length > 0 && action.ratings.every((rating) => rating === 'included');
      const explanations = [...progress.explanations, { text: action.text, ratings: action.ratings, passed, method: 'self-checked' as const, at: now }];
      const rated: CheckpointProgress = { ...progress, explanations, stage: { kind: 'explain-result' } };
      if (passed) return withStatus(checkpoint, rated, now);
      const failures = explanations.filter((explanation) => !explanation.passed).length;
      return failures >= MASTERY_RULES.explanationFailuresBeforeReview ? { ...rated, status: 'needs-review' } : rated;
    }
    default:
      return progress;
  }
}

export interface LessonCount {
  mastered: number;
  total: number;
  completed: boolean;
}

/** A lesson completes only when every checkpoint in it is Mastered. Opening things changes nothing. */
export function countLesson(checkpoints: Checkpoint[], progress: Map<string, CheckpointProgress>): LessonCount {
  const mastered = checkpoints.filter((checkpoint) => progress.get(checkpoint.id)?.status === 'mastered').length;
  return { mastered, total: checkpoints.length, completed: checkpoints.length > 0 && mastered === checkpoints.length };
}

export interface Recommendation {
  checkpoint: Checkpoint;
  lesson: Lesson;
  reason: string;
  /** True when the suggestion is to practise again, not to carry on learning. */
  review?: boolean;
}

/** Picks what to study next: unfinished work, then anything needing review, then the next new checkpoint. */
export function recommendNext(
  lessons: Lesson[],
  checkpoints: Checkpoint[],
  progress: Map<string, CheckpointProgress>,
): Recommendation | null {
  const orderedLessons = [...lessons].sort((a, b) => a.order - b.order || a.createdAt - b.createdAt);
  const inOrder = orderedLessons.flatMap((lesson) =>
    checkpoints
      .filter((checkpoint) => checkpoint.lessonId === lesson.id && missingContent(checkpoint).length === 0)
      .sort((a, b) => a.order - b.order || a.createdAt - b.createdAt)
      .map((checkpoint) => ({ checkpoint, lesson })),
  );
  const withStatusOf = (status: MasteryStatus[]) => inOrder
    .filter(({ checkpoint }) => status.includes(progress.get(checkpoint.id)?.status ?? 'not-started'))
    .sort((a, b) => (progress.get(b.checkpoint.id)?.lastStudiedAt ?? 0) - (progress.get(a.checkpoint.id)?.lastStudiedAt ?? 0));
  const resume = withStatusOf(['learning', 'practicing'])[0];
  if (resume) return { ...resume, reason: 'You started this and haven\'t finished it.' };
  const review = withStatusOf(['needs-review'])[0];
  if (review) return { ...review, reason: 'Part of this still needs review.' };
  const next = inOrder.find(({ checkpoint }) => !progress.has(checkpoint.id) || progress.get(checkpoint.id)?.status === 'not-started');
  if (next) return { ...next, reason: 'This is next in order.' };
  /*
   * Everything here is mastered, which used to mean nothing was suggested at all — a student who
   * had finished a lesson was simply shown an empty space. Offer the one they have not looked at
   * for longest instead, to review rather than to start over, since mastering something is not a
   * reason to be done with it forever.
   */
  const stale = inOrder
    .filter(({ checkpoint }) => progress.get(checkpoint.id)?.status === 'mastered' && checkpoint.questions.length > 0)
    .sort((a, b) => lastLookedAt(progress.get(a.checkpoint.id)!) - lastLookedAt(progress.get(b.checkpoint.id)!))[0];
  return stale ? { ...stale, reason: 'All mastered here. This is the one you have not looked at for longest.', review: true } : null;
}

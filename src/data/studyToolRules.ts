/*
 * The per-feature choices for the study tools, as logic rather than as switches that do nothing.
 *
 * The one thing worth saying about shuffling: it is seeded. A shuffle worked out afresh on every
 * render would reorder the deck underneath the student between one card and the next, which is
 * worse than no shuffle at all. The seed comes from the thing being studied, so the order holds
 * still for a session and differs between sessions.
 */

import type { CardSide, Explanations, ItemOrder, NoteOpen } from './displayPrefs';

/** A small, fast, repeatable number generator — the same seed always gives the same order. */
function numbers(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let drawn = Math.imul(state ^ (state >>> 15), 1 | state);
    drawn = (drawn + Math.imul(drawn ^ (drawn >>> 7), 61 | drawn)) ^ drawn;
    return ((drawn ^ (drawn >>> 14)) >>> 0) / 4294967296;
  };
}

/** Turns any text into a seed, so a deck or a set always shuffles the same way within a session. */
export function seedFrom(text: string): number {
  let seed = 2166136261;
  for (let at = 0; at < text.length; at += 1) {
    seed ^= text.charCodeAt(at);
    seed = Math.imul(seed, 16777619);
  }
  return seed >>> 0;
}

/**
 * Items in the order the student asked for. The original list is never changed, and 'created'
 * returns it exactly as given, so choosing the default can't quietly reorder anything.
 */
export function inChosenOrder<T>(items: T[], order: ItemOrder, seed: string): T[] {
  if (order !== 'shuffled' || items.length < 2) return items;
  const shuffled = [...items];
  const next = numbers(seedFrom(seed));
  for (let at = shuffled.length - 1; at > 0; at -= 1) {
    const swap = Math.floor(next() * (at + 1));
    [shuffled[at], shuffled[swap]] = [shuffled[swap], shuffled[at]];
  }
  return shuffled;
}

/**
 * Which way round to show a card. Asking to start from the definition is how a student practises
 * recall in the other direction, which is a real study technique rather than a cosmetic flip.
 */
export function sidesFor(card: { front: string; back: string }, side: CardSide): { shown: string; hidden: string; flipped: boolean } {
  return side === 'back'
    ? { shown: card.back, hidden: card.front, flipped: true }
    : { shown: card.front, hidden: card.back, flipped: false };
}

/** Whether the explanation belongs on screen now, or is being saved for the end. */
export const explainNow = (when: Explanations): boolean => when === 'each';

/** Whether a note opens ready to type in. */
export const opensWriting = (start: NoteOpen): boolean => start !== 'preview';

/**
 * What to say about a choice, so each setting states its effect rather than just its name. Kept
 * here with the logic so the words and the behaviour cannot drift apart.
 */
export const EXPLAINS: Record<string, string> = {
  'cardOrder.created': 'Cards come in the order you made them.',
  'cardOrder.shuffled': 'Cards are shuffled. The order holds still while you work through them.',
  'cardSide.front': 'Each card shows its front first.',
  'cardSide.back': 'Each card shows its back first, so you recall the other way round.',
  'practiceOrder.created': 'Questions come in the order they were written.',
  'practiceOrder.shuffled': 'Questions are shuffled, in an order that holds still for the session.',
  'explanations.each': 'The explanation appears as soon as you answer.',
  'explanations.end': 'Explanations are saved until the end, then shown together.',
  'noteStart.write': 'A note opens ready to type in.',
  'noteStart.preview': 'A note opens showing how it will read, with a button to start writing.',
  'autoTranscript.on': 'A transcript is started as soon as you stop recording.',
  'autoTranscript.off': "No transcript is made until you ask for one. It's slow on a phone, and it runs on your device.",
};

export const explains = (key: string, value: string): string => EXPLAINS[`${key}.${value}`] ?? '';

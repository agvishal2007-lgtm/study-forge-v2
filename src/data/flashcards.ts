import { logStudy } from './studyLog';
import { getDb, notifyChanged } from './db';
import { nextProgress } from './flashcardRules';
import { localNow } from './plannerRules';
import type { CardProgress, CardRating, Deck, Flashcard } from './types';

export const MAX_CARD_SIDE = 5000;

export const listDecks = async (): Promise<Deck[]> => {
  const decks = await (await getDb()).getAll('decks');
  return decks.sort((a, b) => a.name.localeCompare(b.name));
};
export const getDeck = async (id: string) => (await getDb()).get('decks', id);
export const listCards = async (): Promise<Flashcard[]> => (await getDb()).getAll('cards');
export const listDeckCards = async (deckId: string): Promise<Flashcard[]> => {
  const cards = await (await getDb()).getAllFromIndex('cards', 'deckId', deckId);
  return cards.sort((a, b) => a.createdAt - b.createdAt);
};
export const listCardProgress = async (): Promise<Map<string, CardProgress>> =>
  new Map((await (await getDb()).getAll('cardProgress')).map((entry) => [entry.cardId, entry]));

export async function createDeck(name: string, courseId: string | null, topicId: string | null): Promise<Deck> {
  const now = Date.now();
  const deck: Deck = { id: crypto.randomUUID(), name: name.trim(), courseId, topicId, createdAt: now, updatedAt: now };
  await (await getDb()).put('decks', deck);
  notifyChanged();
  return deck;
}

export async function updateDeck(id: string, changes: Pick<Deck, 'name' | 'courseId' | 'topicId'>): Promise<void> {
  const tx = (await getDb()).transaction('decks', 'readwrite');
  const deck = await tx.store.get(id);
  if (!deck) throw new Error('This deck no longer exists.');
  await tx.store.put({ ...deck, ...changes, name: changes.name.trim(), updatedAt: Math.max(Date.now(), deck.updatedAt + 1) });
  await tx.done;
  notifyChanged();
}

export async function deleteDeck(id: string): Promise<void> {
  const tx = (await getDb()).transaction(['decks', 'cards', 'cardProgress'], 'readwrite');
  for (const cardId of await tx.objectStore('cards').index('deckId').getAllKeys(id)) {
    await tx.objectStore('cards').delete(cardId);
    await tx.objectStore('cardProgress').delete(cardId);
  }
  await tx.objectStore('decks').delete(id);
  await tx.done;
  notifyChanged();
}

export async function addCard(deckId: string, front: string, back: string): Promise<void> {
  const db = await getDb();
  const now = Date.now();
  await db.put('cards', { id: crypto.randomUUID(), deckId, front: front.trim(), back: back.trim(), createdAt: now, updatedAt: now });
  notifyChanged();
}

/** Fixing a card's wording keeps its place in the schedule. */
export async function updateCard(id: string, front: string, back: string): Promise<void> {
  const tx = (await getDb()).transaction('cards', 'readwrite');
  const card = await tx.store.get(id);
  if (!card) throw new Error('This card no longer exists.');
  await tx.store.put({ ...card, front: front.trim(), back: back.trim(), updatedAt: Math.max(Date.now(), card.updatedAt + 1) });
  await tx.done;
  notifyChanged();
}

export async function deleteCard(id: string): Promise<void> {
  const tx = (await getDb()).transaction(['cards', 'cardProgress'], 'readwrite');
  await tx.objectStore('cards').delete(id);
  await tx.objectStore('cardProgress').delete(id);
  await tx.done;
  notifyChanged();
}

/** Saves one answer. The reading and writing happen together, so nothing is lost or counted twice. */
export async function rateCard(cardId: string, rating: CardRating): Promise<void> {
  const tx = (await getDb()).transaction(['cards', 'cardProgress'], 'readwrite');
  if (!(await tx.objectStore('cards').getKey(cardId))) throw new Error('This card no longer exists.');
  const current = await tx.objectStore('cardProgress').get(cardId);
  await tx.objectStore('cardProgress').put(nextProgress(cardId, current, rating, localNow().date, Date.now()));
  await tx.done;
  await logStudy('cards');
  notifyChanged();
}

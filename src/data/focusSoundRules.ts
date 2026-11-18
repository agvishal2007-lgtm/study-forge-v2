/*
 * Focus sounds: steady background sound for studying. Every sound here is made by the browser
 * itself from noise and filters, so there are no recordings to download, nothing to license, it
 * works with no internet at all, and there is no chance of a voice or a lyric in it — which is the
 * whole point. Nothing ever plays unless the student presses play.
 *
 * This file only calculates, so it can be tested directly.
 */
export type SoundId = 'white' | 'pink' | 'brown' | 'fan' | 'wind';

export interface SoundInfo {
  id: SoundId;
  name: string;
  /** Plain words for what it sounds like and when it helps. */
  what: string;
}

export const SOUNDS: SoundInfo[] = [
  { id: 'brown', name: 'Brown noise', what: 'Deep and soft, like distant surf. The gentlest on most ears.' },
  { id: 'pink', name: 'Pink noise', what: 'Even and full, like steady rain on a roof.' },
  { id: 'white', name: 'White noise', what: 'Bright and hissy. Best at covering voices nearby.' },
  { id: 'fan', name: 'Fan', what: 'A low whirr that rises and falls, like a fan across the room.' },
  { id: 'wind', name: 'Wind', what: 'Air moving in long slow breaths, like wind outside a window.' },
];

export const soundInfo = (id: SoundId): SoundInfo | undefined => SOUNDS.find((sound) => sound.id === id);

/** A volume is a number from 0 to 1. Anything odd becomes something safe and quiet enough. */
export function safeVolume(value: unknown, fallback = 0.5): number {
  // Nothing stored at all is not the same as a volume of zero, so it falls back rather than mutes.
  if (value === null || value === undefined || value === '') return fallback;
  const number = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(1, Math.max(0, number));
}

/**
 * Volumes never add up to something startling: the more layers play at once, the more each one is
 * held back, so adding a sound can't suddenly make everything loud.
 */
export function mixedGain(volume: number, layers: number): number {
  const safe = safeVolume(volume);
  if (layers <= 1) return safe;
  return safe / Math.sqrt(layers);
}

export const TIMER_CHOICES = [15, 30, 45, 60, 90, 120];
/** The last stretch of a timer is faded out, so sound never stops with a jolt. */
export const FADE_SECONDS = 8;

/** Plain words for how long is left, such as "28 minutes left" or "40 seconds left". */
export function timeLeftWords(msLeft: number): string {
  if (msLeft <= 0) return 'Finished';
  const seconds = Math.ceil(msLeft / 1000);
  if (seconds < 90) return `${seconds} ${seconds === 1 ? 'second' : 'seconds'} left`;
  const minutes = Math.round(seconds / 60);
  return `${minutes} ${minutes === 1 ? 'minute' : 'minutes'} left`;
}

export interface SavedMix {
  /** Which sounds are on, and how loud each one is on its own. */
  layers: { id: SoundId; volume: number }[];
  master: number;
}

/** Reads back a saved mix, throwing away anything that isn't a sound we have. */
export function readMix(value: unknown): SavedMix {
  const raw = (value ?? {}) as Partial<SavedMix>;
  const layers = Array.isArray(raw.layers) ? raw.layers : [];
  const seen = new Set<SoundId>();
  const kept: SavedMix['layers'] = [];
  for (const layer of layers) {
    const id = (layer as { id?: SoundId })?.id;
    if (!id || !soundInfo(id) || seen.has(id)) continue;
    seen.add(id);
    kept.push({ id, volume: safeVolume((layer as { volume?: number }).volume) });
  }
  return { layers: kept, master: safeVolume(raw.master, 0.6) };
}

import { Platform } from 'react-native';

/**
 * Decibels as the 0–1 the rings and the trail are drawn from.
 *
 * How loud is loud depends on the phone, and a fixed window written for one
 * of them breaks the other. A Galaxy M53 reads about -63 dB in a quiet room
 * and peaks around -39 for ordinary speech; an iPhone 13 sits some 20 dB
 * higher on both counts, so the Android window read every iOS frame as a
 * shout: the trail was a solid wall of bars, and the silence that ends a
 * recording never arrived — a minute of an empty room went to the
 * transcriber, which answered with a sentence nobody had said.
 *
 * So the floor is found rather than assumed. The quietest frame heard so far
 * is the room, a few decibels of wobble are forgiven, and speech is what
 * climbs out of it. The starting guess only covers the frames before the room
 * has been heard, and being wrong about it costs a moment of over-eager bars
 * rather than a broken recording — the floor only ever falls towards the
 * truth.
 */

/** Room noise wobbles about this much around its own floor. */
const FLOOR_MARGIN_DB = 4;
/** From the floor to a voice that is clearly speaking. */
const SPAN_DB = 30;

export const FLOOR_GUESS_DB = Platform.OS === 'ios' ? -45 : -60;

/** One scale per recording: the last room says nothing about this one. */
export function createLoudness(guessDb: number = FLOOR_GUESS_DB) {
  let floorDb = guessDb;

  return function loudness(metering: number | undefined): number {
    if (metering == null || Number.isNaN(metering)) return 0;

    floorDb = Math.min(floorDb, metering);

    const overRoom = metering - (floorDb + FLOOR_MARGIN_DB);

    return Math.max(0, Math.min(1, overRoom / SPAN_DB));
  };
}

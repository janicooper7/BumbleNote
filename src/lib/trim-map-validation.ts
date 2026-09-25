// Server-side validation of the trim maps that ride along with an upload.
//
// Lives apart from src/lib/audio-trim.ts on purpose: that module is the browser
// half (WebAudio decoding) and has a hand-kept mirror in the extension, while this
// is the server's gate on what the browser sent. Kept pure, with no Next or DB
// imports, so it can be unit-tested on its own.
//
// Trim maps drive the timestamp arithmetic that reassembles the dialogue, so they
// get validated rather than trusted. A malformed map would not fail loudly — it
// would quietly deal the two speakers' words into the wrong order — so a bad one
// is rejected outright instead of being dropped, which would be just as wrong
// given the audio really was trimmed.

import type { TrimMap } from "./audio-trim";

/** Mirrors MAX_SPANS in lib/audio-trim: two numbers per span. */
export const MAX_TRIM_NUMBERS = 4000 * 2;

/**
 * Parse one track's trim map from an untrusted request body. Returns undefined
 * for "not trimmed" (absent or empty) and throws on anything malformed.
 */
export function parseTrimMap(value: unknown, track: string): TrimMap | undefined {
  if (value === undefined || value === null) return undefined;
  if (!Array.isArray(value)) throw new Error(`Bad ${track} trim map.`);
  if (value.length === 0) return undefined;
  if (value.length % 2 !== 0 || value.length > MAX_TRIM_NUMBERS) {
    throw new Error(`Bad ${track} trim map.`);
  }

  let prevEnd = -1;
  for (let i = 0; i < value.length; i += 2) {
    const start = value[i];
    const dur = value[i + 1];
    if (typeof start !== "number" || typeof dur !== "number") {
      throw new Error(`Bad ${track} trim map.`);
    }
    // Spans must be finite, forward-going, positive, and strictly ordered — the
    // binary search in makeTimeMapper assumes exactly that.
    if (!Number.isFinite(start) || !Number.isFinite(dur) || start < 0 || dur <= 0) {
      throw new Error(`Bad ${track} trim map.`);
    }
    if (start < prevEnd) throw new Error(`Bad ${track} trim map.`);
    prevEnd = start + dur;
  }
  return value as number[];
}

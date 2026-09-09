// Speech-to-text: turn a lesson's two audio tracks into a labelled transcript.
//
// The capture extension records the two speakers as physically separate files —
// tab audio (the student) and the tutor's microphone — so we get clean speaker
// separation without any AI diarization. We transcribe each track on its own,
// then interleave the words by timestamp to reconstruct the conversation as a
// "Tutor:" / "Student:" dialogue, which feeds straight into the AI pipeline.
//
// Each track is silence-trimmed in the browser before upload, so Deepgram bills
// speech instead of wall-clock (see lib/audio-trim). That leaves the word
// timestamps in a compressed, per-track timeline: two tracks trimmed by different
// amounts no longer share a clock, and interleaving them raw would scramble the
// dialogue. The trim map that came up with the audio undoes exactly that, so
// every word is back on real lesson time before the merge.

import { DeepgramClient } from "@deepgram/sdk";
import type { TrimMap } from "./audio-trim";
import { env } from "./env";

// nova-3 is Deepgram's latest general model. Kept as a constant for easy tuning.
const MODEL = "nova-3";

let client: DeepgramClient | undefined;
function getClient(): DeepgramClient {
  if (!client) client = new DeepgramClient({ apiKey: env.DEEPGRAM_API_KEY });
  return client;
}

type Speaker = "Tutor" | "Student";
type Word = { start: number; text: string; speaker: Speaker };

// The subset of Deepgram's word shape we rely on (results.channels[].alternatives[].words[]).
type DgWord = { start: number; word: string; punctuated_word?: string };

/**
 * Build the "compressed time -> real lesson time" function for one trimmed track.
 *
 * `map` is flat [srcStart, duration, ...] pairs (see TrimMap): span i occupies
 * [offset_i, offset_i + duration_i) in the audio we submitted, where offset_i is
 * the sum of every earlier duration, and it started at srcStart_i in the real
 * lesson. So a timestamp resolves to srcStart_i + how far into the span it fell.
 *
 * The prefix sums are computed once here and closed over, and the lookup is a
 * binary search: a long lesson is thousands of spans against tens of thousands of
 * words, and doing either part per-word makes the merge quadratic.
 *
 * Exported so it can be exercised on its own: this is the piece that silently
 * corrupts turn order if it drifts, and a scrambled transcript still reads
 * plausibly enough to ship.
 */
export function makeTimeMapper(map: TrimMap | undefined): (t: number) => number {
  if (!map || map.length < 2) return (t) => t; // untrimmed: already real time

  const spans = Math.floor(map.length / 2);
  const offsets = new Float64Array(spans);
  let acc = 0;
  for (let i = 0; i < spans; i++) {
    offsets[i] = acc;
    acc += map[i * 2 + 1];
  }

  return (t) => {
    // Last span whose output offset is <= t.
    let lo = 0;
    let hi = spans - 1;
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2);
      if (offsets[mid] <= t) lo = mid;
      else hi = mid - 1;
    }
    // Clamp inside the span: Deepgram can report a word start a hair past the end
    // of the audio, which would otherwise project into the silence we removed.
    const into = Math.min(Math.max(0, t - offsets[lo]), map[lo * 2 + 1]);
    return map[lo * 2] + into;
  };
}

async function transcribeTrack(
  audio: Buffer,
  speaker: Speaker,
  map: TrimMap | undefined,
): Promise<Word[]> {
  const res = await getClient().listen.v1.media.transcribeFile(audio, {
    model: MODEL,
    language: "en",
    smart_format: true,
    punctuate: true,
  });

  // Callback-mode responses have no `results`; we transcribe synchronously.
  const results = "results" in res ? res.results : undefined;
  const words = (results?.channels?.[0]?.alternatives?.[0]?.words ?? []) as DgWord[];
  const toLessonTime = makeTimeMapper(map);
  return words.map((w) => ({
    start: toLessonTime(w.start),
    text: w.punctuated_word ?? w.word,
    speaker,
  }));
}

/**
 * Transcribe both lesson tracks and merge them into a single labelled transcript.
 * Words are ordered by their start time, and consecutive words from the same
 * speaker are grouped into one turn.
 */
export async function transcribeLesson(input: {
  studentAudio: Buffer;
  tutorAudio: Buffer;
  /** Trim maps from lib/audio-trim, per track. Absent = that track wasn't trimmed. */
  trimMaps?: { student?: TrimMap; tutor?: TrimMap };
}): Promise<string> {
  let student: Word[];
  let tutor: Word[];
  try {
    [student, tutor] = await Promise.all([
      transcribeTrack(input.studentAudio, "Student", input.trimMaps?.student),
      transcribeTrack(input.tutorAudio, "Tutor", input.trimMaps?.tutor),
    ]);
  } catch (err) {
    const detail = err instanceof Error ? err.message : "unknown error";
    throw new Error(`Couldn't transcribe the audio: ${detail}`);
  }

  const words = [...student, ...tutor].sort((a, b) => a.start - b.start);
  if (words.length === 0) {
    throw new Error("No speech was detected in the recordings.");
  }

  const turns: { speaker: Speaker; text: string }[] = [];
  for (const w of words) {
    const last = turns[turns.length - 1];
    if (last && last.speaker === w.speaker) last.text += ` ${w.text}`;
    else turns.push({ speaker: w.speaker, text: w.text });
  }

  return turns.map((t) => `${t.speaker}: ${t.text.trim()}`).join("\n");
}

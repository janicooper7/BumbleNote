// Voice-activity trimming: cut the silence out of a lesson track before upload.
//
// Each recorded track is mostly silence by construction — the tutor's mic is
// quiet while the student talks, and vice versa — but Deepgram bills *submitted*
// duration, not speech. So a 60-minute lesson is billed as ~120 minutes of audio
// for ~60 minutes of talking. Dropping the silence roughly halves that.
//
// The catch is that stt.ts interleaves the two tracks by Deepgram's word start
// times to reconstruct the dialogue. Once a track is trimmed those timestamps
// live in a *compressed* timeline, and comparing a trimmed student time against a
// trimmed tutor time scrambles turn order. So trimming also emits a TrimMap that
// maps compressed time back to real lesson time; the map rides along to the
// worker, which un-maps every word before merging (see mapTrimmedTime in stt.ts).
//
// Browser-only (needs WebAudio decoding). The capture extension carries a plain-JS
// mirror of this file — extension/audio-trim.js — keep the two in sync.

/**
 * Kept speech spans, flattened to [srcStart, duration, ...] pairs in seconds and
 * ordered by srcStart. The compressed timeline is just these spans butted
 * together, so a span's output offset is the sum of all durations before it —
 * which is why it doesn't need storing. `undefined` means "not trimmed": the
 * timeline is already the real one.
 *
 * Flat numbers rather than objects because this is serialized into the
 * /api/upload/complete body; a chatty lesson runs to a few thousand spans.
 */
export type TrimMap = number[];

export type TrimmedTrack = {
  /** What to upload: the trimmed 16 kHz WAV, or the original blob if untrimmed. */
  blob: Blob;
  /** Offset map for the uploaded audio, or undefined when it wasn't trimmed. */
  map?: TrimMap;
  originalSec: number;
  trimmedSec: number;
};

// Deepgram's models are trained on 16 kHz; sending more is paying to downsample.
const TARGET_RATE = 16000;
const FRAME_MS = 20;

// Padding around each detected span. Speech onsets ramp up over a few tens of ms,
// so an energy VAD always fires slightly late and releases slightly early —
// without a lead-in the first consonant of a word gets clipped, which is exactly
// the kind of damage that turns "peak" into "eak" in the transcript.
const PAD_BEFORE_MS = 250;
const PAD_AFTER_MS = 400;

// Spans closer together than this are fused. Natural speech is full of short
// gaps (stop consonants, breaths, beats between clauses); cutting them out saves
// almost nothing and risks chopping mid-word.
const MERGE_GAP_MS = 600;

// Isolated blips shorter than this are keyboard taps, mouse clicks, door noise.
const MIN_SPEECH_MS = 120;

// Every kept span starts and ends on a cut, and a cut across a non-zero sample is
// a step discontinuity — an audible click an ASR model can read as a plosive.
const FADE_MS = 5;

// Above this speech ratio there is nothing worth reclaiming, and re-encoding to
// 16-bit WAV would make the upload *larger* than the Opus original. Leave it be.
const SKIP_IF_SPEECH_RATIO_ABOVE = 0.95;

// Ceiling on span count, to bound both the map's size in the JSON body and the
// per-word lookup. Hit only by pathologically choppy audio; see coalesce().
const MAX_SPANS = 4000;

// Absolute noise gate, so a digitally-silent track (RMS 0, no measurable floor)
// does not end up with a threshold of 0 and count every sample as speech.
const ABS_FLOOR = 10 ** (-55 / 20); // about -55 dBFS

// Speech sits well above the room's noise floor; +8 dB is loose enough to keep a
// mumbled aside and tight enough to drop breathing and fan noise.
const OVER_NOISE = 2.5; // about +8 dB

// ...but if the "floor" measurement is itself contaminated (a track that is almost
// wall-to-wall speech), never demand more than -16 dB relative to the loud parts.
const MAX_REL_TO_PEAK = 0.15;

type Span = { start: number; end: number }; // seconds, in the original timeline

/** Decode any recorded blob to mono Float32 at TARGET_RATE. */
async function decodeMono(blob: Blob): Promise<Float32Array> {
  // decodeAudioData resamples to the context's rate, so asking for a 16 kHz
  // context does the downsample for us — and keeps a long lesson's decoded
  // buffer three times smaller than it would be at 48 kHz.
  const ctx = new OfflineAudioContext(1, 1, TARGET_RATE);
  const buf = await ctx.decodeAudioData(await blob.arrayBuffer());

  if (buf.numberOfChannels === 1) return buf.getChannelData(0);

  const mixed = new Float32Array(buf.length);
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const data = buf.getChannelData(c);
    for (let i = 0; i < data.length; i++) mixed[i] += data[i];
  }
  for (let i = 0; i < mixed.length; i++) mixed[i] /= buf.numberOfChannels;
  return mixed;
}

/** Per-frame RMS envelope. */
function envelope(pcm: Float32Array, frame: number): Float32Array {
  const count = Math.max(1, Math.ceil(pcm.length / frame));
  const rms = new Float32Array(count);
  for (let f = 0; f < count; f++) {
    const start = f * frame;
    const end = Math.min(start + frame, pcm.length);
    let sum = 0;
    for (let i = start; i < end; i++) sum += pcm[i] * pcm[i];
    rms[f] = Math.sqrt(sum / Math.max(1, end - start));
  }
  return rms;
}

function percentile(sorted: Float32Array, p: number): number {
  if (sorted.length === 0) return 0;
  const i = Math.min(sorted.length - 1, Math.max(0, Math.round(p * (sorted.length - 1))));
  return sorted[i];
}

/**
 * Pick the speech threshold from the track's own statistics rather than a fixed
 * dBFS number — mic gain, headset type and room tone vary hugely between tutors,
 * and one hard-coded gate would be wrong for most of them.
 */
function chooseThreshold(rms: Float32Array): number {
  const sorted = Float32Array.from(rms).sort();
  const noise = percentile(sorted, 0.2);
  const loud = percentile(sorted, 0.95);
  const floor = Math.max(noise * OVER_NOISE, ABS_FLOOR);
  return loud > 0 ? Math.min(floor, loud * MAX_REL_TO_PEAK) : floor;
}

/** Frames over threshold -> padded, de-blipped, merged spans. */
function detectSpans(rms: Float32Array, threshold: number, totalSec: number): Span[] {
  const frameSec = FRAME_MS / 1000;
  const raw: Span[] = [];
  let open = -1;

  for (let f = 0; f <= rms.length; f++) {
    const speech = f < rms.length && rms[f] > threshold;
    if (speech && open < 0) open = f;
    else if (!speech && open >= 0) {
      raw.push({ start: open * frameSec, end: f * frameSec });
      open = -1;
    }
  }

  // Drop blips *before* padding — padding would inflate a 20 ms click into 670 ms
  // of kept audio and, worse, bridge unrelated spans around it.
  const kept = raw.filter((s) => s.end - s.start >= MIN_SPEECH_MS / 1000);

  const padded = kept.map((s) => ({
    start: Math.max(0, s.start - PAD_BEFORE_MS / 1000),
    end: Math.min(totalSec, s.end + PAD_AFTER_MS / 1000),
  }));

  return coalesce(padded, MERGE_GAP_MS / 1000);
}

/** Fuse spans separated by less than `gap`, widening the gap until under MAX_SPANS. */
function coalesce(spans: Span[], gap: number): Span[] {
  let out = spans;
  let g = gap;
  do {
    const merged: Span[] = [];
    for (const s of out) {
      const last = merged[merged.length - 1];
      if (last && s.start - last.end <= g) last.end = Math.max(last.end, s.end);
      else merged.push({ ...s });
    }
    out = merged;
    g *= 2;
  } while (out.length > MAX_SPANS);
  return out;
}

/**
 * Write the kept spans straight into a 16-bit PCM WAV, fading each seam.
 *
 * Splicing into an intermediate Float32 buffer and encoding that afterwards would
 * read more cleanly, but the decoded track is still live at this point and a long
 * lesson's kept audio is another ~100 MB as Float32 — so samples are converted as
 * they are copied. Deepgram sniffs the container, so no encoding hints needed.
 */
function encodeWav(pcm: Float32Array, spans: Span[], rate: number): Blob {
  const idx = (sec: number) => Math.min(pcm.length, Math.max(0, Math.round(sec * rate)));
  const total = spans.reduce((n, s) => n + (idx(s.end) - idx(s.start)), 0);

  const buf = new ArrayBuffer(44 + total * 2);
  const view = new DataView(buf);
  const ascii = (at: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(at + i, s.charCodeAt(i));
  };

  ascii(0, "RIFF");
  view.setUint32(4, 36 + total * 2, true);
  ascii(8, "WAVE");
  ascii(12, "fmt ");
  view.setUint32(16, 16, true); // fmt chunk size
  view.setUint16(20, 1, true); // format: PCM
  view.setUint16(22, 1, true); // channels: mono
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * 2, true); // byte rate
  view.setUint16(32, 2, true); // block align
  view.setUint16(34, 16, true); // bits per sample
  ascii(36, "data");
  view.setUint32(40, total * 2, true);

  const fade = Math.round((FADE_MS / 1000) * rate);
  let at = 0; // output sample index
  for (const s of spans) {
    const from = idx(s.start);
    const len = idx(s.end) - from;
    for (let i = 0; i < len; i++) {
      let v = pcm[from + i];
      if (i < fade) v *= i / fade;
      else if (i >= len - fade) v *= (len - 1 - i) / fade;
      const c = Math.max(-1, Math.min(1, v));
      view.setInt16(44 + (at + i) * 2, c < 0 ? c * 0x8000 : c * 0x7fff, true);
    }
    at += len;
  }
  return new Blob([buf], { type: "audio/wav" });
}

function round(sec: number): number {
  return Math.round(sec * 1000) / 1000;
}

/**
 * Trim the silence out of one recorded track.
 *
 * Never throws: anything unexpected (a codec the decoder will not touch, a
 * truncated recording, an out-of-memory splice) falls back to the untrimmed
 * original. A saving we did not get is a rounding error on the bill; a lesson we
 * dropped on the floor is the tutor's hour of work.
 */
export async function trimSilence(blob: Blob): Promise<TrimmedTrack> {
  const untrimmed = (sec = 0): TrimmedTrack => ({
    blob,
    map: undefined,
    originalSec: sec,
    trimmedSec: sec,
  });

  let pcm: Float32Array;
  try {
    pcm = await decodeMono(blob);
  } catch {
    return untrimmed();
  }

  const originalSec = pcm.length / TARGET_RATE;
  try {
    const frame = Math.round((FRAME_MS / 1000) * TARGET_RATE);
    const rms = envelope(pcm, frame);
    const spans = detectSpans(rms, chooseThreshold(rms), originalSec);
    const trimmedSec = spans.reduce((n, s) => n + (s.end - s.start), 0);

    // Nothing detected at all is far more likely to be a VAD misfire than a truly
    // silent hour, and uploading an empty file would cost us the whole track's
    // transcript. Send the original and let Deepgram be the judge.
    if (spans.length === 0) return untrimmed(originalSec);
    if (trimmedSec > originalSec * SKIP_IF_SPEECH_RATIO_ABOVE) return untrimmed(originalSec);

    const map: TrimMap = [];
    for (const s of spans) map.push(round(s.start), round(s.end - s.start));

    return { blob: encodeWav(pcm, spans, TARGET_RATE), map, originalSec, trimmedSec };
  } catch {
    return untrimmed(originalSec);
  }
}

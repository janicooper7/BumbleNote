// Voice-activity trimming for the capture extension.
//
// Plain-JS mirror of the web app's src/lib/audio-trim.ts — keep the two in sync.
// See that file for the full rationale; the short version is that each track is
// mostly silence by construction (the tutor's mic is quiet while the student
// talks, and vice versa) and Deepgram bills submitted duration, not speech. We
// cut the silence out here and ship a map of what we cut, so the worker can put
// the word timestamps back on real lesson time before interleaving the speakers.

// Assigned onto the global rather than declared, because offscreen.js is a
// separate classic script in the same document and this is how it reaches it.
globalThis.BumbleNoteTrim = (() => {
  const TARGET_RATE = 16000;
  const FRAME_MS = 20;
  const PAD_BEFORE_MS = 250;
  const PAD_AFTER_MS = 400;
  const MERGE_GAP_MS = 600;
  const MIN_SPEECH_MS = 120;
  const FADE_MS = 5;
  const SKIP_IF_SPEECH_RATIO_ABOVE = 0.95;
  const MAX_SPANS = 4000;
  const ABS_FLOOR = 10 ** (-55 / 20);
  const OVER_NOISE = 2.5;
  const MAX_REL_TO_PEAK = 0.15;

  async function decodeMono(blob) {
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

  function envelope(pcm, frame) {
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

  function percentile(sorted, p) {
    if (sorted.length === 0) return 0;
    const i = Math.min(sorted.length - 1, Math.max(0, Math.round(p * (sorted.length - 1))));
    return sorted[i];
  }

  function chooseThreshold(rms) {
    const sorted = Float32Array.from(rms).sort();
    const noise = percentile(sorted, 0.2);
    const loud = percentile(sorted, 0.95);
    const floor = Math.max(noise * OVER_NOISE, ABS_FLOOR);
    return loud > 0 ? Math.min(floor, loud * MAX_REL_TO_PEAK) : floor;
  }

  function coalesce(spans, gap) {
    let out = spans;
    let g = gap;
    do {
      const merged = [];
      for (const s of out) {
        const last = merged[merged.length - 1];
        if (last && s.start - last.end <= g) last.end = Math.max(last.end, s.end);
        else merged.push({ start: s.start, end: s.end });
      }
      out = merged;
      g *= 2;
    } while (out.length > MAX_SPANS);
    return out;
  }

  function detectSpans(rms, threshold, totalSec) {
    const frameSec = FRAME_MS / 1000;
    const raw = [];
    let open = -1;

    for (let f = 0; f <= rms.length; f++) {
      const speech = f < rms.length && rms[f] > threshold;
      if (speech && open < 0) open = f;
      else if (!speech && open >= 0) {
        raw.push({ start: open * frameSec, end: f * frameSec });
        open = -1;
      }
    }

    const kept = raw.filter((s) => s.end - s.start >= MIN_SPEECH_MS / 1000);
    const padded = kept.map((s) => ({
      start: Math.max(0, s.start - PAD_BEFORE_MS / 1000),
      end: Math.min(totalSec, s.end + PAD_AFTER_MS / 1000),
    }));
    return coalesce(padded, MERGE_GAP_MS / 1000);
  }

  // Samples are converted as they are copied rather than spliced into an
  // intermediate Float32 buffer first: the decoded track is still live here, and a
  // long lesson's kept audio would be another ~100 MB.
  function encodeWav(pcm, spans, rate) {
    const idx = (sec) => Math.min(pcm.length, Math.max(0, Math.round(sec * rate)));
    const total = spans.reduce((n, s) => n + (idx(s.end) - idx(s.start)), 0);

    const buf = new ArrayBuffer(44 + total * 2);
    const view = new DataView(buf);
    const ascii = (at, s) => {
      for (let i = 0; i < s.length; i++) view.setUint8(at + i, s.charCodeAt(i));
    };

    ascii(0, "RIFF");
    view.setUint32(4, 36 + total * 2, true);
    ascii(8, "WAVE");
    ascii(12, "fmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, rate, true);
    view.setUint32(28, rate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    ascii(36, "data");
    view.setUint32(40, total * 2, true);

    const fade = Math.round((FADE_MS / 1000) * rate);
    let at = 0;
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

  const round = (sec) => Math.round(sec * 1000) / 1000;

  /**
   * Trim one recorded track. Never throws — on any failure the untrimmed original
   * is returned, because a saving we missed is a rounding error on the bill and a
   * lesson we lost is the tutor's hour of work.
   *
   * -> { blob, map, originalSec, trimmedSec }, map undefined when untrimmed.
   */
  async function trimSilence(blob) {
    const untrimmed = (sec = 0) => ({
      blob,
      map: undefined,
      originalSec: sec,
      trimmedSec: sec,
    });

    let pcm;
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

      if (spans.length === 0) return untrimmed(originalSec);
      if (trimmedSec > originalSec * SKIP_IF_SPEECH_RATIO_ABOVE) return untrimmed(originalSec);

      const map = [];
      for (const s of spans) map.push(round(s.start), round(s.end - s.start));

      return { blob: encodeWav(pcm, spans, TARGET_RATE), map, originalSec, trimmedSec };
    } catch {
      return untrimmed(originalSec);
    }
  }

  return { trimSilence };
})();

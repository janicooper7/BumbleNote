// The span arithmetic behind trimSilence. Decoding and WAV encoding need
// WebAudio/Blob and aren't covered here; what is covered is everything that
// decides which seconds of the lesson survive and what the TrimMap says.

import { describe, expect, it } from "vitest";
import { chooseThreshold, coalesce, detectSpans, envelope, type Span } from "./audio-trim";
import { makeTimeMapper } from "./stt";
import { parseTrimMap } from "./trim-map-validation";

const FRAME_SEC = 0.02; // FRAME_MS in audio-trim

/** An RMS envelope of `frames` frames, loud (1) wherever a range says so. */
function rmsWith(frames: number, ...loud: [from: number, to: number][]): Float32Array {
  const rms = new Float32Array(frames);
  for (const [from, to] of loud) rms.fill(1, from, to);
  return rms;
}

function expectSpans(actual: Span[], expected: [number, number][]) {
  expect(actual).toHaveLength(expected.length);
  actual.forEach((s, i) => {
    expect(s.start).toBeCloseTo(expected[i][0], 6);
    expect(s.end).toBeCloseTo(expected[i][1], 6);
  });
}

describe("envelope", () => {
  it("computes RMS per frame, including a short final frame", () => {
    const pcm = new Float32Array(100);
    pcm.fill(0.5, 0, 40);
    pcm.fill(-0.25, 40, 100); // sign must not matter
    const rms = envelope(pcm, 40);
    expect(rms).toHaveLength(3);
    expect(rms[0]).toBeCloseTo(0.5, 6);
    expect(rms[1]).toBeCloseTo(0.25, 6);
    expect(rms[2]).toBeCloseTo(0.25, 6); // 20 samples, not divided by 40
  });

  it("returns one silent frame for empty audio", () => {
    expect(Array.from(envelope(new Float32Array(0), 320))).toEqual([0]);
  });
});

describe("chooseThreshold", () => {
  it("never drops to zero on a digitally silent track", () => {
    const t = chooseThreshold(new Float32Array(500));
    expect(t).toBeGreaterThan(0);
    expect(t).toBeCloseTo(10 ** (-55 / 20), 6);
  });

  it("sits a margin above the room's noise floor", () => {
    const rms = new Float32Array(1000).fill(0.01);
    rms.fill(0.5, 0, 200); // 20% speech
    const t = chooseThreshold(rms);
    expect(t).toBeCloseTo(0.025, 6); // 0.01 × 2.5
    expect(t).toBeGreaterThan(0.01);
    expect(t).toBeLessThan(0.5);
  });

  it("is capped relative to the peak when the track is wall-to-wall speech", () => {
    const t = chooseThreshold(new Float32Array(1000).fill(0.5));
    expect(t).toBeCloseTo(0.075, 6); // 0.5 × 0.15, not 0.5 × 2.5
  });
});

describe("detectSpans", () => {
  it("pads a detected span (250 ms before, 400 ms after)", () => {
    // Speech 1.0–1.2 s in a 6 s track.
    expectSpans(detectSpans(rmsWith(300, [50, 60]), 0.5, 6), [[0.75, 1.6]]);
  });

  it("drops blips shorter than 120 ms before padding them", () => {
    expect(detectSpans(rmsWith(300, [50, 55]), 0.5, 6)).toEqual([]); // 100 ms
    expect(detectSpans(rmsWith(300, [50, 56]), 0.5, 6)).toHaveLength(1); // 120 ms
  });

  it("treats the threshold as exclusive", () => {
    expect(detectSpans(new Float32Array(300).fill(0.5), 0.5, 6)).toEqual([]);
  });

  it("fuses spans whose padded edges are closer than 600 ms", () => {
    // 1.0–1.2 s and 2.0–2.2 s: padded to 0.75–1.6 and 1.75–2.6, 150 ms apart.
    expectSpans(detectSpans(rmsWith(300, [50, 60], [100, 110]), 0.5, 6), [[0.75, 2.6]]);
  });

  it("keeps spans apart when the silence between them is long", () => {
    // 1.0–1.2 s and 4.0–4.2 s.
    expectSpans(detectSpans(rmsWith(300, [50, 60], [200, 210]), 0.5, 6), [
      [0.75, 1.6],
      [3.75, 4.6],
    ]);
  });

  it("clamps padding to the start and end of the track and closes a span at the end", () => {
    // Speech from 0 and speech running to the very last frame of a 4 s track.
    expectSpans(detectSpans(rmsWith(200, [0, 10], [150, 200]), 0.5, 4), [
      [0, 0.6],
      [2.75, 4],
    ]);
  });

  it("finds nothing in silence", () => {
    expect(detectSpans(new Float32Array(300), 0.5, 6)).toEqual([]);
  });
});

describe("coalesce", () => {
  it("merges spans within the gap, keeps the rest, and doesn't mutate the input", () => {
    const input: Span[] = [
      { start: 0, end: 1 },
      { start: 1.5, end: 2 },
      { start: 5, end: 6 },
    ];
    const snapshot = structuredClone(input);
    expect(coalesce(input, 0.5)).toEqual([
      { start: 0, end: 2 },
      { start: 5, end: 6 },
    ]);
    expect(input).toEqual(snapshot);
  });

  it("keeps the later end when an overlapping span is contained in the previous one", () => {
    expect(
      coalesce(
        [
          { start: 0, end: 5 },
          { start: 1, end: 2 },
        ],
        0.1,
      ),
    ).toEqual([{ start: 0, end: 5 }]);
  });

  it("widens the gap until the span count is under the 4000 cap", () => {
    // 6000 short spans, 1 s apart: too many at a 0.6 s gap, so it must keep
    // merging, but it must still cover the same stretch of the lesson.
    const spans: Span[] = Array.from({ length: 6000 }, (_, i) => ({
      start: i * 1.1,
      end: i * 1.1 + 0.1,
    }));
    const out = coalesce(spans, 0.6);
    expect(out.length).toBeLessThanOrEqual(4000);
    expect(out.length).toBeGreaterThan(0);
    expect(out[0].start).toBe(0);
    expect(out[out.length - 1].end).toBeCloseTo(5999 * 1.1 + 0.1, 6);
  });
});

describe("trim map round trip", () => {
  it("produces a map the server accepts and that maps compressed time back onto the speech", () => {
    // 60 s track at 20 ms frames with three utterances.
    const rms = rmsWith(3000, [250, 350], [1000, 1100], [2500, 2600]);
    const spans = detectSpans(rms, 0.5, 60);
    expect(spans).toHaveLength(3);

    // Built exactly as trimSilence builds it.
    const round = (sec: number) => Math.round(sec * 1000) / 1000;
    const map: number[] = [];
    for (const s of spans) map.push(round(s.start), round(s.end - s.start));

    expect(parseTrimMap(map, "student")).toBe(map);

    const toReal = makeTimeMapper(map);
    // The first word of the second utterance, 20.0 s into the lesson, sits in
    // compressed time after the whole first span plus its 250 ms lead-in.
    const firstSpanLen = map[1];
    expect(toReal(firstSpanLen + 0.25)).toBeCloseTo(1000 * FRAME_SEC, 6);
    // And the start of the third utterance.
    expect(toReal(firstSpanLen + map[3] + 0.25)).toBeCloseTo(2500 * FRAME_SEC, 6);
  });
});

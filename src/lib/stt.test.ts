import { beforeEach, describe, expect, it, vi } from "vitest";

// Deepgram is replaced by a fake that answers per audio buffer, so the tests
// exercise the real time-mapping and interleaving without touching the network.
const dg = vi.hoisted(() => ({
  words: new Map<string, { start: number; word: string; punctuated_word?: string }[]>(),
  fail: undefined as Error | undefined,
  calls: [] as { audio: string; options: Record<string, unknown> }[],
}));

vi.mock("@deepgram/sdk", () => ({
  DeepgramClient: class {
    listen = {
      v1: {
        media: {
          transcribeFile: async (audio: Buffer, options: Record<string, unknown>) => {
            dg.calls.push({ audio: audio.toString(), options });
            if (dg.fail) throw dg.fail;
            const words = dg.words.get(audio.toString()) ?? [];
            return { results: { channels: [{ alternatives: [{ words }] }] } };
          },
        },
      },
    };
  },
}));

import { makeTimeMapper, transcribeLesson } from "./stt";

const STUDENT = Buffer.from("student-audio");
const TUTOR = Buffer.from("tutor-audio");

function say(track: Buffer, ...words: [start: number, text: string][]) {
  dg.words.set(
    track.toString(),
    words.map(([start, text]) => ({ start, word: text.toLowerCase(), punctuated_word: text })),
  );
}

beforeEach(() => {
  dg.words.clear();
  dg.fail = undefined;
  dg.calls.length = 0;
});

describe("makeTimeMapper", () => {
  it("is the identity for an untrimmed track", () => {
    for (const map of [undefined, [], [5]]) {
      const f = makeTimeMapper(map);
      expect(f(0)).toBe(0);
      expect(f(12.34)).toBe(12.34);
    }
  });

  it("maps a single span by its source offset", () => {
    const f = makeTimeMapper([10, 5]); // compressed [0,5) was real [10,15)
    expect(f(0)).toBe(10);
    expect(f(2.5)).toBe(12.5);
  });

  it("maps each span through its own offset", () => {
    // Spans: real [2,4) -> [0,2), real [10,13) -> [2,5), real [30,31) -> [5,6)
    const f = makeTimeMapper([2, 2, 10, 3, 30, 1]);
    expect(f(0)).toBe(2);
    expect(f(1.5)).toBe(3.5);
    expect(f(2)).toBe(10); // boundary belongs to the later span
    expect(f(4)).toBe(12);
    expect(f(5)).toBe(30);
    expect(f(5.5)).toBe(30.5);
  });

  it("clamps a timestamp past the end into the last span rather than into removed silence", () => {
    const f = makeTimeMapper([2, 2, 10, 3]);
    expect(f(5)).toBe(13); // exactly the end
    expect(f(9)).toBe(13); // past the end of the audio
  });

  it("clamps a negative timestamp to the first span's start", () => {
    expect(makeTimeMapper([7, 1])(-0.2)).toBe(7);
  });

  it("agrees with a linear scan over many spans (binary search check)", () => {
    const map: number[] = [];
    let src = 0;
    for (let i = 0; i < 1000; i++) {
      src += 0.5 + (i % 7) * 0.3; // a gap of silence
      const dur = 0.2 + (i % 5) * 0.1;
      map.push(src, dur);
      src += dur;
    }
    const f = makeTimeMapper(map);

    const linear = (t: number) => {
      let offset = 0;
      for (let i = 0; i < map.length; i += 2) {
        const dur = map[i + 1];
        const isLast = i + 2 >= map.length;
        if (t < offset + dur || isLast) return map[i] + Math.min(Math.max(0, t - offset), dur);
        offset += dur;
      }
      return t;
    };

    const total = map.reduce((n, v, i) => (i % 2 ? n + v : n), 0);
    for (let t = 0; t < total; t += 0.137) {
      expect(f(t)).toBeCloseTo(linear(t), 9);
    }
  });
});

describe("transcribeLesson", () => {
  it("interleaves the two tracks by time into labelled turns", async () => {
    say(TUTOR, [0, "Hello,"], [0.4, "how"], [0.6, "are"], [0.8, "you?"], [5, "Great."]);
    say(STUDENT, [2, "I'm"], [2.3, "fine,"], [2.6, "thanks."]);

    const text = await transcribeLesson({ studentAudio: STUDENT, tutorAudio: TUTOR });
    expect(text).toBe(
      ["Tutor: Hello, how are you?", "Student: I'm fine, thanks.", "Tutor: Great."].join("\n"),
    );
  });

  it("falls back to the raw word when there's no punctuated form", async () => {
    dg.words.set(TUTOR.toString(), [{ start: 0, word: "hello" }]);
    say(STUDENT, [1, "Hi."]);
    expect(await transcribeLesson({ studentAudio: STUDENT, tutorAudio: TUTOR })).toBe(
      "Tutor: hello\nStudent: Hi.",
    );
  });

  it("un-maps each trimmed track before merging, so turn order follows real time", async () => {
    // Real lesson: tutor speaks at 0s and 20s, student at 10s. The tutor track is
    // trimmed to two 1-second spans butted together, so its second word sits at
    // 1.0 in compressed time; the student track is trimmed to one span starting
    // at 8.5s, so the student word sits at 1.5. Merged raw, the student would
    // answer after the tutor had already moved on.
    say(TUTOR, [0, "Question?"], [1, "Right!"]);
    say(STUDENT, [1.5, "Answer."]);

    const unmapped = await transcribeLesson({ studentAudio: STUDENT, tutorAudio: TUTOR });
    expect(unmapped).toBe("Tutor: Question? Right!\nStudent: Answer.");

    const mapped = await transcribeLesson({
      studentAudio: STUDENT,
      tutorAudio: TUTOR,
      trimMaps: { tutor: [0, 1, 20, 1], student: [8.5, 2] },
    });
    expect(mapped).toBe("Tutor: Question?\nStudent: Answer.\nTutor: Right!");
  });

  it("works when only one track was trimmed", async () => {
    say(TUTOR, [0, "One."], [30, "Three."]);
    say(STUDENT, [0.5, "Two."]); // compressed; really at 15.5
    const text = await transcribeLesson({
      studentAudio: STUDENT,
      tutorAudio: TUTOR,
      trimMaps: { student: [15, 2] },
    });
    expect(text).toBe("Tutor: One.\nStudent: Two.\nTutor: Three.");
  });

  it("throws a friendly error when neither track has speech", async () => {
    await expect(transcribeLesson({ studentAudio: STUDENT, tutorAudio: TUTOR })).rejects.toThrow(
      "No speech was detected in the recordings.",
    );
  });

  it("wraps Deepgram failures", async () => {
    dg.fail = new Error("401 Unauthorized");
    await expect(transcribeLesson({ studentAudio: STUDENT, tutorAudio: TUTOR })).rejects.toThrow(
      "Couldn't transcribe the audio: 401 Unauthorized",
    );
  });

  it("opts out of Deepgram's model-improvement program on every request", async () => {
    say(TUTOR, [0, "Hi."]);
    await transcribeLesson({ studentAudio: STUDENT, tutorAudio: TUTOR });
    expect(dg.calls).toHaveLength(2);
    for (const call of dg.calls) expect(call.options.mip_opt_out).toBe(true);
  });
});

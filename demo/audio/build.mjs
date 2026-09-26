// Stitches the per-line TTS clips into two time-aligned tracks, tutor.wav and
// student.wav: each speaker's lines where they fall, silence while the other
// talks — the same shape the recorder gets from a mic and a lesson tab.
import { readFileSync, writeFileSync, unlinkSync } from "node:fs";
const dir = new URL(".", import.meta.url);
const lines = JSON.parse(readFileSync(new URL("lesson.json", dir), "utf8"));
const RATE = 16000, GAP = Math.round(RATE * 0.6);

function pcm(file) {
  const b = readFileSync(file);
  let o = 12; // walk RIFF chunks to "data"
  while (b.toString("ascii", o, o + 4) !== "data") o += 8 + b.readUInt32LE(o + 4);
  return b.subarray(o + 8, o + 8 + b.readUInt32LE(o + 4));
}
const clips = lines.map((_, i) => pcm(new URL(`part-${String(i).padStart(2, "0")}.wav`, dir)));
const total = clips.reduce((n, c) => n + c.length / 2 + GAP, GAP);
const tracks = { tutor: Buffer.alloc(total * 2), student: Buffer.alloc(total * 2) };
let at = GAP;
lines.forEach(([who], i) => {
  clips[i].copy(tracks[who], at * 2);
  at += clips[i].length / 2 + GAP;
});
for (const [who, data] of Object.entries(tracks)) {
  const h = Buffer.alloc(44);
  h.write("RIFF", 0); h.writeUInt32LE(36 + data.length, 4); h.write("WAVE", 8);
  h.write("fmt ", 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22);
  h.writeUInt32LE(RATE, 24); h.writeUInt32LE(RATE * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34);
  h.write("data", 36); h.writeUInt32LE(data.length, 40);
  writeFileSync(new URL(`${who}.wav`, dir), Buffer.concat([h, data]));
}
clips.forEach((_, i) => unlinkSync(new URL(`part-${String(i).padStart(2, "0")}.wav`, dir)));
console.log(`tutor.wav + student.wav, ${(total / RATE).toFixed(1)}s`);

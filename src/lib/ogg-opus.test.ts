import { describe, expect, it } from "vitest";
import { muxOggOpus, oggCrc, opusPacketSamples48 } from "./ogg-opus";

type Page = { flags: number; granule: bigint; serial: number; seq: number; packets: Uint8Array[]; crcOk: boolean };

/** An independent reader: splits the file into pages and reassembles packets from the lacing. */
function readOgg(bytes: Uint8Array): Page[] {
  const pages: Page[] = [];
  let at = 0;
  while (at < bytes.length) {
    expect(String.fromCharCode(...bytes.subarray(at, at + 4))).toBe("OggS");
    const view = new DataView(bytes.buffer, bytes.byteOffset + at);
    const nseg = bytes[at + 26];
    const lacing = bytes.subarray(at + 27, at + 27 + nseg);
    const bodyLen = lacing.reduce((n, l) => n + l, 0);
    const len = 27 + nseg + bodyLen;

    const copy = bytes.slice(at, at + len);
    const stored = new DataView(copy.buffer).getUint32(22, true);
    new DataView(copy.buffer).setUint32(22, 0, true);

    const packets: Uint8Array[] = [];
    let p = at + 27 + nseg;
    let cur: number[] = [];
    for (const l of lacing) {
      cur.push(...bytes.subarray(p, p + l));
      p += l;
      if (l < 255) {
        packets.push(Uint8Array.from(cur));
        cur = [];
      }
    }
    pages.push({
      flags: bytes[at + 5],
      granule: view.getBigUint64(6, true),
      serial: view.getUint32(14, true),
      seq: view.getUint32(18, true),
      packets,
      crcOk: oggCrc(copy) === stored,
    });
    at += len;
  }
  return pages;
}

/** A 20 ms CELT packet (config 31: 960 samples at 48 kHz), padded to `size` bytes. */
const packet20ms = (size: number, fill = 7) => {
  const p = new Uint8Array(size).fill(fill);
  p[0] = 31 << 3;
  return p;
};

describe("oggCrc", () => {
  it("matches the CRC-32 Ogg uses (check value for '123456789')", () => {
    expect(oggCrc(Uint8Array.from("123456789", (c) => c.charCodeAt(0)))).toBe(0x89a1897f);
  });
});

describe("opusPacketSamples48", () => {
  it.each([
    ["CELT 20 ms", [31 << 3], 960],
    ["CELT 2.5 ms", [16 << 3], 120],
    ["SILK 60 ms", [3 << 3], 2880],
    ["hybrid 10 ms", [12 << 3], 480],
    ["two frames (code 1)", [(31 << 3) | 1], 1920],
    ["code 3 with 3 frames", [(31 << 3) | 3, 3], 2880],
    ["empty packet", [], 0],
  ])("%s", (_, bytes, samples) => {
    expect(opusPacketSamples48(Uint8Array.from(bytes))).toBe(samples);
  });
});

describe("muxOggOpus", () => {
  const mux = async (args: Parameters<typeof muxOggOpus>[0]) =>
    readOgg(new Uint8Array(await muxOggOpus(args).arrayBuffer()));

  it("writes header pages, then audio, with valid CRCs and sequence numbers", async () => {
    const packets = Array.from({ length: 10 }, (_, i) => packet20ms(80, i));
    const pages = await mux({ packets, preSkip: 312, inputRate: 16000, inputSamples: 3200 });

    expect(pages.every((p) => p.crcOk)).toBe(true);
    expect(pages.map((p) => p.seq)).toEqual(pages.map((_, i) => i));
    expect(new Set(pages.map((p) => p.serial)).size).toBe(1);

    expect(pages[0].flags).toBe(0x02); // BOS
    const head = pages[0].packets[0];
    expect(String.fromCharCode(...head.subarray(0, 8))).toBe("OpusHead");
    expect(new DataView(head.buffer).getUint16(10, true)).toBe(312); // pre-skip
    expect(new DataView(head.buffer).getUint32(12, true)).toBe(16000); // input rate
    expect(String.fromCharCode(...pages[1].packets[0].subarray(0, 8))).toBe("OpusTags");
    expect(pages.at(-1)!.flags & 0x04).toBe(0x04); // EOS

    expect(pages.slice(2).flatMap((p) => p.packets)).toEqual(packets);
  });

  it("sets the final granule from the input length, so padding is trimmed", async () => {
    // 10 packets decode to 9600 samples at 48 kHz, but only 3190 input samples at
    // 16 kHz (9570 at 48 kHz) were real audio.
    const packets = Array.from({ length: 10 }, () => packet20ms(80));
    const pages = await mux({ packets, preSkip: 312, inputRate: 16000, inputSamples: 3190 });
    expect(pages.at(-1)!.granule).toBe(BigInt(312 + 9570));
  });

  it("splits into pages under 255 segments, with running granules", async () => {
    // 600 packets of 300 bytes = 2 segments each, so at most 127 per page.
    const packets = Array.from({ length: 600 }, () => packet20ms(300));
    const pages = await mux({ packets, preSkip: 0, inputRate: 48000, inputSamples: 600 * 960 });
    const audio = pages.slice(2);

    expect(audio.length).toBeGreaterThan(4);
    expect(audio.every((p) => p.packets.length * 2 <= 255)).toBe(true);
    for (const p of audio.slice(0, -1)) {
      const packetsSoFar = audio.slice(0, audio.indexOf(p) + 1).reduce((n, q) => n + q.packets.length, 0);
      expect(p.granule).toBe(BigInt(packetsSoFar * 960));
    }
    expect(audio.flatMap((p) => p.packets)).toHaveLength(600);
  });

  it("laces packets whose length is an exact multiple of 255 with a terminating zero", async () => {
    const packets = [packet20ms(255), packet20ms(510), packet20ms(1)];
    const pages = await mux({ packets, preSkip: 0, inputRate: 48000, inputSamples: 3 * 960 });
    expect(pages.slice(2).flatMap((p) => p.packets).map((p) => p.length)).toEqual([255, 510, 1]);
  });

  it("produces a valid, empty stream for no packets", async () => {
    const pages = await mux({ packets: [], preSkip: 312, inputRate: 16000, inputSamples: 0 });
    expect(pages).toHaveLength(3);
    expect(pages[2].flags & 0x04).toBe(0x04);
    expect(pages.every((p) => p.crcOk)).toBe(true);
  });
});

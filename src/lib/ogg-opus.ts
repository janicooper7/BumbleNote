// A minimal Ogg Opus muxer (RFC 7845): wraps the raw Opus packets a WebCodecs
// AudioEncoder emits into a file Deepgram — or any Ogg demuxer — can read.
//
// WebCodecs encodes but doesn't containerize, and a muxer library would be a
// dependency for ~150 lines. It's pure (no browser APIs), so it is unit-tested
// on its own; the encoder that feeds it lives in lib/audio-trim.
//
// Timing is the part that matters here: stt.ts maps Deepgram's word timestamps
// back through the trim map, so the file must decode to exactly the samples that
// went in. Two header fields guarantee that: `preSkip` tells the decoder how many
// leading samples are encoder lookahead to discard, and the last page's granule
// position says where the real audio ends, trimming the final packet's padding.
// Granule positions are always in 48 kHz samples, whatever the input rate.

const OPUS_RATE = 48000;

/** Ogg's CRC-32: polynomial 0x04C11DB7, init 0, not reflected, no final xor. */
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let r = i << 24;
    for (let j = 0; j < 8; j++) r = r & 0x80000000 ? (r << 1) ^ 0x04c11db7 : r << 1;
    table[i] = r >>> 0;
  }
  return table;
})();

export function oggCrc(bytes: Uint8Array): number {
  let crc = 0;
  for (const b of bytes) crc = ((crc << 8) ^ CRC_TABLE[((crc >>> 24) ^ b) & 0xff]) >>> 0;
  return crc;
}

/** Samples (at 48 kHz) one Opus packet decodes to, read from its TOC byte (RFC 6716 §3.1). */
export function opusPacketSamples48(packet: Uint8Array): number {
  if (packet.length === 0) return 0;
  const toc = packet[0];
  const config = toc >> 3;
  // Frame size in 48 kHz samples: SILK-only, hybrid, CELT-only config ranges.
  const frame =
    config < 12
      ? [480, 960, 1920, 2880][config & 3]
      : config < 16
        ? [480, 960][config & 1]
        : [120, 240, 480, 960][config & 3];
  const code = toc & 3;
  const frames = code === 0 ? 1 : code === 3 ? (packet[1] ?? 0) & 0x3f : 2;
  return frame * frames;
}

/** The identification header (RFC 7845 §5.1), for a mono stream. */
export function opusHead(preSkip: number, inputRate: number): Uint8Array {
  const head = new Uint8Array(19);
  const view = new DataView(head.buffer);
  head.set(ascii("OpusHead"), 0);
  head[8] = 1; // version
  head[9] = 1; // channels
  view.setUint16(10, preSkip, true);
  view.setUint32(12, inputRate, true); // informational only
  view.setInt16(16, 0, true); // output gain
  head[18] = 0; // channel mapping family 0: mono/stereo, no table
  return head;
}

function opusTags(): Uint8Array {
  const vendor = ascii("BumbleNote");
  const tags = new Uint8Array(8 + 4 + vendor.length + 4);
  const view = new DataView(tags.buffer);
  tags.set(ascii("OpusTags"), 0);
  view.setUint32(8, vendor.length, true);
  tags.set(vendor, 12);
  view.setUint32(12 + vendor.length, 0, true); // no user comments
  return tags;
}

const BOS = 0x02;
const EOS = 0x04;

function page(
  packets: Uint8Array[],
  granule: bigint,
  serial: number,
  sequence: number,
  flags: number,
): Uint8Array {
  // Lacing: each packet is 255-byte segments plus a final one under 255 — a zero
  // if the length is an exact multiple, or the reader would run on into the next.
  const lacing: number[] = [];
  for (const p of packets) {
    let n = p.length;
    while (n >= 255) {
      lacing.push(255);
      n -= 255;
    }
    lacing.push(n);
  }
  const bodyLen = packets.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(27 + lacing.length + bodyLen);
  const view = new DataView(out.buffer);
  out.set(ascii("OggS"), 0);
  out[4] = 0; // version
  out[5] = flags;
  view.setBigUint64(6, granule, true);
  view.setUint32(14, serial, true);
  view.setUint32(18, sequence, true);
  // CRC at 22 stays zero while it's computed over the whole page.
  out[26] = lacing.length;
  out.set(lacing, 27);
  let at = 27 + lacing.length;
  for (const p of packets) {
    out.set(p, at);
    at += p.length;
  }
  view.setUint32(22, oggCrc(out), true);
  return out;
}

/**
 * Mux Opus packets into an Ogg Opus file.
 *
 * `inputSamples` is the number of samples actually fed to the encoder, at
 * `inputRate`; the final granule is set from it so the decoder trims the last
 * packet's padding and the output is exactly as long as the input.
 */
export function muxOggOpus(args: {
  packets: Uint8Array[];
  preSkip: number;
  inputRate: number;
  inputSamples: number;
  serial?: number;
}): Blob {
  const serial = args.serial ?? 0x424e4f50; // "BNOP"
  const pages: Uint8Array[] = [
    page([opusHead(args.preSkip, args.inputRate)], BigInt(0), serial, 0, BOS),
    page([opusTags()], BigInt(0), serial, 1, 0),
  ];

  const end = BigInt(args.preSkip) + BigInt(Math.round((args.inputSamples * OPUS_RATE) / args.inputRate));
  let granule = BigInt(args.preSkip);
  let batch: Uint8Array[] = [];
  let segments = 0;

  const flush = (last: boolean) => {
    if (batch.length === 0 && !last) return;
    // The last page's granule is the true end, which trims the final packet.
    pages.push(page(batch, last ? end : granule, serial, pages.length, last ? EOS : 0));
    batch = [];
    segments = 0;
  };

  for (const packet of args.packets) {
    const segs = Math.floor(packet.length / 255) + 1;
    if (segments + segs > 255) flush(false);
    batch.push(packet);
    segments += segs;
    granule += BigInt(opusPacketSamples48(packet));
  }
  flush(true);

  return new Blob(pages as BlobPart[], { type: "audio/ogg" });
}

function ascii(s: string): Uint8Array {
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
}

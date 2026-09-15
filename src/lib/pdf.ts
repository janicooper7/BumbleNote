// Renders a student-facing lesson-report PDF from a session, using pdf-lib
// (pure JS — no fonts to bundle, no native deps). Server-only; called from the
// "Confirm & send" Server Action and attached to the student's email.

import { PDFDocument, StandardFonts, rgb, type PDFFont } from "pdf-lib";
import type { Session, Student } from "./mock";

const A4: [number, number] = [595.28, 841.89];
const MARGIN = 48;
const HEADER_H = 132;

const C = {
  brand: rgb(0.992, 0.702, 0),
  brandDeep: rgb(0.604, 0.392, 0),
  ink: rgb(0.086, 0.137, 0.239),
  inkSoft: rgb(0.302, 0.365, 0.475),
  muted: rgb(0.549, 0.604, 0.69),
  mint: rgb(0.075, 0.494, 0.44),
  amber: rgb(0.667, 0.451, 0.075),
  soft: rgb(1, 0.957, 0.851),
  white: rgb(1, 1, 1),
  line: rgb(0.937, 0.902, 0.839),
};

type Fonts = { reg: PDFFont; bold: PDFFont; italic: PDFFont };

// The standard PDF fonts use WinAnsi encoding, which can't represent characters
// like the → arrow that AI/tutor text often contains. Map the common offenders
// and replace anything else outside WinAnsi with "?" so a stray emoji or symbol
// never crashes rendering.
const REPLACE: Record<string, string> = {
  "→": "->", "←": "<-", "↔": "<->", "⟶": "->", "⇒": "=>", "⟹": "=>",
  "≥": ">=", "≤": "<=", "×": "x", "…": "...", "\t": "  ",
  // Common English-teaching IPA → student-friendly forms (student-facing PDF;
  // the standard PDF fonts can't encode phonetic symbols).
  "θ": "th", "ð": "th", "ʃ": "sh", "ʒ": "zh", "ŋ": "ng",
  "æ": "a", "ə": "uh", "ɪ": "i", "ʊ": "u", "ɒ": "o", "ɔ": "aw", "ʌ": "u",
  "ɜ": "er", "ɑ": "ah", "ɡ": "g", "ʔ": "'", "ː": "", "ˈ": "'", "ˌ": "",
};
// Typographic code points WinAnsi *can* encode (dashes, curly quotes, bullet, …).
const WINANSI_EXTRA = new Set([
  0x20ac, 0x201a, 0x0192, 0x201e, 0x2026, 0x2020, 0x2021, 0x02c6, 0x2030, 0x0160,
  0x2039, 0x0152, 0x017d, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2013, 0x2014,
  0x02dc, 0x2122, 0x0161, 0x203a, 0x0153, 0x017e, 0x0178,
]);

function sanitize(input: string): string {
  // Affricate digraphs first (two code points → one friendly form).
  const s = input.replace(/tʃ/g, "ch").replace(/dʒ/g, "j");
  let out = "";
  for (const ch of s) {
    if (REPLACE[ch] !== undefined) {
      out += REPLACE[ch];
      continue;
    }
    const cp = ch.codePointAt(0)!;
    out += cp <= 0xff || WINANSI_EXTRA.has(cp) ? ch : "?";
  }
  return out;
}

/** Split text into lines that fit `maxWidth`, honouring explicit newlines. */
function wrap(raw: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const text = sanitize(raw);
  const out: string[] = [];
  for (const para of text.split("\n")) {
    const words = para.split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      out.push("");
      continue;
    }
    let line = "";
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) > maxWidth && line) {
        out.push(line);
        line = word;
      } else {
        line = candidate;
      }
    }
    if (line) out.push(line);
  }
  return out;
}

export function renderLessonReportPDF(
  session: Session,
  student: Student,
  opts: { tutorName: string },
): Promise<Uint8Array> {
  return build(session, student, opts);
}

async function build(
  session: Session,
  student: Student,
  opts: { tutorName: string },
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const fonts: Fonts = {
    reg: await doc.embedFont(StandardFonts.Helvetica),
    bold: await doc.embedFont(StandardFonts.HelveticaBold),
    italic: await doc.embedFont(StandardFonts.HelveticaOblique),
  };
  const [W, H] = A4;

  let page = doc.addPage(A4);
  let y = HEADER_H + 28; // vertical cursor measured from the top

  function newPage() {
    page = doc.addPage(A4);
    y = MARGIN;
  }
  function ensure(space: number) {
    if (H - y - space < MARGIN) newPage();
  }

  // Draw wrapped text starting at the cursor; advances y. Returns nothing.
  function text(
    str: string,
    o: { font?: PDFFont; size?: number; color?: ReturnType<typeof rgb>; x?: number; lineHeight?: number },
  ) {
    const font = o.font ?? fonts.reg;
    const size = o.size ?? 10.5;
    const color = o.color ?? C.ink;
    const x = o.x ?? MARGIN;
    const lh = o.lineHeight ?? size * 1.45;
    const maxW = W - MARGIN - x;
    for (const line of wrap(str, font, size, maxW)) {
      ensure(lh);
      page.drawText(line, { x, y: H - y - size, size, font, color });
      y += lh;
    }
  }

  function gap(px: number) {
    y += px;
  }

  function sectionLabel(label: string) {
    gap(10);
    ensure(20);
    text(label.toUpperCase(), { font: fonts.bold, size: 8.5, color: C.muted, lineHeight: 13 });
    gap(4);
  }

  function bullet(str: string, color = C.ink) {
    const size = 10.5;
    const lh = size * 1.45;
    ensure(lh);
    page.drawText("•", { x: MARGIN, y: H - y - size, size, font: fonts.bold, color: C.brandDeep });
    // Draw the wrapped body indented; reuse `text` with an x offset.
    text(str, { x: MARGIN + 16, size, color, lineHeight: lh });
  }

  // ---- Header band ----
  page.drawRectangle({ x: 0, y: H - HEADER_H, width: W, height: HEADER_H, color: C.ink });
  page.drawText("BUMBLENOTE", {
    x: MARGIN,
    y: H - 40,
    size: 10,
    font: fonts.bold,
    color: C.brand,
  });
  const topic = session.title.includes("·")
    ? session.title.split("·").slice(1).join("·").trim()
    : session.title;
  page.drawText(sanitize(topic), {
    x: MARGIN,
    y: H - 74,
    size: 22,
    font: fonts.bold,
    color: C.white,
  });
  page.drawText(sanitize(`${student.name}  ·  ${session.date}`), {
    x: MARGIN,
    y: H - 98,
    size: 11,
    font: fonts.reg,
    color: rgb(0.78, 0.85, 0.94),
  });

  // ---- Lesson snapshot ----
  sectionLabel("Lesson snapshot");
  text(
    `Speaking time: you ${session.talkTime.student}% / tutor ${session.talkTime.tutor}%`,
    { color: C.inkSoft, size: 10.5 },
  );

  // ---- Vocabulary ----
  if (session.vocab.length) {
    sectionLabel("New vocabulary");
    for (const v of session.vocab) {
      ensure(30);
      text(v.term, { font: fonts.bold, size: 11, color: C.ink, lineHeight: 15 });
      if (v.meaning) text(v.meaning, { size: 10, color: C.inkSoft, lineHeight: 14 });
      if (v.example) text(v.example, { font: fonts.italic, size: 10, color: C.muted, lineHeight: 14 });
      gap(6);
    }
  }

  // ---- Went well ----
  if (session.wentWell.length) {
    sectionLabel("What went well");
    for (const item of session.wentWell) bullet(item, C.mint);
  }

  // ---- Areas to improve ----
  if (session.focus.length) {
    sectionLabel("Areas to improve");
    for (const item of session.focus) bullet(item, C.amber);
  }

  // ---- Homework ----
  if (session.homework.trim()) {
    sectionLabel("Homework");
    text(session.homework, { size: 10.5, color: C.ink });
  }

  // ---- Additional note ----
  if (session.additionalInfo.trim()) {
    sectionLabel("A note from your tutor");
    text(session.additionalInfo, { size: 10.5, color: C.ink });
  }

  // ---- Footer on every page ----
  const pages = doc.getPages();
  for (const p of pages) {
    p.drawText(sanitize(`Prepared by ${opts.tutorName} with BumbleNote`), {
      x: MARGIN,
      y: 30,
      size: 8.5,
      font: fonts.reg,
      color: C.muted,
    });
  }

  return doc.save();
}

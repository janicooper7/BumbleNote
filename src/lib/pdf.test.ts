// The lesson-report PDF renders whatever a lesson throws at it: long text that
// runs over pages, empty sections, and characters the fonts can't draw.

import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { sessions, students } from "./mock";
import { renderLessonReportPDF } from "./pdf";

const session = sessions[0];
const student = students.find((s) => s.id === session.studentId)!;

async function pages(bytes: Uint8Array): Promise<number> {
  return (await PDFDocument.load(bytes)).getPageCount();
}

describe("renderLessonReportPDF", () => {
  it("renders a normal lesson", async () => {
    const pdf = await renderLessonReportPDF(session, student, { tutorName: "Millie Cooper" });
    expect(Buffer.from(pdf.slice(0, 5)).toString()).toBe("%PDF-");
    expect(await pages(pdf)).toBeGreaterThanOrEqual(1);
  });

  it("carries a long lesson over several pages", async () => {
    const long = {
      ...session,
      vocab: Array.from({ length: 30 }, (_, i) => ({ ...session.vocab[i % 4] })),
      focus: Array.from({ length: 25 }, () => session.focus[0]),
      homework: Array.from({ length: 40 }, () => session.homework).join("\n"),
    };
    const pdf = await renderLessonReportPDF(long, student, { tutorName: "Millie Cooper" });
    expect(await pages(pdf)).toBeGreaterThan(2);
  });

  it("copes with empty sections and characters the fonts lack", async () => {
    const odd = {
      ...session,
      title: "Lesson 1 · /θɪŋk/ 🎉 ⟶ 王",
      vocab: [{ term: "naïve ⟶ 🙂", meaning: "", example: "" }],
      wentWell: [],
      focus: [],
      homework: "",
      additionalInfo: "",
      talkTime: { tutor: 100, student: 0 },
    };
    const pdf = await renderLessonReportPDF(odd, { ...student, name: "Ольга" }, { tutorName: "" });
    expect(await pages(pdf)).toBe(1);
  });
});

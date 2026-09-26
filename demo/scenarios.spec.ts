// One take per how-to guide (src/lib/guides.ts), named by the guide's slug.
// Each opens on its first frame, waits for you to start recording (see
// Director.action), plays at a watchable pace, then holds the last frame.
//
//   npm run demo -- -g "combine-lessons"        run one take
//
// Data each take expects:
//   sign-in, add-a-student       an empty account     (npm run demo:seed)
//   everything else              the sample account   (DEMO_SAMPLE=1 npm run demo:seed)
//
// record-a-lesson uploads real audio, which needs Netlify Blobs — run it
// against the live site (DEMO_BASE_URL=https://bumblenote.com) or
// `netlify dev`, not plain `next dev`. It creates a real lesson.

import { readFileSync } from "node:fs";
import { test as base, type Page } from "@playwright/test";
import { CURSOR_SCRIPT, Director, fakeLesson } from "./director";
import { DEMO_EMAIL, DEMO_PASSWORD } from "./seed";

const test = base.extend<{ d: Director }>({
  d: async ({ page }, provide) => {
    await page.addInitScript(CURSOR_SCRIPT);
    await provide(new Director(page));
  },
});

const STUDENT = {
  name: process.env.DEMO_STUDENT ?? "Maria Silva",
  // example.com is reserved and can never belong to a real person.
  email: process.env.DEMO_STUDENT_EMAIL ?? "maria.silva@example.com",
};

/** Length of demo/audio's lesson, plus a beat, so Stop lands after the last line. */
const LESSON_SEC = 102;

const button = (page: Page, name: string | RegExp) =>
  page.getByRole("button", { name, exact: typeof name === "string" });
const navLink = (page: Page, label: string) => page.getByRole("link", { name: label, exact: true }).first();
const lessonLink = (page: Page, id: string) => page.locator(`a[href="/dashboard/sessions/${id}"]`).first();
const studentLink = (page: Page, id: string) => page.locator(`a[href="/dashboard/students/${id}"]`).first();

async function settle(page: Page) {
  await page.waitForLoadState("networkidle");
}

/** Opens the recorder and picks the student; the fake lesson starts playing. */
async function startRecording(page: Page, d: Director) {
  await d.click(button(page, /Record a lesson/));
  await d.beat(900);
  const search = page.getByPlaceholder("Search students…");
  if (await search.isVisible()) await d.type(search, STUDENT.name.split(" ")[0], { clear: false });
  await d.click(page.getByRole("button", { name: new RegExp(STUDENT.name) }).first());
  await button(page, /Stop & file lesson/).waitFor();
}

/** Waits for the draft to open after Stop, then shows it. */
async function landOnDraft(page: Page, d: Director) {
  await page.waitForURL("**/dashboard/sessions/**", { timeout: 5 * 60_000 });
  await settle(page);
  await d.beat(2000);
  await d.scroll(450);
  await d.beat(1500);
  await d.scroll(450);
  await d.beat(1500);
}

// ── empty account ──────────────────────────────────────────────────────────

test.describe("sign-in", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("sign-in", async ({ page, d }) => {
    // Signed out, but keep the site-gate cookie so the take starts on /login.
    const { cookies } = JSON.parse(readFileSync("demo/.auth/state.json", "utf8"));
    await page.context().addCookies(cookies.filter((c: { name: string }) => c.name === "bn_gate"));

    await d.open("/login");
    await d.action("Sign in");
    await d.type(page.locator('input[name="email"]'), DEMO_EMAIL);
    await d.type(page.locator('input[name="password"]'), DEMO_PASSWORD);
    await d.click(page.locator('form:has(input[name="password"]) button[type="submit"]'));
    await page.waitForURL(/\/dashboard/);
    await settle(page);
    await d.cut();
  });
});

test("add-a-student", async ({ page, d }) => {
  await d.open("/dashboard");
  await d.action("Add a student");

  await d.click(navLink(page, "Students"));
  await page.waitForURL("**/dashboard/students");
  await settle(page);
  await d.beat(800);
  await d.click(page.getByRole("link", { name: "+ Add student" }));
  await page.waitForURL("**/students/new");
  await settle(page);
  await d.beat(800);

  await d.type(page.locator('input[name="name"]'), STUDENT.name);
  await d.type(page.locator('input[name="email"]'), STUDENT.email);
  await d.type(page.locator('input[name="native"]'), "Portuguese");
  const selects = page.locator("select");
  await d.choose(selects.nth(0), "B1");
  await d.choose(selects.nth(1), "Business English");
  await d.type(page.locator('input[name="interests"]'), "cycling, podcasts, cooking");
  await d.type(page.locator('input[name="focus"]'), "articles, pronunciation");
  await d.type(
    page.getByPlaceholder(/Anything from past lessons/),
    "Project manager in Lisbon. Wants to sound confident in client meetings.",
  );
  await d.type(page.locator('input[name="hourlyRate"]'), "30");

  await d.click(button(page, "Add student"));
  // Ends on the "… is ready to go" confirmation, not the profile.
  await page.getByText(/is ready to go/).waitFor();
  await d.cut(3000);
});

// ── sample account ─────────────────────────────────────────────────────────

test("record-a-lesson", async ({ page, d }) => {
  await fakeLesson(page);
  await d.open("/dashboard");
  await d.action("Record a lesson (~2.5 min: the lesson plays in real time)");

  await startRecording(page, d);
  // The lesson plays out; drift over the timer and the warning now and then.
  await d.hover(page.getByText(/Don.t close this tab/).first(), 3000);
  await page.waitForTimeout(LESSON_SEC * 1000 - 9000);
  await d.click(button(page, /Stop & file lesson/));
  await page.getByText(/Transcribing & drafting/).waitFor();
  await landOnDraft(page, d);
  await d.cut();
});

test("review-lesson-notes", async ({ page, d }) => {
  await d.open("/dashboard");
  await d.action("Review and edit lesson notes");

  await d.hover(page.getByText("Drafts to review"), 900);
  await d.click(lessonLink(page, "demo-maria-14"));
  await page.waitForURL("**/sessions/demo-maria-14");
  await settle(page);
  await d.beat(1500);

  // Read down the draft.
  await d.scroll(350);
  await d.hover(page.locator('input[value="leeway"]'), 1500);
  await d.scroll(300);

  // Add a point the AI missed.
  await d.click(button(page, "+ Add").first());
  await d.type(
    page.getByPlaceholder("Something they did well…").last(),
    "Much clearer /θ/ in \"three\" and \"think\" than last week",
    { clear: false },
  );

  // Tweak the homework.
  const homework = page.getByPlaceholder("Suggest a task to practise before next lesson…");
  await d.click(homework);
  await page.keyboard.press("Control+End");
  await homework.pressSequentially(" Aim for 6–8 sentences.", { delay: 45 });
  await d.beat(800);

  await d.scroll(400);
  await d.beat(1200);
  await d.click(button(page, "Save draft"));
  await d.beat(1500);
  await d.click(button(page, "Confirm lesson"));
  await button(page, "Confirmed ✓").waitFor();
  await d.hover(button(page, "Send to student →"), 1800);
  await d.cut(2500);
});

test("combine-lessons", async ({ page, d }) => {
  await d.open("/dashboard");
  await d.action("Combine lessons");

  await d.click(button(page, /Combine lessons/));
  await d.beat(900);
  const search = page.getByPlaceholder("Search students…");
  if (await search.isVisible()) await d.type(search, "Kenji", { clear: false });
  await d.click(page.getByRole("button", { name: /Kenji Tanaka/ }).first());
  // Scoped to the dialog's checkboxes: the titles also sit on the page behind.
  const part = (n: number) => page.locator("label").filter({ hasText: `Travel stories (part ${n})` });
  await part(1).waitFor();
  await d.beat(1000);
  await d.click(part(1));
  await d.click(part(2));
  await d.hover(page.getByText(/min combined/), 1800);
  await d.click(button(page, "Combine 2 lessons"));
  await landOnDraft(page, d);
  await d.cut();
});

test("track-student-progress", async ({ page, d }) => {
  await d.open("/dashboard");
  await d.action("Track a student's progress");

  await d.click(navLink(page, "Students"));
  await page.waitForURL("**/dashboard/students");
  await settle(page);
  await d.beat(800);
  await d.click(studentLink(page, "demo-sofia"));
  await page.waitForURL("**/students/demo-sofia");
  await settle(page);
  await d.beat(1800);

  await d.reveal(page.getByText(/Where to take Sofia next/i));
  await d.beat(2200);
  await d.reveal(page.getByText(/The journey so far/i));
  await d.beat(2200);
  await d.scroll(400);
  await d.beat(1500);
  await d.reveal(page.getByText(/Lesson history/i));
  await d.beat(1200);
  await d.hover(lessonLink(page, "demo-sofia-22"), 900);
  await d.scrollToBottom();
  await d.beat(1500);
  await d.scrollToTop();
  await d.cut();
});

test("manage-your-plan", async ({ page, d }) => {
  await d.open("/dashboard");
  await d.action("Manage your plan");

  await d.click(navLink(page, "Settings"));
  await page.waitForURL("**/dashboard/settings");
  await settle(page);
  await d.beat(1200);

  await d.reveal(page.getByText("Plan & usage"));
  await d.beat(2000);
  await d.reveal(page.getByText("Change plan"));
  await d.beat(800);

  // Upgrade: open it, read what happens, back out.
  await d.click(button(page, "Upgrade"));
  await d.beat(3500);
  await d.click(button(page, "Cancel").first());

  // Downgrade.
  await d.click(button(page, "Downgrade"));
  await d.beat(3000);
  await d.click(button(page, "Cancel").first());

  // Pause.
  await d.click(button(page, "Pause next month"));
  await d.beat(3500);
  await d.click(button(page, "Cancel").first());

  await d.hover(page.getByRole("link", { name: /Manage billing/ }), 1800);
  await d.cut();
});

test("edit-your-profile", async ({ page, d }) => {
  await d.open("/dashboard");
  await d.action("Edit your profile");

  await d.click(navLink(page, "Settings"));
  await page.waitForURL("**/dashboard/settings");
  await settle(page);
  await d.beat(1200);

  await d.click(button(page, /Edit profile/));
  await d.beat(800);
  await d.type(page.locator("#tutor-name"), "Alex Morgan · English tutor");
  await d.click(button(page, "Save"));
  await page.getByText("Saved ✓").waitFor();
  await d.beat(1500);
  await d.hover(page.getByText(/Students see this/), 2500);
  await d.cut();
});

// Launch-sequence emails 2–5: the right people get each one, once, at the right
// time. Run against real Postgres (PGlite), since who's due is the SQL itself.

import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@neondatabase/serverless", () => import("@/test/pglite-neon"));

type Msg = { to: string; subject: string; html: string; text: string };
const resend = vi.hoisted(() => ({
  sent: [] as Msg[],
  fail: false,
  /** Addresses Resend refuses individually (permissive batch validation). */
  refuse: new Set<string>(),
}));
vi.mock("resend", () => ({
  Resend: class {
    batch = {
      send: async (msgs: Msg[]) => {
        if (resend.fail) return { data: null, error: { message: "boom" } };
        const errors: { index: number; message: string }[] = [];
        msgs.forEach((m, index) => {
          if (resend.refuse.has(m.to)) errors.push({ index, message: "invalid" });
          else resend.sent.push(m);
        });
        return { data: { data: msgs.map(() => ({ id: "x" })), errors }, error: null };
      },
    };
  },
}));

import { migrate, pg } from "@/test/pglite-neon";
import {
  BENEFITS_AT,
  LAUNCH_AT,
  optOutTutor,
  runLifecycleEmails,
  sendAccountWelcome,
  sendLaunchLive,
} from "./lifecycle-emails";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const subjects = () => resend.sent.map((m) => `${m.subject} -> ${m.to}`).sort();
const at = (d: Date, mins: number) => new Date(d.getTime() + mins * 60_000);
const kinds = (outcomes: Awaited<ReturnType<typeof runLifecycleEmails>>) =>
  Object.fromEntries(outcomes.map((o) => [o.kind, o.sent]));

/** A tutor whose trial ran out `minsAgo` minutes ago (their 2nd counted lesson). */
async function trialUsedUp(id: string, email: string, minsAgo: number, plan = "free") {
  await pg.exec(`
    insert into tutors (id, email, name, first_name, plan, lessons_created, welcome_sent_at)
    values ('${id}', '${email}', 'Anna Smith', 'Anna', '${plan}', 2, now());
    insert into students (id, tutor_id, name, initial, level, goal, native, last_seen)
    values ('st-${id}', '${id}', 'S', 'S', 'B1', 'g', 'es', 'today');
    insert into sessions (id, tutor_id, student_id, student_name, student_initial, title, date, iso_date,
      duration_min, level_from, level_to, observed_level, talk_time, created_at)
    values ('l1-${id}', '${id}', 'st-${id}', 'S', 'S', 't', 'd', '2026-10-05', 45, 'B1', 'B2', 'B1',
      '{"tutor":50,"student":50}', now() - interval '3 hours'),
      ('l2-${id}', '${id}', 'st-${id}', 'S', 'S', 't', 'd', '2026-10-05', 45, 'B1', 'B2', 'B1',
      '{"tutor":50,"student":50}', now() - interval '${minsAgo} minutes');`);
}

beforeAll(async () => {
  process.env.RESEND_API_KEY = "test";
  await migrate();
});

beforeEach(async () => {
  resend.sent = [];
  resend.fail = false;
  resend.refuse = new Set();
  await pg.exec("delete from waitlist; delete from sessions; delete from students; delete from tutors;");
});

describe("waitlist emails", () => {
  beforeEach(async () => {
    await pg.query(`insert into waitlist (id, email) values ('${A}', 'a@x.io'), ('${B}', 'b@x.io')`);
  });

  it("sends nothing to the waitlist before launch", async () => {
    await runLifecycleEmails(at(LAUNCH_AT, -5));
    expect(resend.sent).toHaveLength(0);
  });

  it("sends 'we're live' at launch, once, with each address's own unsubscribe link", async () => {
    expect(kinds(await runLifecycleEmails(LAUNCH_AT))["launch-live"]).toBe(2);
    await runLifecycleEmails(at(LAUNCH_AT, 5));
    expect(subjects()).toEqual(["BumbleNote is LIVE! -> a@x.io", "BumbleNote is LIVE! -> b@x.io"]);
    const toA = resend.sent.find((m) => m.to === "a@x.io")!;
    expect(toA.text).toContain(`unsubscribe?id=${A}`);
    expect(toA.text).toContain("/signup");
  });

  it("catches someone who joins the waitlist later on launch morning", async () => {
    await runLifecycleEmails(LAUNCH_AT);
    await pg.query(`insert into waitlist (email) values ('late@x.io')`);
    await runLifecycleEmails(at(LAUNCH_AT, 30));
    expect(resend.sent.map((m) => m.to)).toContain("late@x.io");
  });

  it("stops sending 'we're live' a day after launch", async () => {
    await runLifecycleEmails(at(LAUNCH_AT, 25 * 60));
    expect(resend.sent).toHaveLength(0);
  });

  it("can't double-send when two runs overlap", async () => {
    await Promise.all([sendLaunchLive(), sendLaunchLive()]);
    expect(resend.sent).toHaveLength(2);
  });

  it("releases the claims when Resend is down, so the next run retries", async () => {
    resend.fail = true;
    const [live] = (await runLifecycleEmails(LAUNCH_AT)).filter((o) => o.kind === "launch-live");
    expect(live.failed).toBe("Couldn't send the email: boom");
    resend.fail = false;
    await runLifecycleEmails(at(LAUNCH_AT, 5));
    expect(resend.sent).toHaveLength(2);
  });

  it("reports an address Resend refuses and doesn't retry it", async () => {
    resend.refuse.add("b@x.io");
    const [live] = (await runLifecycleEmails(LAUNCH_AT)).filter((o) => o.kind === "launch-live");
    expect(live.sent).toBe(1);
    expect(live.rejected).toEqual(["b@x.io: invalid"]);
    resend.refuse.clear();
    await runLifecycleEmails(at(LAUNCH_AT, 5));
    expect(resend.sent).toHaveLength(1);
  });

  it("sends the benefits email on the 9th only to addresses with no account", async () => {
    await pg.query(`insert into tutors (email, name, welcome_sent_at) values ('B@x.io', 'B', now())`);
    await runLifecycleEmails(BENEFITS_AT);
    expect(subjects()).toEqual(["What happens after your lesson ends -> a@x.io"]);
  });
});

describe("account welcome", () => {
  it("sends once per account, greeting them by first name", async () => {
    await pg.query(`insert into tutors (id, email, name, first_name) values ('${A}', 'a@x.io', 'Anna Smith', 'Anna')`);
    await Promise.all([sendAccountWelcome(A), sendAccountWelcome(A)]);
    await runLifecycleEmails();
    expect(subjects()).toEqual(["Welcome to BumbleNote -> a@x.io"]);
    expect(resend.sent[0].text).toMatch(/^Hey Anna,/);
    expect(resend.sent[0].text).toContain("/dashboard/guides/add-a-student");
  });

  it("uses a Google account's name, and falls back to busy-bee", async () => {
    await pg.query(`insert into tutors (email, name) values ('g@x.io', 'Grace Hopper'), ('n@x.io', 'n@x.io')`);
    await runLifecycleEmails();
    const greet = Object.fromEntries(resend.sent.map((m) => [m.to, m.text.split("\n")[0]]));
    expect(greet).toEqual({ "g@x.io": "Hey Grace,", "n@x.io": "Hey busy-bee," });
  });

  it("leaves accounts the sweep missed for more than two days alone", async () => {
    await pg.query(`insert into tutors (email, name, created_at) values ('old@x.io', 'Old', now() - interval '3 days')`);
    await runLifecycleEmails();
    expect(resend.sent).toHaveLength(0);
  });
});

describe("trial finished", () => {
  it("waits an hour after the second lesson, then sends once with an unsubscribe link", async () => {
    await trialUsedUp(A, "a@x.io", 30);
    await runLifecycleEmails();
    expect(resend.sent).toHaveLength(0);

    await pg.query(`update sessions set created_at = now() - interval '61 minutes' where id = 'l2-${A}'`);
    await runLifecycleEmails();
    await runLifecycleEmails();
    expect(subjects()).toEqual(["Your two free lessons are done -> a@x.io"]);
    const [{ t }] = (await pg.query<{ t: string }>(`select email_token t from tutors where id = '${A}'`)).rows;
    expect(resend.sent[0].text).toContain(`/api/email/unsubscribe?token=${t}`);
    expect(resend.sent[0].text).toContain("$15.99/mo");
  });

  it("skips tutors who subscribed, or unsubscribed", async () => {
    await trialUsedUp(A, "a@x.io", 90, "starter");
    await trialUsedUp(B, "b@x.io", 90);
    const [{ t }] = (await pg.query<{ t: string }>(`select email_token t from tutors where id = '${B}'`)).rows;
    await optOutTutor(t);
    await runLifecycleEmails();
    expect(resend.sent).toHaveLength(0);
  });

  it("skips tutors with a trial lesson left", async () => {
    await trialUsedUp(A, "a@x.io", 90);
    await pg.query(`update tutors set lessons_created = 1 where id = '${A}'`);
    await runLifecycleEmails();
    expect(resend.sent).toHaveLength(0);
  });
});

// The waitlist welcome email goes out once per address, whoever sends it, and a
// failed send leaves the row free for the next attempt. Run against real
// Postgres (PGlite), since the claim is the SQL itself.

import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@neondatabase/serverless", () => import("@/test/pglite-neon"));

const resend = vi.hoisted(() => ({ sent: [] as { to: string; html: string }[], fail: false }));
vi.mock("resend", () => ({
  Resend: class {
    emails = {
      send: async (msg: { to: string; html: string }) => {
        if (resend.fail) return { error: { message: "boom" } };
        resend.sent.push(msg);
        return { data: { id: "x" }, error: null };
      },
    };
  },
}));

import { migrate, pg } from "@/test/pglite-neon";
import { removeFromWaitlist, sendWaitlistWelcome, unsubscribeUrl } from "./waitlist-welcome";

const ID = "22222222-2222-4222-8222-222222222222";

const sentAt = async () =>
  (await pg.query<{ s: Date | null }>(`select welcome_sent_at s from waitlist where id = '${ID}'`)).rows[0]?.s;

beforeAll(async () => {
  process.env.RESEND_API_KEY = "test";
  await migrate();
});

beforeEach(async () => {
  resend.sent = [];
  resend.fail = false;
  await pg.query("delete from waitlist");
  await pg.query(`insert into waitlist (id, email) values ('${ID}', 'tutor@example.com')`);
});

describe("sendWaitlistWelcome", () => {
  it("sends once, even when two senders race for the same row", async () => {
    const results = await Promise.all([sendWaitlistWelcome(ID), sendWaitlistWelcome(ID)]);
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(resend.sent).toHaveLength(1);
    expect(resend.sent[0].to).toBe("tutor@example.com");
    expect(resend.sent[0].html).toContain(unsubscribeUrl(ID).replace(/&/g, "&amp;"));
    expect(await sentAt()).toBeInstanceOf(Date);

    expect(await sendWaitlistWelcome(ID)).toBe(false);
    expect(resend.sent).toHaveLength(1);
  });

  it("releases the row when the send fails, so a retry sends it", async () => {
    resend.fail = true;
    await expect(sendWaitlistWelcome(ID)).rejects.toThrow();
    expect(await sentAt()).toBeNull();

    resend.fail = false;
    expect(await sendWaitlistWelcome(ID)).toBe(true);
    expect(resend.sent).toHaveLength(1);
  });

  it("unsubscribing deletes the address", async () => {
    await removeFromWaitlist(ID);
    expect((await pg.query("select 1 from waitlist")).rows).toHaveLength(0);
  });
});

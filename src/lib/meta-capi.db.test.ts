// Conversions API: each event goes once, only for tutors who accepted marketing
// cookies, with identifiers hashed; and a Meta failure never throws. Run against
// real Postgres (PGlite), since the once-only guard is the meta_events key.

import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@neondatabase/serverless", () => import("@/test/pglite-neon"));

import { migrate, pg } from "@/test/pglite-neon";
import { hashForMeta, trackActivation, trackConversion, trackVisitorConversion } from "./meta-capi";

const A = "11111111-1111-4111-8111-111111111111";

type Call = { url: string; body: { data: Record<string, unknown>[]; test_event_code?: string } };
let calls: Call[] = [];
let respond: () => Response = () => new Response("{}", { status: 200 });

beforeAll(async () => {
  await migrate();
});

beforeEach(async () => {
  calls = [];
  respond = () => new Response("{}", { status: 200 });
  vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
    calls.push({ url, body: JSON.parse(String(init.body)) });
    return respond();
  });
  process.env.META_PIXEL_ID = "123";
  process.env.META_CAPI_ACCESS_TOKEN = "tok";
  delete process.env.META_TEST_EVENT_CODE;
  await pg.exec("delete from meta_events; delete from tutors;");
  await pg.query(`insert into tutors (id, email, name, ad_consent, meta_fbp, meta_fbc, meta_client_ip, meta_client_ua, signup_country)
    values ('${A}', ' Anna@Example.com ', 'Anna', true, 'fb.1.1.111', 'fb.1.2.IwAR', '203.0.113.9', 'Mozilla/5.0', 'GB')`);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const subscribe = () =>
  trackConversion({
    eventId: "subscribe-sub_1",
    eventName: "Subscribe",
    tutorId: A,
    value: 15.99,
    currency: "USD",
    eventSourceUrl: "https://bumblenote.com/dashboard/billing/success",
  });

describe("trackConversion", () => {
  it("sends one event with hashed email, Meta's cookies, value and currency", async () => {
    expect(await subscribe()).toEqual({ status: "sent" });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://graph.facebook.com/v26.0/123/events");
    const [e] = calls[0].body.data;
    expect(e).toMatchObject({
      event_name: "Subscribe",
      event_id: "subscribe-sub_1",
      action_source: "website",
      custom_data: { value: 15.99, currency: "USD" },
      user_data: {
        em: [hashForMeta("anna@example.com")],
        external_id: [hashForMeta(A)],
        country: [hashForMeta("gb")],
        client_ip_address: "203.0.113.9",
        client_user_agent: "Mozilla/5.0",
        fbp: "fb.1.1.111",
        fbc: "fb.1.2.IwAR",
      },
    });
    expect(JSON.stringify(e)).not.toContain("anna@example.com");
  });

  it("sends a retried event once (a Stripe webhook retry)", async () => {
    await subscribe();
    expect(await subscribe()).toEqual({ status: "duplicate" });
    expect(calls).toHaveLength(1);
  });

  it("sends nothing for a tutor who didn't accept marketing cookies, and records why", async () => {
    await pg.query(`update tutors set ad_consent = false`);
    expect(await subscribe()).toEqual({ status: "skipped", reason: "no marketing consent" });
    await pg.query(`update tutors set ad_consent = null`);
    expect(await trackActivation(A)).toMatchObject({ status: "skipped" });
    expect(calls).toHaveLength(0);
    const { rows } = await pg.query<{ status: string }>(`select status from meta_events order by event_id`);
    expect(rows.map((r) => r.status)).toEqual(["skipped", "skipped"]);
  });

  it("passes the test event code through", async () => {
    process.env.META_TEST_EVENT_CODE = "TEST123";
    await subscribe();
    expect(calls[0].body.test_event_code).toBe("TEST123");
  });

  it("never throws when Meta fails, and records the failure", async () => {
    respond = () => new Response("bad token", { status: 400 });
    expect(await subscribe()).toMatchObject({ status: "failed" });
    vi.stubGlobal("fetch", async () => {
      throw new Error("network down");
    });
    expect(await trackActivation(A)).toMatchObject({ status: "failed", error: "network down" });
    const { rows } = await pg.query<{ status: string }>(`select status from meta_events`);
    expect(rows.every((r) => r.status === "failed")).toBe(true);
  });

  it("skips quietly when Meta isn't configured", async () => {
    delete process.env.META_CAPI_ACCESS_TOKEN;
    expect(await subscribe()).toEqual({ status: "skipped", reason: "Meta not configured" });
    expect(calls).toHaveLength(0);
  });

  it("sends ActivatedTrial once per tutor, however many lessons follow", async () => {
    await trackActivation(A);
    await trackActivation(A);
    expect(calls.map((c) => c.body.data[0].event_name)).toEqual(["ActivatedTrial"]);
  });

  it("sends a waitlist Lead once, only with consent, with no tutor attached", async () => {
    const lead = (consented: boolean, id = "lead-w1") =>
      trackVisitorConversion({
        eventId: id,
        eventName: "Lead",
        consented,
        user: { email: "new@x.io", ip: "203.0.113.1", userAgent: "UA", fbp: "fb.1.1.1" },
        eventSourceUrl: "https://bumblenote.com/enter",
      });
    expect(await lead(true)).toEqual({ status: "sent" });
    expect(await lead(true)).toEqual({ status: "duplicate" });
    expect(await lead(false, "lead-w2")).toEqual({ status: "skipped", reason: "no marketing consent" });
    expect(calls).toHaveLength(1);
    expect(calls[0].body.data[0]).toMatchObject({ event_name: "Lead", user_data: { em: [hashForMeta("new@x.io")] } });
    const { rows } = await pg.query<{ tutor_id: string | null }>(`select tutor_id from meta_events where event_id = 'lead-w1'`);
    expect(rows[0].tutor_id).toBeNull();
  });
});

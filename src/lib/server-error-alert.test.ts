import { beforeEach, describe, expect, it, vi } from "vitest";

const sent = vi.hoisted(() => [] as Array<Record<string, unknown>>);
vi.mock("@/lib/alerts", () => ({
  alertOperator: async (args: Record<string, unknown>) => {
    sent.push(args);
  },
}));

import { alertServerError, describeError, fingerprintFor } from "./server-error-alert";

/** The shape Drizzle throws for a failed query: SQL + params, driver error as cause. */
function drizzleError(params: string[]): Error {
  const cause = Object.assign(new Error('duplicate key value violates unique constraint "sessions_pkey"'), {
    code: "23505",
  });
  return Object.assign(
    new Error(`Failed query: insert into "students" ("name", "email") values ($1, $2)\nparams: ${params.join(",")}`),
    { name: "DrizzleQueryError", cause },
  );
}

const ctx = { routePath: "/api/upload/complete", routeType: "route" };
const req = { path: "/api/upload/complete?uploadId=abc&email=x@y.com", method: "POST" };

beforeEach(() => {
  sent.length = 0;
});

describe("describeError", () => {
  it("keeps the SQL and the driver's reason, drops the bound parameters", () => {
    const d = describeError(drizzleError(["Maria Lopez", "maria@example.com"]));
    expect(d.name).toBe("DrizzleQueryError");
    expect(d.message).toContain('insert into "students"');
    expect(d.cause).toBe('[23505] duplicate key value violates unique constraint "sessions_pkey"');
    const all = JSON.stringify(d);
    expect(all).not.toContain("Maria");
    expect(all).not.toContain("maria@example.com");
  });

  it("cuts inline params and redacts email addresses in any message", () => {
    const d = describeError(new Error("lookup failed for tutor jo.smith+x@mail.co.uk params: secret"));
    expect(d.message).toBe("lookup failed for tutor [email]");
  });

  it("handles non-Error throws", () => {
    expect(describeError("boom")).toEqual({ name: "NonError", message: "boom" });
  });
});

describe("fingerprintFor", () => {
  it("is the same for one problem hit with different ids", () => {
    const a = fingerprintFor(new Error("Student 123 not found in 'maria-2'"), ctx);
    const b = fingerprintFor(new Error("Student 98765 not found in 'john-7'"), ctx);
    expect(a).toBe(b);
  });

  it("differs by route and by error", () => {
    const base = fingerprintFor(new Error("x"), ctx);
    expect(fingerprintFor(new Error("x"), { ...ctx, routePath: "/api/capture" })).not.toBe(base);
    expect(fingerprintFor(new Error("y"), ctx)).not.toBe(base);
  });
});

describe("alertServerError", () => {
  it("emails a scrubbed report without the query string", async () => {
    await alertServerError(drizzleError(["Maria", "maria@example.com"]), req, ctx);
    expect(sent).toHaveLength(1);
    const fields = sent[0].fields as Record<string, string>;
    expect(fields.Request).toBe("POST /api/upload/complete");
    expect(fields.Kind).toBe("route");
    expect(JSON.stringify(sent[0])).not.toMatch(/maria|uploadId|x@y\.com/i);
  });

  it.each(["NEXT_REDIRECT;replace;/login;307;", "NEXT_HTTP_ERROR_FALLBACK;404", "DYNAMIC_SERVER_USAGE"])(
    "ignores Next's control-flow signal %s",
    async (digest) => {
      await alertServerError(Object.assign(new Error("x"), { digest }), req, ctx);
      expect(sent).toHaveLength(0);
    },
  );

  it("passes a render error's digest through, so it can be found in the logs", async () => {
    await alertServerError(Object.assign(new Error("render broke"), { digest: "2338214467" }), req, {
      routePath: "/dashboard/sessions/[id]",
      routeType: "render",
    });
    expect((sent[0].fields as Record<string, string>).Digest).toBe("2338214467");
  });
});

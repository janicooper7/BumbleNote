// A password signup proves nothing about the address, so a Google sign-in into
// such a row must take the account back from whoever set that password. Run
// against real Postgres (PGlite), since the claim is the SQL itself.

import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@neondatabase/serverless", () => import("@/test/pglite-neon"));

import { migrate, pg } from "@/test/pglite-neon";
import { sessionVersionOf, tutorForSignIn } from "./session-identity";

const EMAIL = "tutor@example.com";

type Row = { id: string; password_hash: string | null; email_verified_at: Date | null; session_version: number };
const row = async () =>
  (await pg.query<Row>(`select id, password_hash, email_verified_at, session_version from tutors where email = '${EMAIL}'`))
    .rows[0];

const passwordSignup = () =>
  pg.query(`insert into tutors (email, name, password_hash) values ('${EMAIL}', 'Someone', 'scrypt$x')`);

beforeAll(async () => {
  await migrate();
});

beforeEach(async () => {
  await pg.query("delete from tutors");
});

describe("tutorForSignIn", () => {
  it("creates a Google tutor as already verified", async () => {
    const t = await tutorForSignIn(EMAIL, "Tutor", true);
    expect(t.sessionVersion).toBe(0);
    const r = await row();
    expect(r.id).toBe(t.id);
    expect(r.email_verified_at).toBeInstanceOf(Date);
  });

  it("leaves a password sign-in untouched", async () => {
    await passwordSignup();
    await tutorForSignIn(EMAIL, "Someone", false);
    const r = await row();
    expect(r.password_hash).toBe("scrypt$x");
    expect(r.email_verified_at).toBeNull();
    expect(r.session_version).toBe(0);
  });

  it("drops an unproven password and ends its sessions when Google signs in", async () => {
    await passwordSignup();
    const before = await row();

    const t = await tutorForSignIn(EMAIL, "Tutor", true);

    const r = await row();
    expect(t.id).toBe(before.id);
    expect(r.password_hash).toBeNull();
    expect(r.email_verified_at).toBeInstanceOf(Date);
    // A session minted at version 0 by the password holder no longer matches.
    expect(t.sessionVersion).toBe(1);
    expect(await sessionVersionOf(before.id)).toBe(1);
  });

  it("keeps a password the tutor has already proven", async () => {
    await pg.query(
      `insert into tutors (email, name, password_hash, email_verified_at) values ('${EMAIL}', 'Tutor', 'scrypt$x', now())`,
    );
    const t = await tutorForSignIn(EMAIL, "Tutor", true);
    const r = await row();
    expect(r.password_hash).toBe("scrypt$x");
    expect(t.sessionVersion).toBe(0);
  });
});

describe("sessionVersionOf", () => {
  it("is null once the tutor is gone, so their session ends", async () => {
    const t = await tutorForSignIn(EMAIL, "Tutor", true);
    await pg.query("delete from tutors");
    expect(await sessionVersionOf(t.id)).toBeNull();
  });
});

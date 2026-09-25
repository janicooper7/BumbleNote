import { describe, expect, it } from "vitest";
import { insertWithUniqueId } from "./unique-id";

/** Shaped like what Drizzle throws: the Postgres code only on the nested cause. */
function drizzleDuplicate(id: string): Error {
  const pg = Object.assign(new Error(`duplicate key value violates unique constraint "students_pkey"`), {
    code: "23505",
    detail: `Key (id)=(${id}) already exists.`,
  });
  return new Error(`Failed query: insert into "students" ... params: ${id}`, { cause: pg });
}

/** A fake table: inserting an id that's already present throws a unique violation. */
function fakeTable(taken: Iterable<string>, makeError = drizzleDuplicate) {
  const ids = new Set(taken);
  const attempts: string[] = [];
  const insert = async (id: string) => {
    attempts.push(id);
    if (ids.has(id)) throw makeError(id);
    ids.add(id);
  };
  return { ids, attempts, insert };
}

describe("insertWithUniqueId", () => {
  it("uses the base id when it's free", async () => {
    const t = fakeTable([]);
    expect(await insertWithUniqueId("maria", t.insert)).toBe("maria");
    expect(t.attempts).toEqual(["maria"]);
  });

  it("walks sequential suffixes, starting at -2", async () => {
    const t = fakeTable(["maria", "maria-2", "maria-3"]);
    expect(await insertWithUniqueId("maria", t.insert)).toBe("maria-4");
    expect(t.attempts).toEqual(["maria", "maria-2", "maria-3", "maria-4"]);
  });

  it("detects the violation from a top-level code, message, or detail too", async () => {
    const shapes: ((id: string) => unknown)[] = [
      () => Object.assign(new Error("x"), { code: "23505" }),
      (id) => new Error(`duplicate key value violates unique constraint (${id})`),
      (id) => Object.assign(new Error("insert failed"), { detail: `Key (id)=(${id}) already exists.` }),
      () => ({ code: "23505" }), // a non-Error throwable
    ];
    for (const shape of shapes) {
      const t = fakeTable(["maria"], shape as (id: string) => Error);
      expect(await insertWithUniqueId("maria", t.insert)).toBe("maria-2");
    }
  });

  it("rethrows anything that isn't a duplicate key, without retrying", async () => {
    const boom = Object.assign(new Error("connection reset"), { code: "08006" });
    const attempts: string[] = [];
    await expect(
      insertWithUniqueId("maria", async (id) => {
        attempts.push(id);
        throw boom;
      }),
    ).rejects.toBe(boom);
    expect(attempts).toEqual(["maria"]);
  });

  it("doesn't mistake an unrelated 'already exists' message for a collision", async () => {
    const err = new Error('relation "students" already exists');
    await expect(
      insertWithUniqueId("maria", async () => {
        throw err;
      }),
    ).rejects.toBe(err);
  });

  it("switches to a random suffix once the sequential ones run out", async () => {
    const taken = ["maria", ...Array.from({ length: 20 }, (_, i) => `maria-${i + 2}`)];
    const t = fakeTable(taken);
    const id = await insertWithUniqueId("maria", t.insert);
    expect(id).toMatch(/^maria-[a-z0-9]{1,6}$/);
    expect(taken).not.toContain(id);
    expect(t.attempts).toHaveLength(22);
    expect(t.attempts[20]).toBe("maria-21");
  });

  it("gives up with a descriptive error after 25 attempts", async () => {
    let calls = 0;
    await expect(
      insertWithUniqueId("maria", async (id) => {
        calls += 1;
        throw drizzleDuplicate(id);
      }),
    ).rejects.toThrow(/Couldn't find a free id for "maria" after 25 attempts: Failed query/);
    expect(calls).toBe(25);
  });

  it("stops walking a cause chain that loops", async () => {
    const a: { cause?: unknown; message: string } = { message: "a" };
    a.cause = a;
    await expect(
      insertWithUniqueId("maria", async () => {
        throw a;
      }),
    ).rejects.toBe(a);
  });
});

import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "./password";
import { MIN_PASSWORD_LENGTH, passwordProblem } from "./password-policy";

describe("passwordProblem", () => {
  it("accepts a password with a letter and a number at the minimum length", () => {
    expect(MIN_PASSWORD_LENGTH).toBe(10);
    expect(passwordProblem("abcdefghi1")).toBeNull();
  });

  it("rejects one character short", () => {
    expect(passwordProblem("abcdefgh1")).toMatch(/at least 10/);
  });

  it("requires both a letter and a number", () => {
    expect(passwordProblem("abcdefghijk")).toMatch(/letter and one number/);
    expect(passwordProblem("12345678901")).toMatch(/letter and one number/);
  });

  it("caps the length at 200", () => {
    expect(passwordProblem(`a1${"x".repeat(198)}`)).toBeNull();
    expect(passwordProblem(`a1${"x".repeat(199)}`)).toMatch(/too long/);
  });
});

// Real scrypt at production cost (~100 ms per hash), so these are a little slow.
describe("hashPassword / verifyPassword", () => {
  it("round-trips, and rejects a wrong password", async () => {
    const stored = await hashPassword("correct horse 1");
    expect(stored).toMatch(/^scrypt\$32768\$8\$1\$[A-Za-z0-9+/=]+\$[A-Za-z0-9+/=]+$/);
    expect(await verifyPassword("correct horse 1", stored)).toBe(true);
    expect(await verifyPassword("correct horse 2", stored)).toBe(false);
  });

  it("salts each hash", async () => {
    const [a, b] = await Promise.all([hashPassword("same-pass-1"), hashPassword("same-pass-1")]);
    expect(a).not.toBe(b);
  });

  it("normalizes Unicode, so composed and decomposed forms match", async () => {
    const composed = "café-password-1";
    const decomposed = "café-password-1";
    const stored = await hashPassword(composed);
    expect(await verifyPassword(decomposed, stored)).toBe(true);
  });

  it.each([
    "",
    "bcrypt$10$abc",
    "scrypt$0$8$1$c2FsdA==$a2V5",
    "scrypt$32768$8$1$$a2V5",
    "scrypt$32768$8$1$c2FsdA==",
    "scrypt$3$8$1$c2FsdA==$a2V5", // N not a power of two: scrypt throws
  ])("returns false instead of throwing on malformed hash %j", async (stored) => {
    await expect(verifyPassword("whatever-1", stored)).resolves.toBe(false);
  });
});

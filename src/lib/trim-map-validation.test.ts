import { describe, expect, it } from "vitest";
import { MAX_TRIM_NUMBERS, parseTrimMap } from "./trim-map-validation";

describe("parseTrimMap", () => {
  it("accepts a well-formed map and returns it unchanged", () => {
    const map = [0, 1.5, 3, 2, 10.25, 0.5];
    expect(parseTrimMap(map, "student")).toBe(map);
  });

  it("treats undefined, null and an empty array as 'not trimmed'", () => {
    expect(parseTrimMap(undefined, "student")).toBeUndefined();
    expect(parseTrimMap(null, "student")).toBeUndefined();
    expect(parseTrimMap([], "student")).toBeUndefined();
  });

  it("accepts spans that touch end-to-start", () => {
    expect(parseTrimMap([0, 2, 2, 3], "tutor")).toEqual([0, 2, 2, 3]);
  });

  it("names the track in the error", () => {
    expect(() => parseTrimMap([1], "tutor")).toThrow("Bad tutor trim map.");
    expect(() => parseTrimMap([1], "student")).toThrow("Bad student trim map.");
  });

  it.each([
    ["a non-array", { 0: 1, 1: 2 }],
    ["a string", "0,1"],
    ["an odd length", [0, 1, 2]],
    ["a single number", [5]],
    ["a negative start", [-1, 2]],
    ["a zero duration", [0, 0]],
    ["a negative duration", [0, -1]],
    ["NaN", [0, Number.NaN]],
    ["Infinity start", [Number.POSITIVE_INFINITY, 1]],
    ["Infinity duration", [0, Number.POSITIVE_INFINITY]],
    ["a numeric string", ["0", 1]],
    ["null inside", [0, null]],
    ["overlapping spans", [0, 5, 4, 1]],
    ["out-of-order spans", [10, 1, 2, 1]],
    ["duplicate starts", [3, 1, 3, 1]],
  ])("rejects %s", (_label, value) => {
    expect(() => parseTrimMap(value, "student")).toThrow(/trim map/);
  });

  it("accepts a map exactly at the size cap and rejects one span over it", () => {
    const atCap: number[] = [];
    for (let i = 0; i < MAX_TRIM_NUMBERS / 2; i++) atCap.push(i * 2, 1);
    expect(parseTrimMap(atCap, "student")).toHaveLength(MAX_TRIM_NUMBERS);

    const overCap = [...atCap, MAX_TRIM_NUMBERS * 2, 1];
    expect(() => parseTrimMap(overCap, "student")).toThrow(/trim map/);
  });
});

import { describe, expect, it } from "vitest";
import { escapeRegex } from "../src/lib/escapeRegex.js";

describe("escapeRegex", () => {
  it("neutralizes every regex metacharacter", () => {
    const hostile = "a+b*c?(d)[e]{1}^$|\\.";
    const re = new RegExp(escapeRegex(hostile));
    expect(re.test(hostile)).toBe(true);
    expect(re.test("aab")).toBe(false);
  });
});

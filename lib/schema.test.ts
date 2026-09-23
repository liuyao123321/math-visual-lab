import { describe, expect, it } from "vitest";
import { examples } from "@/lib/examples";
import { solveResultSchema } from "@/lib/math-schema";
import { defaultSettings, readSettings, STORAGE_KEYS } from "@/lib/storage";

describe("solution schemas", () => {
  it("accepts every built-in demonstration", () => {
    for (const example of examples) expect(solveResultSchema.safeParse(example).success).toBe(true);
  });

  it("rejects unknown status values", () => {
    expect(solveResultSchema.safeParse({ ...examples[0], status: "guessed" }).success).toBe(false);
  });
});

describe("versioned browser storage", () => {
  it("recovers from corrupted settings", () => {
    localStorage.setItem(STORAGE_KEYS.settings, "{broken");
    expect(readSettings()).toEqual(defaultSettings);
    expect(localStorage.getItem(STORAGE_KEYS.settings)).toBeNull();
  });
});

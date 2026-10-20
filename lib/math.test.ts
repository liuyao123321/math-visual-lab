import { describe, expect, it } from "vitest";
import { compileSafeExpression, evaluateExpression, reportSummary, sampleExpression } from "@/lib/math";

describe("safe math evaluation", () => {
  it("samples an allowed expression", () => {
    const sampled = sampleExpression("a*x^2+1", [-1, 1], { a: 2 }, 3);
    expect(sampled.x).toEqual([-1, 0, 1]);
    expect(sampled.y).toEqual([3, 1, 3]);
  });

  it("rejects unsafe or unsupported names", () => {
    expect(() => compileSafeExpression("import('x')")).toThrow();
    expect(() => compileSafeExpression("x; alert(1)")).toThrow();
    expect(() => compileSafeExpression("random() + x")).toThrow();
  });

  it("evaluates parameter-only coordinate expressions safely", () => {
    expect(evaluateExpression("2-sqrt(4-k)", { k: 3 })).toBe(1);
    expect(evaluateExpression("2-sqrt(4-k)", { k: 5 })).toBeNull();
    expect(evaluateExpression("unknown+1", { k: 3 })).toBeNull();
  });
});

describe("learning report summary", () => {
  it("calculates mastery and weak topics", () => {
    const summary = reportSummary([
      { topics: ["导数", "极值"], mastery: "reviewing", createdAt: "2026-09-22T08:00:00.000Z", lastPracticedAt: null },
      { topics: ["导数"], mastery: "mastered", createdAt: "2026-09-21T08:00:00.000Z", lastPracticedAt: null },
    ]);
    expect(summary.total).toBe(2);
    expect(summary.masteredRate).toBe(50);
    expect(summary.weakTopics[0]).toEqual({ topic: "导数", count: 1 });
  });
});

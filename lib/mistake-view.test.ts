import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { emptyMistakeFilters, filterMistakes, sortMistakes, mistakeFilterOptions, mistakePalette, difficultyRank, mistakeDateLabel } from "./mistake-view";
import { mistakeFixture as record } from "@/testdata/mistake-view";

describe("mistake view pure operations", () => {
  it("intersects all dimensions and searches existing notes and error reasons", () => {
    const records = [record("a", { note: "特别备注" }), record("b", { subject: "线性代数" }), record("c", { difficulty: "进阶" }), record("d", { mastery: "mastered" })];
    const filters = { ...emptyMistakeFilters, query: "特别", subject: "高等数学", difficulty: "基础", mastery: "unreviewed" as const, errorReason: "计算错误" };
    expect(filterMistakes(records, filters).map((item) => item.id)).toEqual(["a"]);
    expect(filterMistakes(records, { ...emptyMistakeFilters, query: "计算错误" })).toHaveLength(4);
  });
  it("uses local calendar days with inclusive start and exclusive tomorrow", () => {
    const now = new Date(2026, 9, 27, 12);
    const records = [record("today", { createdAt: new Date(2026, 9, 27).toISOString() }), record("day6", { createdAt: new Date(2026, 9, 21).toISOString() }), record("day7", { createdAt: new Date(2026, 9, 20, 23, 59).toISOString() }), record("day29", { createdAt: new Date(2026, 8, 28).toISOString() }), record("old", { createdAt: new Date(2026, 8, 27, 23, 59).toISOString() }), record("future", { createdAt: new Date(2026, 9, 28).toISOString() }), record("invalid", { createdAt: "bad date" })];
    expect(filterMistakes(records, { ...emptyMistakeFilters, time: "today" }, now).map((item) => item.id)).toEqual(["today"]);
    expect(filterMistakes(records, { ...emptyMistakeFilters, time: "week" }, now).map((item) => item.id)).toEqual(["today", "day6"]);
    expect(filterMistakes(records, { ...emptyMistakeFilters, time: "month" }, now).map((item) => item.id)).toEqual(["today", "day6", "day7", "day29"]);
    expect(filterMistakes(records, emptyMistakeFilters, now)).toHaveLength(7);
  });
  it("handles missing values and normalizes options without changing records", () => {
    const records = [record("a", { subject: "", difficulty: "", errorReason: "   " }), record("b", { errorReason: "计算  错误" }), record("c", { errorReason: "计算 错误" })];
    const before = structuredClone(records);
    const options = mistakeFilterOptions(records);
    expect(options.subjects).toContain("未分类"); expect(options.difficulties).toContain("未标注");
    expect(options.reasons).toEqual(["", "计算 错误"]);
    expect(filterMistakes(records, { ...emptyMistakeFilters, errorReason: "" }).map((item) => item.id)).toEqual(["a"]);
    expect(records).toEqual(before);
  });
  it.each(["newest", "oldest"] as const)("sorts %s with invalid timestamps last, independently of note edits", (sort) => {
    const records = [record("bad", { createdAt: "invalid" }), record("old", { createdAt: "2025-01-01T00:00:00Z", updatedAt: "2030-01-01T00:00:00Z" }), record("new")];
    expect(sortMistakes(records, sort).map((item) => item.id)).toEqual(sort === "newest" ? ["new", "old", "bad"] : ["old", "new", "bad"]);
    expect(records.map((item) => item.id)).toEqual(["bad", "old", "new"]);
  });
  it("sorts last practice with never-practiced and invalid values last", () => {
    const records = [record("never"), record("bad", { lastPracticedAt: "x" }), record("old", { lastPracticedAt: "2026-01-01T00:00:00Z" }), record("new", { lastPracticedAt: "2026-10-01T00:00:00Z" })];
    expect(sortMistakes(records, "practiced").map((item) => item.id)).toEqual(["new", "old", "bad", "never"]);
  });
  it("sorts attempts descending and breaks ties by date and then ID", () => {
    const records = [record("b", { attempts: 2 }), record("zero"), record("a", { attempts: 2 }), record("older", { attempts: 2, createdAt: "2025-01-01T00:00:00Z" })];
    expect(sortMistakes(records, "attempts").map((item) => item.id)).toEqual(["a", "b", "older", "zero"]);
  });
  it.each(["easy", "hard"] as const)("uses business difficulty order for %s and puts unknown values last", (sort) => {
    const records = [record("unknown", { difficulty: "未知" }), record("middle", { difficulty: "中等" }), record("easy"), record("hard", { difficulty: "进阶" })];
    expect(sortMistakes(records, sort).map((item) => item.id)).toEqual(sort === "easy" ? ["easy", "middle", "hard", "unknown"] : ["hard", "middle", "easy", "unknown"]);
    expect(difficultyRank("constructor")).toBeNull();
  });
  it("never sorts the original array or derives colors from record position", () => {
    const original = Object.freeze([record("a"), record("b", { subject: "线性代数" }), record("c", { subject: "概率统计" })]);
    for (const sort of ["newest", "oldest", "practiced", "attempts", "easy", "hard"] as const) {
      expect(sortMistakes(original, sort).map((item) => mistakePalette(item.subject))).toEqual(["forest", "navy", "plum"]);
    }
    expect(mistakePalette("其他")).toBe("paper"); expect(mistakePalette("constructor")).toBe("paper");
    expect(mistakeDateLabel("invalid")).toBe("时间未记录");
    expect(mistakeDateLabel("2026-02-30T00:00:00Z")).toBe("时间未记录");
    expect(mistakeDateLabel("123")).toBe("时间未记录");
  });
  it("keeps text contrast above 4.5:1 on every card palette in both themes", () => {
    const css = readFileSync("components/mistakes-view.css", "utf8");
    const base = css.match(/\.mistake-card \{ --mistake-ground: (#[\da-f]+); --mistake-ink: (#[\da-f]+); --mistake-secondary: (#[\da-f]+);/i)!;
    const palettes = [[base[1], base[2], base[3]]];
    for (const variant of ["navy", "plum", "paper"]) {
      const rule = css.match(new RegExp("\\.mistake-card--" + variant + " \\{([^}]+)"))![1];
      palettes.push([rule.match(/--mistake-ground: (#[\da-f]+)/i)![1], rule.match(/--mistake-ink: (#[\da-f]+)/i)?.[1] ?? base[2], rule.match(/--mistake-secondary: (#[\da-f]+)/i)![1]]);
    }
    const dark = css.match(/\.dark \.mistake-card--paper \{([^}]+)/)![1];
    palettes.push([dark.match(/--mistake-ground: (#[\da-f]+)/i)![1], dark.match(/--mistake-ink: (#[\da-f]+)/i)![1], dark.match(/--mistake-secondary: (#[\da-f]+)/i)![1]]);
    const luminance = (hex: string) => hex.slice(1).match(/../g)!.map((part) => parseInt(part, 16) / 255).map((value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4).reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0);
    for (const [background, foreground, secondary] of palettes) for (const text of [foreground, secondary]) {
      const values = [luminance(background), luminance(text)].sort((a, b) => a - b);
      expect((values[1] + 0.05) / (values[0] + 0.05)).toBeGreaterThanOrEqual(4.5);
    }
  });
});

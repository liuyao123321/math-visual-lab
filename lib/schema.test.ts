import { beforeEach, describe, expect, it } from "vitest";
import { examples } from "@/lib/examples";
import { solveResultSchema, tutorRequestSchema } from "@/lib/math-schema";
import { defaultSettings, readSettings, readMistakes, STORAGE_KEYS } from "@/lib/storage";

beforeEach(() => localStorage.clear());

describe("solution schemas", () => {
  it("accepts every built-in demonstration", () => {
    for (const example of examples) expect(solveResultSchema.safeParse(example).success).toBe(true);
  });

  it("rejects unknown status values", () => {
    expect(solveResultSchema.safeParse({ ...examples[0], status: "guessed" }).success).toBe(false);
  });

  it("rejects empty solved lessons but supports text-only concept answers", () => {
    expect(solveResultSchema.safeParse({ ...examples[0], steps: [], finalAnswerLatex: "" }).success).toBe(false);
    expect(solveResultSchema.safeParse({ ...examples[0], visualization: null, finalAnswerLatex: "", finalAnswerText: "驻点不一定是极值点。" }).success).toBe(true);
    const request = tutorRequestSchema.parse({ action: "solve", question: "解释导数的定义" });
    expect(request.action === "solve" && request.mode).toBe("auto");
  });
});

describe("versioned browser storage", () => {
  it("keeps legacy empty-answer snapshots without deleting the collection", () => {
    const record = {
      id: "old-mistake", question: examples[0].normalizedQuestion,
      solution: { ...examples[0], steps: [], finalAnswerLatex: "" },
      subject: "高等数学", topics: ["二次函数"], questionType: "二次函数", difficulty: "基础",
      errorReason: "计算出错", note: "保留这条笔记", mastery: "unreviewed", attempts: 0,
      createdAt: "2026-10-02", updatedAt: "2026-10-02", lastPracticedAt: null,
    };
    const raw = JSON.stringify([record]);
    localStorage.setItem(STORAGE_KEYS.mistakes, raw);
    expect(readMistakes()).toHaveLength(1);
    expect(readMistakes()[0].note).toBe("保留这条笔记");
    expect(localStorage.getItem(STORAGE_KEYS.mistakes)).toBe(raw);
    expect(solveResultSchema.safeParse(record.solution).success).toBe(false);
  });
  it("recovers from corrupted settings", () => {
    localStorage.setItem(STORAGE_KEYS.settings, "{broken");
    expect(readSettings()).toEqual(defaultSettings);
    expect(localStorage.getItem(STORAGE_KEYS.settings)).toBeNull();
  });

  it("migrates version 1 settings without losing theme or explanation mode", () => {
    localStorage.setItem(STORAGE_KEYS.legacySettings, JSON.stringify({ version: 1, theme: "dark", defaultMode: "detailed" }));
    const settings = readSettings();
    expect(settings).toMatchObject({ version: 2, theme: "dark", defaultMode: "detailed" });
    expect(settings.learnerProfile).toEqual(defaultSettings.learnerProfile);
    expect(localStorage.getItem(STORAGE_KEYS.legacySettings)).toBeNull();
    expect(localStorage.getItem(STORAGE_KEYS.settings)).not.toBeNull();
  });
});

describe("personalization request boundary", () => {
  it("rejects a learning context whose personalization switch is off", () => {
    const parsed = tutorRequestSchema.safeParse({
      action: "solve",
      question: "求 x+1=0",
      mode: "concise",
      learningContext: {
        profile: { ...defaultSettings.learnerProfile, personalizationEnabled: false },
        weakTopics: [],
        frequentErrorReasons: [],
        recentPracticeCount: 0,
      },
    });
    expect(parsed.success).toBe(false);
  });
});

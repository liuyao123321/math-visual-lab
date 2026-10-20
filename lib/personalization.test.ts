import { describe, expect, it } from "vitest";
import { examples } from "@/lib/examples";
import type { MistakeRecord } from "@/lib/math-schema";
import { buildLearningContext, buildStudyRecommendations } from "@/lib/personalization";
import { defaultLearnerProfile } from "@/lib/storage";

function mistake(id: string, topics: string[], errorReason: string, attempts = 0, mastery: MistakeRecord["mastery"] = "unreviewed"): MistakeRecord {
  return {
    id,
    question: examples[0].normalizedQuestion,
    solution: examples[0],
    subject: "高等数学",
    topics,
    questionType: "函数",
    difficulty: "基础",
    errorReason,
    note: "",
    mastery,
    attempts,
    createdAt: "2026-09-28T10:00:00.000Z",
    updatedAt: "2026-09-28T10:00:00.000Z",
    lastPracticedAt: null,
  };
}

describe("bounded learning context", () => {
  it("sends no context when personalization is disabled", () => {
    expect(buildLearningContext({ ...defaultLearnerProfile, personalizationEnabled: false }, [mistake("1", ["导数"], "概念没有理解")])).toBeUndefined();
  });

  it("contains only bounded aggregates and excludes mastered records", () => {
    const records = [
      mistake("1", ["导数", "极值"], "公式不会使用"),
      mistake("2", ["导数"], "公式不会使用"),
      mistake("3", ["积分"], "计算过程出错"),
      mistake("4", ["极限"], "概念没有理解"),
      mistake("5", ["向量"], "不应出现", 0, "mastered"),
    ];
    const context = buildLearningContext(defaultLearnerProfile, records, new Date("2026-09-29T10:00:00.000Z"));
    expect(context?.weakTopics).toHaveLength(3);
    expect(context?.weakTopics[0]).toEqual({ topic: "导数", unresolvedCount: 2 });
    expect(context?.frequentErrorReasons[0]).toBe("公式不会使用");
    expect(JSON.stringify(context)).not.toContain("不应出现");
    expect(JSON.stringify(context)).not.toContain("question");
  });
});

describe("study recommendations", () => {
  it("prioritizes unresolved topics and adapts the action to exam goals", () => {
    const recommendations = buildStudyRecommendations(
      [mistake("1", ["导数"], "概念没有理解", 2), mistake("2", ["导数"], "公式不会使用", 0)],
      { ...defaultLearnerProfile, learningGoal: "exam" },
    );
    expect(recommendations[0]).toMatchObject({ topic: "导数", count: 2, mistakeId: "2" });
    expect(recommendations[0].action).toContain("限时重做");
  });
});

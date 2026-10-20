import { beforeEach, describe, expect, it } from "vitest";
import { renderToString } from "katex";
import { examples } from "@/lib/examples";
import type { MistakeRecord } from "@/lib/math-schema";
import { multiMethodSchema, paperSchema } from "@/lib/math-schema";
import { activityStreak, generateReviewPlan, knowledgeMap, localDay } from "@/lib/learning";
import { emptyLearning, LEARNING_KEY, readLearning, useLearningStore } from "@/lib/learning-store";
import { offlinePaper } from "@/lib/offline-paper";
import { exampleMethods } from "@/lib/alternative-methods";
import { experimentReadouts } from "@/lib/visual-analysis";
import { normalizeLatex } from "@/lib/formula";

const record: MistakeRecord = { id: "mistake-1", question: examples[0].normalizedQuestion, solution: examples[0], subject: "高等数学", topics: examples[0].topics, questionType: "二次函数", difficulty: "基础", errorReason: "配方错误", note: "", mastery: "unreviewed", attempts: 0, createdAt: "2026-10-02T00:00:00Z", updatedAt: "2026-10-02T00:00:00Z", lastPracticedAt: null };
beforeEach(() => { localStorage.clear(); useLearningStore.setState({ data: emptyLearning, hydrated: true }); });

describe("review planning and knowledge map", () => {
  it("creates an inclusive daily schedule with explanations tied to actual mistakes", () => {
    const now = new Date(2026, 9, 2, 10);
    const plan = generateReviewPlan([record], "2026-10-04", 30, now);
    expect(plan.tasks).toHaveLength(3);
    expect(plan.tasks[0]).toMatchObject({ day: "2026-10-02", mistakeId: record.id, minutes: 30 });
    expect(plan.tasks[0].reason).toContain("配方错误");
    expect(plan.tasks[2].reason).toContain("间隔复习");
    expect(() => generateReviewPlan([], "2026-10-04", 30, now)).toThrow();
    expect(() => generateReviewPlan([record], "2026-10-01", 30, now)).toThrow();
  });
  it("updates knowledge states from mastery and separates check records", () => {
    const map = knowledgeMap([record], [], ["贝叶斯公式"]);
    expect(map.find((node) => node.topic === "配方法")).toMatchObject({ pending: 1, status: "待巩固", prerequisites: ["二次函数"] });
    expect(map.find((node) => node.topic === "贝叶斯公式")).toMatchObject({ status: "未记录" });
  });
  it("counts a streak across month boundaries and prevents duplicate daily check-ins", () => {
    expect(activityStreak(["2026-09-30", "2026-10-01", "2026-10-02"], new Date(2026, 9, 2))).toBe(3);
    useLearningStore.getState().activity(); useLearningStore.getState().activity();
    expect(readLearning().activityDays).toEqual([localDay()]);
  });
  it("persists completed tasks and safely handles corrupt learning data", () => {
    const plan = generateReviewPlan([record], "2026-10-04", 30, new Date(2026, 9, 2, 10));
    useLearningStore.getState().savePlan(plan);
    useLearningStore.getState().completeTask(plan.tasks[0].id, true);
    expect(readLearning().plan?.tasks[0].completed).toBe(true);
    localStorage.setItem(LEARNING_KEY, "{broken");
    expect(readLearning()).toEqual(emptyLearning);
  });
  it("loads stored learning records before an early mutation", () => {
    localStorage.setItem(LEARNING_KEY, JSON.stringify({ ...emptyLearning, activityDays: ["2026-09-01"] }));
    useLearningStore.setState({ data: emptyLearning, hydrated: false });
    useLearningStore.getState().activity();
    expect(readLearning().activityDays).toContain("2026-09-01");
    expect(useLearningStore.getState().hydrated).toBe(true);
  });
});

describe("mathematical learning features", () => {
  it("provides two valid, renderable offline solutions for all demonstrations", () => {
    for (const example of examples) {
      const result = multiMethodSchema.parse(exampleMethods(example.id));
      for (const method of result.methods) {
        expect(() => renderToString(method.answerLatex, { throwOnError: true })).not.toThrow();
        for (const step of method.steps) for (const formula of step.formulas) expect(() => renderToString(formula, { throwOnError: true })).not.toThrow();
      }
    }
  });
  it("generates new scoped offline questions without pretending to cover unsupported topics", () => {
    const paper = paperSchema.parse(offlinePaper([record], 5));
    expect(paper.questions).toHaveLength(5);
    expect(paper.questions[0].question).not.toBe(record.question);
    expect(new Set(paper.questions.map((question) => question.id)).size).toBe(5);
    expect(() => offlinePaper([{ ...record, topics: ["矩阵"] }])).toThrow();
    const duplicate = { ...paper, questions: paper.questions.map((question) => ({ ...question, id: "duplicate" })) };
    expect(paperSchema.safeParse(duplicate).success).toBe(false);
  });
  it("synchronizes mathematical readouts with parameter changes", () => {
    const readouts = experimentReadouts(examples[0], { k: 5 });
    expect(readouts.find((item) => item.label === "顶点与对称轴")?.latex).toContain("(2,-1)");
    expect(readouts.find((item) => item.label === "零点")?.latex).not.toContain("没有实数零点");
    expect(experimentReadouts(examples[2], { b: 1 })[0].latex).toContain("1.3333");
    expect(experimentReadouts(examples[1], { t: 1 })[1].latex).toContain("0");
    expect(normalizeLatex("$$x^2$$")).toBe("x^2");
  });
});

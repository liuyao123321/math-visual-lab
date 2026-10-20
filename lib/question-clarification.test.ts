import { describe, expect, it } from "vitest";
import { questionAssessmentSchema, type SolveResult } from "@/lib/math-schema";
import { clarificationQuestionsFor, supplementedQuestion } from "@/lib/question-clarification";

const assessment = {
  classification: "incomplete", normalizedQuestion: "函数 f(x)=x^2", message: "请说明题目要求。",
  missingInformation: ["题目要求", "参数范围"], recommendedMode: "detailed", modeReason: "需要先确认题意。", visualizationUseful: false,
  clarificationQuestions: [{ missingIndex: 0, title: "需要求什么？", options: [{ label: "零点", value: "求零点" }, { label: "导数", value: "求导数" }] }],
};

describe("question clarification", () => {
  it("validates choices and supplies a free-text fallback for uncovered conditions", () => {
    const parsed = questionAssessmentSchema.parse(assessment);
    const questions = clarificationQuestionsFor({ inputAssessment: parsed, limitations: [] });
    expect(questions).toHaveLength(2);
    expect(questions[0].options).toHaveLength(2);
    expect(questions[1]).toEqual({ missingIndex: 1, title: "参数范围", options: [] });
  });

  it("requires explicit answers to every question and rejects stale selections", () => {
    const questions = clarificationQuestionsFor({ inputAssessment: questionAssessmentSchema.parse(assessment), limitations: [] });
    expect(supplementedQuestion(assessment.normalizedQuestion, questions, {})).toBeNull();
    expect(supplementedQuestion(assessment.normalizedQuestion, questions, { "0": { selected: "option-9", custom: "旧答案" }, "1": { selected: "custom", custom: "实数" } })).toBeNull();
    const revised = supplementedQuestion(assessment.normalizedQuestion, questions, { "0": { selected: "option-1", custom: "未选择的旧答案" }, "1": { selected: "custom", custom: "实数" } });
    expect(revised).toContain("需要求什么？：求导数");
    expect(revised).toContain("参数范围：实数");
    expect(revised).not.toContain("旧答案");
  });

  it("does not fabricate candidates for legacy output or late missing conditions", () => {
    const legacy = { limitations: ["请提供积分上下限。"] };
    expect(clarificationQuestionsFor(legacy)[0].options).toEqual([]);
    const complete = questionAssessmentSchema.parse({ ...assessment, classification: "complete", missingInformation: [], clarificationQuestions: [] });
    expect(clarificationQuestionsFor({ ...legacy, inputAssessment: complete })[0].title).toBe(legacy.limitations[0]);
  });

  it("rejects duplicate or invalid missing-condition references and singleton options", () => {
    const question = assessment.clarificationQuestions[0];
    for (const clarificationQuestions of [[question, question], [{ ...question, missingIndex: 4 }], [{ ...question, options: question.options.slice(0, 1) }]]) {
      expect(questionAssessmentSchema.safeParse({ ...assessment, clarificationQuestions }).success).toBe(false);
    }
    expect(questionAssessmentSchema.safeParse({ ...assessment, classification: "not_math" }).success).toBe(false);
  });

  it("keeps old assessment snapshots compatible and respects the request size limit", () => {
    const { clarificationQuestions: unused, ...old } = assessment;
    void unused;
    expect(questionAssessmentSchema.safeParse(old).success).toBe(true);
    const questions = clarificationQuestionsFor({ limitations: ["说明条件"] } as Pick<SolveResult, "limitations">);
    expect(supplementedQuestion("题".repeat(1999), questions, { "0": { selected: "custom", custom: "补充" } })).toBeNull();
  });
});

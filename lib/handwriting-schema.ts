import { z } from "zod";

const id = z.string().trim().min(1).max(80);
const text = z.string().max(1200);
const formulas = z.array(z.string().max(1200)).max(4);
export const studentStepSchema = z.object({ id, text, formulas });
export type StudentStep = z.infer<typeof studentStepSchema>;
export const studentStepsSchema = z.array(studentStepSchema).max(20).superRefine((steps, ctx) => {
  if (new Set(steps.map((s) => s.id)).size !== steps.length) ctx.addIssue({ code: "custom", message: "步骤标识不能重复" });
});
const ambiguity = z.object({ description: z.string().min(1).max(300), candidates: z.array(z.string().max(100)).max(4).default([]) });
export const handwritingRecognitionSchema = z.object({
  status: z.enum(["recognized", "needs_review", "unreadable"]),
  question: z.string().max(2000),
  conditions: z.array(z.string().max(300)).max(10),
  steps: z.array(studentStepSchema.extend({ uncertainties: z.array(ambiguity).max(6).default([]) })).max(20),
  uncertainties: z.array(ambiguity).max(10),
  warnings: z.array(z.string().max(300)).max(8),
}).superRefine((value, ctx) => {
  if (new Set(value.steps.map((s) => s.id)).size !== value.steps.length) ctx.addIssue({ code: "custom", message: "识别步骤标识重复" });
  if (value.status === "recognized" && (!value.question.trim() || !value.steps.length)) ctx.addIssue({ code: "custom", message: "识别成功必须包含题目和步骤，否则标记需要核对或无法辨认" });
});
export type HandwritingRecognition = z.infer<typeof handwritingRecognitionSchema>;

export const stepVerdictSchema = z.object({
  stepId: id,
  status: z.enum(["correct", "insufficient_basis", "incorrect", "dependent_error", "uncertain"]),
  basis: z.string().min(1).max(800),
  strengths: z.array(z.string().max(300)).max(4),
  issues: z.array(z.string().max(300)).max(4),
  errorTypes: z.array(z.enum(["calculation", "symbol", "concept", "conditions", "logic", "recognition"])).max(6),
  hint: z.string().max(600),
  suggestedRewrite: z.string().max(800).optional(),
});
export const handwritingEvaluationSchema = z.object({
  subject: z.enum(["高等数学", "线性代数", "概率统计", "其他"]).default("其他"),
  topics: z.array(z.string().min(1).max(40)).min(1).max(8).default(["手写过程复盘"]),
  difficulty: z.enum(["基础", "中等", "进阶"]).default("中等"),
  status: z.enum(["in_progress", "completed", "needs_more_info", "uncertain"]),
  summary: z.string().min(1).max(1000),
  firstErrorStepId: id.nullable(),
  steps: z.array(stepVerdictSchema).min(1).max(20),
  understandingQuestion: z.string().max(500),
  limitations: z.array(z.string().max(300)).max(6),
}).superRefine((value, ctx) => {
  const firstError = value.steps.find((s) => s.status === "incorrect")?.stepId ?? null;
  if (value.firstErrorStepId !== firstError) ctx.addIssue({ code: "custom", message: "首次错误必须对应第一个判错步骤" });
  if (new Set(value.steps.map((s) => s.stepId)).size !== value.steps.length) ctx.addIssue({ code: "custom", message: "评价步骤标识重复" });
  let priorError = false;
  for (const step of value.steps) {
    if (step.status === "dependent_error" && !priorError) ctx.addIssue({ code: "custom", message: "依赖错误前必须有已定位错误" });
    if (step.status === "incorrect") priorError = true;
  }
  if (value.status === "completed" && (value.steps.some((s) => s.status !== "correct") || !value.understandingQuestion.trim())) {
    ctx.addIssue({ code: "custom", message: "完成必须所有步骤有效且有理解检查" });
  }
});
export type HandwritingEvaluation = z.infer<typeof handwritingEvaluationSchema>;

export const handwritingHintSchema = z.object({
  level: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  targetStepId: id.nullable(),
  title: z.string().min(1).max(100),
  text: z.string().min(1).max(1000),
  formulas,
});
export type HandwritingHint = z.infer<typeof handwritingHintSchema>;
export const confirmedWorkSchema = z.object({
  question: z.string().trim().min(3).max(2000),
  conditions: z.array(z.string().max(300)).max(10),
  steps: studentStepsSchema.refine((steps) => steps.length > 0 && steps.every((s) => s.text.trim() || s.formulas.some((f) => f.trim())), "请填写每一步，空白步骤不能评价"),
  confirmed: z.literal(true),
});
export type ConfirmedWork = z.infer<typeof confirmedWorkSchema>;
export const verdictLabels: Record<HandwritingEvaluation["steps"][number]["status"], string> = {
  correct: "正确", insufficient_basis: "结论正确但依据不足", incorrect: "存在错误",
  dependent_error: "依赖前面的错误", uncertain: "暂时无法判断",
};

export function evaluationMatches(work: Pick<ConfirmedWork, "steps">, evaluation: HandwritingEvaluation): boolean {
  return work.steps.length === evaluation.steps.length && work.steps.every((s, i) => s.id === evaluation.steps[i].stepId);
}

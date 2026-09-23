import { z } from "zod";

export const explanationModeSchema = z.enum(["concise", "detailed", "visual"]);
export type ExplanationMode = z.infer<typeof explanationModeSchema>;

export const graphParameterSchema = z.object({
  key: z.string().min(1).max(24),
  label: z.string().min(1).max(40),
  min: z.number(),
  max: z.number(),
  step: z.number().positive(),
  defaultValue: z.number(),
});

export const graphLayerSchema = z.object({
  id: z.string().min(1).max(40),
  label: z.string().min(1).max(60),
  type: z.enum(["function", "line", "points", "area"]),
  expression: z.string().max(200).optional(),
  x: z.array(z.number()).max(30).optional(),
  y: z.array(z.number()).max(30).optional(),
  domain: z.tuple([z.number(), z.number()]).optional(),
  color: z.string().max(30).optional(),
  dashed: z.boolean().optional(),
});

export const visualizationSpecSchema = z.object({
  kind: z.literal("cartesian"),
  title: z.string().max(100),
  xLabel: z.string().max(20).default("x"),
  yLabel: z.string().max(20).default("y"),
  xDomain: z.tuple([z.number(), z.number()]),
  yDomain: z.tuple([z.number(), z.number()]).optional(),
  parameters: z.array(graphParameterSchema).max(4).default([]),
  layers: z.array(graphLayerSchema).min(1).max(10),
});
export type VisualizationSpec = z.infer<typeof visualizationSpecSchema>;

export const solutionStepSchema = z.object({
  id: z.string().min(1).max(40),
  title: z.string().min(1).max(80),
  explanation: z.string().min(1).max(1200),
  formulas: z.array(z.string().max(400)).max(5).default([]),
  basis: z.string().max(240).default(""),
  commonMistake: z.string().max(300).optional(),
  visualLayerIds: z.array(z.string().max(40)).max(10).default([]),
});
export type SolutionStep = z.infer<typeof solutionStepSchema>;

export const solveResultSchema = z.object({
  id: z.string().min(1).max(80),
  normalizedQuestion: z.string().min(1).max(2000),
  subject: z.enum(["高等数学", "线性代数", "概率统计", "其他"]),
  questionType: z.string().min(1).max(60),
  topics: z.array(z.string().min(1).max(40)).min(1).max(8),
  difficulty: z.enum(["基础", "中等", "进阶"]),
  status: z.enum(["solved", "needs_more_info", "unsupported"]),
  steps: z.array(solutionStepSchema).max(12),
  finalAnswerLatex: z.string().max(1000),
  commonMistakes: z.array(z.string().max(300)).max(6).default([]),
  limitations: z.array(z.string().max(300)).max(5).default([]),
  visualization: visualizationSpecSchema.optional(),
});
export type SolveResult = z.infer<typeof solveResultSchema>;

export const explainResultSchema = z.object({
  title: z.string().min(1).max(100),
  explanation: z.string().min(1).max(1800),
  formulas: z.array(z.string().max(400)).max(6).default([]),
  analogy: z.string().max(500).default(""),
  checkQuestion: z.string().max(500).default(""),
});
export type ExplainResult = z.infer<typeof explainResultSchema>;

export const practiceResultSchema = z.object({
  question: z.string().min(1).max(1200),
  hint: z.string().min(1).max(700),
  answerLatex: z.string().min(1).max(700),
  topics: z.array(z.string().min(1).max(40)).min(1).max(8),
  difficulty: z.enum(["基础", "中等", "进阶"]),
});
export type PracticeResult = z.infer<typeof practiceResultSchema>;

const imageDataUrlSchema = z.string()
  .max(12_000_000)
  .regex(/^data:image\/(jpeg|png|webp|gif);base64,[A-Za-z0-9+/=]+$/, "图片格式不受支持");

export const tutorRequestSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("solve"),
    question: z.string().trim().max(2000),
    mode: explanationModeSchema,
    imageDataUrl: imageDataUrlSchema.optional(),
  }),
  z.object({
    action: z.literal("explain-step"),
    question: z.string().trim().min(3).max(2000),
    step: solutionStepSchema,
    reason: z.string().trim().min(1).max(300),
    mode: explanationModeSchema,
  }),
  z.object({
    action: z.literal("similar-practice"),
    sourceQuestion: z.string().trim().min(3).max(2000),
    topics: z.array(z.string().min(1).max(40)).min(1).max(8),
    difficulty: z.enum(["基础", "中等", "进阶"]),
  }),
]).superRefine((value, context) => {
  if (value.action === "solve" && value.question.length < 3 && !value.imageDataUrl) {
    context.addIssue({ code: "custom", path: ["question"], message: "请输入题目或上传题目图片" });
  }
});
export type TutorRequest = z.infer<typeof tutorRequestSchema>;

export const masterySchema = z.enum(["unreviewed", "reviewing", "mastered"]);
export type Mastery = z.infer<typeof masterySchema>;

export const mistakeRecordSchema = z.object({
  id: z.string(),
  question: z.string(),
  solution: solveResultSchema,
  subject: z.string(),
  topics: z.array(z.string()),
  questionType: z.string(),
  difficulty: z.string(),
  errorReason: z.string(),
  note: z.string(),
  mastery: masterySchema,
  attempts: z.number().int().nonnegative(),
  createdAt: z.string(),
  updatedAt: z.string(),
  lastPracticedAt: z.string().nullable(),
});
export type MistakeRecord = z.infer<typeof mistakeRecordSchema>;

export const userSettingsSchema = z.object({
  version: z.literal(1),
  theme: z.enum(["light", "dark", "system"]),
  defaultMode: explanationModeSchema,
});
export type UserSettings = z.infer<typeof userSettingsSchema>;

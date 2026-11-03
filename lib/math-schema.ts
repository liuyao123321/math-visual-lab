import { z } from "zod";
import { textbookIdsSchema } from "./textbooks";
import { confirmedWorkSchema, handwritingEvaluationSchema } from "./handwriting-schema";
import { handwritingSessionSchema } from "./handwriting-session";
import { ragSnapshotSchema, stepKnowledgeSchema, personalExcerptsSchema } from "./rag/schema";

export const explanationModeSchema = z.enum(["concise", "detailed", "visual"]);
export type ExplanationMode = z.infer<typeof explanationModeSchema>;
export const explanationSelectionSchema = z.enum(["auto", "concise", "detailed", "visual"]);
export type ExplanationSelection = z.infer<typeof explanationSelectionSchema>;

export const clarificationQuestionSchema = z.object({
  missingIndex: z.number().int().min(0).max(4),
  title: z.string().trim().min(1).max(200),
  options: z.array(z.object({
    label: z.string().trim().min(1).max(100),
    value: z.string().trim().min(1).max(300),
    description: z.string().trim().max(200).optional(),
  })).max(4).default([]).superRefine((options, context) => {
    if (options.length === 1 || new Set(options.map((option) => option.value)).size !== options.length) {
      context.addIssue({ code: "custom", message: "候选项需为零个或2至4个，且不能重复" });
    }
  }),
});
export type ClarificationQuestion = z.infer<typeof clarificationQuestionSchema>;

// Interaction must serve an explicit request in the original problem, not an
// invented variation of its fixed coefficients or bounds.
export const interactiveParameterSchema = z.object({
  key: z.string().regex(/^[A-Za-z][A-Za-z0-9_]*$/).max(24),
  reason: z.string().trim().min(1).max(200),
  sourceQuote: z.string().trim().min(2).max(200),
});

export const questionAssessmentSchema = z.object({
  classification: z.enum(["complete", "incomplete", "not_math"]),
  normalizedQuestion: z.string().max(2000),
  message: z.string().trim().min(1).max(300),
  missingInformation: z.array(z.string().trim().min(1).max(200)).max(5).default([]),
  clarificationQuestions: z.array(clarificationQuestionSchema).max(5).optional(),
  recommendedMode: explanationModeSchema,
  modeReason: z.string().trim().min(1).max(300),
  visualizationUseful: z.boolean(),
  interactiveParameters: z.array(interactiveParameterSchema).max(4).optional(),
}).superRefine((value, context) => {
  const questions = value.clarificationQuestions ?? [];
  if (questions.length && (value.classification !== "incomplete"
    || questions.some((question) => question.missingIndex >= value.missingInformation.length)
    || new Set(questions.map((question) => question.missingIndex)).size !== questions.length)) {
    context.addIssue({ code: "custom", path: ["clarificationQuestions"], message: "核对问题必须一一对应有效的缺失条件" });
  }
  if (value.classification === "complete" && (value.normalizedQuestion.trim().length < 3 || value.missingInformation.length > 0)) {
    context.addIssue({ code: "custom", path: ["classification"], message: "完整题目必须含明确题干且没有缺失条件" });
  }
  if (value.classification === "incomplete" && value.missingInformation.length === 0) {
    context.addIssue({ code: "custom", path: ["missingInformation"], message: "必须具体指出需要补充的条件" });
  }
  if (value.recommendedMode === "visual" && !value.visualizationUseful) {
    context.addIssue({ code: "custom", path: ["recommendedMode"], message: "不适合二维可视化时不得推荐可视化" });
  }
});
export type QuestionAssessment = z.infer<typeof questionAssessmentSchema>;

export const primarySubjectSchema = z.enum(["高等数学", "线性代数", "概率统计"]);
export const selfLevelSchema = z.enum(["foundation", "intermediate", "advanced"]);
export const learningGoalSchema = z.enum(["preview", "homework", "review", "exam"]);
export const preferredExplanationSchema = z.enum(["formula", "visual", "analogy", "comparison"]);
export const tutoringStyleSchema = z.enum(["hint-first", "guided", "complete"]);
export type TutoringStyle = z.infer<typeof tutoringStyleSchema>;

export const learnerProfileSchema = z.object({
  version: z.literal(1),
  primarySubject: primarySubjectSchema,
  selfLevel: selfLevelSchema,
  learningGoal: learningGoalSchema,
  preferredExplanation: preferredExplanationSchema,
  tutoringStyle: tutoringStyleSchema,
  personalizationEnabled: z.boolean(),
});
export type LearnerProfile = z.infer<typeof learnerProfileSchema>;

export const learningContextSummarySchema = z.object({
  profile: learnerProfileSchema,
  weakTopics: z.array(z.object({
    topic: z.string().min(1).max(40),
    unresolvedCount: z.number().int().min(1).max(99),
  })).max(3),
  frequentErrorReasons: z.array(z.string().min(1).max(80)).max(3),
  recentPracticeCount: z.number().int().min(0).max(999),
});
export type LearningContextSummary = z.infer<typeof learningContextSummarySchema>;

export const graphParameterSchema = z.object({
  key: z.string().min(1).max(24),
  label: z.string().min(1).max(40),
  min: z.number(),
  max: z.number(),
  step: z.number().positive(),
  defaultValue: z.number(),
});

const boundExpressions = z.tuple([z.string().min(1).max(200), z.string().min(1).max(200)]);
const spatialRange = z.tuple([z.number().finite(), z.number().finite()]).refine(([min, max]) => min < max);
export const graphLayerSchema = z.object({
  id: z.string().min(1).max(40),
  label: z.string().min(1).max(60),
  type: z.enum(["function", "line", "points", "area", "surface", "solid"]),
  expression: z.string().max(200).optional(),
  x: z.array(z.number()).max(30).optional(),
  y: z.array(z.number()).max(30).optional(),
  xExpressions: z.array(z.string().min(1).max(200)).max(30).optional(),
  yExpressions: z.array(z.string().min(1).max(200)).max(30).optional(),
  domain: z.tuple([z.number(), z.number()]).optional(),
  domainExpressions: z.tuple([z.string().min(1).max(200), z.string().min(1).max(200)]).optional(),
  color: z.string().max(30).optional(),
  dashed: z.boolean().optional(),
  yBounds: boundExpressions.optional(),
  zBounds: boundExpressions.optional(),
});

export const visualizationSpecSchema = z.object({
  kind: z.enum(["cartesian", "space"]),
  title: z.string().max(100),
  xLabel: z.string().max(20).default("x"),
  yLabel: z.string().max(20).default("y"),
  xDomain: z.tuple([z.number(), z.number()]),
  yDomain: z.tuple([z.number(), z.number()]).optional(),
  zDomain: spatialRange.optional(),
  parameters: z.array(graphParameterSchema).max(4).default([]),
  interactiveParameters: z.array(interactiveParameterSchema).max(4).optional(),
  layers: z.array(graphLayerSchema).min(1).max(10),
}).superRefine((spec, ctx) => {
  const spatial = spec.kind === "space";
  const issue = (path: (string | number)[], message: string) => ctx.addIssue({ code: z.ZodIssueCode.custom, path, message });
  if (spatial) {
    if (!spatialRange.safeParse(spec.xDomain).success || !spatialRange.safeParse(spec.yDomain).success) issue(["xDomain"], "三维图需要有限且递增的 x、y 范围");
    if (spec.parameters.length) issue(["parameters"], "三维图首版仅支持固定边界");
    if (spec.layers.length > 6) issue(["layers"], "三维图最多6层");
  }
  spec.layers.forEach((layer, index) => {
    const is3d = layer.type === "surface" || layer.type === "solid";
    if (spatial !== is3d || (layer.type === "surface" && !layer.expression?.trim()) || (layer.type === "solid" && !layer.zBounds)) {
      issue(["layers", index], "图层与坐标维度不匹配，或缺少曲面表达式/立体边界");
    }
    if (is3d && layer.domain && !spatialRange.safeParse(layer.domain).success) issue(["layers", index, "domain"], "三维采样区间必须有限且递增");
  });
});
export type VisualizationSpec = z.infer<typeof visualizationSpecSchema>;

export const solutionStepSchema = z.object({
  ...stepKnowledgeSchema,
  id: z.string().min(1).max(40),
  title: z.string().min(1).max(80),
  explanation: z.string().min(1).max(1200),
  summary: z.string().max(240).optional(),
  goal: z.string().max(240).optional(),
  conditions: z.array(z.string().max(240)).max(6).optional(),
  verification: z.string().max(400).optional(),
  formulas: z.array(z.string().max(400)).max(5).default([]),
  basis: z.string().max(240).default(""),
  commonMistake: z.string().max(300).optional(),
  visualLayerIds: z.array(z.string().max(40)).max(10).default([]),
});
export type SolutionStep = z.infer<typeof solutionStepSchema>;

const solveResultBaseSchema = z.object({
  id: z.string().min(1).max(80),
  normalizedQuestion: z.string().min(1).max(2000),
  subject: z.enum(["高等数学", "线性代数", "概率统计", "其他"]),
  questionType: z.string().min(1).max(60),
  topics: z.array(z.string().min(1).max(40)).min(1).max(8),
  difficulty: z.enum(["基础", "中等", "进阶"]),
  status: z.enum(["solved", "needs_more_info", "unsupported"]),
  steps: z.array(solutionStepSchema).max(12),
  finalAnswerLatex: z.string().max(1000),
  finalAnswerText: z.string().max(1000).optional(),
  recommendedMode: explanationModeSchema.optional(),
  explanationMode: explanationModeSchema.optional(),
  modeReason: z.string().max(300).optional(),
  inputAssessment: questionAssessmentSchema.optional(),
  commonMistakes: z.array(z.string().max(300)).max(6).default([]),
  limitations: z.array(z.string().max(300)).max(5).default([]),
  rag: ragSnapshotSchema.optional().catch(undefined),
  visualization: z.preprocess((value) => value === null ? undefined : value, visualizationSpecSchema.optional()),
});

export const solveResultSchema = solveResultBaseSchema.superRefine((value, context) => {
  if (value.status === "solved" && (value.steps.length === 0 || !(value.finalAnswerLatex.trim() || value.finalAnswerText?.trim()))) {
    context.addIssue({ code: "custom", path: ["steps"], message: "已解答的题目必须有实际讲解步骤及最终答案，不能返回空解析" });
  }
  if (!value.normalizedQuestion.trim() || value.steps.some((step) => !step.title.trim() || !step.explanation.trim())) {
    context.addIssue({ code: "custom", path: ["steps"], message: "题干与步骤不能只有空白字符" });
  }
  if (value.status !== "solved" && value.limitations.length === 0) {
    context.addIssue({ code: "custom", path: ["limitations"], message: "不能解答时必须明确说明原因或缺失条件" });
  }
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

export const multiMethodSchema = z.object({
  methods: z.array(z.object({
    name: z.string().min(1).max(80),
    idea: z.string().min(1).max(500),
    applicability: z.string().min(1).max(300),
    steps: z.array(solutionStepSchema).min(1).max(8),
    answerLatex: z.string().min(1).max(700),
  })).min(2).max(3),
  comparison: z.string().min(1).max(1200),
});
export type MultiMethodResult = z.infer<typeof multiMethodSchema>;
export const paperSchema = z.object({
  title: z.string().min(1).max(100),
  rationale: z.string().min(1).max(1000),
  questions: z.array(practiceResultSchema.extend({ id: z.string().min(1).max(80), expectedConcepts: z.array(z.string().min(1).max(100)).min(1).max(6) })).min(3).max(8),
}).superRefine((paper, context) => {
  if (new Set(paper.questions.map((question) => question.id)).size !== paper.questions.length) {
    context.addIssue({ code: "custom", path: ["questions"], message: "题目 ID 不能重复" });
  }
});
export type PracticePaper = z.infer<typeof paperSchema>;
export const materialAnalysisSchema = z.object({
  title: z.string().min(1).max(100),
  summary: z.string().min(1).max(1200),
  topics: z.array(z.string().min(1).max(40)).min(1).max(20),
  questions: z.array(z.string().min(3).max(2000)).max(20),
  warnings: z.array(z.string().max(300)).max(6),
});
export type MaterialAnalysis = z.infer<typeof materialAnalysisSchema>;

export const understandingCheckSchema = z.object({
  id: z.string().min(1).max(80),
  question: z.string().min(1).max(1000),
  type: z.enum(["concept", "step-fill", "variation"]),
  hint: z.string().min(1).max(500),
  expectedConcepts: z.array(z.string().min(1).max(100)).min(1).max(6),
});
export type UnderstandingCheck = z.infer<typeof understandingCheckSchema>;

export const understandingFeedbackSchema = z.object({
  status: z.enum(["correct", "partially_correct", "incorrect", "uncertain"]),
  explanation: z.string().min(1).max(1400),
  strengths: z.array(z.string().max(240)).max(4).default([]),
  issues: z.array(z.string().max(240)).max(4).default([]),
  nextHint: z.string().max(500).default(""),
  answerLatex: z.string().max(700).optional(),
});
export type UnderstandingFeedback = z.infer<typeof understandingFeedbackSchema>;

const imageDataUrlSchema = z.string()
  .max(12_000_000)
  .regex(/^data:image\/(jpeg|png|webp|gif);base64,[A-Za-z0-9+/=]+$/, "图片格式不受支持");

export const tutorRequestSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("photo-tutor"), question: z.string().trim().max(2000).default(""), imageDataUrl: imageDataUrlSchema,
    mode: explanationSelectionSchema.default("auto"), ragEnabled: z.boolean().optional(), textbookIds: textbookIdsSchema.optional(), personalExcerpts: personalExcerptsSchema.optional(), learningContext: learningContextSummarySchema.optional() }),
  z.object({ action: z.literal("recognize-work"), question: z.string().max(2000).default(""), imageDataUrl: imageDataUrlSchema }),
  z.object({ action: z.literal("evaluate-work"), ...confirmedWorkSchema.shape, learningContext: learningContextSummarySchema.optional() }),
  z.object({ action: z.literal("work-hint"), ...confirmedWorkSchema.shape, evaluation: handwritingEvaluationSchema,
    level: z.union([z.literal(1), z.literal(2), z.literal(3)]), perspective: z.enum(["next", "alternative"]), learningContext: learningContextSummarySchema.optional() }),
  z.object({ action: z.literal("multi-method"), sourceQuestion: z.string().trim().min(3).max(2000), learningContext: learningContextSummarySchema.optional() }),
  z.object({ action: z.literal("generate-paper"), sources: z.array(z.object({ question: z.string().min(3).max(2000), topics: z.array(z.string().min(1).max(40)).min(1).max(8), errorReason: z.string().max(300) })).min(1).max(5), count: z.number().int().min(3).max(8), learningContext: learningContextSummarySchema.optional() }),
  z.object({ action: z.literal("analyze-material"), text: z.string().trim().min(10).max(20000), images: z.array(imageDataUrlSchema).max(5).optional(), learningContext: learningContextSummarySchema.optional() }),
  z.object({
    action: z.literal("solve"),
    ragEnabled: z.boolean().optional(),
    textbookIds: textbookIdsSchema.optional(),
    personalExcerpts: personalExcerptsSchema.optional(),
    question: z.string().trim().max(2000),
    mode: explanationSelectionSchema.default("auto"),
    imageDataUrl: imageDataUrlSchema.optional(),
    learningContext: learningContextSummarySchema.optional(),
  }),
  z.object({
    action: z.literal("explain-step"),
    question: z.string().trim().min(3).max(2000),
    step: solutionStepSchema,
    reason: z.string().trim().min(1).max(300),
    mode: explanationModeSchema,
    perspective: z.enum(["alternative", "visual", "foundation", "comparison", "example", "hint-only"]).optional(),
    learningContext: learningContextSummarySchema.optional(),
  }),
  z.object({
    action: z.literal("similar-practice"),
    sourceQuestion: z.string().trim().min(3).max(2000),
    topics: z.array(z.string().min(1).max(40)).min(1).max(8),
    difficulty: z.enum(["基础", "中等", "进阶"]),
    learningContext: learningContextSummarySchema.optional(),
  }),
  z.object({
    action: z.literal("generate-check"),
    sourceQuestion: z.string().trim().min(3).max(2000),
    topics: z.array(z.string().min(1).max(40)).min(1).max(8),
    difficulty: z.enum(["基础", "中等", "进阶"]),
    learningContext: learningContextSummarySchema.optional(),
  }),
  z.object({
    action: z.literal("evaluate-answer"),
    sourceQuestion: z.string().trim().min(3).max(2000),
    check: understandingCheckSchema,
    answer: z.string().trim().min(1).max(1200),
    learningContext: learningContextSummarySchema.optional(),
  }),
]).superRefine((value, context) => {
  if (value.action === "solve" && value.question.length < 1 && !value.imageDataUrl) {
    context.addIssue({ code: "custom", path: ["question"], message: "请输入题目或上传题目图片" });
  }
  if ("learningContext" in value && value.learningContext && !value.learningContext.profile.personalizationEnabled) {
    context.addIssue({ code: "custom", path: ["learningContext"], message: "个性化关闭时不能发送学习摘要" });
  }
});
export type TutorRequest = z.infer<typeof tutorRequestSchema>;

export const masterySchema = z.enum(["unreviewed", "reviewing", "mastered"]);
export type Mastery = z.infer<typeof masterySchema>;

export const mistakeRecordSchema = z.object({
  id: z.string(),
  question: z.string(),
  // Keep historical snapshots readable even if old model output was empty.
  // Strict lesson validation belongs to new API results, not destructive reads.
  solution: solveResultBaseSchema,
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
  // A damaged optional annotation must never erase an otherwise readable legacy record.
  handwriting: z.preprocess((value) => { const parsed = handwritingSessionSchema.safeParse(value); return parsed.success ? parsed.data : undefined; }, handwritingSessionSchema.optional()),
});
export type MistakeRecord = z.infer<typeof mistakeRecordSchema>;

export const userSettingsSchema = z.object({
  version: z.literal(2),
  theme: z.enum(["light", "dark", "system"]),
  defaultMode: explanationModeSchema,
  learnerProfile: learnerProfileSchema,
});
export type UserSettings = z.infer<typeof userSettingsSchema>;

export const legacyUserSettingsSchema = z.object({
  version: z.literal(1),
  theme: z.enum(["light", "dark", "system"]),
  defaultMode: explanationModeSchema,
});

export const understandingAttemptSchema = z.object({
  id: z.string().min(1),
  solutionId: z.string().min(1),
  topics: z.array(z.string().min(1).max(40)).max(8),
  status: understandingFeedbackSchema.shape.status,
  createdAt: z.string(),
});
export type UnderstandingAttempt = z.infer<typeof understandingAttemptSchema>;

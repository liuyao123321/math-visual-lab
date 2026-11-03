import { z } from "zod";
import { publishedCardMetadata, cardContentLength, MAX_CARD_CONTENT } from "../textbook-cards";

const id = z.string().min(1).max(80);
const webSourceSchema = z.object({
  title: z.string().min(1).max(180),
  section: z.string().min(1).max(150),
  url: z.string().url().refine((url) => url.startsWith("https://"), "来源必须使用HTTPS"),
});
export const localTextbookIdSchema = z.string().regex(/^local-pdf-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
export const knowledgeSourceSchema = z.union([webSourceSchema, z.object({
  kind: z.literal("local_pdf"), title: z.string().min(1).max(180), section: z.string().min(1).max(150),
  fileName: z.string().min(1).max(200), pageNumber: z.number().int().min(1).safe(), textbookId: localTextbookIdSchema,
  pageEnd: z.number().int().positive().safe().optional(),
  category: publishedCardMetadata.innerType().shape.category.optional(),
  cardVersion: z.literal(1).optional(),
  url: z.undefined().optional(),
})]);
export const personalExcerptSchema = z.object({
  id: z.string().min(1).max(80), textbookId: localTextbookIdSchema,
  title: z.string().min(1).max(180), fileName: z.string().min(1).max(200), pageNumber: z.number().int().min(1).safe(),
  text: z.string().trim().min(20).max(1200),
  structured: publishedCardMetadata.optional(),
}).refine((value) => value.id.startsWith(value.textbookId + ":"), "摘录编号必须属于对应个人教材")
  .refine((value) => !value.structured || (value.structured.pageEnd >= value.pageNumber &&
    /^c\d{1,6}:v1$/.test(value.id.slice(value.textbookId.length + 1)) &&
    cardContentLength(value.text, value.structured) <= MAX_CARD_CONTENT), "结构化卡片来源或内容长度无效");
export const personalExcerptsSchema = z.array(personalExcerptSchema).max(4).refine((items) => new Set(items.map((item) => item.id)).size === items.length, "摘录编号重复");
export type PersonalExcerpt = z.infer<typeof personalExcerptSchema>;
export const knowledgeCardSchema = z.object({
  id, title: z.string().min(1).max(120),
  kind: z.enum(["definition", "theorem", "method", "pitfall", "counterexample", "excerpt"]),
  keywords: z.array(z.string().min(1).max(60)).min(1).max(20),
  statement: z.string().min(1).max(1800),
  formulas: z.array(z.string().max(400)).max(4),
  conditions: z.array(z.object({ id, text: z.string().min(1).max(400) })).max(6),
  pitfalls: z.array(z.string().max(400)).max(4),
  sourceId: id,
  reviewStatus: z.enum(["draft", "source_checked", "teacher_reviewed", "user_confirmed"]),
});
export type KnowledgeCard = z.infer<typeof knowledgeCardSchema>;
export const evidenceCardSchema = knowledgeCardSchema.extend({ source: knowledgeSourceSchema }).superRefine((card, ctx) => {
  if ("kind" in card.source && card.source.kind === "local_pdf" && (card.kind !== "excerpt" || card.reviewStatus !== "user_confirmed" || card.sourceId !== card.source.textbookId)) {
    ctx.addIssue({ code: "custom", message: "个人PDF必须标为用户核对的原文摘录，不能伪装教师审核资料" });
  }
});
export type EvidenceCard = z.infer<typeof evidenceCardSchema>;

export const conditionCheckSchema = z.object({
  knowledgeId: id, conditionId: id,
  status: z.enum(["satisfied", "not_satisfied", "unknown", "not_applicable"]),
  evidence: z.string().min(1).max(400),
});
export const stepKnowledgeSchema = {
  knowledgeIds: z.array(id).max(4).optional(),
  citationPurpose: z.enum(["apply", "explain", "contrast"]).optional(),
  conditionChecks: z.array(conditionCheckSchema).max(16).optional(),
};

export const ragSnapshotSchema = z.object({
  version: z.literal(1), knowledgeBaseVersion: z.string().max(80),
  status: z.enum(["matched", "no_match", "not_used"]),
  retrievalMode: z.enum(["text", "vector", "hybrid", "none"]),
  vectorStatus: z.enum(["ready", "unavailable", "index_mismatch", "not_requested"]),
  message: z.string().max(500),
  cards: z.array(evidenceCardSchema).max(4),
  usedKnowledgeIds: z.array(id).max(4),
  retrievalMs: z.number().finite().nonnegative(),
  textbookIds: z.array(id).min(1).max(10).optional(),
}).superRefine((snapshot, context) => {
  const ids = new Set(snapshot.cards.map((card) => card.id));
  if (ids.size !== snapshot.cards.length || snapshot.usedKnowledgeIds.some((item) => !ids.has(item))) {
    context.addIssue({ code: "custom", message: "引用快照编号不一致" });
  }
  if (snapshot.status === "no_match" && snapshot.cards.length) context.addIssue({ code: "custom", message: "未覆盖状态不能包含知识卡" });
});
export type RagSnapshot = z.infer<typeof ragSnapshotSchema>;

export const corpusSchema = z.object({
  version: z.string().min(1),
  scope: z.string(),
  sources: z.record(knowledgeSourceSchema),
  cards: z.array(knowledgeCardSchema).min(1).max(500),
}).superRefine((corpus, context) => {
  const ids = new Set<string>();
  for (const card of corpus.cards) {
    if (ids.has(card.id) || !corpus.sources[card.sourceId]) context.addIssue({ code: "custom", message: `知识编号重复或缺少来源：${card.id}` });
    ids.add(card.id);
    if (new Set(card.conditions.map((condition) => condition.id)).size !== card.conditions.length) context.addIssue({ code: "custom", message: `条件编号重复：${card.id}` });
  }
});

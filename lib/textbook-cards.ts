import { z } from "zod";
import { mathFormattingError } from "./formula";

export const textbookCardKinds = { knowledge: "知识点", example: "例题", exercise: "课后题", unknown: "待分类" } as const;
export const publishedCardMetadata = z.object({
  category: z.enum(["knowledge", "example", "exercise"]),
  title: z.string().trim().min(1).max(100),
  section: z.string().trim().min(1).max(100),
  pageEnd: z.number().int().positive().safe(),
  formulas: z.array(z.string().trim().min(1).max(240)).max(4),
  conditions: z.array(z.string().trim().min(1).max(240)).max(6),
  noConditions: z.boolean(),
  version: z.literal(1),
}).refine((value) => value.category !== "knowledge" || (value.conditions.length > 0) !== value.noConditions,
  "知识点须填写适用条件，或明确核对原文未列额外条件");
export type PublishedCardMetadata = z.infer<typeof publishedCardMetadata>;
export const MAX_TEXTBOOK_CARDS = 500;
export const MAX_CARD_CONTENT = 1200;
export function cardContentLength(text: string, meta: Pick<PublishedCardMetadata, "title" | "section" | "formulas" | "conditions">) {
  return [text, meta.title, meta.section, ...meta.formulas, ...meta.conditions].join("\n").length;
}
export const reviewedTextbookCard = z.object({
  id: z.string().regex(/^c\d{1,6}$/), text: z.string().trim().min(20).max(MAX_CARD_CONTENT),
  pageNumber: z.number().int().positive().safe(), reviewedAt: z.string().datetime(),
  metadata: publishedCardMetadata,
}).superRefine((card, ctx) => {
  if (card.metadata.pageEnd < card.pageNumber || cardContentLength(card.text, card.metadata) > MAX_CARD_CONTENT) {
    ctx.addIssue({ code: "custom", message: "请核对页码；正文、标题、章节、条件与公式合计不能超过1200字符" });
  }
});
export type ReviewedTextbookCard = z.infer<typeof reviewedTextbookCard>;
export type TextbookCardDraft = {
  id: string; category: keyof typeof textbookCardKinds; title: string; section: string;
  pageNumber: number; pageEnd: number; source: string; text: string;
  formulas: string; conditions: string; noConditions: boolean;
  reviewed?: ReviewedTextbookCard; excluded?: boolean;
};
export const pageRangeLabel = (start: number, end: number) => start === end ? String(start) : start + "–" + end;

// Classification is only a suggestion. Use explicit line headings, not topic keywords.
export function suggestTextbookCards(pages: readonly { pageNumber: number; text: string }[]): TextbookCardDraft[] {
  const cards: TextbookCardDraft[] = [];
  let section = "未标注章节";
  let exerciseSection = false;
  let active: TextbookCardDraft | undefined;
  let previousPage = 0;
  function push(text: string, category: TextbookCardDraft["category"], pageNumber: number) {
    if (cards.length >= MAX_TEXTBOOK_CARDS) throw new Error("本批候选超过500条，请缩小页码范围。未截断内容。");
    active = { id: "c" + (cards.length + 1), category, section, title: text.trim().slice(0, 60),
      pageNumber, pageEnd: pageNumber, source: text, text, formulas: "", conditions: "", noConditions: false };
    cards.push(active);
  }
  for (const page of [...pages].sort((a, b) => a.pageNumber - b.pageNumber)) {
    if (page.pageNumber !== previousPage + 1 || active?.category === "unknown" || (active?.text.length ?? 0) >= MAX_CARD_CONTENT) active = undefined;
    previousPage = page.pageNumber;
    for (const line of page.text.split(/\r?\n/)) {
      if (!line.trim()) { if (active) { active.text += "\n"; active.source += "\n"; } continue; }
      const value = line.trim();
      if (/^(?:第\s*[\d一二三四五六七八九十]+\s*[章节]|§\s*\d)/.test(value)) {
        section = value.slice(0, 100); exerciseSection = false; active = undefined; continue;
      }
      if (/^(?:课后习题|课后练习|习题|练习)(?:\s*[\d.．-]+)?\s*[:：]?\s*$/.test(value)) {
        section = (section + " / " + value).slice(0, 100); exerciseSection = true; active = undefined; continue;
      }
      const category = /^(?:定义|定理|引理|推论|性质|公式)(?=\s|[\d:：.．])/u.test(value) ? "knowledge"
        : /^(?:例题|例)(?=\s|[\d:：.．一二三四五六七八九十])/u.test(value) ? "example"
        : /^(?:习题|练习|课后题)(?=\s|[\d:：.．])/u.test(value) || exerciseSection && /^\s*[（(]?\d+[.．、）)]/.test(value) ? "exercise" : undefined;
      if (category || !active) push(line, category ?? (exerciseSection ? "exercise" : "unknown"), page.pageNumber);
      else { active.text += "\n" + line; active.source += "\n" + line; active.pageEnd = page.pageNumber; }
    }
  }
  return cards;
}

export function approveTextbookCard(draft: TextbookCardDraft, reviewedAt = new Date().toISOString()) {
  if (draft.category === "unknown") throw new Error("请先选择这条内容的类别。");
  const lines = (value: string) => value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const result = reviewedTextbookCard.safeParse({ id: draft.id, text: draft.text, pageNumber: draft.pageNumber, reviewedAt,
    metadata: { title: draft.title, section: draft.section, category: draft.category, pageEnd: draft.pageEnd,
      formulas: lines(draft.formulas), conditions: lines(draft.conditions), noConditions: draft.noConditions, version: 1 } });
  if (!result.success) throw new Error(result.error.issues.find((issue) => issue.code === "custom")?.message ??
    "请填写标题、章节及至少20字正文；条件最多6条、公式最多4条，卡片内容合计最多1200字符。");
  if ([result.data.text, result.data.metadata.title, result.data.metadata.section, ...result.data.metadata.conditions, ...result.data.metadata.formulas].some((value) => value.includes("�"))) {
    throw new Error("卡片仍有无法解码的字符，请对照原PDF修正后再通过。");
  }
  const formatting = result.data.metadata.formulas.map((formula) => mathFormattingError(formula, true)).find(Boolean)
    ?? [result.data.text, ...result.data.metadata.conditions].map((value) => mathFormattingError(value)).find(Boolean);
  if (formatting) throw new Error(formatting);
  return result.data;
}

import { z } from "zod";
import { createBm25, reciprocalRankFusion } from "./rag/bm25";
import { localTextbookIdSchema, personalExcerptsSchema, type EvidenceCard, type PersonalExcerpt, type RagSnapshot } from "./rag/schema";

export const PERSONAL_LIBRARY_KEY = "mathlab.personal-textbooks.v1";
export const PERSONAL_LIBRARY_EVENT = "mathlab:personal-textbooks-change";
export const personalPageSchema = z.object({ pageNumber: z.number().int().min(1).max(10000), text: z.string().trim().min(20).max(12000) });
export const personalBookSchema = z.object({
  id: localTextbookIdSchema, title: z.string().trim().min(1).max(180), fileName: z.string().min(1).max(200),
  fingerprint: z.string().regex(/^[a-f0-9]{64}$/), subject: z.enum(["高等数学", "线性代数", "概率统计", "其他"]),
  createdAt: z.string().datetime(), allowAiUse: z.boolean(), pages: z.array(personalPageSchema).min(1).max(30),
}).superRefine((book, ctx) => {
  if (new Set(book.pages.map((page) => page.pageNumber)).size !== book.pages.length) ctx.addIssue({ code: "custom", message: "PDF页码重复" });
  if (book.pages.reduce((count, page) => count + page.text.length, 0) > 150000) ctx.addIssue({ code: "custom", message: "一次最多保存150000字符，请按章节拆分" });
});
export type PersonalBook = z.infer<typeof personalBookSchema>;
const librarySchema = z.object({ version: z.literal(1), books: z.array(personalBookSchema).max(5) }).refine((value) => new Set(value.books.map((book) => book.id)).size === value.books.length, "个人教材编号重复");
export function readPersonalLibrary(): { books: PersonalBook[]; error: string } {
  try {
    if (typeof window === "undefined") return { books: [], error: "" };
    const raw = window.localStorage.getItem(PERSONAL_LIBRARY_KEY);
    if (!raw) return { books: [], error: "" };
    if (raw.length > 1800000) throw new Error("oversized");
    return { books: librarySchema.parse(JSON.parse(raw)).books, error: "" };
  } catch { return { books: [], error: "个人教材存储无法读取，原数据未删除。请先备份浏览器数据，不要覆盖导入。" }; }
}
function writeLibrary(books: PersonalBook[]) {
  const raw = JSON.stringify(librarySchema.parse({ version: 1, books }));
  if (raw.length > 1800000) throw new Error("个人教材文字总量过大，请减少导入章节。原有资料未改动。");
  try { window.localStorage.setItem(PERSONAL_LIBRARY_KEY, raw); }
  catch { throw new Error("浏览器存储空间不足或不可用，保存失败，原有资料未改动。请复制预览内容后再处理。"); }
  window.dispatchEvent(new Event(PERSONAL_LIBRARY_EVENT));
}
export function savePersonalBook(input: PersonalBook) {
  const state = readPersonalLibrary(); if (state.error) throw new Error(state.error);
  const book = personalBookSchema.parse(input);
  if (state.books.length >= 5) throw new Error("最多保存5份个人教材章节，请先备份并移除不再需要的资料。");
  if (state.books.some((old) => old.id === book.id || (old.fingerprint === book.fingerprint && old.pages.map((page) => page.pageNumber).join(",") === book.pages.map((page) => page.pageNumber).join(",")))) throw new Error("相同PDF的这些页码已经导入，请使用已有教材，不会重复保存或覆盖。");
  writeLibrary([...state.books, book]); return book;
}
export function removePersonalBook(id: string) {
  localTextbookIdSchema.parse(id);
  const state = readPersonalLibrary(); if (state.error) throw new Error(state.error);
  writeLibrary(state.books.filter((book) => book.id !== id));
}
export function setPersonalAiConsent(id: string, allowAiUse: boolean) {
  const state = readPersonalLibrary(); if (state.error) throw new Error(state.error);
  if (!state.books.some((book) => book.id === id)) throw new Error("个人教材不存在，请重新选择。");
  writeLibrary(state.books.map((book) => book.id === id ? { ...book, allowAiUse } : book));
}
export function personalChunks(book: PersonalBook): PersonalExcerpt[] {
  const chunks: PersonalExcerpt[] = [];
  for (const page of book.pages) {
    for (let start = 0; start < page.text.length; start += 1050) {
      const text = page.text.slice(start, start + 1200).trim();
      if (text.length >= 20) chunks.push({ id: `${book.id}:${page.pageNumber}:${start}`, textbookId: book.id, title: book.title, fileName: book.fileName, pageNumber: page.pageNumber, text });
      if (start + 1200 >= page.text.length) break;
    }
  }
  return chunks;
}
export function searchPersonalExcerpts(query: string, books: PersonalBook[], selected = "all", forAi = false): PersonalExcerpt[] {
  const chunks = books.filter((book) => (selected === "all" || book.id === selected) && (!forAi || book.allowAiUse)).flatMap(personalChunks);
  const byId = new Map(chunks.map((chunk) => [chunk.id, chunk]));
  return createBm25(chunks.map((chunk) => ({ id: chunk.id, text: chunk.text })))(query, 4).map((hit) => byId.get(hit.id)!);
}
export function mergePersonalEvidence(base: RagSnapshot, query: string, raw: PersonalExcerpt[], textbookIds?: string[]): RagSnapshot {
  const excerpts = personalExcerptsSchema.parse(raw).filter((item) => !textbookIds || textbookIds.includes(item.textbookId));
  if (!excerpts.length) return base;
  const hits = createBm25(excerpts.map((item) => ({ id: item.id, text: item.text })))(query, 4);
  const personal: EvidenceCard[] = hits.map((hit) => {
    const item = excerpts.find((entry) => entry.id === hit.id)!;
    return { id: item.id, title: `${item.title} · PDF第${item.pageNumber}页`, kind: "excerpt", keywords: ["个人教材原文摘录"], statement: item.text,
      formulas: [], conditions: [], pitfalls: ["PDF提取可能丢失公式排版；条件未结构化，请对照原页核验，不是已审核定理。"],
      sourceId: item.textbookId, reviewStatus: "user_confirmed",
      source: { kind: "local_pdf", title: item.title, section: `PDF文件第${item.pageNumber}页`, fileName: item.fileName, pageNumber: item.pageNumber, textbookId: item.textbookId } };
  });
  if (!personal.length) return base;
  const lookup = new Map([...base.cards, ...personal].map((card) => [card.id, card]));
  const ranking = reciprocalRankFusion([base.cards.map((card, index) => ({ id: card.id, score: 1 / (index + 1) })), hits]);
  const cards = ranking.map((hit) => lookup.get(hit.id)!);
  const usesPublic = cards.some((card) => card.source.url);
  return { ...base, status: "matched", cards, usedKnowledgeIds: [], retrievalMode: usesPublic ? base.retrievalMode : "text",
    vectorStatus: usesPublic ? base.vectorStatus : "not_requested", message: "已检索个人PDF原文摘录（文本检索，非教师审核）；请核对原页与公式。" + (usesPublic ? "同时包含课程知识卡。" : ""),
    ...(textbookIds ? { textbookIds } : {}) };
}
export function emptyPersonalSnapshot(textbookIds?: string[]): RagSnapshot {
  return { version: 1, knowledgeBaseVersion: "personal-pdf-v1", status: "no_match", retrievalMode: "none", vectorStatus: "not_requested",
    message: "所选个人教材未找到相关文字；不会用其他教材代替。", cards: [], usedKnowledgeIds: [], retrievalMs: 0, ...(textbookIds ? { textbookIds } : {}) };
}

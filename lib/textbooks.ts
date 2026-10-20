import { z } from "zod";
import catalog from "@/data/knowledge/textbooks.json";
import { localTextbookIdSchema } from "./rag/schema";
import { readPersonalLibrary } from "./personal-library";

export const textbookCatalog = z.object({ version: z.literal(1), textbooks: z.array(z.object({
  id: z.string().regex(/^[a-z0-9-]+$/).max(80), title: z.string().min(1).max(180), subject: z.string().min(1).max(40),
  status: z.enum(["available", "coming_soon"]), coverage: z.string().min(1).max(300), sourceIds: z.array(z.string().min(1).max(80)).max(100),
})).max(100) }).superRefine((value, context) => {
  if (new Set(value.textbooks.map((book) => book.id)).size !== value.textbooks.length) context.addIssue({ code: "custom", message: "教材编号不能重复" });
  for (const book of value.textbooks) {
    if (book.status === "available" && !book.sourceIds.length) context.addIssue({ code: "custom", message: "可选教材必须配置资料来源" });
    if (new Set(book.sourceIds).size !== book.sourceIds.length) context.addIssue({ code: "custom", message: "教材来源不能重复" });
  }
}).parse(catalog);
export const availableTextbooks = textbookCatalog.textbooks.filter((book) => book.status === "available");
export const textbookIdsSchema = z.array(z.string().refine((id) => availableTextbooks.some((book) => book.id === id) || localTextbookIdSchema.safeParse(id).success, "教材不存在或尚未收录"))
  .min(1).max(10).refine((ids) => new Set(ids).size === ids.length, "不能重复选择同一本教材");

export function textbookSourceIds(ids?: string[]): Set<string> | undefined {
  // Even "all" excludes future/unregistered textbooks; never leak pending content.
  const checked = ids === undefined ? availableTextbooks.map((book) => book.id) : textbookIdsSchema.parse(ids);
  return new Set(availableTextbooks.filter((book) => checked.includes(book.id)).flatMap((book) => book.sourceIds));
}
export function filterTextbookCards<T extends { sourceId: string }>(cards: T[], sourceIds?: Set<string>): T[] {
  return sourceIds ? cards.filter((card) => sourceIds.has(card.sourceId)) : cards;
}

export const TEXTBOOK_SELECTION_KEY = "mathlab.textbook-selection.v1";
const preferenceSchema = z.object({ version: z.literal(1), textbookId: z.string().refine((id) => id === "all" || availableTextbooks.some((book) => book.id === id) || readPersonalLibrary().books.some((book) => book.id === id)) });
export function readTextbookSelection(): string {
  try {
    if (typeof window === "undefined") return "all";
    const raw = window.localStorage.getItem(TEXTBOOK_SELECTION_KEY);
    return raw ? preferenceSchema.parse(JSON.parse(raw)).textbookId : "all";
  } catch { return "all"; } // Never clear unrelated settings or a damaged original record.
}
export function writeTextbookSelection(textbookId: string): boolean {
  try {
    const value = preferenceSchema.parse({ version: 1, textbookId });
    window.localStorage.setItem(TEXTBOOK_SELECTION_KEY, JSON.stringify(value));
    return true;
  } catch { return false; }
}

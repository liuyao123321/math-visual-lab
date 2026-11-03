import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { savePersonalBook, readPersonalLibrary, PERSONAL_LIBRARY_KEY, removePersonalBook, setPersonalAiConsent, personalChunks, searchPersonalExcerpts, mergePersonalEvidence, emptyPersonalSnapshot } from "./personal-library";
import { personalBookFixture as book } from "@/testdata/personal-library";
import { ragSnapshotSchema } from "./rag/schema";
import { citationError } from "./rag/citations";
import { examples } from "./examples";
beforeEach(() => localStorage.clear());
afterEach(() => vi.restoreAllMocks());
describe("personal PDF library", () => {
  it("stores confirmed text and source pages, never additional PDF/image/key fields", () => {
    savePersonalBook({ ...book, originalPdf: "PRIVATE-BYTES", apiKey: "PRIVATE-KEY" } as typeof book);
    expect(readPersonalLibrary().books[0]).toEqual(book);
    const raw = localStorage.getItem(PERSONAL_LIBRARY_KEY)!;
    expect(raw).not.toContain("PRIVATE-BYTES"); expect(raw).not.toContain("PRIVATE-KEY");
  });
  it("does not duplicate or overwrite the same PDF pages", () => {
    savePersonalBook(book);
    expect(() => savePersonalBook({ ...book, id: "local-pdf-22222222-2222-4222-8222-222222222222" })).toThrow("已经导入");
    expect(readPersonalLibrary().books).toEqual([book]);
  });
  it("round-trips 600 pages without truncation and preserves high original page numbers", () => {
    const large = { ...book, pages: Array.from({ length: 600 }, (_, index) => ({ pageNumber: index + 10001, text: book.pages[0].text.repeat(10) })) };
    savePersonalBook(large);
    expect(readPersonalLibrary().books[0]).toEqual(large);
    const hits = searchPersonalExcerpts("矩阵乘法", readPersonalLibrary().books);
    const result = mergePersonalEvidence(emptyPersonalSnapshot([book.id]), "矩阵乘法", hits, [book.id]);
    expect(result.cards[0].source).toMatchObject({ pageNumber: 10001 });
    expect(ragSnapshotSchema.safeParse(result).success).toBe(true);
  });
  it("rejects oversized text without changing the existing library", () => {
    savePersonalBook(book);
    const before = localStorage.getItem(PERSONAL_LIBRARY_KEY);
    expect(() => savePersonalBook({ ...book, id: "local-pdf-22222222-2222-4222-8222-222222222222", pages: Array.from({ length: 10 }, (_, index) => ({ pageNumber: index + 1, text: "x".repeat(160000) })) })).toThrow("150万字符");
    expect(localStorage.getItem(PERSONAL_LIBRARY_KEY)).toBe(before);
  });
  it("keeps original data when storage is corrupt or quota is exceeded", () => {
    localStorage.setItem(PERSONAL_LIBRARY_KEY, "broken");
    expect(() => savePersonalBook(book)).toThrow("未删除");
    expect(localStorage.getItem(PERSONAL_LIBRARY_KEY)).toBe("broken");
    localStorage.clear(); savePersonalBook(book);
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("quota"); });
    expect(() => setPersonalAiConsent(book.id, true)).toThrow("保存失败");
    expect(readPersonalLibrary().books[0].allowAiUse).toBe(false);
  });
  it("requires separate AI consent and never sends unrelated books' excerpts", () => {
    expect(searchPersonalExcerpts("矩阵乘法", [book])).toHaveLength(1);
    expect(searchPersonalExcerpts("矩阵乘法", [book], "all", true)).toEqual([]);
    expect(searchPersonalExcerpts("矩阵乘法", [{ ...book, allowAiUse: true }], "all", true)).toHaveLength(1);
    expect(searchPersonalExcerpts("矩阵乘法", [book], "openstax-calculus-1")).toEqual([]);
    expect(searchPersonalExcerpts("完全不相关的量子物理", [book])).toEqual([]);
  });
  it("preserves page numbers, bounded chunks and user-confirmed provenance outside the public topic gate", () => {
    const chunks = personalChunks({ ...book, pages: [{ pageNumber: 3, text: book.pages[0].text.repeat(35) }] });
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((chunk) => chunk.pageNumber === 3 && chunk.text.length <= 1200)).toBe(true);
    const snapshot = mergePersonalEvidence(emptyPersonalSnapshot([book.id]), "矩阵乘法", personalChunks(book), [book.id]);
    expect(snapshot.status).toBe("matched"); expect(snapshot.retrievalMode).toBe("text");
    expect(snapshot.cards[0].reviewStatus).toBe("user_confirmed");
    expect(snapshot.cards[0].source).toMatchObject({ kind: "local_pdf", pageNumber: 3, fileName: book.fileName });
    expect(ragSnapshotSchema.safeParse(snapshot).success).toBe(true);
    expect(ragSnapshotSchema.safeParse({ ...snapshot, cards: [{ ...snapshot.cards[0], reviewStatus: "teacher_reviewed" }] }).success).toBe(false);
  });
  it("does not turn unstructured excerpts into unconditional theorem applications", () => {
    const snapshot = mergePersonalEvidence(emptyPersonalSnapshot([book.id]), "矩阵乘法", personalChunks(book), [book.id]);
    const answer = structuredClone(examples[0]);
    answer.steps[0].knowledgeIds = [snapshot.cards[0].id]; answer.steps[0].citationPurpose = "apply";
    expect(citationError(answer, snapshot)).toContain("原文摘录");
    answer.steps[0].citationPurpose = "explain";
    expect(citationError(answer, snapshot)).toBeNull();
  });
  it("changes only the chosen personal record and leaves real learning keys untouched", () => {
    localStorage.setItem("mathlab.mistakes.v1", "preserve"); savePersonalBook(book);
    setPersonalAiConsent(book.id, true);
    expect(readPersonalLibrary().books[0].allowAiUse).toBe(true);
    removePersonalBook(book.id);
    expect(readPersonalLibrary().books).toEqual([]);
    expect(localStorage.getItem("mathlab.mistakes.v1")).toBe("preserve");
  });
});

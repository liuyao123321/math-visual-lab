import { beforeEach, describe, expect, it } from "vitest";
import { approveTextbookCard, suggestTextbookCards } from "./textbook-cards";
import { emptyPersonalSnapshot, mergePersonalEvidence, readPersonalLibrary, savePersonalBook, searchPersonalExcerpts, setPersonalAiConsent, withdrawPersonalCard } from "./personal-library";
import { personalExcerptsSchema, ragSnapshotSchema } from "./rag/schema";
import { citationError } from "./rag/citations";
import { personalBookFixture } from "@/testdata/personal-library";
import { examples } from "./examples";

const pages = [
  { pageNumber: 3, text: "第二章 矩阵\n定理 2.1 矩阵乘法\n矩阵乘法只有在左矩阵列数与右矩阵行数相等时才有定义。\n例 2.2 矩阵乘法\n求两个具体矩阵的乘积，首先检查行列数。" },
  { pageNumber: 4, text: "解：确认维数匹配后，按行列内积求元素。\n课后习题\n1. 证明矩阵乘法满足结合律并说明各矩阵的尺寸。" },
  { pageNumber: 6, text: "第三章 行列式\n这是尚未分类的测试内容，包含唯一术语孤立文本。" },
];
const approve = (index: number) => approveTextbookCard({ ...suggestTextbookCards(pages)[index],
  conditions: index === 0 ? "左矩阵列数等于右矩阵行数" : "", formulas: index === 0 ? "A_{m\\times n}B_{n\\times p}" : "" });
beforeEach(() => localStorage.clear());

describe("structured personal textbook evidence", () => {
  it("classifies explicit headings, preserves cross-page solutions and keeps unknown content unclassified", () => {
    const cards = suggestTextbookCards(pages);
    expect(cards.map((card) => card.category)).toEqual(["knowledge", "example", "exercise", "unknown"]);
    expect(cards[1]).toMatchObject({ pageNumber: 3, pageEnd: 4, section: "第二章 矩阵" });
    expect(cards[1].source).toContain("按行列内积求元素");
    expect(cards[3]).toMatchObject({ pageNumber: 6, pageEnd: 6, section: "第三章 行列式" });
  });
  it("requires human category and conditions, rejects invalid LaTeX and never truncates a long card", () => {
    const [knowledge, , , unknown] = suggestTextbookCards(pages);
    expect(() => approveTextbookCard(unknown)).toThrow("先选择");
    expect(() => approveTextbookCard(knowledge)).toThrow("适用条件");
    expect(() => approveTextbookCard({ ...knowledge, conditions: "维数匹配", formulas: "\\notARealCommand{1}" })).toThrow("LaTeX");
    expect(() => approveTextbookCard({ ...knowledge, text: "数学文本".repeat(400), conditions: "维数匹配" })).toThrow();
    expect(approve(0).metadata.conditions).toEqual(["左矩阵列数等于右矩阵行数"]);
  });
  it("persists only approved card evidence, keeps source and conditions, and never falls back after withdrawal", () => {
    const book = savePersonalBook({ ...personalBookFixture, pages, cards: [approve(0)] });
    const restored = readPersonalLibrary().books;
    expect(restored).toEqual([book]);
    expect(searchPersonalExcerpts("孤立文本", restored, book.id)).toEqual([]);
    const found = searchPersonalExcerpts("矩阵乘法", restored, book.id);
    const snapshot = ragSnapshotSchema.parse(mergePersonalEvidence(emptyPersonalSnapshot([book.id]), "矩阵乘法", found, [book.id]));
    expect(snapshot.cards[0]).toMatchObject({ reviewStatus: "user_confirmed", kind: "excerpt", formulas: ["A_{m\\times n}B_{n\\times p}"],
      conditions: [{ text: "左矩阵列数等于右矩阵行数" }], source: { fileName: book.fileName, pageNumber: 3, section: "第二章 矩阵", category: "knowledge", cardVersion: 1 } });
    withdrawPersonalCard(book.id, book.cards![0].id);
    expect(readPersonalLibrary().books[0].pages).toEqual(pages);
    expect(searchPersonalExcerpts("矩阵乘法", readPersonalLibrary().books, book.id)).toEqual([]);
  });
  it("honors AI opt-in and excludes exercises from AI while keeping them locally searchable", () => {
    const book = savePersonalBook({ ...personalBookFixture, pages, cards: [approve(0), approve(1), approve(2)] });
    expect(searchPersonalExcerpts("矩阵乘法", [book], book.id, true)).toEqual([]);
    setPersonalAiConsent(book.id, true);
    const authorized = readPersonalLibrary().books;
    expect(searchPersonalExcerpts("矩阵乘法", authorized, book.id).some((item) => item.structured?.category === "exercise")).toBe(true);
    expect(searchPersonalExcerpts("矩阵乘法", authorized, book.id, true).map((item) => item.structured?.category).sort()).toEqual(["example", "knowledge"]);
    setPersonalAiConsent(book.id, false);
    expect(searchPersonalExcerpts("矩阵乘法", readPersonalLibrary().books, book.id, true)).toEqual([]);
  });
  it("validates evidence limits and prevents applying personal cards as certified theorems", () => {
    const book = { ...personalBookFixture, pages, cards: [approve(0)] };
    const snippets = searchPersonalExcerpts("矩阵乘法", [book]);
    expect(personalExcerptsSchema.safeParse([{ ...snippets[0], text: "字".repeat(1199) }]).success).toBe(false);
    const snapshot = mergePersonalEvidence(emptyPersonalSnapshot(), "矩阵乘法", snippets);
    const solution = { ...examples[0], steps: [{ ...examples[0].steps[0], knowledgeIds: [snapshot.cards[0].id], citationPurpose: "apply" as const }] };
    expect(citationError(solution, snapshot)).toContain("不能");
  });
});

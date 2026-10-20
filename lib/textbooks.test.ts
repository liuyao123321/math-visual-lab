import { beforeEach, describe, expect, it, vi, afterEach } from "vitest";
import { availableTextbooks, filterTextbookCards, textbookSourceIds, textbookIdsSchema,
  readTextbookSelection, writeTextbookSelection, TEXTBOOK_SELECTION_KEY } from "./textbooks";
import corpus from "@/data/knowledge/derivatives.json";
beforeEach(() => localStorage.clear());
afterEach(() => vi.restoreAllMocks());
describe("textbook catalog and preferences", () => {
  it("only advertises the existing partial corpus and maps genuine sources", () => {
    const ids = availableTextbooks.map((book) => book.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const book of availableTextbooks) {
      expect(book.coverage).toContain("部分");
      for (const source of book.sourceIds) expect(Object.hasOwn(corpus.sources, source)).toBe(true);
    }
  });
  it("filters candidates before ranking, including empty selections without falling back", () => {
    const cards = [{ id: "a", sourceId: "definition" }, { id: "b", sourceId: "another-book" }];
    expect(filterTextbookCards(cards, textbookSourceIds([availableTextbooks[0].id]))).toEqual([cards[0]]);
    expect(filterTextbookCards(cards, textbookSourceIds())).toEqual([cards[0]]);
    expect(filterTextbookCards(cards, new Set())).toEqual([]);
    expect(filterTextbookCards(cards)).toEqual(cards);
  });
  it("rejects unknown, empty or duplicated textbook IDs", () => {
    for (const ids of [[], ["unavailable-book"], [availableTextbooks[0].id, availableTextbooks[0].id]]) expect(textbookIdsSchema.safeParse(ids).success).toBe(false);
  });
  it("persists only textbook selection and safely handles damaged preferences", () => {
    expect(readTextbookSelection()).toBe("all");
    expect(writeTextbookSelection(availableTextbooks[0].id)).toBe(true);
    expect(readTextbookSelection()).toBe(availableTextbooks[0].id);
    localStorage.setItem("unrelated-record", "preserve");
    localStorage.setItem(TEXTBOOK_SELECTION_KEY, "broken");
    expect(readTextbookSelection()).toBe("all");
    expect(localStorage.getItem(TEXTBOOK_SELECTION_KEY)).toBe("broken");
    expect(localStorage.getItem("unrelated-record")).toBe("preserve");
  });
  it("reports failed preference writes rather than deleting settings", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("quota"); });
    expect(writeTextbookSelection(availableTextbooks[0].id)).toBe(false);
  });
});

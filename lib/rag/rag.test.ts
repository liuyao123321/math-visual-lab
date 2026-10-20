// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import * as textbookRules from "@/lib/textbooks";
import { createBm25, reciprocalRankFusion } from "./bm25";
import { normalizeQuery, tokenize } from "./tokenize";
import { knowledgeCards, retrieveKnowledge, validVectorIndex } from "./retrieve";
import { attachRagSnapshot, citationError } from "./citations";
import { examples } from "@/lib/examples";
import { solveResultSchema } from "@/lib/math-schema";
import { mathFormattingError } from "@/lib/formula";
import vectors from "@/data/rag-index/vectors.json";

describe("course retrieval", () => {
  it("filters both lexical and dense candidates before fusion (simulated narrower textbook scope)", async () => {
    const scope = vi.spyOn(textbookRules, "textbookSourceIds").mockReturnValue(new Set(["definition"]));
    try {
      const { snapshot } = await retrieveKnowledge("导数定义", { textbookIds: ["openstax-calculus-1"], embeddingUrl: "http://127.0.0.1:8765", fetcher: async () =>
        new Response(JSON.stringify({ vector: vectors.vectors[30].values, model: vectors.model, revision: vectors.revision, dimensions: vectors.dimensions })) });
      expect(snapshot.retrievalMode).toBe("hybrid");
      expect(snapshot.cards.length).toBeGreaterThan(0);
      expect(snapshot.cards.every((card) => card.sourceId === "definition")).toBe(true);
      expect(snapshot.textbookIds).toEqual(["openstax-calculus-1"]);
    } finally { scope.mockRestore(); }
  });
  it("keeps signs, inequalities and negation rather than normalizing math away", () => {
    expect(normalizeQuery("f′(x) ≤ −1 不可导")).toBe("f'(x) ≤ -1 不可导");
    expect(tokenize("f'(x)≤-1，不可导")).toEqual(expect.arrayContaining(["≤", "-", "不可导"]));
    expect(tokenize("可导")).not.toEqual(tokenize("不可导"));
    expect(normalizeQuery("x²+x₁")).toBe("x²+x₁");
  });
  it("ranks exact mathematical terminology and returns nothing for empty search", () => {
    const search = createBm25([{ id: "a", text: "链式法则 复合函数" }, { id: "b", text: "条件概率" }]);
    expect(search("复合函数链式法则")[0].id).toBe("a");
    expect(search("")).toEqual([]);
  });
  it("fuses ranks and does not treat raw scores as probabilities", () => {
    const fused = reciprocalRankFusion([[{ id: "a", score: 999 }, { id: "b", score: 1 }], [{ id: "b", score: 0.1 }]]);
    expect(fused[0].id).toBe("b");
  });
  it("includes genuine sources and a counterexample for the zero-derivative misconception", async () => {
    const { snapshot } = await retrieveKnowledge("导数为零的点一定是极值点吗？", { mode: "text" });
    expect(snapshot.status).toBe("matched");
    expect(snapshot.cards.map((card) => card.id)).toContain("EXT-007");
    expect(snapshot.cards.every((card) => card.source.url?.startsWith("https://openstax.org/"))).toBe(true);
    expect(snapshot.cards).toHaveLength(4);
  });
  it("does not fabricate course coverage for unrelated probability questions", async () => {
    const fetcher = async () => { throw new Error("must not call encoder"); };
    const { snapshot } = await retrieveKnowledge("掷两枚骰子，点数之和为七的概率是多少？", { fetcher });
    expect(snapshot.status).toBe("no_match");
    expect(snapshot.cards).toEqual([]);
    expect(snapshot.retrievalMode).toBe("none");
  });
  it("falls back to actual BM25 when the encoder is unavailable", async () => {
    const { snapshot } = await retrieveKnowledge("怎样使用链式法则求导？", { embeddingUrl: "http://127.0.0.1:1", fetcher: async () => { throw new Error("offline"); } });
    expect(snapshot.retrievalMode).toBe("text");
    expect(snapshot.vectorStatus).toBe("unavailable");
    expect(snapshot.cards.length).toBeGreaterThan(0);
  });
  it("rejects stale vector corpus fingerprints", async () => {
    expect(await validVectorIndex({ ...vectors, ready: true, sourceHash: "stale" })).toBe(false);
  });
  it("ships a real normalized index matching the current corpus and pinned model", async () => {
    expect(vectors.ready).toBe(true);
    expect(await validVectorIndex(vectors)).toBe(true);
  });
  it("uses the configured encoder response for hybrid ranking", async () => {
    let calls = 0;
    const { snapshot } = await retrieveKnowledge("导数定义", { embeddingUrl: "http://127.0.0.1:8765", fetcher: async () => {
      calls++;
      return new Response(JSON.stringify({ vector: vectors.vectors[0].values, model: vectors.model, revision: vectors.revision, dimensions: vectors.dimensions }));
    } });
    expect(calls).toBe(1);
    expect(snapshot.retrievalMode).toBe("hybrid");
    expect(snapshot.vectorStatus).toBe("ready");
  });
  it("falls back when the query encoder uses a different revision", async () => {
    const { snapshot } = await retrieveKnowledge("导数定义", { embeddingUrl: "http://127.0.0.1:8765", fetcher: async () => new Response(JSON.stringify({ vector: vectors.vectors[0].values, model: vectors.model, revision: "other", dimensions: vectors.dimensions })) });
    expect(snapshot.retrievalMode).toBe("text");
    expect(snapshot.vectorStatus).toBe("unavailable");
  });
  it("keeps all seed formulas renderable and marks their actual review status", () => {
    expect(knowledgeCards).toHaveLength(42);
    for (const card of knowledgeCards) {
      expect(card.reviewStatus).toBe("source_checked");
      for (const formula of card.formulas) expect(mathFormattingError(formula, true), card.id).toBeNull();
    }
  });
});

describe("citation validation and old saved data", () => {
  const getContext = async () => (await retrieveKnowledge("费马定理和导数为零的极值条件", { mode: "text" })).snapshot;
  it("rejects a real corpus ID that was not supplied to this generation", async () => {
    const snapshot = await getContext();
    const other = knowledgeCards.find((card) => !snapshot.cards.some((candidate) => candidate.id === card.id))!;
    const solution = structuredClone(examples[0]);
    solution.steps[0].knowledgeIds = [other.id]; solution.steps[0].citationPurpose = "explain";
    expect(citationError(solution, snapshot)).toContain("不在本次");
  });
  it("requires every condition before claiming a theorem was applied", async () => {
    const snapshot = await getContext(); const card = snapshot.cards[0];
    const solution = structuredClone(examples[0]);
    solution.steps[0] = { ...solution.steps[0], knowledgeIds: [card.id], citationPurpose: "apply", conditionChecks: [] };
    expect(citationError(solution, snapshot)).toContain("全部适用条件");
    solution.steps[0].conditionChecks = card.conditions.map((condition) => ({ knowledgeId: card.id, conditionId: condition.id, status: "unknown", evidence: "原题没有提供该信息" }));
    expect(citationError(solution, snapshot)).toContain("不能直接应用");
  });
  it("allows contrast to explain why a condition cannot be inferred", async () => {
    const snapshot = await getContext(); const card = snapshot.cards[0];
    const solution = structuredClone(examples[0]);
    solution.steps[0] = { ...solution.steps[0], knowledgeIds: [card.id], citationPurpose: "contrast", conditionChecks: card.conditions.map((condition) => ({ knowledgeId: card.id, conditionId: condition.id, status: "unknown", evidence: "不能将待判断的结论当成已知条件" })) };
    expect(citationError(solution, snapshot)).toBeNull();
    const result = solveResultSchema.parse(attachRagSnapshot(solution, snapshot));
    expect(result.rag?.usedKnowledgeIds).toEqual([card.id]);
    expect(result.rag?.cards[0].source.url).toBe(card.source.url);
  });
  it("keeps old snapshots usable and does not present unused retrieval as an actual citation", async () => {
    expect(solveResultSchema.parse(examples[0]).rag).toBeUndefined();
    const result = attachRagSnapshot(examples[0], await getContext());
    expect(result.rag?.status).toBe("not_used");
    expect(result.rag?.usedKnowledgeIds).toEqual([]);
    expect(solveResultSchema.parse({ ...examples[0], rag: { damaged: true } }).steps).toHaveLength(examples[0].steps.length);
  });
});

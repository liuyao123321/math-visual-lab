import rawCorpus from "@/data/knowledge/derivatives.json";
import rawVectors from "@/data/rag-index/vectors.json";
import { corpusSchema, type EvidenceCard, type RagSnapshot, type PersonalExcerpt } from "./schema";
import { mergePersonalEvidence } from "@/lib/personal-library";
import { createBm25, reciprocalRankFusion, type RankedHit } from "./bm25";
import { inKnowledgeScope } from "./tokenize";
import { filterTextbookCards, textbookSourceIds } from "@/lib/textbooks";

export const knowledgeCorpus = corpusSchema.parse(rawCorpus);
export const knowledgeCards: EvidenceCard[] = knowledgeCorpus.cards.filter((card) => card.reviewStatus !== "draft")
  .map((card) => ({ ...card, source: knowledgeCorpus.sources[card.sourceId] }));
export const searchText = (card: EvidenceCard) => [card.title, ...card.keywords, card.statement, ...card.formulas,
  ...card.conditions.map((condition) => condition.text), ...card.pitfalls].join("\n");
const lexicalSearch = createBm25(knowledgeCards.map((card) => ({ id: card.id, text: searchText(card) })));
const cardById = new Map(knowledgeCards.map((card) => [card.id, card]));
type VectorIndex = { ready: boolean; model: string; revision: string; dimensions: number; sourceHash: string;
  queryInstruction: string; vectors: Array<{ id: string; values: number[] }> };
const vectors: VectorIndex = rawVectors;

export type RetrievalResult = { snapshot: RagSnapshot; ranking: RankedHit[] };
export type RetrievalOptions = {
  personalExcerpts?: PersonalExcerpt[];
  textbookIds?: string[];
  mode?: "text" | "vector" | "hybrid"; deadline?: number; embeddingUrl?: string;
  fetcher?: typeof fetch; index?: VectorIndex;
};

let hashPromise: Promise<string> | undefined;
async function corpusHash() {
  hashPromise ??= crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(rawCorpus)))
    .then((buffer) => [...new Uint8Array(buffer)].map((value) => value.toString(16).padStart(2, "0")).join(""));
  return hashPromise;
}

export async function validVectorIndex(index: VectorIndex) {
  if (!index.ready || index.model !== "BAAI/bge-small-zh-v1.5" || !index.revision || index.dimensions !== 512
    || index.queryInstruction !== "为这个句子生成表示以用于检索相关文章："
    || index.sourceHash !== await corpusHash() || !Array.isArray(index.vectors) || index.vectors.length !== knowledgeCards.length) return false;
  const seen = new Set<string>();
  return index.vectors.every((row) => {
    if (!row || !Array.isArray(row.values)) return false;
    const norm = Math.sqrt(row.values.reduce((sum, value) => sum + value * value, 0));
    if (!cardById.has(row.id) || seen.has(row.id) || row.values.length !== index.dimensions
      || !row.values.every(Number.isFinite) || Math.abs(norm - 1) > 0.02) return false;
    seen.add(row.id); return true;
  });
}

async function vectorSearch(query: string, options: RetrievalOptions, index: VectorIndex, allowedIds?: Set<string>): Promise<RankedHit[]> {
  const baseUrl = options.embeddingUrl ?? process.env.RAG_EMBEDDING_URL;
  if (!baseUrl) throw new Error("未配置向量服务");
  // This is a server-controlled URL, never accepted from a browser request.
  const controller = new AbortController();
  const remaining = Math.min(4000, (options.deadline ?? Date.now() + 4000) - Date.now());
  if (remaining <= 0) throw new Error("检索时间已用尽");
  const timer = setTimeout(() => controller.abort(), remaining);
  try {
    const response = await (options.fetcher ?? fetch)(new URL("/embed", baseUrl), {
      method: "POST", headers: { "Content-Type": "application/json" }, signal: controller.signal,
      body: JSON.stringify({ text: query }),
    });
    if (!response.ok) throw new Error("向量服务暂不可用");
    const payload = await response.json() as { vector?: unknown; model?: string; revision?: string; dimensions?: number };
    const vector = payload.vector;
    if (payload.model !== index.model || payload.revision !== index.revision || payload.dimensions !== index.dimensions
      || !Array.isArray(vector) || vector.length !== index.dimensions
      || !vector.every((value) => typeof value === "number" && Number.isFinite(value))) throw new Error("编码模型不匹配");
    const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
    if (norm <= 0 || !Number.isFinite(norm)) throw new Error("无效查询向量");
    return index.vectors.filter((row) => !allowedIds || allowedIds.has(row.id)).map((row) => ({ id: row.id, score: row.values.reduce((sum, value, position) => sum + value * vector[position] / norm, 0) }))
      .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id)).slice(0, 8);
  } finally { clearTimeout(timer); }
}

async function retrieveCourseKnowledge(query: string, options: RetrievalOptions = {}): Promise<RetrievalResult> {
  const started = Date.now();
  const sources = textbookSourceIds(options.textbookIds);
  const candidates = filterTextbookCards(knowledgeCards, sources);
  const allowedIds = sources ? new Set(candidates.map((card) => card.id)) : undefined;
  const snapshot: RagSnapshot = { version: 1, knowledgeBaseVersion: knowledgeCorpus.version, status: "no_match",
    retrievalMode: "none", vectorStatus: "not_requested", cards: [], usedKnowledgeIds: [], retrievalMs: 0,
    message: "当前知识库覆盖导数、单调性与极值，本题尚未检索到可靠课程依据。",
    ...(options.textbookIds ? { textbookIds: options.textbookIds } : {}) };
  if (!candidates.length) { snapshot.message = "所选教材未找到可用的匹配资料，不会改用其他教材。"; return { snapshot, ranking: [] }; }
  if (!inKnowledgeScope(query)) return { snapshot, ranking: [] };
  const lexical = candidates.length === knowledgeCards.length ? lexicalSearch(query) : createBm25(candidates.map((card) => ({ id: card.id, text: searchText(card) })))(query);
  let dense: RankedHit[] = [];
  if (options.mode !== "text") {
    const index = options.index ?? vectors;
    if (!await validVectorIndex(index)) snapshot.vectorStatus = index.ready ? "index_mismatch" : "unavailable";
    else {
      try { dense = await vectorSearch(query, options, index, allowedIds); snapshot.vectorStatus = "ready"; }
      catch { snapshot.vectorStatus = "unavailable"; }
    }
  }
  const ranking = reciprocalRankFusion(dense.length ? options.mode === "vector" ? [dense] : [lexical, dense] : [lexical]);
  // Scope and at least one lexical hit are required until a relevance threshold
  // has been calibrated on the team's labelled data. No arbitrary cosine cutoff.
  snapshot.cards = lexical.length ? ranking.map((hit) => cardById.get(hit.id)!).filter(Boolean) : [];
  snapshot.status = snapshot.cards.length ? "matched" : "no_match";
  snapshot.retrievalMode = snapshot.cards.length ? dense.length ? options.mode === "vector" ? "vector" : "hybrid" : "text" : "none";
  snapshot.retrievalMs = Date.now() - started;
  if (snapshot.cards.length) snapshot.message = dense.length
    ? "已检索课程资料；请结合每一步的引用和条件说明核对。"
    : "已使用文本检索课程资料；语义检索未启用或暂不可用。";
  return { snapshot, ranking: snapshot.cards.length ? ranking : [] };
}

export async function retrieveKnowledge(query: string, options: RetrievalOptions = {}): Promise<RetrievalResult> {
  const started = Date.now();
  const base = await retrieveCourseKnowledge(query, options);
  if (!options.personalExcerpts?.length) return base;
  const snapshot = mergePersonalEvidence(base.snapshot, query, options.personalExcerpts, options.textbookIds);
  snapshot.retrievalMs = Date.now() - started;
  return { snapshot, ranking: snapshot.cards.map((card, index) => ({ id: card.id, score: 1 / (index + 1) })) };
}

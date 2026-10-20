// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "./route";
import { retrieveKnowledge } from "@/lib/rag/retrieve";
import { examples } from "@/lib/examples";

vi.mock("@/lib/rag/retrieve", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/rag/retrieve")>();
  return { ...actual, retrieveKnowledge: (query: string, options: import("@/lib/rag/retrieve").RetrievalOptions = {}) => actual.retrieveKnowledge(query, { ...options, mode: "text" }) };
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const question = "导数为零的点一定是极值点吗？";
const assessment = { classification: "complete", normalizedQuestion: question, message: "条件完整", missingInformation: [], recommendedMode: "detailed", modeReason: "概念辨析", visualizationUseful: false };
const upstream = (data: unknown) => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(data) } }] }));
const request = (enabled = true, textbookIds?: string[]) => new NextRequest("http://localhost/api/tutor", { method: "POST", headers: { Authorization: "Bearer mock-key-only", "Content-Type": "application/json" }, body: JSON.stringify({ action: "solve", question, mode: "auto", ragEnabled: enabled, textbookIds }) });
async function validAnswer() {
  const snapshot = (await retrieveKnowledge(question)).snapshot;
  const answer = structuredClone(examples[0]);
  answer.normalizedQuestion = question;
  answer.steps[0] = { ...answer.steps[0], knowledgeIds: [snapshot.cards[0].id], citationPurpose: "explain", conditionChecks: [] };
  return answer;
}

describe("RAG generation protocol (mock model, not a quality benchmark)", () => {
  it("keeps the selected textbook scope in ordinary-answer evidence", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(upstream(assessment)).mockResolvedValueOnce(upstream(await validAnswer()));
    vi.stubGlobal("fetch", fetcher);
    const response = await POST(request(true, ["openstax-calculus-1"]));
    const payload = await response.json() as { data: import("@/lib/math-schema").SolveResult };
    expect(response.status).toBe(200);
    expect(payload.data.rag?.textbookIds).toEqual(["openstax-calculus-1"]);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it("rejects an unknown selected textbook without calling the model", async () => {
    const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    expect((await POST(request(true, ["not-imported"]))).status).toBe(400);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("passes actual retrieved knowledge and replaces model-invented snapshots", async () => {
    const answer = { ...await validAnswer(), rag: { source: "invented" } };
    const fetcher = vi.fn().mockResolvedValueOnce(upstream(assessment)).mockResolvedValueOnce(upstream(answer));
    vi.stubGlobal("fetch", fetcher);
    const response = await POST(request());
    const payload = await response.json() as { data: import("@/lib/math-schema").SolveResult };
    expect(response.status).toBe(200);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(payload.data.rag?.cards[0].source.url).toContain("openstax.org");
    expect(payload.data.rag?.usedKnowledgeIds).toHaveLength(1);
    const messages = JSON.parse(fetcher.mock.calls[1][1].body).messages;
    expect(messages[1].content).toContain(payload.data.rag!.cards[0].id);
  });
  it("repairs fabricated knowledge IDs within the existing one-repair budget", async () => {
    const good = await validAnswer(); const bad = structuredClone(good);
    bad.steps[0].knowledgeIds = ["MADE-UP"];
    const fetcher = vi.fn().mockResolvedValueOnce(upstream(assessment)).mockResolvedValueOnce(upstream(bad)).mockResolvedValueOnce(upstream(good));
    vi.stubGlobal("fetch", fetcher);
    expect((await POST(request())).status).toBe(200);
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(JSON.parse(fetcher.mock.calls[2][1].body).messages.at(-1).content).toContain("禁止编造引用");
  });
  it("does not expose a persistently invalid citation as a verified result", async () => {
    const bad = await validAnswer(); bad.steps[0].knowledgeIds = ["MADE-UP"];
    const fetcher = vi.fn().mockResolvedValueOnce(upstream(assessment)).mockResolvedValue(upstream(bad));
    vi.stubGlobal("fetch", fetcher);
    const response = await POST(request());
    expect(response.status).toBe(502);
    expect(fetcher).toHaveBeenCalledTimes(3);
  });
  it("keeps the existing no-RAG request path and does not attach fabricated model metadata", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(upstream(assessment)).mockResolvedValueOnce(upstream({ ...examples[0], rag: { invented: true } })));
    const response = await POST(request(false));
    expect(response.status).toBe(200);
    expect((await response.json() as { data: { rag?: unknown } }).data.rag).toBeUndefined();
  });
});

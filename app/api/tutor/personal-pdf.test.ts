// @vitest-environment node
// Mock model responses verify transport and attribution, not mathematical AI quality.
import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "./route";
import { examples } from "@/lib/examples";
import { personalBookFixture as book } from "@/testdata/personal-library";
import { personalChunks } from "@/lib/personal-library";
const excerpts = personalChunks(book);
const query = "矩阵乘法有哪些维数条件？";
const req = (personalExcerpts: unknown = excerpts) => new NextRequest("http://localhost/api/tutor", { method: "POST", headers: { Authorization: "Bearer synthetic-test-key", "Content-Type": "application/json" },
  body: JSON.stringify({ action: "solve", question: query, mode: "auto", ragEnabled: true, textbookIds: [book.id], personalExcerpts }) });
const upstream = (data: unknown) => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(data) } }] }));
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
describe("private PDF answer evidence protocol", () => {
  it("uses only supplied snippets outside the public derivative scope and preserves file/page attribution", async () => {
    const assessment = { classification: "complete", normalizedQuestion: query, message: "条件完整", missingInformation: [], recommendedMode: "detailed", modeReason: "说明条件", visualizationUseful: false };
    const answer = structuredClone(examples[0]); answer.normalizedQuestion = query;
    answer.steps[0].knowledgeIds = [excerpts[0].id]; answer.steps[0].citationPurpose = "explain";
    const mock = vi.fn().mockResolvedValueOnce(upstream(assessment)).mockResolvedValueOnce(upstream(answer)); vi.stubGlobal("fetch", mock);
    const response = await POST(req());
    expect(response.status).toBe(200);
    const payload = await response.json() as { data: import("@/lib/math-schema").SolveResult };
    expect(payload.data.rag?.cards[0].source).toMatchObject({ kind: "local_pdf", fileName: book.fileName, pageNumber: 3 });
    expect(payload.data.rag?.cards[0].reviewStatus).toBe("user_confirmed");
    expect(payload.data.rag?.usedKnowledgeIds).toEqual([excerpts[0].id]);
    const sent = JSON.parse(mock.mock.calls[1][1].body).messages;
    expect(sent[1].content).toContain(book.pages[0].text);
    expect(sent[1].content).toContain("禁止apply");
    expect(mock).toHaveBeenCalledTimes(2);
  });
  it("rejects oversized or mismatched snippets before provider calls", async () => {
    const mock = vi.fn(); vi.stubGlobal("fetch", mock);
    for (const invalid of [[{ ...excerpts[0], text: "x".repeat(1201) }], [{ ...excerpts[0], textbookId: "local-pdf-22222222-2222-4222-8222-222222222222" }]]) {
      expect((await POST(req(invalid))).status).toBe(400);
    }
    expect(mock).not.toHaveBeenCalled();
  });
});

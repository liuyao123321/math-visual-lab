// @vitest-environment node
// These responses are deliberately mocked; they do NOT measure real OCR accuracy.
import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "./route";
import { examples } from "@/lib/examples";
import { recognition } from "@/testdata/handwriting";
import type { SolveResult } from "@/lib/math-schema";
import type { HandwritingRecognition } from "@/lib/handwriting-schema";
const image = "data:image/png;base64,iVBORw0KGgo=";
const req = (patch: object = {}) => new NextRequest("http://localhost/api/tutor", {
  method: "POST", headers: { Authorization: "Bearer test-fixture-not-real", "Content-Type": "application/json" },
  body: JSON.stringify({ action: "photo-tutor", question: "", imageDataUrl: image, ...patch }),
});
const upstream = (data: unknown) => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(data) } }] }));
const payloadOf = async (response: Response) => await response.json() as {
  code?: string; data: { kind: string; solution: SolveResult; recognition: HandwritingRecognition; finalAnswerLatex?: string };
};
const assessment = { classification: "complete", normalizedQuestion: examples[0].normalizedQuestion,
  message: "题目完整", missingInformation: [], recommendedMode: "visual", modeReason: "题目要求结合图像", visualizationUseful: true };
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("unified photo tutoring proxy (mock provider)", () => {
  it("classifies and assesses a question in one image pass, then solves with text only", async () => {
    const mock = vi.fn().mockResolvedValueOnce(upstream({ kind: "question", assessment })).mockResolvedValueOnce(upstream(examples[0]));
    vi.stubGlobal("fetch", mock);
    const response = await POST(req());
    expect(response.status).toBe(200);
    const payload = await payloadOf(response);
    expect(payload.data.kind).toBe("solution");
    expect(payload.data.solution.status).toBe("solved");
    expect(payload.data.solution.recommendedMode).toBe("visual");
    expect(payload.data.solution.visualization?.parameters).toEqual([]);
    expect(mock).toHaveBeenCalledTimes(2);
    const first = JSON.parse(mock.mock.calls[0][1].body);
    const second = JSON.parse(mock.mock.calls[1][1].body);
    expect(first.messages[1].content).toContainEqual({ type: "image_url", image_url: { url: image, detail: "original" } });
    expect(second.messages.every((m: { content: unknown }) => typeof m.content === "string")).toBe(true);
    expect(JSON.stringify(second)).not.toContain(image);
    expect(first.messages[0].content).toContain("手抄的题目");
    expect(first.messages[0].content).toContain("不能仅因包含公式或手写");
  });

  it.each(["student_work", "uncertain"])("returns %s for confirmation, without evaluating, correcting or solving", async (kind) => {
    const mock = vi.fn().mockResolvedValue(upstream({ kind, reason: "需核对学生步骤", recognition, finalAnswerLatex: "x=2" }));
    vi.stubGlobal("fetch", mock);
    const response = await POST(req());
    expect(response.status).toBe(200);
    const payload = await payloadOf(response);
    expect(payload.data.kind).toBe(kind);
    expect(payload.data.recognition.steps[0].formulas).toEqual(["2x=6"]);
    expect(payload.data.finalAnswerLatex).toBeUndefined();
    expect(payload.data.solution).toBeUndefined();
    expect(mock).toHaveBeenCalledTimes(1);
  });

  it("stops incomplete question photos at the existing clarification flow", async () => {
    const mock = vi.fn().mockResolvedValue(upstream({ kind: "question", assessment: { ...assessment, classification: "incomplete",
      normalizedQuestion: "求函数的导数，原函数未给出。", missingInformation: ["原函数"], message: "请补充原函数" } }));
    vi.stubGlobal("fetch", mock);
    const payload = await payloadOf(await POST(req()));
    expect(payload.data.solution.status).toBe("needs_more_info");
    expect(payload.data.solution.steps).toEqual([]);
    expect(mock).toHaveBeenCalledTimes(1);
  });

  it("keeps unreadable images as uncertainty and requests reshooting, not invented steps", async () => {
    const mock = vi.fn().mockResolvedValue(upstream({ kind: "uncertain", reason: "请重新拍摄或手动补充",
      recognition: { status: "unreadable", question: "", conditions: [], steps: [], uncertainties: [], warnings: ["图片模糊"] } }));
    vi.stubGlobal("fetch", mock);
    const payload = await payloadOf(await POST(req()));
    expect(payload.data.kind).toBe("uncertain");
    expect(payload.data.recognition.steps).toEqual([]);
    expect(mock).toHaveBeenCalledTimes(1);
  });

  it("repairs contradictory student-work classification once, then safely fails", async () => {
    const mock = vi.fn().mockImplementation(() => Promise.resolve(upstream({ kind: "student_work", reason: "没看清",
      recognition: { status: "unreadable", question: "", conditions: [], steps: [], uncertainties: [], warnings: [] } })));
    vi.stubGlobal("fetch", mock);
    const response = await POST(req());
    expect(response.status).toBe(502);
    expect((await payloadOf(response)).code).toBe("invalid_model_output");
    expect(mock).toHaveBeenCalledTimes(2);
  });

  it.each([[401, "invalid_key"], [429, "rate_limited"], [400, "image_input_rejected"]])("handles provider %i without leaking details", async (status, code) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("private upstream details", { status: status as number })));
    const response = await POST(req());
    const payload = await payloadOf(response);
    expect(payload.code).toBe(code);
    expect(JSON.stringify(payload)).not.toContain("private upstream");
  });

  it("requires a valid image rather than silently falling back to a different task", async () => {
    const mock = vi.fn(); vi.stubGlobal("fetch", mock);
    expect((await POST(req({ imageDataUrl: undefined }))).status).toBe(400);
    expect(mock).not.toHaveBeenCalled();
  });
});

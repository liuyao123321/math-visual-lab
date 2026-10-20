// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "./route";
import { work, evaluation, recognition } from "@/testdata/handwriting";
import { handwritingMessages } from "@/lib/handwriting-prompts";
const upstream = (data: unknown) => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(data) } }] }));
const req = (body: unknown) => new NextRequest("http://localhost/api/tutor", { method: "POST", headers: { Authorization: "Bearer test-fixture-not-real", "Content-Type": "application/json" }, body: JSON.stringify(body) });
const image = "data:image/png;base64,iVBORw0KGgo=";
const payloadOf = async (response: Response) => await response.json() as { code?: string; data: { status: string; firstErrorStepId: string | null; finalAnswerLatex?: string; steps: Array<{ formulas: string[]; uncertainties: Array<{ candidates: string[] }> }> } };
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
describe("handwriting API (mock upstream, not real model tests)", () => {
  it("only transcribes, preserving wrong arithmetic and explicit ambiguities", async () => {
    const mock = vi.fn().mockResolvedValue(upstream(recognition)); vi.stubGlobal("fetch", mock);
    const response = await POST(req({ action: "recognize-work", question: "", imageDataUrl: image }));
    expect(response.status).toBe(200);
    const payload = await payloadOf(response);
    expect(payload.data.steps[0].formulas).toEqual(["2x=6"]);
    expect(payload.data.steps[0].uncertainties[0].candidates).toEqual(["6", "4"]);
    const sent = JSON.parse(mock.mock.calls[0][1].body);
    expect(sent.messages[0].content).toContain("禁止求解、纠错或评价");
    expect(sent.messages[1].content).toContainEqual({ type: "image_url", image_url: { url: image, detail: "original" } });
  });
  it("repairs step-id/order mismatch once rather than attaching verdicts to wrong work", async () => {
    const mock = vi.fn().mockResolvedValueOnce(upstream({ ...evaluation, steps: evaluation.steps.map((s) => ({ ...s, stepId: s.stepId + "wrong" })), firstErrorStepId: "s1wrong" })).mockResolvedValueOnce(upstream(evaluation));
    vi.stubGlobal("fetch", mock);
    const response = await POST(req({ action: "evaluate-work", ...work }));
    expect(response.status).toBe(200); expect(mock).toHaveBeenCalledTimes(2);
    expect((await payloadOf(response)).data.firstErrorStepId).toBe("s1");
    const sent = JSON.parse(mock.mock.calls[0][1].body);
    expect(typeof sent.messages[1].content).toBe("string");
    expect(sent.messages[0].content).toContain("接受合法替代解法和等价表达");
    expect(sent.messages[0].content).toContain("前提错误");
  });
  it("rejects empty/unconfirmed work without calling the provider", async () => {
    const mock = vi.fn(); vi.stubGlobal("fetch", mock);
    for (const patch of [{ steps: [] }, { confirmed: false }]) expect((await POST(req({ action: "evaluate-work", ...work, ...patch }))).status).toBe(400);
    expect(mock).not.toHaveBeenCalled();
  });
  it("rejects stale evaluation ids before generating hints", async () => {
    const mock = vi.fn(); vi.stubGlobal("fetch", mock);
    const response = await POST(req({ action: "work-hint", ...work, steps: [...work.steps].reverse(), evaluation, level: 1, perspective: "next" }));
    expect(response.status).toBe(400); expect((await payloadOf(response)).code).toBe("stale_evaluation"); expect(mock).not.toHaveBeenCalled();
  });
  it("bounds hint level and strips unrequested answer fields", async () => {
    const mock = vi.fn().mockResolvedValueOnce(upstream({ level: 3, targetStepId: null, title: "提示", text: "重算右边", formulas: [] })).mockResolvedValueOnce(upstream({ level: 1, targetStepId: "s1", title: "先看移项", text: "减去的数是什么？", formulas: [], finalAnswerLatex: "x=2" }));
    vi.stubGlobal("fetch", mock);
    const response = await POST(req({ action: "work-hint", ...work, evaluation, level: 1, perspective: "next" }));
    expect(response.status).toBe(200); expect(mock).toHaveBeenCalledTimes(2);
    expect((await payloadOf(response)).data.finalAnswerLatex).toBeUndefined();
  });
  it("maps image capability/format rejections without exposing provider details", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("private upstream detail", { status: 400 })));
    const response = await POST(req({ action: "recognize-work", imageDataUrl: image }));
    expect(response.status).toBe(422);
    expect(await response.text()).not.toContain("private upstream detail");
  });
  it("preserves unreadable recognition as uncertainty, not an all-correct claim", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(upstream({ status: "unreadable", question: "", conditions: [], steps: [], uncertainties: [], warnings: ["照片模糊，请重新拍摄"] })));
    const response = await POST(req({ action: "recognize-work", imageDataUrl: image }));
    expect(response.status).toBe(200); expect((await payloadOf(response)).data.status).toBe("unreadable");
  });
  it("does not accept completion based on erroneous steps", async () => {
    const mock = vi.fn().mockResolvedValueOnce(upstream({ ...evaluation, status: "completed", understandingQuestion: "检查一下" })).mockResolvedValueOnce(upstream(evaluation));
    vi.stubGlobal("fetch", mock);
    expect((await POST(req({ action: "evaluate-work", ...work }))).status).toBe(200);
    expect(mock).toHaveBeenCalledTimes(2);
  });
  it("contains independent criteria for illegal reasoning, ambiguity and limited hints", () => {
    const evaluationPrompt = handwritingMessages({ action: "evaluate-work", ...work })[0].content;
    expect(evaluationPrompt).toContain("非法推理"); expect(evaluationPrompt).toContain("不能编造");
    const hintPrompt = handwritingMessages({ action: "work-hint", ...work, evaluation, level: 1, perspective: "next" })[0].content;
    expect(hintPrompt).toContain("最后一步不得代算");
  });
});

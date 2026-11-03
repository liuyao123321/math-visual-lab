// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/tutor/route";
import { examples } from "@/lib/examples";
import { defaultSettings } from "@/lib/storage";
import { exampleMethods } from "@/lib/alternative-methods";

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

const upstream = (data: unknown) => new Response(JSON.stringify({ choices: [{ message: { content: typeof data === "string" ? data : JSON.stringify(data) } }] }), { status: 200 });
const completeAssessment = {
  classification: "complete", normalizedQuestion: examples[0].normalizedQuestion,
  message: "题目完整。", missingInformation: [], recommendedMode: "visual",
  modeReason: "观察函数零点与顶点有助理解。", visualizationUseful: true,
};
const solveMock = (data: unknown) => vi.fn().mockResolvedValueOnce(upstream(completeAssessment)).mockResolvedValue(upstream(data));
const requestFor = (body: unknown) => new NextRequest("http://localhost/api/tutor", { method: "POST", headers: { Authorization: "Bearer sk-test-only", "Content-Type": "application/json" }, body: JSON.stringify(body) });
const payloadOf = async (response: Response) => await response.json() as { code: string; data: { methods: unknown[]; questions: unknown[]; warnings: unknown[] } };

describe("POST /api/tutor", () => {
  it("repairs invalid formulas embedded in explanation text", async () => {
    const valid = exampleMethods(examples[0].id)!;
    const invalid = structuredClone(valid);
    invalid.methods[0].steps[0].explanation = String.raw`使用 \(\unknowncommand{1}\)。`;
    const fetchMock = vi.fn().mockResolvedValueOnce(upstream(invalid)).mockResolvedValueOnce(upstream(valid));
    vi.stubGlobal("fetch", fetchMock);
    const response = await POST(requestFor({ action: "multi-method", sourceQuestion: examples[0].normalizedQuestion }));
    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("rejects JSON control-character corruption instead of silently displaying rac", async () => {
    const invalid = structuredClone(exampleMethods(examples[0].id)!);
    invalid.methods[0].answerLatex = "\frac{1}{2}";
    vi.stubGlobal("fetch", vi.fn().mockImplementation(() => Promise.resolve(upstream(invalid))));
    const response = await POST(requestFor({ action: "multi-method", sourceQuestion: examples[0].normalizedQuestion }));
    expect(response.status).toBe(502);
  });
  it("repairs an invalid formula once before exposing multiple solutions", async () => {
    const valid = exampleMethods(examples[0].id)!;
    const invalid = structuredClone(valid);
    invalid.methods[0].answerLatex = "\\notARealMathCommand{";
    const fetchMock = vi.fn().mockResolvedValueOnce(upstream(invalid)).mockResolvedValueOnce(upstream(valid));
    vi.stubGlobal("fetch", fetchMock);
    const response = await POST(requestFor({ action: "multi-method", sourceQuestion: examples[0].normalizedQuestion }));
    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect((await payloadOf(response)).data.methods).toHaveLength(2);
  });

  it("rejects repeated invalid JSON with a safe error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockImplementation(() => Promise.resolve(upstream("not JSON"))));
    const response = await POST(requestFor({ action: "multi-method", sourceQuestion: examples[0].normalizedQuestion }));
    expect(response.status).toBe(502);
    expect((await payloadOf(response)).code).toBe("invalid_model_output");
  });

  it("repairs a paper whose question count differs from the request", async () => {
    const question = { id: "q1", question: "计算定积分", hint: "先求原函数", answerLatex: "1", topics: ["定积分"], difficulty: "基础", expectedConcepts: ["原函数"] };
    const paper = { title: "专项模拟", rationale: "针对积分错题", questions: Array.from({ length: 4 }, (_, index) => ({ ...question, id: `q${index}` })) };
    const fetchMock = vi.fn().mockResolvedValueOnce(upstream(paper)).mockResolvedValueOnce(upstream({ ...paper, questions: paper.questions.slice(0, 3) }));
    vi.stubGlobal("fetch", fetchMock);
    const response = await POST(requestFor({ action: "generate-paper", count: 3, sources: [{ question: "计算从0到1的定积分", topics: ["积分"], errorReason: "忘记上下限" }] }));
    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect((await payloadOf(response)).data.questions).toHaveLength(3);
  });

  it("passes material images and explicit uncertainty warnings without treating them as instructions", async () => {
    const fetchMock = vi.fn().mockResolvedValue(upstream({ title: "试卷", summary: "有模糊公式", topics: ["导数"], questions: [], warnings: ["请补充第二题的条件"] }));
    vi.stubGlobal("fetch", fetchMock);
    const image = "data:image/png;base64,iVBORw0KGgo=";
    const response = await POST(requestFor({ action: "analyze-material", text: "以下资料含有数学题目，请识别", images: [image] }));
    expect(response.status).toBe(200);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.messages[0].content).toContain("待分析数据");
    expect(body.messages[1].content).toContainEqual({ type: "image_url", image_url: { url: image, detail: "original" } });
    expect((await payloadOf(response)).data.warnings).toHaveLength(1);
  });

  it.each([[429, "rate_limited"], [503, "upstream_error"]])("maps upstream %i without leaking response details", async (status, code) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("private provider detail", { status })));
    const response = await POST(requestFor({ action: "multi-method", sourceQuestion: examples[0].normalizedQuestion }));
    const payload = await payloadOf(response);
    expect(payload.code).toBe(code);
    expect(JSON.stringify(payload)).not.toContain("private provider detail");
  });

  it("handles empty replies and aborted requests", async () => {
    const emptyMock = vi.fn().mockImplementation(() => Promise.resolve(upstream("")));
    vi.stubGlobal("fetch", emptyMock);
    let response = await POST(requestFor({ action: "multi-method", sourceQuestion: examples[0].normalizedQuestion }));
    expect((await payloadOf(response)).code).toBe("empty_response");
    expect(emptyMock).toHaveBeenCalledTimes(2);
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new DOMException("aborted", "AbortError")));
    response = await POST(requestFor({ action: "multi-method", sourceQuestion: examples[0].normalizedQuestion }));
    expect(response.status).toBe(504);
    expect((await payloadOf(response)).code).toBe("timeout");
  });
  it("rejects requests without an API key", async () => {
    const request = new NextRequest("http://localhost/api/tutor", { method: "POST", body: JSON.stringify({ action: "solve", question: "求 x+1=0", mode: "concise" }) });
    const response = await POST(request);
    expect(response.status).toBe(401);
  });

  it("returns validated structured solutions", async () => {
    const fetchMock = solveMock(examples[0]);
    vi.stubGlobal("fetch", fetchMock);
    const request = new NextRequest("http://localhost/api/tutor", {
      method: "POST",
      headers: { Authorization: "Bearer sk-demo", "Content-Type": "application/json" },
      body: JSON.stringify({ action: "solve", question: "求 x²-4x+3 的零点", mode: "visual" }),
    });
    const response = await POST(request);
    const payload = await response.json() as { data: { status: string; id: string } };
    expect(response.status).toBe(200);
    expect(payload.data.status).toBe("solved");
    expect(payload.data.id).not.toBe(examples[0].id);
    const systemPrompt = JSON.parse(fetchMock.mock.calls[1][1].body).messages[0].content as string;
    const formatExample = JSON.parse(/例如 (\{.*\})。不要/.exec(systemPrompt)![1]);
    expect(formatExample.formulas[0]).toBe(String.raw`\frac{1}{2}`);
    expect(formatExample.explanation).toContain(String.raw`\(x^2=1\)`);
  });

  it("freezes invented sliders in an otherwise useful static graph", async () => {
    const data = { ...examples[0], visualization: { ...examples[0].visualization!,
      parameters: [{ key: "k", label: "常数项 k", min: 0, max: 6, step: 0.5, defaultValue: 3 }],
      layers: [{ id: "curve", label: "函数曲线", type: "function", expression: "x^2-4*x+k" }],
      interactiveParameters: [{ key: "k", reason: "模型擅自扩展", sourceQuote: "改变常数项" }],
    } };
    vi.stubGlobal("fetch", solveMock(data));
    const response = await POST(requestFor({ action: "solve", question: examples[0].normalizedQuestion, mode: "auto" }));
    const { data: result } = await response.json() as { data: import("@/lib/math-schema").SolveResult };
    expect(response.status).toBe(200);
    expect(result.visualization?.parameters).toEqual([]);
    expect(result.visualization?.layers[0].expression).toBe("x^2-4*x+(3)");
    expect(result.steps.length).toBeGreaterThan(0);
  });

  it("retains animations when the assessment grounds them in the actual request", async () => {
    const assessment = { ...completeAssessment, normalizedQuestion: examples[1].normalizedQuestion,
      interactiveParameters: examples[1].visualization!.interactiveParameters };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(upstream(assessment)).mockResolvedValueOnce(upstream(examples[1])));
    const response = await POST(requestFor({ action: "solve", question: examples[1].normalizedQuestion, mode: "auto" }));
    const { data } = await response.json() as { data: import("@/lib/math-schema").SolveResult };
    expect(response.status).toBe(200);
    expect(data.visualization?.parameters.map((parameter) => parameter.key)).toEqual(["t"]);
  });

  it("sends an uploaded question image as a vision input", async () => {
    const fetchMock = solveMock(examples[0]);
    vi.stubGlobal("fetch", fetchMock);
    const imageDataUrl = "data:image/png;base64,iVBORw0KGgo=";
    const request = new NextRequest("http://localhost/api/tutor", {
      method: "POST",
      headers: { Authorization: "Bearer sk-demo", "Content-Type": "application/json" },
      body: JSON.stringify({ action: "solve", question: "", mode: "visual", imageDataUrl }),
    });

    const response = await POST(request);
    expect(response.status).toBe(200);
    const upstreamBody = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(upstreamBody.messages[1].content).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "image_url", image_url: { url: imageDataUrl, detail: "original" } }),
    ]));
  });

  it("maps an upstream authentication failure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("unauthorized", { status: 401 })));
    const request = new NextRequest("http://localhost/api/tutor", {
      method: "POST",
      headers: { Authorization: "Bearer bad-key", "Content-Type": "application/json" },
      body: JSON.stringify({ action: "solve", question: "求 x+1=0", mode: "concise" }),
    });
    const response = await POST(request);
    expect(response.status).toBe(401);
    expect((await response.json() as { code: string }).code).toBe("invalid_key");
  });

  it("passes only the supplied bounded learning summary to the model", async () => {
    const fetchMock = solveMock(examples[0]);
    vi.stubGlobal("fetch", fetchMock);
    const learningContext = {
      profile: defaultSettings.learnerProfile,
      weakTopics: [{ topic: "导数", unresolvedCount: 2 }],
      frequentErrorReasons: ["公式不会使用"],
      recentPracticeCount: 3,
    };
    const request = new NextRequest("http://localhost/api/tutor", {
      method: "POST",
      headers: { Authorization: "Bearer sk-demo", "Content-Type": "application/json" },
      body: JSON.stringify({ action: "solve", question: "求 x+1=0", mode: "concise", learningContext }),
    });

    const response = await POST(request);
    expect(response.status).toBe(200);
    const upstreamBody = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    const messages = JSON.stringify(upstreamBody.messages);
    expect(messages).toContain("导数");
    expect(messages).toContain("公式不会使用");
    expect(messages).not.toContain("姓名");
  });

  it("validates a generated understanding check", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({ id: "check", question: "若导数为零，是否一定是极值点？", type: "concept", hint: "想想驻点与极值点的关系。", expectedConcepts: ["驻点", "极值"] }) } }],
    }), { status: 200, headers: { "Content-Type": "application/json" } })));
    const request = new NextRequest("http://localhost/api/tutor", {
      method: "POST",
      headers: { Authorization: "Bearer sk-demo", "Content-Type": "application/json" },
      body: JSON.stringify({ action: "generate-check", sourceQuestion: "求函数极值", topics: ["导数"], difficulty: "基础" }),
    });

    const response = await POST(request);
    const payload = await response.json() as { data: { type: string; id: string } };
    expect(response.status).toBe(200);
    expect(payload.data.type).toBe("concept");
    expect(payload.data.id).not.toBe("check");
  });
  it.each(["incomplete", "not_math"])("stops after assessment for %s input", async (classification) => {
    const assessment = { ...completeAssessment, classification, recommendedMode: "detailed",
      visualizationUseful: false, message: classification === "incomplete" ? "请补充积分上下限。" : "请输入数学问题。",
      missingInformation: classification === "incomplete" ? ["积分下限与上限"] : [],
    };
    const fetchMock = vi.fn().mockResolvedValue(upstream(assessment));
    vi.stubGlobal("fetch", fetchMock);
    const response = await POST(requestFor({ action: "solve", question: "请算这个积分", mode: "auto" }));
    const { data } = await response.json() as { data: import("@/lib/math-schema").SolveResult };
    expect(response.status).toBe(200);
    expect(data.status).toBe(classification === "incomplete" ? "needs_more_info" : "unsupported");
    expect(data.steps).toEqual([]);
    expect(data.finalAnswerLatex).toBe("");
    expect(data.limitations).toContain(assessment.message);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("recovers an empty assessment once without inventing an answer", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(upstream(""))
      .mockResolvedValueOnce(upstream(completeAssessment)).mockResolvedValueOnce(upstream(examples[0]));
    vi.stubGlobal("fetch", fetchMock);
    const response = await POST(requestFor({ action: "solve", question: examples[0].normalizedQuestion, mode: "auto" }));
    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    for (const call of fetchMock.mock.calls) {
      const body = JSON.parse(call[1].body);
      expect(body.thinking).toEqual({ type: "disabled" });
      expect(body.response_format).toEqual({ type: "json_object" });
    }
  });

  it("returns validated clarification options without solving or choosing an answer", async () => {
    const clarificationQuestions = [{ missingIndex: 0, title: "你希望求什么？", options: [{ label: "求零点", value: "求函数零点" }, { label: "求极值", value: "求函数极值" }] }];
    const assessment = { ...completeAssessment, classification: "incomplete", missingInformation: ["题目要求"], clarificationQuestions };
    const fetchMock = vi.fn().mockResolvedValue(upstream(assessment));
    vi.stubGlobal("fetch", fetchMock);
    const response = await POST(requestFor({ action: "solve", question: "f(x)=x^2-4x+3，求什么还没写", mode: "auto" }));
    const { data } = await response.json() as { data: import("@/lib/math-schema").SolveResult };
    expect(response.status).toBe(200);
    expect(data.inputAssessment?.clarificationQuestions).toEqual(clarificationQuestions);
    expect(data.steps).toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const prompt = JSON.parse(fetchMock.mock.calls[0][1].body).messages[0].content;
    expect(prompt).toContain("不能凭空编造数值或公式作为候选");
    expect(prompt).toContain("仍应返回 incomplete");
  });

  it("repairs invalid clarification references once within the existing request budget", async () => {
    const assessment = { ...completeAssessment, classification: "incomplete", missingInformation: ["积分上下限"], clarificationQuestions: [{ missingIndex: 0, title: "积分上下限？", options: [] }] };
    const fetchMock = vi.fn().mockResolvedValueOnce(upstream({ ...assessment, clarificationQuestions: [{ ...assessment.clarificationQuestions[0], missingIndex: 4 }] })).mockResolvedValueOnce(upstream(assessment));
    vi.stubGlobal("fetch", fetchMock);
    const response = await POST(requestFor({ action: "solve", question: "计算 x^2 的定积分" }));
    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const { data } = await response.json() as { data: import("@/lib/math-schema").SolveResult };
    expect(data.inputAssessment?.clarificationQuestions?.[0].options).toEqual([]);
  });

  it.each(["empty", "length"])("recovers a %s solve reply once", async (failure) => {
    const broken = failure === "empty" ? upstream("") : new Response(JSON.stringify({
      choices: [{ finish_reason: "length", message: { content: '{"steps":', reasoning_content: "not a final answer" } }],
    }), { status: 200 });
    const fetchMock = vi.fn().mockResolvedValueOnce(upstream(completeAssessment))
      .mockResolvedValueOnce(broken).mockResolvedValueOnce(upstream(examples[0]));
    vi.stubGlobal("fetch", fetchMock);
    const response = await POST(requestFor({ action: "solve", question: examples[0].normalizedQuestion, mode: "auto" }));
    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("rejects a solved result with empty steps and answer then repairs it", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(upstream(completeAssessment))
      .mockResolvedValueOnce(upstream({ ...examples[0], steps: [], finalAnswerLatex: "" }))
      .mockResolvedValueOnce(upstream(examples[0]));
    vi.stubGlobal("fetch", fetchMock);
    const response = await POST(requestFor({ action: "solve", question: examples[0].normalizedQuestion, mode: "auto" }));
    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("recommends concise text for a simple question and does not force visualization", async () => {
    const assessment = { ...completeAssessment, normalizedQuestion: "解方程 x+1=0",
      recommendedMode: "concise", modeReason: "只需移项。", visualizationUseful: false };
    const fetchMock = vi.fn().mockResolvedValueOnce(upstream(assessment)).mockResolvedValueOnce(upstream({
      ...examples[0], normalizedQuestion: assessment.normalizedQuestion, visualization: null,
    }));
    vi.stubGlobal("fetch", fetchMock);
    const response = await POST(requestFor({ action: "solve", question: assessment.normalizedQuestion, mode: "auto" }));
    const { data } = await response.json() as { data: import("@/lib/math-schema").SolveResult };
    expect(response.status).toBe(200);
    expect(data).toMatchObject({ recommendedMode: "concise", explanationMode: "concise" });
    expect(data.visualization).toBeUndefined();
    const body = JSON.parse(fetchMock.mock.calls[1][1].body);
    expect(body.messages[1].content).toContain("本次讲解模式：concise");
    expect(body.messages[1].content).toContain("本题无需图像");
    expect(body.messages[1].content).toContain("答案卡");
    expect(body.messages[1].content).toContain("不为凑短而跳过证明");
  });

  it("honors a requested detailed explanation while preserving the AI recommendation", async () => {
    const fetchMock = solveMock(examples[0]);
    vi.stubGlobal("fetch", fetchMock);
    const response = await POST(requestFor({ action: "solve", question: examples[0].normalizedQuestion, mode: "detailed" }));
    const { data } = await response.json() as { data: import("@/lib/math-schema").SolveResult };
    expect(data).toMatchObject({ recommendedMode: "visual", explanationMode: "detailed" });
    expect(data.visualization).toBeUndefined();
    const body = JSON.parse(fetchMock.mock.calls[1][1].body);
    expect(body.messages[1].content).toContain("第一次学习此方法");
    expect(body.messages[1].content).toContain("verification");
    expect(body.messages[1].content).toContain("不输出内部思考");
  });

  it("preserves structured teaching fields through proxy validation", async () => {
    const lesson = { ...examples[0], steps: [{ ...examples[0].steps[0], summary: "选用配方法", goal: "定位顶点", conditions: ["自变量为实数"], verification: "展开核对系数" }] };
    vi.stubGlobal("fetch", solveMock(lesson));
    const response = await POST(requestFor({ action: "solve", question: lesson.normalizedQuestion, mode: "detailed" }));
    expect(response.status).toBe(200);
    const { data } = await response.json() as { data: import("@/lib/math-schema").SolveResult };
    expect(data.steps[0]).toMatchObject({ summary: "选用配方法", goal: "定位顶点", conditions: ["自变量为实数"], verification: "展开核对系数" });
  });

  it("preserves valid text when a graph has malformed configuration", async () => {
    const fetchMock = solveMock({ ...examples[0], visualization: { kind: "unknown" } });
    vi.stubGlobal("fetch", fetchMock);
    const response = await POST(requestFor({ action: "solve", question: examples[0].normalizedQuestion, mode: "auto" }));
    const { data } = await response.json() as { data: import("@/lib/math-schema").SolveResult };
    expect(response.status).toBe(200);
    expect(data.steps.length).toBeGreaterThan(0);
    expect(data.visualization).toBeUndefined();
    expect(data.limitations).toContain("图像数据不完整，已保留文字解析。");
  });

  it("withholds an answer if solving discovers more missing conditions", async () => {
    vi.stubGlobal("fetch", solveMock({ ...examples[0], status: "needs_more_info", limitations: ["请补充参数范围。"] }));
    const response = await POST(requestFor({ action: "solve", question: examples[0].normalizedQuestion, mode: "auto" }));
    const { data } = await response.json() as { data: import("@/lib/math-schema").SolveResult };
    expect(response.status).toBe(200);
    expect(data.steps).toEqual([]);
    expect(data.finalAnswerLatex).toBe("");
    expect(data.visualization).toBeUndefined();
  });

});

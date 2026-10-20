import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SolveWorkspace } from "@/components/solve-workspace";
import { examples } from "@/lib/examples";
import { defaultSettings } from "@/lib/storage";
import { useMathLabStore } from "@/lib/store";
import { saveSolveHandoff, savePhotoHandoff } from "@/lib/solve-handoff";
import { readHandwritingSession } from "@/lib/handwriting-session";
import { recognition, evaluation } from "@/testdata/handwriting";
import type { HandwritingRecognition } from "@/lib/handwriting-schema";
import { readSolveSession, SOLVE_SESSION_KEY } from "@/lib/solve-session";
import { questionAssessmentSchema } from "@/lib/math-schema";
import * as photoInput from "@/lib/question-photo";

const testState = vi.hoisted(() => ({
  params: {} as Record<string, string>,
  callTutor: vi.fn(),
}));

const clarificationResult = {
  ...examples[0], id: "clarify-goal", normalizedQuestion: "函数 f(x)=x^2-4x+3，题目要求尚未说明。",
  status: "needs_more_info" as const, steps: [], finalAnswerLatex: "", visualization: undefined,
  limitations: ["请确认题目要求。"], inputAssessment: questionAssessmentSchema.parse({
    classification: "incomplete", normalizedQuestion: "函数 f(x)=x^2-4x+3，题目要求尚未说明。",
    message: "请确认题目要求。", missingInformation: ["题目要求"], recommendedMode: "detailed",
    modeReason: "需要先确认题意。", visualizationUseful: false,
    clarificationQuestions: [{ missingIndex: 0, title: "你希望求什么？", options: [{ label: "求零点", value: "求函数零点" }, { label: "求极值", value: "求函数极值" }] }],
  }),
};

vi.mock("next/navigation", () => ({ useSearchParams: () => ({ get: (key: string) => testState.params[key] ?? null }) }));
vi.mock("@/components/math-plot", () => ({ MathPlot: () => <div data-testid="math-plot" /> }));
vi.mock("@/lib/tutor-client", () => ({
  TutorError: class TutorError extends Error {
    constructor(message: string, public code: string) { super(message); }
  },
  callTutor: testState.callTutor,
}));

describe("SolveWorkspace tutoring flow", () => {
  it("blocks premature submit and ignores an older photo read after a new selection", async () => {
    let first!: (value: string) => void, second!: (value: string) => void;
    const read = vi.spyOn(photoInput, "readQuestionPhoto")
      .mockImplementationOnce(() => new Promise((resolve) => { first = resolve; }))
      .mockImplementationOnce(() => new Promise((resolve) => { second = resolve; }));
    try {
      render(<SolveWorkspace />);
      const input = screen.getByLabelText("拍照或选择数学题图片");
      fireEvent.change(input, { target: { files: [new File(["first"], "first.png", { type: "image/png" })] } });
      expect(screen.getByRole("button", { name: "正在读取图片…" })).toBeDisabled();
      fireEvent.change(input, { target: { files: [new File(["second"], "second.png", { type: "image/png" })] } });
      fireEvent.change(screen.getByLabelText("数学题目"), { target: { value: "图片补充：请检查第二行" } });
      await act(async () => second("data:image/png;base64,c2Vjb25k"));
      expect(screen.getByAltText("待识别题目预览")).toHaveAttribute("src", "data:image/png;base64,c2Vjb25k");
      await act(async () => first("data:image/png;base64,Zmlyc3Q="));
      expect(screen.getByAltText("待识别题目预览")).toHaveAttribute("src", "data:image/png;base64,c2Vjb25k");
      expect(screen.getByText("second.png")).toBeInTheDocument();
      expect(screen.getByLabelText("数学题目")).toHaveValue("图片补充：请检查第二行");
      expect(testState.callTutor).not.toHaveBeenCalled();
    } finally { read.mockRestore(); }
  });
  it("keeps separate feedback at every step and restores it after navigation", async () => {
    useMathLabStore.setState({ settings: { ...defaultSettings, learnerProfile: { ...defaultSettings.learnerProfile, tutoringStyle: "complete" } } });
    testState.callTutor.mockResolvedValue({ title: "只针对第二步", explanation: "补上4再减去4，数值保持不变。", formulas: [], analogy: "", checkQuestion: "" });
    const page = render(<SolveWorkspace />);
    const first = screen.getByLabelText(`关于“${examples[0].steps[0].title}”的困惑`);
    const second = screen.getByLabelText(`关于“${examples[0].steps[1].title}”的困惑`);
    fireEvent.change(first, { target: { value: "第一步的问题" } });
    fireEvent.change(second, { target: { value: "第二步的问题" } });
    const article = screen.getByRole("article", { name: `第2步：${examples[0].steps[1].title}` });
    fireEvent.click(within(article).getByRole("button", { name: "换种讲法" }));
    await screen.findByText("只针对第二步");
    expect(within(screen.getByRole("article", { name: `第1步：${examples[0].steps[0].title}` })).queryByText("只针对第二步")).not.toBeInTheDocument();
    expect(testState.callTutor).toHaveBeenCalledWith(expect.objectContaining({ step: examples[0].steps[1], reason: "第二步的问题" }), expect.anything());
    page.unmount(); render(<SolveWorkspace />);
    expect(screen.getByLabelText(`关于“${examples[0].steps[0].title}”的困惑`)).toHaveValue("第一步的问题");
    expect(screen.getByLabelText(`关于“${examples[0].steps[1].title}”的困惑`)).toHaveValue("第二步的问题");
    expect(screen.getAllByText("只针对第二步")).toHaveLength(1);
    expect(testState.callTutor).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("button", { name: "简单例子" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "概念对比" })).not.toBeInTheDocument();
  });
  it("has one input flow, without a separate handwriting answering tab", () => {
    render(<SolveWorkspace />);
    expect(screen.queryByRole("tab", { name: "手写过程辅导" })).not.toBeInTheDocument();
    expect(screen.queryByRole("tablist", { name: "回答方式" })).not.toBeInTheDocument();
    expect(screen.queryByText("检索教材依据")).not.toBeInTheDocument();
    expect(screen.getByText(/按“课程知识检索”中选择的教材检索/)).toBeInTheDocument();
    expect(screen.getByLabelText("数学题目")).toBeInTheDocument();
    expect(testState.callTutor).not.toHaveBeenCalled();
    expect(screen.queryByText("离线演示题")).not.toBeInTheDocument();
    expect(screen.getByText("图片说明").closest("details")).not.toHaveAttribute("open");
    expect(screen.queryByText(/AI 自动区分题目和你的解题过程/)).not.toBeInTheDocument();
  });

  const photoWork = { kind: "student_work" as const, reason: "题目下方有学生计算步骤", recognition: recognition as HandwritingRecognition };
  async function uploadPhoto() {
    fireEvent.change(screen.getByLabelText("拍照或选择数学题图片"), { target: { files: [new File(["photo"], "回归测试.png", { type: "image/png" })] } });
    await screen.findByAltText("待识别题目预览");
    fireEvent.click(screen.getByRole("button", { name: "识别并解析" }));
  }

  it("automatically enters process review after photo submission, preserving wrong work without revealing an answer", async () => {
    testState.callTutor.mockResolvedValue(photoWork);
    render(<SolveWorkspace />); await uploadPhoto();
    await screen.findByLabelText("手写题目");
    expect(testState.callTutor).toHaveBeenCalledTimes(1);
    expect(testState.callTutor).toHaveBeenCalledWith(expect.objectContaining({ action: "photo-tutor", question: "" }), expect.objectContaining({ onNotice: expect.any(Function) }));
    expect(screen.getByLabelText("第1步公式")).toHaveValue("2x=6");
    expect(screen.getByRole("button", { name: "确认并检查过程 / 检查我新写的一步" })).toBeDisabled();
    expect(screen.queryByText("最终答案")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "上传手写过程" })).not.toBeInTheDocument();
    expect(readHandwritingSession()?.savedMistakeId).toBeNull();
    cleanup(); render(<SolveWorkspace />);
    expect(await screen.findByLabelText("手写题目")).toHaveValue(recognition.question);
    expect(testState.callTutor).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "重新输入或上传题目" }));
    expect(screen.getByLabelText("数学题目")).toBeInTheDocument();
  });

  it("continues ordinary photo answers with the returned automatic lesson and no second request", async () => {
    testState.callTutor.mockResolvedValue({ kind: "solution", solution: examples[1] });
    render(<SolveWorkspace />); await uploadPhoto();
    await waitFor(() => expect(useMathLabStore.getState().currentSolution?.id).toBe(examples[1].id));
    expect(screen.queryByLabelText("手写题目")).not.toBeInTheDocument();
    expect(screen.queryByAltText("待识别题目预览")).not.toBeInTheDocument();
    expect(testState.callTutor).toHaveBeenCalledTimes(1);
  });

  it("requires a choice for ambiguous photos, restores that choice screen, then evaluates only confirmed work", async () => {
    testState.callTutor.mockResolvedValue({ ...photoWork, kind: "uncertain", reason: "无法区分题干示例与学生作答" });
    render(<SolveWorkspace />); await uploadPhoto();
    await screen.findByRole("region", { name: "核对图片内容" });
    expect(screen.queryByText("最终答案")).not.toBeInTheDocument();
    expect(testState.callTutor).toHaveBeenCalledTimes(1);
    cleanup(); render(<SolveWorkspace />);
    expect(await screen.findByRole("region", { name: "核对图片内容" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "包含我的解题过程，先帮我点拨" }));
    await screen.findByLabelText("手写题目");
    testState.callTutor.mockResolvedValue(evaluation);
    fireEvent.click(screen.getByRole("checkbox", { name: /我已核对原题/ }));
    fireEvent.click(screen.getByRole("button", { name: "确认并检查过程 / 检查我新写的一步" }));
    await screen.findByText("首次影响结论的错误：第1步");
    expect(testState.callTutor).toHaveBeenLastCalledWith(expect.objectContaining({ action: "evaluate-work", confirmed: true }), expect.anything());
    expect(screen.queryByText("最终答案")).not.toBeInTheDocument();
  });

  it("uses the reviewed question when an ambiguous photo is confirmed as question-only", async () => {
    testState.callTutor.mockResolvedValueOnce({ ...photoWork, kind: "uncertain" }).mockResolvedValueOnce(examples[1]);
    render(<SolveWorkspace />); await uploadPhoto();
    await screen.findByRole("region", { name: "核对图片内容" });
    fireEvent.change(screen.getByLabelText("图片核对题目"), { target: { value: "解方程 2x+1=5。" } });
    fireEvent.click(screen.getByRole("button", { name: "只有题目，开始普通答疑" }));
    await waitFor(() => expect(testState.callTutor).toHaveBeenCalledTimes(2));
    expect(testState.callTutor).toHaveBeenLastCalledWith(expect.objectContaining({ action: "solve", question: "解方程 2x+1=5。", imageDataUrl: undefined }), expect.objectContaining({ onNotice: expect.any(Function) }));
  });

  it("receives homepage handwriting handoff without retransmitting its image or automatically evaluating it", async () => {
    testState.params = { handoff: savePhotoHandoff(photoWork) };
    render(<SolveWorkspace />);
    await screen.findByLabelText("手写题目");
    expect(screen.getByLabelText("第1步公式")).toHaveValue("2x=6");
    expect(testState.callTutor).not.toHaveBeenCalled();
    expect(sessionStorage.getItem("mathlab.solve-handoff.v1")).toBeNull();
  });

  it("keeps the input and original photo when automatic routing fails", async () => {
    testState.callTutor.mockRejectedValue(new Error("network"));
    render(<SolveWorkspace />);
    fireEvent.change(screen.getByLabelText("数学题目"), { target: { value: "补充：解方程 2x+1=5" } });
    await uploadPhoto();
    await screen.findByRole("alert");
    expect(screen.getByLabelText("数学题目")).toHaveValue("补充：解方程 2x+1=5");
    expect(screen.getByAltText("待识别题目预览")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "识别并解析" })).toBeEnabled();
    expect(screen.queryByText("最终答案")).not.toBeInTheDocument();
  });

  it("does not reload the old example instead of the newly recognized work on refresh", async () => {
    testState.params = { example: examples[0].id };
    testState.callTutor.mockResolvedValue(photoWork);
    render(<SolveWorkspace />); await uploadPhoto();
    await screen.findByLabelText("手写题目");
    expect(window.location.pathname + window.location.search).toBe("/solve");
    expect(readSolveSession()?.entryKey).toBe("");
    testState.params = {}; cleanup(); render(<SolveWorkspace />);
    expect(await screen.findByLabelText("手写题目")).toHaveValue(recognition.question);
    expect(testState.callTutor).toHaveBeenCalledTimes(1);
  });

  it("lets the student correct a wrong routing decision using the edited question and no image", async () => {
    testState.callTutor.mockResolvedValueOnce(photoWork).mockResolvedValueOnce(examples[1]);
    render(<SolveWorkspace />); await uploadPhoto();
    await screen.findByLabelText("手写题目");
    fireEvent.change(screen.getByLabelText("手写题目"), { target: { value: "求导数 f(x)=x^3-3x。" } });
    fireEvent.click(screen.getByRole("button", { name: "识别有误？这张图片只有题目，改为普通答疑" }));
    await waitFor(() => expect(testState.callTutor).toHaveBeenCalledTimes(2));
    expect(testState.callTutor).toHaveBeenLastCalledWith(expect.objectContaining({ action: "solve", question: "求导数 f(x)=x^3-3x。", imageDataUrl: undefined }), expect.objectContaining({ onNotice: expect.any(Function) }));
    expect(screen.queryByLabelText("手写题目")).not.toBeInTheDocument();
  });
  afterEach(() => cleanup());

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    testState.params = {};
    testState.callTutor.mockReset();
    useMathLabStore.setState({
      mistakes: [],
      settings: defaultSettings,
      hydrated: true,
      currentSolution: null,
      understandingAttempts: [],
    });
  });

  it("reveals only the first step in guided mode and withholds the final answer", () => {
    render(<SolveWorkspace />);
    expect(screen.getByText(`已展开 1/${examples[0].steps.length} 步`)).toBeInTheDocument();
    expect(screen.queryByText("最终答案")).not.toBeInTheDocument();
    expect(screen.getByText("我理解了，继续")).toBeInTheDocument();
    expect(screen.queryByText("本次辅导策略")).not.toBeInTheDocument();
    expect(screen.queryByRole("slider")).not.toBeInTheDocument();
    expect(screen.queryByText("播放动画")).not.toBeInTheDocument();
    expect(screen.getByTestId("math-plot")).toBeInTheDocument();
  });

  it("shows all steps and the answer in complete mode", () => {
    useMathLabStore.setState({
      settings: { ...defaultSettings, learnerProfile: { ...defaultSettings.learnerProfile, tutoringStyle: "complete" } },
    });
    render(<SolveWorkspace />);
    expect(screen.getByText(`已展开 ${examples[0].steps.length}/${examples[0].steps.length} 步`)).toBeInTheDocument();
    expect(screen.getByText("最终答案")).toBeInTheDocument();
    expect(screen.getByText("理解检查")).toBeInTheDocument();
  });

  it("keeps formulas visible in every revealed step, not just the active step", () => {
    useMathLabStore.setState({ settings: { ...defaultSettings, learnerProfile: { ...defaultSettings.learnerProfile, tutoringStyle: "complete" } } });
    const { container } = render(<SolveWorkspace />);
    const articles = container.querySelectorAll("article");
    expect(articles).toHaveLength(examples[0].steps.length);
    articles.forEach((article, index) => expect(article.querySelectorAll(".katex")).toHaveLength(examples[0].steps[index].formulas.length));
  });

  it("automatically starts a question submitted from the homepage", async () => {
    testState.params = { question: "求 x+1=0", auto: "1" };
    testState.callTutor.mockResolvedValue(examples[0]);
    render(<SolveWorkspace />);

    await waitFor(() => expect(testState.callTutor).toHaveBeenCalledWith(expect.objectContaining({
      action: "solve",
      question: "求 x+1=0",
    }), expect.objectContaining({ onNotice: expect.any(Function) })));
    expect(testState.callTutor).toHaveBeenCalledTimes(1);
  });

  it("opens the homepage photo result without solving or charging again", async () => {
    testState.params = { handoff: saveSolveHandoff(examples[1]) };
    render(<SolveWorkspace />);
    await waitFor(() => expect(useMathLabStore.getState().currentSolution).toEqual(examples[1]));
    expect(testState.callTutor).not.toHaveBeenCalled();
    expect(sessionStorage.getItem("mathlab.solve-handoff.v1")).toBeNull();
    expect(sessionStorage.getItem(SOLVE_SESSION_KEY)).not.toBeNull();
  });

  it("uses automatic mode then shows the recommended text lesson without a chart", async () => {
    testState.params = { question: "解方程 x+1=0", auto: "1" };
    testState.callTutor.mockResolvedValue({ ...examples[0], id: "generated", normalizedQuestion: "解方程 x+1=0",
      recommendedMode: "concise", explanationMode: "concise", modeReason: "只需移项。", visualization: undefined });
    render(<SolveWorkspace />);
    await screen.findByText("AI 推荐：简洁 · 只需移项。");
    expect(testState.callTutor).toHaveBeenCalledWith(expect.objectContaining({ mode: "auto" }), expect.objectContaining({ onNotice: expect.any(Function) }));
    expect(screen.getByRole("tab", { name: "自动" })).toHaveAttribute("aria-selected", "true");
    expect(screen.queryByTestId("math-plot")).not.toBeInTheDocument();
    expect(screen.queryByText("实时可视化")).not.toBeInTheDocument();
  });

  it("regenerates an AI lesson when the user selects a different mode", async () => {
    testState.params = { question: "解方程 x+1=0", auto: "1" };
    const result = { ...examples[0], id: "generated", normalizedQuestion: "解方程 x+1=0",
      recommendedMode: "concise", explanationMode: "concise", modeReason: "只需移项。", visualization: undefined };
    testState.callTutor.mockResolvedValueOnce(result).mockResolvedValueOnce({ ...result, explanationMode: "detailed" });
    render(<SolveWorkspace />);
    await screen.findByText("AI 推荐：简洁 · 只需移项。");
    fireEvent.mouseDown(screen.getByRole("tab", { name: "详细" }), { button: 0, ctrlKey: false });
    await waitFor(() => expect(testState.callTutor).toHaveBeenCalledTimes(2));
    expect(testState.callTutor).toHaveBeenLastCalledWith(expect.objectContaining({ mode: "detailed", question: result.normalizedQuestion }), expect.objectContaining({ onNotice: expect.any(Function) }));
    await screen.findByText("当前采用：详细");
    fireEvent.change(screen.getByLabelText("数学题目"), { target: { value: "解方程 x+2=0" } });
    expect(screen.getByRole("tab", { name: "自动" })).toHaveAttribute("aria-selected", "true");
    expect(screen.queryByText("当前采用：详细")).not.toBeInTheDocument();
  });

  it("shows a clarification without an answer or graph", async () => {
    testState.params = { question: "帮我计算这个积分", auto: "1" };
    testState.callTutor.mockResolvedValue({ ...examples[0], normalizedQuestion: testState.params.question,
      status: "needs_more_info", steps: [], finalAnswerLatex: "", visualization: undefined, limitations: ["请提供被积函数和积分上下限。"] });
    render(<SolveWorkspace />);
    await screen.findByLabelText("补充：请提供被积函数和积分上下限。");
    expect(screen.queryByText("最终答案")).not.toBeInTheDocument();
    expect(screen.queryByText("收藏错题")).not.toBeInTheDocument();
  });

  it("preserves a failed question without presenting the unrelated offline answer", async () => {
    testState.params = { question: "求 x+1=0", auto: "1" };
    testState.callTutor.mockRejectedValue(new Error("模型返回空内容"));
    render(<SolveWorkspace />);
    await screen.findByText("本次未获得有效解析。输入已保留，可修改或重试。");
    expect(screen.getByLabelText("数学题目")).toHaveValue("求 x+1=0");
    expect(screen.queryByRole("button", { name: "识别函数结构" })).not.toBeInTheDocument();
    expect(screen.queryByText("解析完成")).not.toBeInTheDocument();
  });

  it("lets the user confirm a candidate before resubmitting the supplemented question", async () => {
    testState.params = { question: clarificationResult.normalizedQuestion, auto: "1" };
    testState.callTutor.mockResolvedValueOnce(clarificationResult).mockImplementationOnce(async (request) => ({ ...examples[0], normalizedQuestion: request.question }));
    render(<SolveWorkspace />);
    const choice = await screen.findByRole("radio", { name: "求零点" });
    expect(choice).not.toBeChecked();
    fireEvent.click(choice);
    expect(testState.callTutor).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "确认补充并继续解析" }));
    await screen.findByText("解析完成");
    expect(testState.callTutor).toHaveBeenCalledTimes(2);
    expect(testState.callTutor).toHaveBeenLastCalledWith(expect.objectContaining({
      action: "solve", mode: "auto", question: expect.stringContaining("你希望求什么？：求函数零点"), imageDataUrl: undefined,
    }), expect.objectContaining({ onNotice: expect.any(Function) }));
    expect((screen.getByLabelText("数学题目") as HTMLTextAreaElement).value).toContain("用户确认的补充条件");
  });

  it("restores an unsubmitted clarification choice and custom answer without a new AI call", async () => {
    testState.params = { question: clarificationResult.normalizedQuestion, auto: "1" };
    testState.callTutor.mockResolvedValue(clarificationResult);
    const page = render(<SolveWorkspace />);
    fireEvent.click(await screen.findByRole("radio", { name: "自己填写" }));
    fireEvent.change(screen.getByLabelText("补充：你希望求什么？"), { target: { value: "分析单调性" } });
    page.unmount();
    testState.params = {};
    useMathLabStore.setState({ currentSolution: null });
    render(<SolveWorkspace />);
    expect(screen.getByRole("radio", { name: "自己填写" })).toBeChecked();
    expect(screen.getByLabelText("补充：你希望求什么？")).toHaveValue("分析单调性");
    expect(testState.callTutor).toHaveBeenCalledTimes(1);
  });

  it("continues asking when confirmed text still lacks necessary conditions", async () => {
    testState.params = { question: clarificationResult.normalizedQuestion, auto: "1" };
    testState.callTutor.mockResolvedValueOnce(clarificationResult).mockImplementationOnce(async (request) => ({
      ...clarificationResult, normalizedQuestion: request.question, inputAssessment: undefined, limitations: ["请补充定义域。"],
    }));
    render(<SolveWorkspace />);
    fireEvent.click(await screen.findByRole("radio", { name: "求极值" }));
    fireEvent.click(screen.getByRole("button", { name: "确认补充并继续解析" }));
    await screen.findByLabelText("补充：请补充定义域。");
    expect(screen.queryByText("最终答案")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "确认补充并继续解析" })).toBeDisabled();
  });

  it("restores unsolved text after native navigation discards the in-memory store", () => {
    const page = render(<SolveWorkspace />);
    fireEvent.change(screen.getByLabelText("数学题目"), { target: { value: "请证明这个极限存在，我还没有提交" } });
    page.unmount();
    useMathLabStore.setState({ currentSolution: null });
    render(<SolveWorkspace />);
    expect(screen.getByLabelText("数学题目")).toHaveValue("请证明这个极限存在，我还没有提交");
    expect(screen.queryByText("解析完成")).not.toBeInTheDocument();
    expect(testState.callTutor).not.toHaveBeenCalled();
  });

  it("restores the exact harmonic-series source with a rendered preview after navigation", () => {
    const value = String.raw`证明调和级数 \sum_{n=1}^{\infty} \frac{1}{n} 发散。`;
    const page = render(<SolveWorkspace />);
    fireEvent.change(screen.getByLabelText("数学题目"), { target: { value } });
    page.unmount();
    useMathLabStore.setState({ currentSolution: null });
    render(<SolveWorkspace />);
    expect(screen.getByLabelText("数学题目")).toHaveValue(value);
    expect(screen.getByRole("region", { name: "题目公式预览" }).querySelector(".mfrac")).toBeInTheDocument();
    expect(testState.callTutor).not.toHaveBeenCalled();
  });

  it("restores revealed steps, active step, notes and visualization parameters", () => {
    testState.params = { example: examples[1].id };
    const page = render(<SolveWorkspace />);
    fireEvent.click(screen.getByRole("button", { name: "我理解了，继续" }));
    fireEvent.click(screen.getByRole("button", { name: "我理解了，继续" }));
    fireEvent.click(screen.getByRole("button", { name: "我理解了，继续" }));
    fireEvent.change(screen.getByPlaceholderText("写下当时的错误思路或复习提醒（可选）"), { target: { value: "不能弄错零点" } });
    const parameter = examples[1].visualization!.parameters[0];
    fireEvent.change(screen.getByRole("spinbutton", { name: parameter.label + "数值" }), { target: { value: "2" } });
    const saved = readSolveSession()!;
    expect(saved.progressCount).toBe(4);
    page.unmount();
    useMathLabStore.setState({ currentSolution: null });
    render(<SolveWorkspace />);
    expect(screen.getByText(`已展开 4/${examples[1].steps.length} 步`)).toBeInTheDocument();
    expect(screen.getByPlaceholderText("写下当时的错误思路或复习提醒（可选）")).toHaveValue("不能弄错零点");
    expect(screen.getByRole("spinbutton", { name: parameter.label + "数值" })).toHaveValue(2);
    expect(readSolveSession()?.activeStep).toBe(saved.activeStep);
  });

  it("restores an AI result on browser back without automatically charging again", async () => {
    testState.params = { question: "解方程 x+1=0", auto: "1" };
    const result = { ...examples[0], id: "ai-saved", normalizedQuestion: testState.params.question, visualization: undefined, explanationMode: "concise" };
    testState.callTutor.mockResolvedValue(result);
    const page = render(<SolveWorkspace />);
    await screen.findByText("解析完成");
    page.unmount();
    useMathLabStore.setState({ currentSolution: null });
    render(<SolveWorkspace />);
    await screen.findByText("解析完成");
    expect(screen.getByLabelText("数学题目")).toHaveValue(result.normalizedQuestion);
    expect(testState.callTutor).toHaveBeenCalledTimes(1);
  });

  it("opens a different explicit question rather than overwriting it with the last draft", () => {
    const page = render(<SolveWorkspace />);
    fireEvent.change(screen.getByLabelText("数学题目"), { target: { value: "旧题目草稿" } });
    page.unmount();
    testState.params = { question: "另一道新题目" };
    useMathLabStore.setState({ currentSolution: null });
    render(<SolveWorkspace />);
    expect(screen.getByLabelText("数学题目")).toHaveValue("另一道新题目");
    expect(testState.callTutor).not.toHaveBeenCalled();
  });

  it("does not silently repeat a pending solve after leaving the page", async () => {
    testState.params = { question: "求一个尚未完成的题目", auto: "1" };
    let finish!: (value: unknown) => void;
    testState.callTutor.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    const page = render(<SolveWorkspace />);
    await waitFor(() => expect(testState.callTutor).toHaveBeenCalledTimes(1));
    page.unmount();
    testState.params = {};
    useMathLabStore.setState({ currentSolution: null });
    render(<SolveWorkspace />);
    expect(screen.getByText("上次请求在离开页面时中断，题目和进度已保留，请手动重试。")).toBeInTheDocument();
    expect(screen.getByLabelText("数学题目")).toHaveValue("求一个尚未完成的题目");
    finish(examples[0]);
    await waitFor(() => expect(testState.callTutor).toHaveBeenCalledTimes(1));
    expect(screen.queryByText("解析完成")).not.toBeInTheDocument();
  });
});

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HandwritingWorkspace } from "./handwriting-workspace";
import { emptyHandwritingSession, readHandwritingSession, writeHandwritingSession } from "@/lib/handwriting-session";
import { work, evaluation, recognition } from "@/testdata/handwriting";
import { useMathLabStore } from "@/lib/store";
import { defaultSettings, readMistakes, STORAGE_KEYS } from "@/lib/storage";
import { examples } from "@/lib/examples";
const mocks = vi.hoisted(() => ({ callTutor: vi.fn() }));
vi.mock("@/lib/tutor-client", () => ({ callTutor: mocks.callTutor, TutorError: class extends Error {} }));
const checkButton = () => screen.getByRole("button", { name: "确认并检查过程 / 检查我新写的一步" });
const confirmBox = () => screen.getByRole("checkbox", { name: /我已核对原题/ });
function seed(withEvaluation = false) {
  writeHandwritingSession({ ...emptyHandwritingSession(), ...work, evaluation: withEvaluation ? evaluation : null });
}
beforeEach(() => {
  sessionStorage.clear(); localStorage.clear(); mocks.callTutor.mockReset();
  useMathLabStore.setState({ hydrated: true, mistakes: [], settings: defaultSettings, currentSolution: null });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); sessionStorage.clear(); localStorage.clear(); });

describe("handwriting workflow (DOM tests, not browser/real AI)", () => {
  it("resumes unsaved edits to the same mistake instead of overwriting them with its older snapshot", () => {
    const original = { ...emptyHandwritingSession(), ...work, evaluation };
    render(<HandwritingWorkspace initialRecord={{ id: "test-mistake", handwriting: original }} />);
    fireEvent.change(screen.getByLabelText("第1步公式"), { target: { value: "2x=4" } });
    cleanup(); render(<HandwritingWorkspace initialRecord={{ id: "test-mistake", handwriting: original }} />);
    expect(screen.getByLabelText("第1步公式")).toHaveValue("2x=4");
    expect(confirmBox()).not.toBeChecked();
    expect(mocks.callTutor).not.toHaveBeenCalled();
  });
  it("never calls empty work correct, requires manual review and permits direct input", () => {
    render(<HandwritingWorkspace />);
    expect(checkButton()).toBeDisabled();
    expect(screen.queryByText("本题已完成")).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("手写题目"), { target: { value: work.question } });
    fireEvent.click(screen.getByRole("button", { name: "补充新步骤" }));
    fireEvent.change(screen.getByLabelText("第1步公式"), { target: { value: "2x=4" } });
    fireEvent.click(confirmBox()); expect(checkButton()).toBeEnabled();
    expect(mocks.callTutor).not.toHaveBeenCalled();
  });
  it("checks confirmed steps with exact ids and distinguishes first vs dependent error", async () => {
    seed(); mocks.callTutor.mockResolvedValue(evaluation); render(<HandwritingWorkspace />);
    fireEvent.click(checkButton());
    await screen.findByText("首次影响结论的错误：第1步");
    expect(screen.getByText("第2步 · 依赖前面的错误")).toBeInTheDocument();
    expect(mocks.callTutor.mock.calls[0][0]).toMatchObject({ action: "evaluate-work", ...work });
    expect(screen.queryByText("最终答案")).not.toBeInTheDocument();
  });
  it("restores completed feedback without another request and persists opened hints", () => {
    seed(true); render(<HandwritingWorkspace />);
    expect(screen.getByText("首次影响结论的错误：第1步")).toBeInTheDocument();
    cleanup(); render(<HandwritingWorkspace />);
    expect(screen.getByLabelText("第1步公式")).toHaveValue("2x=6");
    expect(mocks.callTutor).not.toHaveBeenCalled();
  });
  it("editing old work invalidates verdicts/hints and preserves the step id", () => {
    seed(true); render(<HandwritingWorkspace />);
    fireEvent.change(screen.getByLabelText("第1步公式"), { target: { value: "2x=4" } });
    expect(screen.queryByText("首次影响结论的错误：第1步")).not.toBeInTheDocument();
    expect(confirmBox()).not.toBeChecked();
    expect(readHandwritingSession()).toMatchObject({ evaluation: null, hints: [], confirmed: false });
    expect(readHandwritingSession()?.steps[0].id).toBe("s1");
  });
  it("ignores a late response after an edit and cancels its request signal", async () => {
    seed(); let resolve!: (result: unknown) => void;
    mocks.callTutor.mockImplementation(() => new Promise((r) => { resolve = r; }));
    render(<HandwritingWorkspace />); fireEvent.click(checkButton());
    const signal = mocks.callTutor.mock.calls[0][1].signal;
    fireEvent.change(screen.getByLabelText("第1步公式"), { target: { value: "2x=4" } });
    expect(signal.aborted).toBe(true);
    await act(async () => resolve(evaluation));
    expect(screen.queryByText("首次影响结论的错误：第1步")).not.toBeInTheDocument();
    expect(screen.getByLabelText("第1步公式")).toHaveValue("2x=4");
  });
  it("opens one hint level at a time, preserves opened hint and requests full solve only on demand", async () => {
    seed(true);
    mocks.callTutor.mockImplementation((r) => r.action === "solve" ? Promise.resolve(examples[0]) : Promise.resolve({ level: r.level, targetStepId: "s1", title: `提示${r.level}`, text: "请先检查右边的运算。", formulas: [] }));
    render(<HandwritingWorkspace />);
    fireEvent.click(screen.getByRole("button", { name: "给我下一步提示" })); await screen.findByText("方向提示 · 提示1");
    expect(mocks.callTutor.mock.calls[0][0].level).toBe(1);
    expect(screen.queryByText("方法提示 · 提示2")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "再给方法提示" })); await screen.findByText("方法提示 · 提示2");
    cleanup(); render(<HandwritingWorkspace />);
    expect(screen.getByText("方法提示 · 提示2")).toBeInTheDocument();
    expect(mocks.callTutor).toHaveBeenCalledTimes(2);
    fireEvent.click(screen.getByRole("button", { name: "查看完整解析（首次会调用 AI）" }));
    await screen.findByText("最终答案");
    expect(mocks.callTutor.mock.calls[2][0].action).toBe("solve");
  });
  it("completed work shows understanding check, not meaningless next steps", () => {
    const correct = { ...evaluation, firstErrorStepId: null, status: "completed" as const,
      steps: evaluation.steps.map((s) => ({ ...s, status: "correct" as const })), understandingQuestion: "为什么可以同除以2？" };
    writeHandwritingSession({ ...emptyHandwritingSession(), ...work, evaluation: correct });
    render(<HandwritingWorkspace />);
    expect(screen.getByText("本题已完成")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "给我下一步提示" })).not.toBeInTheDocument();
    expect(screen.getByText("为什么可以同除以2？")).toBeInTheDocument();
  });
  it("step reordering preserves ids and requires review again", () => {
    seed(true); render(<HandwritingWorkspace />); fireEvent.click(screen.getByLabelText("上移第2步"));
    expect(screen.getByLabelText("第1步公式")).toHaveValue("x=3");
    expect(readHandwritingSession()?.steps.map((s) => s.id)).toEqual(["s2", "s1"]);
    expect(confirmBox()).not.toBeChecked();
  });
  it("uploads only after consent, keeps OCR errors and requires review before evaluation", async () => {
    mocks.callTutor.mockResolvedValue(recognition); render(<HandwritingWorkspace />);
    fireEvent.change(screen.getByLabelText("上传手写过程图片"), { target: { files: [new File(["mock-image-bytes"], "测试情境.png", { type: "image/png" })] } });
    await screen.findByText("测试情境.png");
    const recognizeButton = screen.getByRole("button", { name: "识别笔迹（不评价）" });
    expect(recognizeButton).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox", { name: /我同意将这张图片/ })); fireEvent.click(recognizeButton);
    await waitFor(() => expect(screen.getByLabelText("第1步公式")).toHaveValue("2x=6"));
    expect(checkButton()).toBeDisabled(); expect(mocks.callTutor).toHaveBeenCalledTimes(1);
    expect(sessionStorage.getItem("mathlab.handwriting-session.v1")).not.toContain("data:image");
  });
  it("failed requests preserve confirmed work and permit retry", async () => {
    seed(); mocks.callTutor.mockRejectedValueOnce(new Error("test-network")); render(<HandwritingWorkspace />);
    fireEvent.click(checkButton()); await screen.findByRole("alert");
    expect(screen.getByLabelText("第1步公式")).toHaveValue("2x=6");
    expect(checkButton()).toBeEnabled();
    mocks.callTutor.mockResolvedValueOnce(evaluation); fireEvent.click(checkButton()); await screen.findByText("首次影响结论的错误：第1步");
  });
  it("saves confirmed reason and process without a photo and does not save duplicates", () => {
    seed(true); render(<HandwritingWorkspace />);
    fireEvent.change(screen.getByLabelText("手写错误原因"), { target: { value: "测试情境：减法计算错误" } });
    fireEvent.change(screen.getByLabelText("手写复盘笔记"), { target: { value: "仅用于自动化回归" } });
    fireEvent.click(screen.getByRole("button", { name: "保存已确认的过程与评价" }));
    expect(screen.getByRole("button", { name: "此版本过程已保存" })).toBeDisabled();
    const saved = readMistakes(); expect(saved).toHaveLength(1);
    expect(saved[0].handwriting?.steps).toEqual(work.steps); expect(saved[0].handwriting?.recognition).toBeNull();
    expect(saved[0].errorReason).toContain("测试情境");
    expect(localStorage.getItem(STORAGE_KEYS.mistakes)).not.toContain("data:image");
  });
  it("quota failure never overwrites previous mistakes or reports successful save", () => {
    seed(true); render(<HandwritingWorkspace />);
    fireEvent.change(screen.getByLabelText("手写错误原因"), { target: { value: "测试情境" } });
    const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("quota"); });
    fireEvent.click(screen.getByRole("button", { name: "保存已确认的过程与评价" }));
    expect(screen.queryByRole("button", { name: "此版本过程已保存" })).not.toBeInTheDocument();
    expect(useMathLabStore.getState().mistakes).toHaveLength(0);
    spy.mockRestore();
  });
});

import { useState } from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StepTutoringPanel, type StepFeedback } from "./step-tutoring-panel";
import { examples } from "@/lib/examples";
import { callTutor } from "@/lib/tutor-client";
vi.mock("@/lib/tutor-client", () => ({ callTutor: vi.fn() }));
afterEach(() => { cleanup(); vi.resetAllMocks(); });
const explanation = { title: "配方的依据", explanation: "加上再减去同一个数，等式仍成立。", formulas: ["x^2-4x+4=(x-2)^2"], analogy: "", checkQuestion: "为什么还要减去4？" };
function Panel() {
  const [value, setValue] = useState<StepFeedback>({ reason: "为什么补4？", detail: null });
  return <StepTutoringPanel step={examples[0].steps[1]} question={examples[0].normalizedQuestion} mode="detailed" learningContext={undefined} value={value} onChange={setValue} onFocus={() => undefined} />;
}
describe("per-step personal tutoring", () => {
  it("offers only three requested choices and sends this exact step and confusion", async () => {
    vi.mocked(callTutor).mockResolvedValue(explanation);
    render(<Panel />);
    expect(screen.queryByRole("button", { name: "简单例子" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "概念对比" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "补基础" }));
    expect(await screen.findByText("配方的依据")).toBeInTheDocument();
    expect(callTutor).toHaveBeenCalledWith(expect.objectContaining({ action: "explain-step", step: examples[0].steps[1], reason: "为什么补4？", perspective: "foundation" }), expect.objectContaining({ signal: expect.any(AbortSignal) }));
  });
  it("ignores a late response after the student changes their confusion", async () => {
    let finish!: (result: typeof explanation) => void;
    vi.mocked(callTutor).mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    render(<Panel />);
    fireEvent.click(screen.getByRole("button", { name: "根据反馈生成专属讲解" }));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "我现在不懂展开公式" } });
    await act(async () => finish(explanation));
    expect(screen.queryByText("配方的依据")).not.toBeInTheDocument();
    expect(screen.getByRole("textbox")).toHaveValue("我现在不懂展开公式");
    expect(screen.getByRole("button", { name: "根据反馈生成专属讲解" })).toBeEnabled();
  });
  it("keeps the input and offers retry after a failed request", async () => {
    vi.mocked(callTutor).mockRejectedValue(new Error("连接中断，请重试"));
    render(<Panel />); fireEvent.click(screen.getByRole("button", { name: "换种讲法" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("连接中断");
    expect(screen.getByRole("textbox")).toHaveValue("为什么补4？");
    expect(screen.getByRole("button", { name: "换种讲法" })).toBeEnabled();
  });
});

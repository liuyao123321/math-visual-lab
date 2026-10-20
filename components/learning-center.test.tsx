import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LearningCenter } from "@/components/learning-center";
import { emptyLearning, LEARNING_KEY, useLearningStore } from "@/lib/learning-store";
import { generateReviewPlan } from "@/lib/learning";
import { useMathLabStore } from "@/lib/store";
import { defaultSettings } from "@/lib/storage";
import { examples } from "@/lib/examples";

vi.mock("sonner", () => ({ toast: { success: vi.fn() } }));
afterEach(() => cleanup());
beforeEach(() => {
  localStorage.clear();
  useMathLabStore.setState({ mistakes: [], settings: defaultSettings, understandingAttempts: [], hydrated: true });
  useLearningStore.setState({ data: emptyLearning, hydrated: true });
});

describe("learning center operations", () => {
  it("opens simulation directly without the removed review tools", () => {
    render(<LearningCenter />);
    expect(screen.getByText("专项模拟")).toBeInTheDocument();
    expect(screen.getByText("根据错题生成模拟试卷")).toBeInTheDocument();
    for (const label of ["复习中心", "复习计划", "知识地图", "试卷与资料"]) expect(screen.queryByText(label)).not.toBeInTheDocument();
    expect(screen.queryByRole("tablist")).not.toBeInTheDocument();
  });
  it("creates an offline paper, saves answers, and blocks an incomplete submission", async () => {
    useMathLabStore.getState().addMistake({ solution: examples[0], errorReason: "配方错误", note: "" });
    render(<LearningCenter />);
    fireEvent.click(screen.getByText("使用离线变式题库"));
    const session = useLearningStore.getState().data.sessions[0];
    expect(session.paper.questions).toHaveLength(5);
    expect(session.paper.rationale).toContain("从你的错题知识点");
    expect(screen.queryByText(/从你的错题知识点/)).not.toBeInTheDocument();
    expect(screen.getByText(/确定性离线题库 · 已答/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("第1题回答"), { target: { value: "使用配方法" } });
    expect(useLearningStore.getState().data.sessions[0].answers[session.paper.questions[0].id]).toBe("使用配方法");
    fireEvent.click(screen.getByText("交卷并查看反馈"));
    expect(await screen.findByText("请先完成所有题目的回答，空白题目不会被自动判错。")).toBeInTheDocument();
  });
  it("submits a completed paper without fabricating an AI score", async () => {
    useMathLabStore.getState().addMistake({ solution: examples[2], errorReason: "忘记下限", note: "" });
    render(<LearningCenter />);
    fireEvent.click(screen.getByText("使用离线变式题库"));
    for (let index = 1; index <= 5; index++) fireEvent.change(screen.getByLabelText(`第${index}题回答`), { target: { value: "先求原函数，再计算上下限之差" } });
    fireEvent.click(screen.getByText("交卷并查看反馈"));
    await waitFor(() => expect(useLearningStore.getState().data.sessions[0].submittedAt).not.toBeNull());
    expect(useLearningStore.getState().data.sessions[0].feedback).toEqual({});
    expect(useLearningStore.getState().data.activityDays).toHaveLength(1);
    expect(screen.getByText("本次没有 AI 评价，请自行对照参考答案；有效学习打卡已记录。")).toBeInTheDocument();
  });
  it("preserves legacy plans, materials and check-ins while creating a simulation", () => {
    useMathLabStore.getState().addMistake({ solution: examples[0], errorReason: "配方错误", note: "" });
    const store = useLearningStore.getState();
    store.savePlan(generateReviewPlan(useMathLabStore.getState().mistakes, "2026-12-01", 30));
    store.saveMaterial({ title: "旧资料", summary: "保留内容", topics: ["配方法"], questions: ["求函数零点"], warnings: [] }, "旧资料");
    store.activity();
    const before = structuredClone(useLearningStore.getState().data);
    render(<LearningCenter />);
    fireEvent.click(screen.getByText("使用离线变式题库"));
    const persisted = JSON.parse(localStorage.getItem(LEARNING_KEY)!);
    expect(persisted.plan).toEqual(before.plan);
    expect(persisted.materials).toEqual(before.materials);
    expect(persisted.activityDays).toEqual(before.activityDays);
    expect(persisted.sessions).toHaveLength(1);
  });
  it("allows deselecting all source mistakes instead of restoring the defaults", () => {
    useMathLabStore.getState().addMistake({ solution: examples[0], errorReason: "配方错误", note: "" });
    render(<LearningCenter />);
    fireEvent.click(screen.getByRole("checkbox"));
    expect(screen.getByText("使用离线变式题库")).toBeDisabled();
  });
});

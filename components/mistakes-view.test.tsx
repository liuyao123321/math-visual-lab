import { cleanup, fireEvent, render, screen, within, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MistakesView } from "@/components/mistakes-view";
import { defaultSettings, readMistakes } from "@/lib/storage";
import { useMathLabStore } from "@/lib/store";
import { mistakeFixture } from "@/testdata/mistake-view";
import { emptyHandwritingSession } from "@/lib/handwriting-session";
import { work, evaluation } from "@/testdata/handwriting";

vi.mock("@/lib/usage-client", () => ({ trackUsage: vi.fn() }));
const ids = () => screen.queryAllByRole("article").map((element) => element.getAttribute("data-mistake-id"));
function seed() { useMathLabStore.setState({ mistakes: [mistakeFixture("test-a", { question: "【测试】求导数", note: "导数笔记" }), mistakeFixture("test-b", { subject: "线性代数", difficulty: "进阶", errorReason: "", attempts: 3, createdAt: "2026-01-01T00:00:00Z" }), mistakeFixture("test-c", { subject: "概率统计", difficulty: "中等", mastery: "mastered" })] }); }

describe("MistakesView", () => {
  beforeEach(() => {
    vi.restoreAllMocks(); localStorage.clear();
    vi.stubGlobal("PointerEvent", MouseEvent);
    useMathLabStore.setState({ mistakes: [], settings: defaultSettings, hydrated: true, currentSolution: null });
  });
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

  it("shows a useful empty state", () => {
    render(<MistakesView />);
    expect(screen.getByText("错题集还是空的")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "查看示例题" })).toHaveAttribute("href", "/solve?example=example-quadratic");
  });

  it("keeps editors out of cards and preserves stable course palettes", () => {
    seed(); render(<MistakesView />);
    expect(ids()).toEqual(["test-a", "test-c", "test-b"]);
    expect(screen.queryByRole("textbox", { name: "错误原因" })).not.toBeInTheDocument();
    expect(screen.getAllByRole("article")[0]).toHaveClass("mistake-card--forest");
    fireEvent.change(screen.getByLabelText("排序依据"), { target: { value: "oldest" } });
    expect(ids()).toEqual(["test-b", "test-a", "test-c"]);
    expect(screen.getAllByRole("article")[0]).toHaveClass("mistake-card--navy");
  });

  it("combines dimension filters and clearing filters does not reset sorting", () => {
    seed(); render(<MistakesView />);
    fireEvent.change(screen.getByLabelText("排序依据"), { target: { value: "oldest" } });
    fireEvent.click(screen.getByRole("button", { name: "过滤" }));
    fireEvent.click(screen.getByRole("button", { name: /按科目分类/ }));
    fireEvent.click(screen.getByRole("radio", { name: "线性代数" }));
    fireEvent.click(screen.getByRole("button", { name: "返回分类" }));
    fireEvent.click(screen.getByRole("button", { name: /按错因分类/ }));
    fireEvent.click(screen.getByRole("radio", { name: "未填写" }));
    expect(ids()).toEqual(["test-b"]);
    fireEvent.keyDown(screen.getByRole("dialog", { name: "错题过滤" }), { key: "Escape" });
    fireEvent.click(screen.getByRole("button", { name: "清除过滤" }));
    expect(ids()).toEqual(["test-b", "test-a", "test-c"]);
    expect(screen.getByLabelText("排序依据")).toHaveValue("oldest");
  });

  it("searches notes, filters mastery, and distinguishes filtered empty state", () => {
    seed(); render(<MistakesView />);
    fireEvent.change(screen.getByLabelText("搜索错题"), { target: { value: "导数笔记" } });
    expect(ids()).toEqual(["test-a"]);
    fireEvent.change(screen.getByLabelText("筛选掌握状态"), { target: { value: "mastered" } });
    expect(screen.getByText("没有符合筛选条件的错题")).toBeInTheDocument();
    expect(screen.queryByText("错题集还是空的")).not.toBeInTheDocument();
    fireEvent.click(screen.getAllByRole("button", { name: "清除过滤" })[0]);
    expect(ids()).toHaveLength(3);
  });

  it("opens full detail without counting practice; edits persist after remount", () => {
    seed(); const view = render(<MistakesView />);
    fireEvent.click(screen.getAllByRole("button", { name: /^查看错题详情/ })[0]);
    const dialog = screen.getByRole("dialog", { name: "错题详情" });
    expect(within(dialog).getByRole("link", { name: "再次练习" })).toHaveAttribute("href", "/solve?mistake=test-a");
    expect(useMathLabStore.getState().mistakes[0].attempts).toBe(0);
    fireEvent.change(within(dialog).getByLabelText("复习笔记"), { target: { value: "【测试】新的理解" } });
    fireEvent.change(within(dialog).getByLabelText("错误原因"), { target: { value: "【测试】符号错误" } });
    fireEvent.change(within(dialog).getByLabelText("详情掌握状态"), { target: { value: "mastered" } });
    expect(ids()).toEqual([]); // Background is hidden from accessibility while the dialog protects focus.
    expect(readMistakes()[0]).toMatchObject({ note: "【测试】新的理解", errorReason: "【测试】符号错误", mastery: "mastered", attempts: 0 });
    view.unmount(); useMathLabStore.setState({ mistakes: readMistakes() }); render(<MistakesView />);
    expect(ids()).toEqual(["test-a", "test-c", "test-b"]);
    fireEvent.click(screen.getAllByRole("button", { name: /^查看错题详情/ })[0]);
    expect(screen.getByLabelText("复习笔记")).toHaveValue("【测试】新的理解");
  });

  it("keeps failed drafts and a later successful edit saves all pending fields", () => {
    seed(); render(<MistakesView />);
    fireEvent.click(screen.getAllByRole("button", { name: /^查看错题详情/ })[0]);
    const storage = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new DOMException("test quota", "QuotaExceededError"); });
    fireEvent.change(screen.getByLabelText("错误原因"), { target: { value: "【测试】未保存错因" } });
    expect(screen.getByText(/保存失败，编辑内容仍保留/)).toBeInTheDocument();
    expect(useMathLabStore.getState().mistakes[0].errorReason).toBe("计算错误");
    fireEvent.click(screen.getByRole("button", { name: "关闭详情" }));
    fireEvent.click(screen.getAllByRole("button", { name: /^查看错题详情/ })[0]);
    expect(screen.getByLabelText("错误原因")).toHaveValue("【测试】未保存错因");
    expect(screen.getByRole("link", { name: "再次练习" })).toHaveAttribute("aria-disabled", "true");
    storage.mockRestore();
    fireEvent.change(screen.getByLabelText("复习笔记"), { target: { value: "【测试】存储恢复" } });
    expect(readMistakes()[0]).toMatchObject({ errorReason: "【测试】未保存错因", note: "【测试】存储恢复" });
    expect(screen.queryByText(/保存失败，编辑内容仍保留/)).not.toBeInTheDocument();
  });

  it("requires deletion confirmation and cancel never removes a record", async () => {
    seed(); render(<MistakesView />);
    fireEvent.click(screen.getAllByRole("button", { name: /^查看错题详情/ })[0]);
    fireEvent.click(screen.getByRole("button", { name: "删除错题" }));
    fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "取消" }));
    expect(useMathLabStore.getState().mistakes).toHaveLength(3);
    fireEvent.click(screen.getByRole("button", { name: "删除错题" }));
    fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "确认删除" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect(useMathLabStore.getState().mistakes.map((item) => item.id)).toEqual(["test-b", "test-c"]);
    expect(readMistakes()).toHaveLength(2);
  });

  it("renders long matrix and multiline formulas without cutting math tokens", () => {
    const question = "【测试】计算 $\\begin{pmatrix}1&2\\\\3&4\\end{pmatrix}$，并验证 $$\\begin{aligned}x&=1\\\\y&=2\\end{aligned}$$";
    useMathLabStore.setState({ mistakes: [mistakeFixture("test-matrix", { question })] });
    const view = render(<MistakesView />);
    expect(view.container.querySelectorAll(".katex").length).toBeGreaterThanOrEqual(2);
    expect(view.container.querySelector(".katex-error")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /^查看错题详情/ }));
    expect(useMathLabStore.getState().mistakes[0].question).toBe(question);
    expect(screen.getByRole("dialog").querySelectorAll(".katex").length).toBeGreaterThan(2);
  });

  it("keeps handwritten evaluation matched to stable step identifiers", () => {
    useMathLabStore.setState({ mistakes: [mistakeFixture("test-handwriting", { handwriting: { ...emptyHandwritingSession(), ...work, conditions: ["【测试】实数范围"], evaluation: { ...evaluation, limitations: ["【测试】不能确认原笔迹"], understandingQuestion: "【测试】移项是否保持等价？" } } })] });
    render(<MistakesView />);
    fireEvent.click(screen.getByRole("button", { name: /^查看错题详情/ }));
    fireEvent.click(screen.getByText("已确认的手写步骤与 AI 评价"));
    expect(screen.getByText(/第1步 · 存在错误/)).toBeInTheDocument();
    expect(screen.getByText(/第2步 · 依赖前面的错误/)).toBeInTheDocument();
    expect(screen.getByText("右边减法需重算")).toBeInTheDocument();
    expect(screen.getByText("【测试】不能确认原笔迹")).toBeInTheDocument();
    expect(screen.getByText("【测试】实数范围")).toBeInTheDocument();
    expect(screen.getByText("【测试】移项是否保持等价？")).toBeInTheDocument();
  });

  it("shows only revealed hint levels even after a replacement changed array order", () => {
    const hints = ([2, 3, 1] as const).map((level) => ({ level, targetStepId: "s1", title: `测试提示${level}`, text: `【测试】第${level}级内容`, formulas: [] }));
    useMathLabStore.setState({ mistakes: [mistakeFixture("test-hints", { handwriting: { ...emptyHandwritingSession(), ...work, evaluation, hints, revealedHints: 1 } })] });
    render(<MistakesView />);
    fireEvent.click(screen.getByRole("button", { name: /^查看错题详情/ }));
    fireEvent.click(screen.getByText("已确认的手写步骤与 AI 评价"));
    expect(screen.getByText("【测试】第1级内容")).toBeInTheDocument();
    expect(screen.queryByText("【测试】第2级内容")).not.toBeInTheDocument();
    expect(screen.queryByText("【测试】第3级内容")).not.toBeInTheDocument();
  });

  it("exposes more actions and returns keyboard focus after closing details", async () => {
    seed(); render(<MistakesView />);
    const more = screen.getAllByRole("button", { name: "更多操作" })[0];
    fireEvent.pointerDown(more, { button: 0, ctrlKey: false });
    fireEvent.click(await screen.findByRole("menuitem", { name: "查看详情" }));
    expect(screen.getByRole("dialog", { name: "错题详情" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "关闭详情" }));
    await waitFor(() => expect(more).toHaveFocus());
    fireEvent.pointerDown(more, { button: 0, ctrlKey: false });
    fireEvent.click(await screen.findByRole("menuitemradio", { name: "已掌握" }));
    expect(useMathLabStore.getState().mistakes[0].mastery).toBe("mastered");
  });
});

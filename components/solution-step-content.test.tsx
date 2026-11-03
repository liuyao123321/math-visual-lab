import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { SolutionStepContent } from "./solution-step-content";
import { solutionStepSchema } from "@/lib/math-schema";
import { exampleExplanation } from "@/lib/example-explanations";
import { examples } from "@/lib/examples";
import { explanationStyle } from "@/lib/explanation-style";

afterEach(cleanup);
const step = solutionStepSchema.parse({ id: "test", title: "约分", summary: "在非零条件下约去相同因子。", goal: "保持等价变形", explanation: "先确认分母非零，再对分子分母除以相同的非零因子。", formulas: ["x/x=1"], basis: "分式基本性质", conditions: ["x 不等于零"], verification: "取 x=2 代入核对。", commonMistake: "不能约去零因子。" });
describe("distinct explanation styles", () => {
  it("keeps necessary conditions and formulas visible in concise mode while folding optional detail", () => {
    const view = render(<SolutionStepContent step={step} mode="concise" />);
    expect(screen.getByText(step.summary!)).toBeInTheDocument();
    expect(screen.getByText("x 不等于零")).toBeInTheDocument();
    expect(view.container.querySelector("details")).not.toHaveAttribute("open");
    expect(view.container.querySelector("details")).toHaveTextContent(step.explanation);
    expect(view.container.querySelector(".katex")).toBeInTheDocument();
    expect(screen.queryByText("本步目标：")).not.toBeInTheDocument();
  });
  it("expands goals, reasoning, derivation and checks in detailed mode", () => {
    const view = render(<SolutionStepContent step={step} mode="detailed" />);
    expect(screen.getByText("为什么这样做")).toBeInTheDocument();
    expect(screen.getByText("推导过程")).toBeInTheDocument();
    expect(screen.getByText("如何自检：")).toBeInTheDocument();
    expect(screen.getByText(step.explanation)).toBeInTheDocument();
    expect(view.container.querySelector("details")).toBeNull();
    expect(screen.queryByText(step.summary!)).not.toBeInTheDocument();
  });
  it("does not truncate legacy explanations or manufacture missing detail", () => {
    const legacy = { id: "legacy", title: "旧步骤", explanation: "【测试】必须完整保留的旧说明。".repeat(20), formulas: [], basis: "", visualLayerIds: [] };
    const view = render(<SolutionStepContent step={legacy} mode="concise" />);
    expect(view.container.textContent).toContain(legacy.explanation);
    expect(screen.queryByText("如何自检：")).not.toBeInTheDocument();
  });
  it.each(examples)("gives offline $id real teaching notes without changing mathematics", (example) => {
    const before = structuredClone(example);
    const detailed = exampleExplanation(example, "detailed");
    expect(detailed.steps.every((item) => item.goal && item.verification && item.summary !== item.explanation)).toBe(true);
    expect(detailed.finalAnswerLatex).toBe(example.finalAnswerLatex);
    expect(detailed.steps.map((item) => item.formulas)).toEqual(example.steps.map((item) => item.formulas));
    expect(example).toEqual(before);
    const concise = exampleExplanation(detailed, "concise");
    expect(concise.explanationMode).toBe("concise");
    expect(concise.steps.map((item) => item.id)).toEqual(example.steps.map((item) => item.id));
  });
  it("uses substantively different generation instructions without encouraging skipped conditions", () => {
    expect(explanationStyle("concise")).toContain("1—3步");
    expect(explanationStyle("concise")).toContain("定义域");
    expect(explanationStyle("detailed")).toContain("verification");
    expect(explanationStyle("detailed")).toContain("不输出内部思考");
  });
});

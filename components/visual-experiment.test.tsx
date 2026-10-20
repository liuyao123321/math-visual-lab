import { useState } from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { VisualExperiment } from "@/components/visual-experiment";
import { examples } from "@/lib/examples";
import type { VisualizationSpec } from "@/lib/math-schema";
import { visualizationForStep } from "@/lib/step-visualization";

vi.mock("@/components/math-plot", () => ({ MathPlot: ({ spec }: { spec: VisualizationSpec }) => <div data-testid="layers">{spec.layers.map((layer) => layer.label).join("|")}</div> }));
afterEach(() => { cleanup(); vi.useRealTimers(); });
function Experiment() {
  const [parameters, setParameters] = useState<Record<string, number>>({ t: 0 });
  return <VisualExperiment solution={examples[1]} parameters={parameters} onChange={setParameters} activeLayerIds={[]} />;
}
describe("visual experiment controls", () => {
  it("stops autoplay when the shared canvas switches steps and does not resume on return", () => {
    vi.useFakeTimers();
    const tangent = visualizationForStep(examples[1].visualization, examples[1].steps[3])!;
    const first = visualizationForStep(examples[1].visualization, examples[1].steps[0])!;
    const onChange = vi.fn();
    const scene = (spec: VisualizationSpec) => <VisualExperiment solution={examples[1]} specOverride={spec} inline parameters={{ t: 0 }} onChange={onChange} activeLayerIds={[]} />;
    const page = render(scene(tangent));
    fireEvent.click(screen.getByRole("button", { name: "播放动画" }));
    page.rerender(scene(first));
    act(() => vi.advanceTimersByTime(300));
    page.rerender(scene(tangent));
    expect(screen.getByRole("button", { name: "播放动画" })).toBeInTheDocument();
    expect(screen.getByLabelText("动画参数")).toHaveValue("t");
    act(() => vi.advanceTimersByTime(300));
    expect(onChange).not.toHaveBeenCalled();
  });
  it("uses a finer slider and keeps direct parameter input synchronized", () => {
    render(<Experiment />);
    expect(screen.getByLabelText("切点 t")).toHaveAttribute("step", String(examples[1].visualization!.parameters[0].step / 10));
    fireEvent.change(screen.getByLabelText("切点 t数值"), { target: { value: "1.5" } });
    expect(screen.getByText("当前切点", { selector: "p" })).toBeInTheDocument();
    expect(screen.getByLabelText("切点 t")).toHaveValue("1.5");
  });
  it("adds and removes a custom helper line with validation", () => {
    render(<Experiment />);
    fireEvent.change(screen.getByLabelText("辅助线坐标"), { target: { value: "2.5" } });
    fireEvent.click(screen.getByText("添加"));
    expect(screen.getByTestId("layers")).toHaveTextContent("x=2.5");
    fireEvent.click(screen.getByText("移除辅助线"));
    expect(screen.getByTestId("layers")).not.toHaveTextContent("x=2.5");
    fireEvent.change(screen.getByLabelText("辅助线坐标"), { target: { value: "10001" } });
    fireEvent.click(screen.getByText("添加"));
    expect(screen.getByRole("alert")).toHaveTextContent("有效数值");
  });
  it("plays, pauses and resets an explicit parameter animation", () => {
    vi.useFakeTimers(); render(<Experiment />);
    fireEvent.click(screen.getByText("播放动画"));
    act(() => vi.advanceTimersByTime(80));
    const changed = Number((screen.getByLabelText("切点 t数值") as HTMLInputElement).value);
    expect(changed).toBeGreaterThan(0);
    fireEvent.click(screen.getByText("暂停动画"));
    act(() => vi.advanceTimersByTime(240));
    expect(Number((screen.getByLabelText("切点 t数值") as HTMLInputElement).value)).toBe(changed);
    fireEvent.click(screen.getByText("重置"));
    expect(screen.getByLabelText("切点 t数值")).toHaveValue(0);
  });
  it.each([0, 2])("keeps fixed example %i static while retaining its plot and helpers", (index) => {
    render(<VisualExperiment solution={examples[index]} parameters={{ k: 5, b: 1 }} onChange={vi.fn()} activeLayerIds={[]} />);
    expect(screen.queryByRole("slider")).not.toBeInTheDocument();
    expect(screen.queryByText("播放动画")).not.toBeInTheDocument();
    expect(screen.getByTestId("layers")).toBeInTheDocument();
    expect(screen.getByLabelText("辅助线坐标")).toBeInTheDocument();
  });
});

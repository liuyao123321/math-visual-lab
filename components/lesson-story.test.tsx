import { useLayoutEffect, useState } from "react";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LessonStory } from "./lesson-story";
import { examples } from "@/lib/examples";
import type { VisualizationSpec } from "@/lib/math-schema";

type Trigger = { pin?: HTMLElement; onEnter?: () => void; onEnterBack?: () => void; onUpdate?: (self: { isActive: boolean }) => void };
const engine = vi.hoisted(() => ({ triggers: [] as Trigger[], kill: vi.fn(), refresh: vi.fn(), wide: true }));
// eslint-disable-next-line react-hooks/exhaustive-deps -- Test adapter forwards the GSAP hook's dependency contract.
vi.mock("@gsap/react", () => ({ useGSAP: (callback: () => void | (() => void), options: { dependencies: unknown[] }) => useLayoutEffect(callback, options.dependencies) }));
vi.mock("gsap", () => ({ gsap: {
  registerPlugin: vi.fn(),
  matchMedia: () => { let clean: void | (() => void); return { add: (_: string, callback: () => void | (() => void)) => { clean = callback(); }, revert: () => { clean?.(); } }; },
  timeline: () => { const timeline = { fromTo: () => timeline, kill: vi.fn() }; return timeline; },
} }));
vi.mock("gsap/ScrollTrigger", () => ({ ScrollTrigger: {
  create: (config: Trigger) => { engine.triggers.push(config); return { kill: engine.kill }; },
  refresh: engine.refresh, addEventListener: vi.fn(), removeEventListener: vi.fn(),
} }));
vi.mock("@/components/math-plot", () => ({ MathPlot: ({ spec }: { spec: VisualizationSpec }) => <div data-testid="story-plot" data-layers={spec.layers.map((layer) => layer.id).join(",")} /> }));

function Story({ count = 4, visual = true }: { count?: number; visual?: boolean }) {
  const [active, setActive] = useState(0);
  return <LessonStory solution={examples[1]} steps={examples[1].steps.slice(0, count)} spec={visual ? examples[1].visualization : undefined} activeIndex={active} onActivate={setActive} parameters={{ t: 0 }} onParametersChange={() => undefined} renderStep={(step, index, view) => <article key={step.id} data-story-step={index} aria-label={step.title} data-active={String(view.active)}><button onClick={view.activate}>{step.title}</button>{view.plot}</article>} />;
}
beforeEach(() => {
  engine.triggers = []; engine.kill.mockClear(); engine.wide = true;
  vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: engine.wide, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
  vi.stubGlobal("requestAnimationFrame", vi.fn(() => 1)); vi.stubGlobal("cancelAnimationFrame", vi.fn());
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", { configurable: true, value: vi.fn() });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("shared lesson canvas (mock animation engine)", () => {
  it("has exactly one desktop plot, changing only to the chosen step's layers", () => {
    render(<Story />);
    expect(screen.getAllByTestId("story-plot")).toHaveLength(1);
    expect(screen.getByTestId("story-plot")).toHaveAttribute("data-layers", "function");
    expect(screen.queryByRole("slider")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "观察切线" }));
    expect(screen.getAllByTestId("story-plot")).toHaveLength(1);
    expect(screen.getByRole("region", { name: "当前步骤可视化" })).toHaveAttribute("data-active-step", "d4");
    expect(screen.getByTestId("story-plot")).toHaveAttribute("data-layers", "function,tangent,moving-point");
    expect(screen.getByRole("slider", { name: "切点 t" })).toBeInTheDocument();
  });
  it("only follows actual reading input, not refresh callbacks, and respects an explicit click", () => {
    render(<Story />);
    const tracker = engine.triggers.filter((config) => !config.pin)[1];
    act(() => tracker.onEnter?.());
    expect(screen.getByRole("region", { name: "当前步骤可视化" })).toHaveAttribute("data-active-step", "d1");
    fireEvent.wheel(window);
    act(() => tracker.onEnter?.());
    expect(screen.getByRole("region", { name: "当前步骤可视化" })).toHaveAttribute("data-active-step", "d2");
    fireEvent.click(screen.getByRole("button", { name: "观察切线" }));
    act(() => tracker.onEnter?.());
    expect(screen.getByRole("region", { name: "当前步骤可视化" })).toHaveAttribute("data-active-step", "d4");
  });
  it("does not unlock or leak future graphs, and cleans up its own pins", () => {
    const page = render(<Story count={1} />);
    expect(screen.getByRole("button", { name: "回看下一已展开步骤图像" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "观察切线" })).not.toBeInTheDocument();
    expect(screen.queryByText(/极值点/)).not.toBeInTheDocument();
    page.unmount(); expect(engine.kill).toHaveBeenCalledTimes(2);
  });
  it("supports keyboard-accessible previous and next already-revealed scenes", () => {
    render(<Story />);
    fireEvent.click(screen.getByRole("button", { name: "回看下一已展开步骤图像" }));
    expect(screen.getByRole("region", { name: "当前步骤可视化" })).toHaveAttribute("data-active-step", "d2");
    fireEvent.click(screen.getByRole("button", { name: "回看上一步图像" }));
    expect(screen.getByRole("region", { name: "当前步骤可视化" })).toHaveAttribute("data-active-step", "d1");
  });
  it("uses inline, static figures at narrow width or with reduced motion", () => {
    engine.wide = false; render(<Story />);
    expect(screen.queryByLabelText("步骤联动画布")).not.toBeInTheDocument();
    expect(screen.getAllByTestId("story-plot")).toHaveLength(4);
    expect(within(screen.getByRole("article", { name: "求导" })).getByTestId("story-plot")).toHaveAttribute("data-layers", "function");
    expect(engine.triggers).toHaveLength(0);
  });
  it("never creates an empty right column for a text-only lesson", () => {
    render(<Story visual={false} />);
    expect(screen.queryByLabelText("步骤联动画布")).not.toBeInTheDocument();
    expect(screen.queryByTestId("story-plot")).not.toBeInTheDocument();
  });
});

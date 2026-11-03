import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TutorModePreview } from "./tutor-mode-preview";

const engine = vi.hoisted(() => ({ timelines: [] as Array<{ options: { paused: boolean }; fromTo: ReturnType<typeof vi.fn>; kill: ReturnType<typeof vi.fn>; paused: ReturnType<typeof vi.fn> }> }));

// Execute the real lifecycle against a fake motion engine, not a browser or AI.
vi.mock("./use-browser-gsap", async () => {
  const { useEffect } = await import("react");
  const { gsap } = await import("gsap");
  return { useBrowserGSAP: (effect: (animation: typeof gsap) => void | (() => void), options: { dependencies: unknown[] }) => {
    // eslint-disable-next-line react-hooks/exhaustive-deps
    useEffect(() => effect(gsap), options.dependencies);
  } };
});
vi.mock("gsap", () => ({ gsap: {
  registerPlugin: vi.fn(),
  matchMedia: () => {
    let dispose: (() => void) | void;
    return { add: (_query: string, setup: () => () => void) => { dispose = setup(); }, revert: () => dispose?.() };
  },
  timeline: (options: { paused: boolean }) => {
    const timeline = { options, fromTo: vi.fn().mockReturnThis(), paused: vi.fn(), kill: vi.fn() };
    engine.timelines.push(timeline); return timeline;
  },
} }));

let motion: { matches: boolean; addEventListener: ReturnType<typeof vi.fn>; removeEventListener: ReturnType<typeof vi.fn> };
beforeEach(() => {
  engine.timelines.length = 0;
  motion = { matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() };
  vi.stubGlobal("matchMedia", vi.fn(() => motion));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("navigation preview (fixed demonstration, mocked motion)", () => {
  it.each(["concise", "detailed", "visual"] as const)("renders valid, non-AI mathematics for %s", (mode) => {
    const { container } = render(<TutorModePreview mode={mode} />);
    expect(container.querySelector("[data-preview-mode]")).toHaveAttribute("data-preview-mode", mode);
    expect(screen.getByText("固定示例，不调用 AI")).toBeInTheDocument();
    expect(screen.getByText("求零点与顶点")).toBeInTheDocument();
    expect(container.querySelector("[data-formula-error]")).not.toBeInTheDocument();
    expect(container.querySelectorAll(".katex").length).toBeGreaterThan(0);
  });

  it("pauses without rebuilding the animation and preserves pause when switching previews", () => {
    const page = render(<TutorModePreview mode="concise" />);
    expect(engine.timelines).toHaveLength(1);
    const original = engine.timelines[0];
    fireEvent.click(screen.getByRole("button", { name: "暂停答疑方式演示" }));
    expect(original.paused).toHaveBeenLastCalledWith(true);
    expect(engine.timelines).toHaveLength(1);
    page.rerender(<TutorModePreview mode="visual" />);
    expect(original.kill).toHaveBeenCalledTimes(1);
    expect(engine.timelines[1].options.paused).toBe(true);
    expect(screen.getByRole("button", { name: "播放答疑方式演示" })).toBeInTheDocument();
    page.unmount();
    expect(engine.timelines[1].kill).toHaveBeenCalledTimes(1);
  });

  it("replaces the animation with its complete static content when reduced motion is enabled", () => {
    const { container } = render(<TutorModePreview mode="detailed" />);
    const timeline = engine.timelines[0];
    const listeners = motion.addEventListener.mock.calls.map((call) => call[1] as () => void);
    act(() => { motion.matches = true; listeners.forEach((notify) => notify()); });
    expect(timeline.kill).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("button", { name: "暂停答疑方式演示" })).not.toBeInTheDocument();
    expect(screen.getByText("按系统偏好显示静态演示")).toBeInTheDocument();
    expect(container.querySelectorAll("[data-preview-line]")).toHaveLength(3);
    expect(container.querySelector("[data-preview-answer]")).not.toHaveAttribute("style");
  });

  it("starts with static results and no timeline for a reduced-motion user", () => {
    motion.matches = true;
    render(<TutorModePreview mode="visual" />);
    expect(engine.timelines).toHaveLength(0);
    expect(screen.getByRole("img")).toHaveAccessibleName(/零点为1与3/);
    expect(screen.getByText("与 x 轴交于 1、3，最低点是 (2, −1)。")).toBeInTheDocument();
  });

  it("draws the exact quadratic and independently verifies its roots and vertex", () => {
    const { container } = render(<TutorModePreview mode="visual" />);
    const numbers = container.querySelector("[data-preview-curve]")!.getAttribute("d")!.match(/\d+/g)!.map(Number);
    const [x0, y0, x1, y1, x2, y2] = numbers;
    for (const t of [0, 0.25, 0.5, 0.75, 1]) {
      const x = ((1 - t) ** 2 * x0 + 2 * (1 - t) * t * x1 + t ** 2 * x2 - 28) / 66;
      const y = (125 - ((1 - t) ** 2 * y0 + 2 * (1 - t) * t * y1 + t ** 2 * y2)) / 32;
      expect(y).toBeCloseTo(x * x - 4 * x + 3, 10);
    }
    const dots = [...container.querySelectorAll("[data-preview-point] circle")].map((circle) => [
      (Number(circle.getAttribute("cx")) - 28) / 66,
      (125 - Number(circle.getAttribute("cy"))) / 32,
    ]);
    expect(dots).toEqual([[1, 0], [3, 0], [2, -1]]);
  });
});

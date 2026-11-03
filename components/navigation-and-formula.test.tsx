import { cleanup, fireEvent, render, screen, within, waitFor } from "@testing-library/react";
import { afterEach } from "vitest";
import { describe, expect, it, vi } from "vitest";
import { AppShell } from "@/components/app-shell";
import { MathFormula, MathText } from "@/components/math-formula";
import { TUTOR_MODE_EVENT } from "@/lib/tutor-navigation";

vi.mock("next/navigation", () => ({ usePathname: () => "/solve" }));
vi.mock("next-themes", () => ({ useTheme: () => ({ resolvedTheme: "light", setTheme: vi.fn() }) }));
vi.mock("./use-browser-gsap", () => ({ useBrowserGSAP: vi.fn() }));
vi.mock("gsap", () => ({ gsap: { registerPlugin: vi.fn() } }));
afterEach(cleanup);

describe("navigation and formula accessibility", () => {
  it("renders every main navigation item as a usable link", () => {
    render(<AppShell><main>content</main></AppShell>);

    expect(screen.getAllByRole("link", { name: "首页" })[0]).toHaveAttribute("href", "/");
    expect(screen.getByRole("button", { name: "智能答疑" })).toHaveAttribute("aria-expanded", "false");
    expect(screen.getAllByRole("link", { name: "课程知识检索" }).every((link) => link.getAttribute("href") === "/knowledge")).toBe(true);
    expect(screen.getAllByRole("link", { name: "错题集" })[0]).toHaveAttribute("href", "/mistakes");
    expect(screen.getAllByRole("link", { name: "学习报告" })[0]).toHaveAttribute("href", "/report");
    expect(screen.getAllByRole("link", { name: "专项模拟" }).every((link) => link.getAttribute("href") === "/practice")).toBe(true);
    expect(screen.queryByRole("link", { name: "复习中心" })).not.toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "设置" })[0]).toHaveAttribute("href", "/settings");
    fireEvent.click(screen.getByRole("button", { name: "智能答疑" }));
    for (const [label, mode] of [["简洁答疑", "concise"], ["详细答疑", "detailed"], ["可视化答疑", "visual"]]) expect(screen.getByRole("link", { name: label })).toHaveAttribute("href", `/solve?mode=${mode}`);
  });

  it("renders a valid final answer with KaTeX", () => {
    const { container } = render(<MathFormula value={"x_1=1,\\quad x_2=3"} />);
    expect(container.querySelector(".katex")).toBeInTheDocument();
    expect(container.querySelector("[data-formula-error]")).not.toBeInTheDocument();
  });

  it("includes user feedback and keeps settings separate", () => {
    render(<AppShell><main>content</main></AppShell>);
    const navigation = screen.getByRole("navigation", { name: "主导航" });
    expect(within(navigation).getAllByRole("link").map((link) => link.textContent)).toEqual(["课程知识检索", "错题集", "学习报告", "专项模拟", "问题反馈"]);
    expect(within(navigation).getByRole("button", { name: "智能答疑" })).toBeInTheDocument();
    expect(within(navigation).queryByRole("link", { name: "设置" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "设置" })).toHaveAttribute("href", "/settings");
    expect(screen.queryByRole("button", { name: "切换明暗主题" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "智能答疑" })).toHaveAttribute("aria-current", "page");
  });

  it("closes on outside click and Escape and returns keyboard focus to the trigger", async () => {
    render(<AppShell><main>content</main></AppShell>);
    const trigger = screen.getByRole("button", { name: "智能答疑" });
    fireEvent.click(trigger);
    fireEvent.pointerDown(screen.getByRole("main"));
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    await waitFor(() => expect(screen.getByRole("link", { name: "简洁答疑" })).toHaveFocus());
    fireEvent.keyDown(screen.getByRole("link", { name: "简洁答疑" }), { key: "ArrowDown" });
    await waitFor(() => expect(screen.getByRole("link", { name: "详细答疑" })).toHaveFocus());
    fireEvent.keyDown(screen.getByRole("link", { name: "详细答疑" }), { key: "Escape" });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(trigger).toHaveFocus();
    expect(screen.queryByRole("link", { name: "详细答疑" })).not.toBeInTheDocument();
  });

  it("switches modes in a mounted workspace without a document reload", () => {
    const received = vi.fn((event: Event) => { event.preventDefault(); });
    window.addEventListener(TUTOR_MODE_EVENT, received);
    try {
      render(<AppShell><main>content</main></AppShell>);
      const trigger = screen.getByRole("button", { name: "智能答疑" });
      fireEvent.click(trigger);
      expect(fireEvent.click(screen.getByRole("link", { name: "详细答疑" }))).toBe(false);
      expect(received).toHaveBeenCalledTimes(1);
      expect((received.mock.calls[0][0] as CustomEvent).detail).toEqual({ mode: "detailed" });
      expect(trigger).toHaveAttribute("aria-expanded", "false");
    } finally { window.removeEventListener(TUTOR_MODE_EVENT, received); }
  });

  it("previews the hovered mode without navigating or requesting AI", () => {
    const fetcher = vi.spyOn(window, "fetch");
    try {
      render(<AppShell><main>content</main></AppShell>);
      fireEvent.click(screen.getByRole("button", { name: "智能答疑" }));
      expect(screen.getByRole("region", { name: "简洁答疑演示" })).toBeInTheDocument();
      fireEvent.pointerEnter(screen.getByRole("link", { name: "详细答疑" }));
      expect(screen.getByRole("region", { name: "详细答疑演示" })).toBeInTheDocument();
      expect(screen.getByRole("link", { name: "详细答疑" })).toHaveAttribute("data-preview-active", "true");
      fireEvent.pointerEnter(screen.getByRole("link", { name: "可视化答疑" }));
      expect(screen.getByRole("region", { name: "可视化答疑演示" })).toBeInTheDocument();
      expect(screen.getByRole("img")).toHaveAccessibleName(/零点为1与3/);
      expect(fetcher).not.toHaveBeenCalled();
      fireEvent.keyDown(screen.getByRole("button", { name: "智能答疑" }), { key: "Escape" });
      expect(screen.queryByRole("region", { name: "可视化答疑演示" })).not.toBeInTheDocument();
    } finally { fetcher.mockRestore(); }
  });

  it("previews keyboard focus and keeps only the latest scene during rapid changes", () => {
    render(<AppShell><main>content</main></AppShell>);
    fireEvent.click(screen.getByRole("button", { name: "智能答疑" }));
    fireEvent.focus(screen.getByRole("link", { name: "可视化答疑" }));
    fireEvent.focus(screen.getByRole("link", { name: "详细答疑" }));
    fireEvent.focus(screen.getByRole("link", { name: "简洁答疑" }));
    expect(screen.getByRole("region", { name: "简洁答疑演示" })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "详细答疑演示" })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "可视化答疑演示" })).not.toBeInTheDocument();
  });

  it("keeps invalid LaTeX readable in light mode", () => {
    const { container } = render(<MathFormula value={"\\not-a-command{"} />);
    const fallback = container.querySelector("[data-formula-error]");
    expect(fallback).toBeInTheDocument();
    expect(fallback).toHaveClass("text-amber-900");
  });

  it("renders math embedded in Chinese explanations without injecting prose HTML", () => {
    const { container } = render(<p><MathText value={String.raw`使用 \(\frac{1}{2}\)，再看 \[x^2=1\]。<img src=x onerror=alert(1)>`} /></p>);
    expect(container.querySelectorAll(".katex")).toHaveLength(2);
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("p div")).toBeNull();
    expect(container.textContent).toContain("<img src=x onerror=alert(1)>");
  });

  it("renders multiple separately wrapped formulas and multiline derivations", () => {
    const { container } = render(<MathFormula value={String.raw`$$x=1$$，\[\begin{align}y&=2\\z&=3\end{align}\]`} />);
    expect(container.querySelectorAll(".katex")).toHaveLength(2);
    expect(container.querySelector("[data-formula-error]")).toBeNull();
    expect(container.querySelector(".mtable")).toBeInTheDocument();
  });

  it("renders an entire matrix equation including its inverse exponent and coefficient", () => {
    const { container } = render(<MathFormula value={String.raw`\det A=-2,\quad A^{-1}=\frac{1}{-2}\begin{pmatrix}4&-2\\-3&1\end{pmatrix}`} />);
    expect(container.querySelectorAll(".katex")).toHaveLength(1);
    expect(container.querySelector(".mfrac")).toBeInTheDocument();
    expect(container.querySelector(".mtable")).toBeInTheDocument();
    expect(container.querySelector("[data-formula-error]")).toBeNull();
  });
});

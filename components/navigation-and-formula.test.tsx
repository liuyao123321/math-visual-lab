import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach } from "vitest";
import { describe, expect, it, vi } from "vitest";
import { AppShell } from "@/components/app-shell";
import { MathFormula, MathText } from "@/components/math-formula";

vi.mock("next/navigation", () => ({ usePathname: () => "/solve" }));
vi.mock("next-themes", () => ({ useTheme: () => ({ resolvedTheme: "light", setTheme: vi.fn() }) }));
afterEach(cleanup);

describe("navigation and formula accessibility", () => {
  it("renders every main navigation item as a usable link", () => {
    render(<AppShell><main>content</main></AppShell>);

    expect(screen.getAllByRole("link", { name: "首页" })[0]).toHaveAttribute("href", "/");
    expect(screen.getAllByRole("link", { name: "智能答疑" })[0]).toHaveAttribute("href", "/solve");
    expect(screen.getAllByRole("link", { name: "课程知识检索" }).every((link) => link.getAttribute("href") === "/knowledge")).toBe(true);
    expect(screen.getAllByRole("link", { name: "错题集" })[0]).toHaveAttribute("href", "/mistakes");
    expect(screen.getAllByRole("link", { name: "学习报告" })[0]).toHaveAttribute("href", "/report");
    expect(screen.getAllByRole("link", { name: "专项模拟" }).every((link) => link.getAttribute("href") === "/practice")).toBe(true);
    expect(screen.queryByRole("link", { name: "复习中心" })).not.toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "设置" })[0]).toHaveAttribute("href", "/settings");
    expect(screen.getAllByRole("link", { name: "智能答疑" })[0].tagName).toBe("A");
  });

  it("renders a valid final answer with KaTeX", () => {
    const { container } = render(<MathFormula value={"x_1=1,\\quad x_2=3"} />);
    expect(container.querySelector(".katex")).toBeInTheDocument();
    expect(container.querySelector("[data-formula-error]")).not.toBeInTheDocument();
  });

  it("centers only the five tools and keeps settings separate without a theme shortcut", () => {
    render(<AppShell><main>content</main></AppShell>);
    const navigation = screen.getByRole("navigation", { name: "主导航" });
    expect(within(navigation).getAllByRole("link").map((link) => link.textContent)).toEqual(["智能答疑", "课程知识检索", "错题集", "学习报告", "专项模拟"]);
    expect(within(navigation).queryByRole("link", { name: "设置" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "设置" })).toHaveAttribute("href", "/settings");
    expect(screen.queryByRole("button", { name: "切换明暗主题" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "智能答疑" })).toHaveAttribute("aria-current", "page");
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

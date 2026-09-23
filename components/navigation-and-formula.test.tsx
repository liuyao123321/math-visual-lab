import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AppShell } from "@/components/app-shell";
import { MathFormula } from "@/components/math-formula";

vi.mock("next/navigation", () => ({ usePathname: () => "/solve" }));
vi.mock("next-themes", () => ({ useTheme: () => ({ resolvedTheme: "light", setTheme: vi.fn() }) }));

describe("navigation and formula accessibility", () => {
  it("renders every main navigation item as a usable link", () => {
    render(<AppShell><main>content</main></AppShell>);

    expect(screen.getAllByRole("link", { name: "首页" })[0]).toHaveAttribute("href", "/");
    expect(screen.getAllByRole("link", { name: "智能答疑" })[0]).toHaveAttribute("href", "/solve");
    expect(screen.getAllByRole("link", { name: "错题集" })[0]).toHaveAttribute("href", "/mistakes");
    expect(screen.getAllByRole("link", { name: "学习报告" })[0]).toHaveAttribute("href", "/report");
    expect(screen.getAllByRole("link", { name: "设置" })[0]).toHaveAttribute("href", "/settings");
    expect(screen.getAllByRole("link", { name: "智能答疑" })[0].tagName).toBe("A");
  });

  it("renders a valid final answer with KaTeX", () => {
    const { container } = render(<MathFormula value={"x_1=1,\\quad x_2=3"} />);
    expect(container.querySelector(".katex")).toBeInTheDocument();
    expect(container.querySelector("[data-formula-error]")).not.toBeInTheDocument();
  });

  it("keeps invalid LaTeX readable in light mode", () => {
    const { container } = render(<MathFormula value={"\\not-a-command{"} />);
    const fallback = container.querySelector("[data-formula-error]");
    expect(fallback).toBeInTheDocument();
    expect(fallback).toHaveClass("text-amber-900");
  });
});

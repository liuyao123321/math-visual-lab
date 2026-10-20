import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { MathInputPreview } from "@/components/math-input-preview";

afterEach(cleanup);
describe("math input preview", () => {
  it("renders the screenshot's bare harmonic-series formula without changing its text", () => {
    const value = String.raw`证明调和级数 \sum_{n=1}^{\infty} \frac{1}{n} 发散。`;
    render(<MathInputPreview value={value} />);
    const preview = screen.getByRole("region", { name: "题目公式预览" });
    expect(preview.querySelectorAll(".katex")).toHaveLength(1);
    expect(preview.querySelector(".mfrac")).toBeInTheDocument();
    expect(preview.querySelector("math")).not.toBeNull();
    expect(preview.querySelector("[data-formula-error]")).toBeNull();
    expect(preview.textContent).toContain("证明调和级数");
    expect(preview.textContent).toContain("发散。");
  });
  it("updates wrapped fractions and matrices but does not add a card for plain text", () => {
    const page = render(<MathInputPreview value="请说明极限的概念" />);
    expect(screen.queryByRole("region")).not.toBeInTheDocument();
    page.rerender(<MathInputPreview value={String.raw`矩阵 \begin{pmatrix}1&2\\3&4\end{pmatrix}，结果 $\frac{1}{2}$。`} />);
    expect(page.container.querySelectorAll(".katex")).toHaveLength(2);
    expect(page.container.querySelector(".mtable")).toBeInTheDocument();
  });
  it("preserves incomplete or unsupported syntax with a visible warning", () => {
    const page = render(<MathInputPreview value={String.raw`尚未输入完：\frac{1`} />);
    expect(screen.getByRole("region").textContent).toContain(String.raw`\frac{1`);
    expect(screen.getByText(/部分公式尚无法排版/)).toBeInTheDocument();
    page.rerender(<MathInputPreview value={String.raw`公式 \(\unknowncommand{1}\)`} />);
    expect(page.container.querySelector("[data-formula-error]")).toBeInTheDocument();
    expect(screen.getByText(/部分公式尚无法排版/)).toBeInTheDocument();
  });
  it("never turns prose HTML into executable content", () => {
    const page = render(<MathInputPreview value={String.raw`<img src=x onerror=alert(1)>：$x^2$`} />);
    expect(page.container.querySelector("img")).toBeNull();
    expect(page.container.textContent).toContain("<img src=x onerror=alert(1)>");
  });
});

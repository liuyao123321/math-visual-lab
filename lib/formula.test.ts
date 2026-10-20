import { describe, expect, it } from "vitest";
import { mathFormattingError, normalizeLatex, renderFormula, splitMathText } from "@/lib/formula";

describe("formula normalization and safe text parsing", () => {
  it.each([
    [String.raw`$$\frac{1}{2}$$`, String.raw`\frac{1}{2}`],
    [String.raw`\(x^2\)`, "x^2"],
    ["```latex\n\\sqrt{x}\n```", String.raw`\sqrt{x}`],
    [String.raw`\\frac{1}{2}`, String.raw`\frac{1}{2}`],
    [String.raw`\\(x^2\\)`, "x^2"],
    [String.raw`\begin{align}x&=1\\y&=2\end{align}`, String.raw`\begin{aligned}x&=1\\y&=2\end{aligned}`],
    [String.raw`\begin{equation}x=1\end{equation}`, "x=1"],
    ["x₁+x²", "x_{1}+x^{2}"],
    [String.raw`\text{面积²}`, String.raw`\text{面积²}`],
    [String.raw`\begin{pmatrix}1&2\\[2pt]3&4\end{pmatrix}`, String.raw`\begin{pmatrix}1&2\\[2pt]3&4\end{pmatrix}`],
  ])("normalizes %s without changing the mathematical content", (input, expected) => {
    expect(normalizeLatex(input)).toBe(expected);
    expect(() => renderFormula(input)).not.toThrow();
  });

  it("parses mixed inline, display and matrix math in order", () => {
    const input = String.raw`由 \(x^2=1\) 得到 $x=\pm1$。再看：\[\frac{1}{2}\] 矩阵 \begin{pmatrix}1&2\\3&4\end{pmatrix}`;
    const math = splitMathText(input).filter((part) => part.kind === "math");
    expect(math).toHaveLength(4);
    expect(math.map((part) => part.display)).toEqual([false, false, true, true]);
    expect(mathFormattingError(input)).toBeNull();
  });

  it("recognizes legacy bare commands but leaves prose, prices and incomplete markers intact", () => {
    expect(splitMathText(String.raw`结果为 \frac{1}{2}，使用公式。`).filter((part) => part.kind === "math")[0].value).toBe(String.raw`\frac{1}{2}`);
    for (const input of ["价格 $5，预算 $10。", String.raw`金额 \$5`, String.raw`缺少末尾：\(x+1`, "不要把普通文字当成公式"]) {
      expect(splitMathText(input).map((part) => part.value).join("")).toBe(input);
      expect(splitMathText(input).some((part) => part.kind === "math")).toBe(false);
    }
  });

  it("detects invalid inline syntax and JSON escape corruption", () => {
    expect(mathFormattingError(String.raw`错误 \(\unknowncommand{1}\)`)).not.toBeNull();
    expect(mathFormattingError("\frac{1}{2}", true)).not.toBeNull();
    expect(mathFormattingError("\text{答案}", true)).not.toBeNull();
    expect(mathFormattingError(String.raw`\unknowncommand+\begin{pmatrix}1&2\\3&4\end{pmatrix}`, true)).not.toBeNull();
  });

  it.each([
    String.raw`\sum_{n=1}^{\infty} \frac{1}{n}`,
    String.raw`\lim_{x\to 0} \frac{\sin x}{x}`,
    String.raw`\int_{0}^{1} x^2 dx`,
    String.raw`\prod_{n=1}^{5} n`,
    String.raw`\alpha_1+\beta_2`,
  ])("keeps subscripted bare commands in one formula: %s", (formula) => {
    const parts = splitMathText(`题目 ${formula}，请说明。`);
    const formulas = parts.filter((part) => part.kind === "math");
    expect(formulas).toHaveLength(1);
    expect(formulas[0].value).toBe(formula);
    expect(mathFormattingError(`题目 ${formula}，请说明。`)).toBeNull();
  });

  it("repairs double-escaped subscript commands without matching longer unknown names", () => {
    expect(normalizeLatex(String.raw`\\sum_{n=1}^{\\infty} \\frac{1}{n}`)).toBe(String.raw`\sum_{n=1}^{\infty} \frac{1}{n}`);
    expect(splitMathText(String.raw`不要误识别 \summary 或 \limit`)).toEqual([{ kind: "text", value: String.raw`不要误识别 \summary 或 \limit`, display: false }]);
  });

  it("never permits external image loading, raw HTML or shared macro state", () => {
    const html = renderFormula(String.raw`\includegraphics{https://example.com/private}`);
    expect(html).not.toContain("<img");
    expect(renderFormula("<script>alert(1)</script>")).not.toContain("<script>");
    renderFormula(String.raw`\gdef\testmacro{1}\testmacro`);
    expect(() => renderFormula(String.raw`\testmacro`)).toThrow();
  });
});

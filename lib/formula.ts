import { renderToString, type KatexOptions } from "katex";

export type MathSegment = { kind: "text" | "math"; value: string; display: boolean };
const mathCommands = "frac|dfrac|tfrac|sqrt|text|operatorname|mathrm|mathbf|mathbb|mathcal|left|right|begin|end|lim|int|iint|iiint|sum|prod|sin|cos|tan|log|ln|exp|alpha|beta|gamma|delta|theta|lambda|mu|sigma|pi|infty|quad|qquad|cdot|times|div|pm|leq?|geq?|neq?|to|rightarrow|partial|nabla|vec|overline|underbrace|overbrace|boxed";
// TeX command names end before a non-letter, including '_' and digits.
// JavaScript \b considers '_' a word character and misses \sum_{...} / \lim_{...}.
const escapedCommands = new RegExp(`(?<!\\\\)\\\\\\\\(?=(?:${mathCommands})(?![a-zA-Z]))`, "g");
const bareCommand = new RegExp(`\\\\(?:${mathCommands})(?![a-zA-Z])`, "g");
const environments = "align\\*?|alignat\\*?|equation\\*?|gather\\*?|multline\\*?|aligned|alignedat|gathered|cases|[pbvVB]?matrix|array";

/** Repair syntax wrappers only: never infer a missing operand or mathematical result. */
export function normalizeLatex(value: string): string {
  let text = value.trim().replace(/^```(?:latex|math|tex)?\s*\n?([\s\S]*?)\n?```$/i, "$1").trim();
  if (text.startsWith("`") && text.endsWith("`") && !text.includes("\n")) text = text.slice(1, -1).trim();
  // Known doubly escaped commands; preserve genuine matrix row separators (\\\\).
  text = text.replace(escapedCommands, "\\");
  text = normalizeMathMarkers(text);
  for (let index = 0; index < 3; index++) {
    const parts = splitMathText(text, false);
    if (parts.length !== 1 || parts[0].kind !== "math" || parts[0].value === text) break;
    text = parts[0].value.trim();
  }
  // These display-only environments have equivalent KaTeX math-mode forms.
  text = text.replace(/\\(begin|end)\{(align\*?|gather\*?|equation\*?|multline\*?)\}/g, (_, edge: string, env: string) =>
    env.startsWith("equation") ? "" : `\\${edge}{${env.startsWith("gather") || env.startsWith("multline") ? "gathered" : "aligned"}}`);
  text = text.replace(/\\(begin|end)\{alignat\*?\}/g, "\\$1{alignedat}");
  const superscripts: Record<string, string> = { "⁰": "0", "¹": "1", "²": "2", "³": "3", "⁴": "4", "⁵": "5", "⁶": "6", "⁷": "7", "⁸": "8", "⁹": "9", "⁺": "+", "⁻": "-", "⁽": "(", "⁾": ")", "ⁿ": "n", "ⁱ": "i" };
  const subscripts: Record<string, string> = { "₀": "0", "₁": "1", "₂": "2", "₃": "3", "₄": "4", "₅": "5", "₆": "6", "₇": "7", "₈": "8", "₉": "9", "₊": "+", "₋": "-", "₍": "(", "₎": ")" };
  // Leave text{} contents untouched; superscripts in math input get real TeX layout.
  text = text.replace(/\\(?:text|textrm|textsf|texttt)\{(?:[^{}]|\{[^{}]*\})*\}|[⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻⁽⁾ⁿⁱ]+|[₀₁₂₃₄₅₆₇₈₉₊₋₍₎]+/g, (run) => {
    if (run.startsWith("\\")) return run;
    const sup = !!superscripts[run[0]];
    return `${sup ? "^" : "_"}{${[...run].map((char) => (sup ? superscripts : subscripts)[char]).join("")}}`;
  });
  return text.trim();
}

function isEscaped(text: string, index: number) {
  let slashes = 0;
  while (index > 0 && text[--index] === "\\") slashes++;
  return slashes % 2 === 1;
}

function findEnd(text: string, start: number, closing: string) {
  let depth = 0;
  for (let index = start; index < text.length; index++) {
    if (depth === 0 && text.startsWith(closing, index) && !isEscaped(text, index)) return index;
    if (!isEscaped(text, index)) {
      if (text[index] === "{") depth++;
      if (text[index] === "}") depth = Math.max(0, depth - 1);
    }
  }
  return -1;
}

/** Parse only math markers/known TeX commands; all remaining content stays React text. */
export function splitMathText(value: string, includeBareCommands = true): MathSegment[] {
  value = normalizeMathMarkers(value).replace(escapedCommands, "\\");
  const parts: MathSegment[] = [];
  const marker = new RegExp("```(?:latex|math|tex)\\s*\\n|\\$\\$|\\\\\\[|\\\\\\(|\\$|\\\\begin\\{(?:" + environments + ")\\}", "g");
  let offset = 0;
  let match: RegExpExecArray | null;
  while ((match = marker.exec(value))) {
    if (isEscaped(value, match.index)) continue;
    const opening = match[0];
    const env = opening.startsWith("\\begin") ? opening.slice(7, -1) : undefined;
    const closing = opening.startsWith("```") ? "```" : env ? `\\end{${env}}` : opening === "\\[" ? "\\]" : opening === "\\(" ? "\\)" : opening;
    const end = findEnd(value, marker.lastIndex, closing);
    if (end < 0) continue; // Do not invent a closing delimiter.
    const inner = value.slice(marker.lastIndex, end);
    // Do not mistake prices or prose for a dollar-delimited formula.
    if (opening === "$" && (/\d/.test(value[end + 1] ?? "") || (/[\u4e00-\u9fff]/.test(inner) && !/\\text\b/.test(inner)) || /^\d+(?:\.\d+)?\s+(?:and|to)\s*$/i.test(inner))) continue;
    if (match.index > offset) parts.push({ kind: "text", value: value.slice(offset, match.index), display: false });
    parts.push({ kind: "math", value: env ? value.slice(match.index, end + closing.length) : inner, display: opening !== "$" && opening !== "\\(" });
    offset = end + closing.length;
    marker.lastIndex = offset;
  }
  if (offset < value.length) parts.push({ kind: "text", value: value.slice(offset), display: false });
  if (!includeBareCommands) return parts;
  return parts.flatMap((part) => part.kind === "math" ? [part] : splitBareCommands(part.value));
}

function normalizeMathMarkers(value: string) {
  return value.replace(/\\\\\(([\s\S]*?)\\\\\)/g, "\\($1\\)")
    .replace(/\\\\\[([\s\S]*?)\\\\\]/g, "\\[$1\\]");
}

function splitBareCommands(text: string): MathSegment[] {
  const parts: MathSegment[] = [];
  bareCommand.lastIndex = 0;
  let offset = 0;
  let match: RegExpExecArray | null;
  while ((match = bareCommand.exec(text))) {
    if (isEscaped(text, match.index)) continue;
    let depth = 0;
    let end = match.index;
    for (; end < text.length; end++) {
      const char = text[end];
      if (!depth && (/[\u4e00-\u9fff，。；：！？\n`$]/.test(char))) break;
      if (!isEscaped(text, end)) {
        if (char === "{") depth++;
        if (char === "}") { if (!depth) break; depth--; }
      }
    }
    if (end <= match.index || depth) continue;
    if (match.index > offset) parts.push({ kind: "text", value: text.slice(offset, match.index), display: false });
    const raw = text.slice(match.index, end);
    parts.push({ kind: "math", value: raw.trimEnd(), display: false });
    if (raw.length !== raw.trimEnd().length) parts.push({ kind: "text", value: raw.slice(raw.trimEnd().length), display: false });
    offset = end;
    bareCommand.lastIndex = end;
  }
  if (offset < text.length) parts.push({ kind: "text", value: text.slice(offset), display: false });
  return parts;
}

export const formulaOptions: KatexOptions = {
  throwOnError: true, trust: false, strict: "ignore", output: "htmlAndMathml", maxExpand: 500, maxSize: 20,
};

export function renderFormula(value: string, displayMode = true) {
  const error = controlCharacterError(value);
  if (error) throw new Error(error);
  return renderToString(normalizeLatex(value), { ...formulaOptions, displayMode });
}

function controlCharacterError(value: string): string | null {
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value) || /\t(?:ext|imes|heta)\b|\r(?:ight|ho)\b/.test(value)) return "公式含异常控制字符，请正确转义 JSON 反斜杠。";
  return null;
}

export function mathFormattingError(value: string, formulaOnly = false): string | null {
  const error = controlCharacterError(value);
  if (error) return error;
  if (formulaOnly) {
    // A matrix environment is part of the same equation, not a separate prose block.
    try { renderFormula(value); return null; } catch {
      if (!/\$|\\[([]|```/.test(value)) return "公式含无法渲染的 LaTeX，请修复语法和 JSON 反斜杠转义。";
    }
  }
  const parts = splitMathText(value, !formulaOnly);
  const formulas = formulaOnly && !parts.some((part) => part.kind === "math") ? [value] : parts.filter((part) => part.kind === "math").map((part) => part.value);
  for (const formula of formulas) {
    if (!formula.trim()) continue;
    // A JSON \b/\f escape can otherwise silently turn \begin/\frac into plain letters.
    try { renderFormula(formula); } catch { return "公式含无法渲染的 LaTeX，请修复语法和 JSON 反斜杠转义。"; }
  }
  return null;
}

"use client";

import { useMemo } from "react";
import { MathText } from "@/components/math-formula";
import { mathFormattingError, splitMathText } from "@/lib/formula";

/** Keep editable source unchanged; render a separate, safe view of the same input. */
export function MathInputPreview({ value, label = "题目公式预览" }: { value: string; label?: string }) {
  const state = useMemo(() => {
    const parts = splitMathText(value);
    const hasFormula = parts.some((part) => part.kind === "math");
    const unparsed = parts.some((part) => part.kind === "text" && /\\(?:[a-zA-Z]+|[([])/.test(part.value));
    return { visible: hasFormula || unparsed, warning: unparsed || !!mathFormattingError(value) };
  }, [value]);
  if (!state.visible) return null;
  return <section aria-label={label} className="min-w-0 rounded-xl border border-primary/25 bg-primary/[0.04] p-3">
    <p className="mb-2 text-sm font-medium">{label}</p>
    <div className="min-w-0 text-base leading-8"><MathText value={value} /></div>
    <p className="mt-2 text-xs leading-5 text-muted-foreground">输入框保留可编辑的 LaTeX，排版效果显示在这里。</p>
    {state.warning && <p className="mt-2 text-sm leading-6 text-amber-800 dark:text-amber-200">部分公式尚无法排版，请核对命令、括号或公式分隔符；原文已保留。</p>}
  </section>;
}

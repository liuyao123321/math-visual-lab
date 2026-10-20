"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { MathFormula, MathText } from "@/components/math-formula";
import { callTutor } from "@/lib/tutor-client";
import { exampleMethods } from "@/lib/alternative-methods";
import type { LearningContextSummary, MultiMethodResult, SolveResult } from "@/lib/math-schema";

export function MultiMethodPanel({ solution, learningContext }: { solution: SolveResult; learningContext?: LearningContextSummary }) {
  const [result, setResult] = useState<MultiMethodResult | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState(0);
  async function generate() {
    setLoading(true); setError("");
    try { setResult(exampleMethods(solution.id) ?? await callTutor({ action: "multi-method", sourceQuestion: solution.normalizedQuestion, learningContext }) as MultiMethodResult); setSelected(0); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "暂时无法提供可靠多解，请稍后重试。"); }
    finally { setLoading(false); }
  }
  return <section className="mt-5 space-y-3 rounded-xl border p-4"><h3 className="font-medium">一题多解</h3><p className="text-sm text-muted-foreground">比较不同方法的思路和适用条件，并交叉核对结论。</p><Button variant="outline" onClick={generate} disabled={loading}>{loading ? "正在寻找不同解法" : "比较两种解法"}</Button>{error && <p role="alert" className="text-sm text-amber-700 dark:text-amber-300">{error}</p>}{result && <><div className="flex flex-wrap gap-2">{result.methods.map((method, index) => <Button key={method.name} variant={selected === index ? "secondary" : "outline"} onClick={() => setSelected(index)}>{method.name}</Button>)}</div><p className="text-sm leading-6">思路：<MathText value={result.methods[selected].idea} /></p><p className="text-sm leading-6 text-muted-foreground">适用条件：<MathText value={result.methods[selected].applicability} /></p>{result.methods[selected].steps.map((step) => <div key={step.id} className="space-y-2 border-t pt-3"><p className="font-medium"><MathText value={step.title} /></p><p className="text-sm leading-6"><MathText value={step.explanation} /></p>{step.formulas.map((formula) => <MathFormula key={formula} value={formula} />)}</div>)}<MathFormula value={result.methods[selected].answerLatex} /><p className="rounded-lg bg-muted/50 p-3 text-sm leading-6"><MathText value={result.comparison} /></p><p className="text-xs text-muted-foreground">{exampleMethods(solution.id) ? "内置教材示例的人工整理多解。" : "AI 生成多解，请结合教材核对结论。"}</p></>}</section>;
}

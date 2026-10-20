"use client";

import { useEffect, useRef, useState } from "react";
import { BrainCircuit, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MathFormula, MathText } from "@/components/math-formula";
import { callTutor } from "@/lib/tutor-client";
import type { ExplainResult, ExplanationMode, SolutionStep, TutorRequest } from "@/lib/math-schema";

export type StepFeedback = { reason: string; detail: ExplainResult | null };
type Context = Extract<TutorRequest, { action: "explain-step" }>["learningContext"];
const choices = [{ value: "alternative", label: "换种讲法" }, { value: "visual", label: "结合图像" }, { value: "foundation", label: "补基础" }] as const;

export function StepTutoringPanel({ step, question, mode, learningContext, value, onChange, onFocus }: {
  step: SolutionStep; question: string; mode: ExplanationMode; learningContext: Context;
  value: StepFeedback; onChange: (value: StepFeedback) => void; onFocus: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const sequence = useRef(0), active = useRef<AbortController | null>(null);
  useEffect(() => () => { sequence.current++; active.current?.abort(); }, []);
  async function explain(perspective?: typeof choices[number]["value"]) {
    if (busy) return;
    const ticket = ++sequence.current;
    const controller = new AbortController(); active.current = controller;
    setBusy(true); setError(""); onFocus();
    try {
      const detail = await callTutor({ action: "explain-step", question, step, reason: value.reason, mode, perspective, learningContext }, { signal: controller.signal }) as ExplainResult;
      if (ticket === sequence.current) onChange({ ...value, detail });
    } catch (caught) {
      if (ticket === sequence.current) setError(caught instanceof Error ? caught.message : "讲解暂时无法生成，请重试。");
    } finally { if (ticket === sequence.current) setBusy(false); }
  }
  return <section className="step-feedback" aria-label={`第${step.id}步专属讲解`}>
    <label className="block"><span className="text-sm font-medium">这一步哪里没看懂？</span>
      <Input className="mt-2" aria-label={`关于“${step.title}”的困惑`} value={value.reason} maxLength={20000} onChange={(event) => {
        sequence.current++; active.current?.abort(); setBusy(false); setError(""); onFocus(); onChange({ reason: event.target.value, detail: null });
      }} />
    </label>
    <div className="mt-3 flex flex-wrap gap-2" aria-label="选择讲解角度">{choices.map((choice) => <Button key={choice.value} size="sm" variant="outline" disabled={busy} onClick={() => void explain(choice.value)}>{choice.label}</Button>)}</div>
    <Button className="mt-3 w-full" variant="secondary" disabled={busy} onClick={() => void explain()}>{busy ? <Loader2 className="animate-spin" /> : <BrainCircuit />}根据反馈生成专属讲解</Button>
    {error && <p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}
    {value.detail && <div className="mt-4 space-y-3" aria-live="polite"><h3 className="font-medium"><MathText value={value.detail.title} /></h3><p className="text-sm leading-7"><MathText value={value.detail.explanation} /></p>{value.detail.formulas.map((formula) => <MathFormula key={formula} value={formula} />)}{value.detail.analogy && <p className="text-sm leading-6">类比：<MathText value={value.detail.analogy} /></p>}{value.detail.checkQuestion && <p className="text-sm">检查理解：<MathText value={value.detail.checkQuestion} /></p>}</div>}
  </section>;
}

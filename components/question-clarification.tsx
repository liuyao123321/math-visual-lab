"use client";

import { useId } from "react";
import { CircleHelp, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { MathText } from "@/components/math-formula";
import { MathInputPreview } from "@/components/math-input-preview";
import type { ClarificationQuestion } from "@/lib/math-schema";
import { clarificationAnswer, supplementedQuestion, type ClarificationDraft } from "@/lib/question-clarification";
import { cn } from "@/lib/utils";

export function QuestionClarification({ question, questions, value, onChange, onConfirm, disabled = false }: {
  question: string;
  questions: ClarificationQuestion[];
  value: ClarificationDraft;
  onChange: (next: ClarificationDraft) => void;
  onConfirm: (question: string) => void;
  disabled?: boolean;
}) {
  const id = useId();
  const revised = supplementedQuestion(question, questions, value);
  const answers = questions.map((item) => ({ title: item.title, answer: clarificationAnswer(item, value[String(item.missingIndex)]) })).filter((item) => item.answer);
  const answered = answers.length;
  const update = (key: string, patch: Partial<ClarificationDraft[string]>) => onChange({ ...value, [key]: { ...(value[key] ?? { selected: "", custom: "" }), ...patch } });
  return <form aria-label="题目核对选项" className="mb-4 space-y-4 rounded-xl border border-primary/25 bg-primary/[0.04] p-4" onSubmit={(event) => { event.preventDefault(); if (revised && !disabled) onConfirm(revised); }}>
    <div><h3 className="flex items-center gap-2 text-sm font-medium"><CircleHelp className="size-4 text-primary dark:text-primary" />先确认这些条件</h3><p className="mt-2 text-xs leading-6 text-muted-foreground">请选择符合原题的内容，或自己填写。候选项不是已知条件；只有确认后才会继续核对和解析。</p></div>
    {questions.map((item) => {
      const key = String(item.missingIndex);
      const selected = value[key]?.selected ?? "";
      const customId = `${id}-${key}-text`;
      return <fieldset key={key} disabled={disabled} className="min-w-0 space-y-2">
        <legend className="mb-2 text-sm font-medium"><MathText value={item.title} /></legend>
        {item.options.map((option, index) => <label key={index} className={cn("flex cursor-pointer items-start gap-3 rounded-lg border bg-background/80 p-3 text-sm transition-colors focus-within:ring-2 focus-within:ring-ring", selected === `option-${index}` ? "border-primary bg-primary/10" : "border-border hover:border-primary/50")}>
          <input type="radio" name={`${id}-${key}`} value={`option-${index}`} checked={selected === `option-${index}`} onChange={() => update(key, { selected: `option-${index}` })} className="mt-1 size-4 shrink-0 accent-primary" />
          <span className="min-w-0"><span className="block"><MathText value={option.label} /></span>{option.description && <span className="mt-1 block text-xs leading-5 text-muted-foreground"><MathText value={option.description} /></span>}</span>
        </label>)}
        {item.options.length > 0 && <label className="flex cursor-pointer items-center gap-3 rounded-lg border bg-background/80 p-3 text-sm focus-within:ring-2 focus-within:ring-ring"><input type="radio" name={`${id}-${key}`} value="custom" checked={selected === "custom"} onChange={() => update(key, { selected: "custom" })} className="size-4 accent-primary" />自己填写</label>}
        {(selected === "custom" || item.options.length === 0) && <div className="space-y-2"><label htmlFor={customId} className="sr-only">补充：{item.title}</label><Textarea id={customId} maxLength={300} spellCheck={false} value={value[key]?.custom ?? ""} onChange={(event) => update(key, { selected: "custom", custom: event.target.value })} placeholder="按原题填写条件，可输入 LaTeX；不确定时请说明" className="min-h-20 bg-background" /><MathInputPreview value={value[key]?.custom ?? ""} label="补充公式预览" /></div>}
      </fieldset>;
    })}
    {answered > 0 && <div className="rounded-lg bg-background/70 p-3 text-xs leading-6"><p className="font-medium">将提交的补充：</p><ul className="mt-1 space-y-1">{answers.map((item, index) => <li key={index}><MathText value={`${item.title}：${item.answer}`} /></li>)}</ul></div>}
    <div aria-live="polite" className="text-xs leading-5 text-muted-foreground">已补充 {answered}/{questions.length} 项{answered === questions.length && !revised ? "。补充后题目超过2000字符，请精简原题或补充内容。" : "；不确定的条件可以说明，AI 会再次核对。"}</div>
    <Button type="submit" className="w-full" disabled={disabled || !revised}><Check />确认补充并继续解析</Button>
  </form>;
}

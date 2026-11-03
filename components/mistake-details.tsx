"use client";

import { lazy, Suspense, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { DialogClose } from "@/components/ui/dialog";
import { MathFormula, MathText } from "@/components/math-formula";
import { KnowledgeEvidence } from "@/components/knowledge-evidence";
import { SolutionStepContent } from "@/components/solution-step-content";
import { verdictLabels } from "@/lib/handwriting-schema";
import { masteryLabels } from "@/lib/store";
import { mistakeDateLabel } from "@/lib/mistake-view";
import type { Mastery, MistakeRecord } from "@/lib/math-schema";

type Edit = Partial<Pick<MistakeRecord, "note" | "errorReason" | "mastery">>;
const SavedMathPlot = lazy(() => import("@/components/math-plot").then((module) => ({ default: module.MathPlot })));
export function MistakeDetails({ item, draft, onDraft, onUpdate, onDelete }: { item: MistakeRecord; draft?: Edit; onDraft: (id: string, draft: Edit | null) => void; onUpdate: (id: string, patch: Edit) => boolean; onDelete: (id: string, source: HTMLElement | null) => void }) {
  const [note, setNote] = useState(draft?.note ?? item.note);
  const [reason, setReason] = useState(draft?.errorReason ?? item.errorReason);
  const [mastery, setMastery] = useState(draft?.mastery ?? item.mastery);
  const [failed, setFailed] = useState(!!draft);
  const [showGraph, setShowGraph] = useState(false);
  const revealedHints = item.handwriting?.hints.filter((hint) => hint.level <= item.handwriting!.revealedHints).sort((a, b) => a.level - b.level) ?? [];
  // A successful retry must also save earlier failed edits, not silently discard them.
  function save(patch: Edit) { const next = { note, errorReason: reason, mastery, ...patch }; const saved = onUpdate(item.id, next); setFailed(!saved); onDraft(item.id, saved ? null : next); }
  return <div className="mistake-detail-body">
    <section aria-label="完整原题"><h3>题目</h3><div className="text-base leading-8"><MathText value={item.question} /></div><p className="mt-3 text-sm text-muted-foreground">{item.questionType} · {item.difficulty} · 已复习 {item.attempts} 次</p><p className="mt-1 text-xs text-muted-foreground">收藏于 {mistakeDateLabel(item.createdAt)}{item.lastPracticedAt ? ` · 最近练习 ${mistakeDateLabel(item.lastPracticedAt)}` : " · 尚未练习"}</p>
      {item.topics.length > 0 && <div className="mt-3 flex flex-wrap gap-2">{item.topics.map((topic) => <span key={topic} className="rounded bg-muted px-2 py-1 text-xs">{topic}</span>)}</div>}
    </section>
    <section aria-label="编辑错题"><h3>复习记录</h3><div className="grid gap-4 sm:grid-cols-2"><label className="space-y-2 text-sm">错误原因<Input aria-label="错误原因" value={reason} onChange={(event) => { setReason(event.target.value); save({ errorReason: event.target.value }); }} /></label><label className="space-y-2 text-sm">掌握状态<select aria-label="详情掌握状态" className="mistake-native-select w-full" value={mastery} onChange={(event) => { const next = event.target.value as Mastery; setMastery(next); save({ mastery: next }); }}>{Object.entries(masteryLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label></div><label className="mt-4 block space-y-2 text-sm">复习笔记<Textarea aria-label="复习笔记" className="min-h-28" value={note} onChange={(event) => { setNote(event.target.value); save({ note: event.target.value }); }} placeholder="记录新的理解…" /></label>
      {failed ? <div role="alert" className="mt-3 text-sm text-destructive"><p>保存失败，编辑内容仍保留在本页。刷新或离开本页前请先复制，或重试保存。</p><Button type="button" variant="outline" className="mt-2" onClick={() => save({ note, errorReason: reason, mastery })}>重试保存</Button></div> : <p className="mt-2 text-xs text-muted-foreground">修改自动保存</p>}
    </section>
    <details className="mistake-detail-analysis" open><summary>保存的完整解析</summary><div className="mt-4 space-y-5">{item.solution.steps.length ? item.solution.steps.map((step, index) => <section key={step.id}><h3>{index + 1}. <MathText value={step.title} /></h3><SolutionStepContent step={step} mode="detailed" rag={item.solution.rag} /></section>) : <p className="text-sm text-muted-foreground">这份历史记录没有完整步骤，可再次练习重新获取解析。</p>}
      {(item.solution.finalAnswerLatex || item.solution.finalAnswerText) && <section><h3>最终答案</h3>{item.solution.finalAnswerLatex && <MathFormula value={item.solution.finalAnswerLatex} />}{item.solution.finalAnswerText && <p className="mt-3 text-sm leading-7"><MathText value={item.solution.finalAnswerText} /></p>}</section>}
      {item.solution.commonMistakes.length > 0 && <section><h3>常见错误</h3><ul className="list-disc space-y-2 pl-5 text-sm leading-6">{item.solution.commonMistakes.map((text, index) => <li key={index}><MathText value={text} /></li>)}</ul></section>}
      {item.solution.rag && <KnowledgeEvidence rag={item.solution.rag} />}
      {item.solution.limitations.length > 0 && <p className="text-sm text-muted-foreground"><MathText value={item.solution.limitations.join("；")} /></p>}
    </div></details>
    {item.solution.visualization && <details className="mistake-detail-analysis" onToggle={(event) => setShowGraph(event.currentTarget.open)}><summary>保存的题目图像</summary>{showGraph && <Suspense fallback={<p role="status">正在载入图像…</p>}><SavedMathPlot spec={item.solution.visualization} parameters={Object.fromEntries(item.solution.visualization.parameters.map((parameter) => [parameter.key, parameter.defaultValue]))} activeLayerIds={[]} compact /></Suspense>}</details>}
    {item.handwriting && <details className="mistake-detail-analysis"><summary>已确认的手写步骤与 AI 评价</summary><p className="mt-3 text-sm text-muted-foreground">这是保存的过程复盘，不是标准答案；错误原因由学生确认。</p>{item.handwriting.evaluation && <p className="mt-3 text-sm leading-7"><MathText value={item.handwriting.evaluation.summary} /></p>}{item.handwriting.conditions.length > 0 && <p className="mt-3 text-sm leading-7">已知条件：<MathText value={item.handwriting.conditions.join("；")} /></p>}{item.handwriting.evaluation?.limitations.map((text, index) => <p key={index} className="mt-2 text-sm text-muted-foreground">评价限制：<MathText value={text} /></p>)}{item.handwriting.evaluation?.understandingQuestion && <p className="mt-2 text-sm">理解检查：<MathText value={item.handwriting.evaluation.understandingQuestion} /></p>}{revealedHints.map((hint) => <section key={hint.level} className="mt-3"><h3>已展开提示 {hint.level} · {hint.title}</h3><MathText value={hint.text} />{hint.formulas.map((formula, index) => <MathFormula key={index} value={formula} />)}</section>)}{item.handwriting.steps.map((step, index) => {
      const verdict = item.handwriting?.evaluation?.steps.find((entry) => entry.stepId === step.id);
      return <section className="mt-4 border-t pt-4" key={step.id}><h3>第{index + 1}步 · {verdict ? verdictLabels[verdict.status] : "待检查"}</h3><p className="text-sm leading-7"><MathText value={step.text} /></p>{step.formulas.map((formula, index) => <MathFormula key={index} value={formula} />)}{verdict && <div className="mt-3 space-y-2 text-sm leading-6"><p>依据：<MathText value={verdict.basis} /></p>{verdict.strengths.map((text, index) => <p key={index}>做对的部分：<MathText value={text} /></p>)}{verdict.issues.map((text, index) => <p key={index}>需要检查：<MathText value={text} /></p>)}{verdict.hint && <p>提示：<MathText value={verdict.hint} /></p>}{verdict.suggestedRewrite && <p>建议改写：<MathText value={verdict.suggestedRewrite} /></p>}</div>}</section>;
    })}</details>}
    <div className="mistake-detail-actions"><Button type="button" variant="ghost" className="text-destructive" onClick={(event) => onDelete(item.id, event.currentTarget)}>删除错题</Button><div className="flex flex-wrap gap-2"><DialogClose asChild><Button variant="outline">关闭详情</Button></DialogClose><Button asChild><a href={`/solve?mistake=${encodeURIComponent(item.id)}`} aria-disabled={failed} onClick={(event) => { if (failed) event.preventDefault(); }}>再次练习</a></Button></div></div>
  </div>;
}

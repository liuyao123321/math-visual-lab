"use client";

import { BookOpen, ExternalLink } from "lucide-react";
import { MathFormula, MathText } from "@/components/math-formula";
import type { SolveResult } from "@/lib/math-schema";
import type { EvidenceCard, RagSnapshot } from "@/lib/rag/schema";
import { textbookCatalog } from "@/lib/textbooks";

const labels = { satisfied: "满足", not_satisfied: "不满足", unknown: "尚未确认", not_applicable: "本处不适用" };
function KnowledgeCard({ card }: { card: EvidenceCard }) {
  return <div className="mt-3 space-y-2 text-sm leading-6">
    <p><MathText value={card.statement} /></p>
    {card.formulas.map((formula) => <MathFormula key={formula} value={formula} />)}
    {card.conditions.length > 0 && <div><p className="font-medium">适用条件</p><ul className="list-disc space-y-1 pl-5">{card.conditions.map((condition) => <li key={condition.id}><MathText value={condition.text} /></li>)}</ul></div>}
    {card.pitfalls.map((pitfall) => <p key={pitfall} className="text-amber-800 dark:text-amber-200">提醒：<MathText value={pitfall} /></p>)}
    {card.source.url ? <a href={card.source.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary underline underline-offset-4 dark:text-primary">{card.source.title} · {card.source.section}<ExternalLink className="size-3 shrink-0" /></a> : <p className="break-all text-muted-foreground">{"fileName" in card.source ? `${card.source.fileName} · PDF文件第${card.source.pageNumber}页（非印刷页码）` : "来源待核对"}</p>}
    <p className="text-xs text-muted-foreground">{card.reviewStatus === "teacher_reviewed" ? "已由教师复核" : card.reviewStatus === "user_confirmed" ? "用户核对的原文摘录，未经教师复核" : "教材对照整理，待团队及教师复核"} · {card.id}</p>
  </div>;
}

export function KnowledgeEvidence({ rag, preview = false }: { rag: RagSnapshot; preview?: boolean }) {
  return <section aria-label="课程知识依据" className="my-4 rounded-xl border border-primary/25 bg-primary/[0.04] p-4">
    <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="flex items-center gap-2 text-sm font-medium"><BookOpen className="size-4 text-primary" />{preview ? "知识检索结果" : "课程知识依据"}</h3><span className="rounded-full bg-muted px-2 py-1 text-xs">{rag.retrievalMode === "hybrid" ? "混合检索" : rag.retrievalMode === "vector" ? "语义检索" : rag.retrievalMode === "text" ? "文本检索" : "未覆盖"}</span></div>
    <p role="status" className="mt-2 text-xs leading-5 text-muted-foreground">{rag.message}</p>
    {rag.textbookIds && <p className="mt-1 text-xs leading-5 text-muted-foreground">检索教材：{rag.textbookIds.map((id) => textbookCatalog.textbooks.find((book) => book.id === id)?.title ?? rag.cards.find((card) => card.sourceId === id)?.source.title ?? "个人或历史教材").join("、")}</p>}
    {rag.vectorStatus === "index_mismatch" && <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">向量索引与知识库版本不一致，已停用语义检索。</p>}
    {rag.cards.map((card) => <details key={card.id} className="mt-3 rounded-lg border bg-background/70 px-3 py-2"><summary className="cursor-pointer text-sm font-medium">{card.title}<span className="ml-2 text-xs font-normal text-muted-foreground">{preview ? "候选资料" : rag.usedKnowledgeIds.includes(card.id) ? "解析已引用" : "候选资料"}</span></summary><KnowledgeCard card={card} /></details>)}
    <p className="mt-3 text-xs leading-5 text-muted-foreground">检索资料提供学习依据，不代表数学结论已经证明。条件是否成立仍需核对。</p>
    <details className="mt-2 text-xs text-muted-foreground"><summary className="cursor-pointer">查看检索信息</summary><p className="mt-1 break-all">{rag.knowledgeBaseVersion} · 检索用时 {rag.retrievalMs} ms</p></details>
  </section>;
}

export function StepKnowledgeEvidence({ step, rag }: { step: SolveResult["steps"][number]; rag?: RagSnapshot }) {
  if (!rag || !step.knowledgeIds?.length) return null;
  const cards = rag.cards.filter((card) => step.knowledgeIds!.includes(card.id));
  if (!cards.length) return null;
  return <details className="mt-3 rounded-lg border border-primary/20 bg-background/70 px-3 py-2 text-sm">
    <summary className="cursor-pointer font-medium text-primary dark:text-primary">查看本步知识依据与条件</summary>
    <p className="mt-2 text-xs text-muted-foreground">引用用途：{step.citationPurpose === "apply" ? "应用定理" : step.citationPurpose === "contrast" ? "辨析误用或不适用" : "解释概念"}。条件说明由AI生成，请核对。</p>
    {cards.map((card) => <div key={card.id} className="mt-3 border-t pt-2"><p className="font-medium">{card.title}</p><KnowledgeCard card={card} />
      {(step.conditionChecks ?? []).filter((check) => check.knowledgeId === card.id).map((check) => <div key={check.conditionId} className="mt-2 rounded-md bg-muted/60 p-2"><p className="text-xs font-medium">{labels[check.status]}：<MathText value={card.conditions.find((condition) => condition.id === check.conditionId)?.text ?? check.conditionId} /></p><p className="mt-1 text-xs leading-5"><MathText value={check.evidence} /></p></div>)}
    </div>)}
  </details>;
}

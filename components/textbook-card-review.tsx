"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { MathText } from "@/components/math-formula";
import { approveTextbookCard, cardContentLength, MAX_TEXTBOOK_CARDS, pageRangeLabel, textbookCardKinds, type TextbookCardDraft } from "@/lib/textbook-cards";

export function TextbookCardReview({ cards, onChange, file }: { cards: TextbookCardDraft[]; onChange: (cards: TextbookCardDraft[]) => void; file: File | null }) {
  const [index, setIndex] = useState(0);
  const [error, setError] = useState("");
  const current = Math.min(index, cards.length - 1);
  const card = cards[current];
  const next = cards[current + 1];
  const editor = useRef<HTMLTextAreaElement>(null);
  const originalUrl = useRef("");
  useEffect(() => () => { if (originalUrl.current) URL.revokeObjectURL(originalUrl.current); originalUrl.current = ""; }, [file]);
  if (!card) return <p role="status">没有可分类的正文。请核对预览或换一个页码范围。</p>;
  const approved = cards.filter((item) => item.reviewed).length;
  const excluded = cards.filter((item) => item.excluded).length;
  const length = cardContentLength(card.text, { ...card, formulas: card.formulas.split("\n").filter(Boolean), conditions: card.conditions.split("\n").filter(Boolean) });
  const update = (patch: Partial<TextbookCardDraft>) => { setError(""); onChange(cards.map((item, i) => i === current ? { ...item, reviewed: undefined, excluded: false, ...patch } : item)); };
  const select = (value: number) => { setError(""); setIndex(value); };
  const canMerge = !!next && !next.excluded && next.section === card.section && next.pageNumber <= card.pageEnd + 1;
  function split() {
    const at = editor.current?.selectionStart ?? 0;
    if (at <= 0 || at >= card.text.length || !card.text.slice(0, at).trim() || !card.text.slice(at).trim()) { setError("请把光标放在正文中的拆分位置。"); return; }
    if (cards.length >= MAX_TEXTBOOK_CARDS) { setError("本批最多500条，请缩小页码范围。"); return; }
    const id = "c" + (Math.max(...cards.map((item) => Number(item.id.slice(1)))) + 1);
    const clean = { ...card, formulas: "", conditions: "", noConditions: false, reviewed: undefined, excluded: false };
    onChange([...cards.slice(0, current), { ...clean, text: card.text.slice(0, at).trim() },
      { ...clean, id, title: card.text.slice(at).trim().slice(0, 60), text: card.text.slice(at).trim() }, ...cards.slice(current + 1)]);
    setError("");
  }
  function merge() {
    if (!canMerge) return;
    onChange([...cards.slice(0, current), { ...card, category: card.category === next.category ? card.category : "unknown",
      pageEnd: Math.max(card.pageEnd, next.pageEnd), text: card.text + "\n" + next.text,
      source: card.source === next.source ? card.source : card.source + "\n" + next.source,
      formulas: [card.formulas, next.formulas].filter(Boolean).join("\n"), conditions: [card.conditions, next.conditions].filter(Boolean).join("\n"),
      noConditions: false, reviewed: undefined, excluded: false }, ...cards.slice(current + 2)]);
    setError("");
  }
  function openSource() {
    if (!file) return;
    try {
      originalUrl.current ||= URL.createObjectURL(file);
      window.open(originalUrl.current + "#page=" + card.pageNumber, "_blank", "noopener,noreferrer");
    } catch { setError("无法打开原PDF，请在本机阅读器按页码核对。"); }
  }
  return <section aria-label="教材卡片审核" className="space-y-4 border-t pt-4">
    <h3 className="font-medium">逐条审核教材卡片</h3>
    <p className="text-sm leading-6 text-muted-foreground">分类是本机规则的建议。对照原 PDF 检查公式、出处和条件；只有点过“核对通过”的卡片会入库。修改或拆合后需重新核对。</p>
    <p role="status" className="text-sm">已通过 {approved} 条 · 已略过 {excluded} 条 · 待核对 {cards.length - approved - excluded} 条</p>
    <div className="flex flex-wrap items-center gap-2">
      <Button type="button" variant="outline" disabled={current === 0} onClick={() => select(current - 1)}>上一条</Button>
      <label className="min-w-0 flex-1 text-sm"><span className="sr-only">选择审核条目</span><select className="h-10 w-full rounded-lg border bg-background px-2" value={current} onChange={(event) => select(Number(event.target.value))}>{cards.map((item, i) => <option key={item.id} value={i}>{i + 1}/{cards.length} · {item.reviewed ? "已通过" : item.excluded ? "略过" : textbookCardKinds[item.category]} · {item.title.slice(0, 32)}</option>)}</select></label>
      <Button type="button" variant="outline" disabled={!next} onClick={() => select(current + 1)}>下一条</Button>
    </div>
    <div className="grid gap-4 md:grid-cols-2">
      <div className="min-w-0 space-y-2">
        <p className="text-sm font-medium">提取原文 · PDF 第 {pageRangeLabel(card.pageNumber, card.pageEnd)} 页</p>
        <Button type="button" variant="outline" onClick={openSource}>打开原 PDF 核对</Button>
        <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-muted p-3 font-sans text-sm leading-6">{card.source}</pre>
      </div>
      <div className="min-w-0 space-y-3">
        <label className="block space-y-1 text-sm">内容类别<select className="h-10 w-full rounded-lg border bg-background px-2" value={card.category} onChange={(event) => update({ category: event.target.value as TextbookCardDraft["category"] })}>{Object.entries(textbookCardKinds).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
        <label className="block space-y-1 text-sm">卡片标题<Input value={card.title} maxLength={100} onChange={(event) => update({ title: event.target.value })} /></label>
        <label className="block space-y-1 text-sm">教材章节<Input value={card.section} maxLength={100} onChange={(event) => update({ section: event.target.value })} /></label>
        <label className="block space-y-1 text-sm">卡片正文<Textarea ref={editor} className="min-h-36" value={card.text} onChange={(event) => update({ text: event.target.value })} /></label>
        <label className="block space-y-1 text-sm">公式（LaTeX，每行一条）<Textarea value={card.formulas} onChange={(event) => update({ formulas: event.target.value })} /></label>
        <label className="block space-y-1 text-sm">适用条件（每行一条）<Textarea value={card.conditions} onChange={(event) => update({ conditions: event.target.value, noConditions: false })} /></label>
        {card.category === "knowledge" && <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={card.noConditions} disabled={!!card.conditions.trim()} onChange={(event) => update({ noConditions: event.target.checked })} />已核对，原文未列额外适用条件</label>}
        {length <= 1200 && <details className="text-sm"><summary className="cursor-pointer">预览正文与公式</summary><div className="mt-2 whitespace-pre-wrap break-words leading-7"><MathText value={card.text} />{card.formulas.split("\n").filter(Boolean).map((formula, i) => <div key={i}><MathText value={"\\[" + formula + "\\]"} /></div>)}</div></details>}
        <p className="text-xs text-muted-foreground">{length}/1200 字符 · 长卡请拆分，系统不会截断。</p>
      </div>
    </div>
    <div className="flex flex-wrap gap-2">
      <Button type="button" variant="outline" onClick={split}>在光标处拆分</Button>
      <Button type="button" variant="outline" disabled={!canMerge} onClick={merge}>与下一条合并</Button>
      <Button type="button" variant="ghost" onClick={() => update({ excluded: !card.excluded })}>{card.excluded ? "恢复待核对" : "略过此条"}</Button>
      {card.reviewed ? <Button type="button" variant="outline" onClick={() => update({})}>撤回通过</Button> :
        <Button type="button" disabled={card.excluded} onClick={() => { try { update({ reviewed: approveTextbookCard(card) }); } catch (caught) { setError(caught instanceof Error ? caught.message : "卡片未通过校验。"); } }}>核对通过</Button>}
    </div>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
  </section>;
}

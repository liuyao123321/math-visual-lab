"use client";

import { useMemo, useRef, useState } from "react";
import { ArrowDownUp, BookOpenCheck, Search, X } from "lucide-react";
import { toast } from "sonner";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MathText } from "@/components/math-formula";
import { MistakeCard } from "@/components/mistake-card";
import { MistakeDetails } from "@/components/mistake-details";
import { MistakeFiltersMenu } from "@/components/mistake-filters";
import { emptyMistakeFilters, filterMistakes, sortMistakes, mistakeSortLabels, timeFilterLabels, type MistakeFilters, type MistakeSort } from "@/lib/mistake-view";
import { masteryLabels, useMathLabStore } from "@/lib/store";
import type { MistakeRecord } from "@/lib/math-schema";
import "./mistakes-view.css";

type Edit = Partial<Pick<MistakeRecord, "note" | "errorReason" | "mastery">>;
export function MistakesView() {
  const mistakes = useMathLabStore((state) => state.mistakes);
  const hydrated = useMathLabStore((state) => state.hydrated);
  const updateMistake = useMathLabStore((state) => state.updateMistake);
  const removeMistake = useMathLabStore((state) => state.removeMistake);
  const [filters, setFilters] = useState<MistakeFilters>({ ...emptyMistakeFilters });
  const [sort, setSort] = useState<MistakeSort>("newest");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [drafts, setDrafts] = useState<Map<string, Edit>>(() => new Map());
  const [deleteError, setDeleteError] = useState("");
  const heading = useRef<HTMLHeadingElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const deleteReturnFocus = useRef<HTMLElement | null>(null);
  const visible = useMemo(() => sortMistakes(filterMistakes(mistakes, filters), sort), [mistakes, filters, sort]);
  const selected = mistakes.find((item) => item.id === selectedId);
  const deleting = mistakes.find((item) => item.id === deleteId);
  function patch<K extends keyof MistakeFilters>(key: K, value: MistakeFilters[K]) { setFilters((previous) => ({ ...previous, [key]: value })); }
  function update(id: string, value: Edit) {
    try { updateMistake(id, value); setError(""); return true; }
    catch { setError("保存失败，原有记录未改动。请检查浏览器存储空间后重试。"); return false; }
  }
  function open(id: string, source: HTMLElement | null) { returnFocus.current = source; setSelectedId(id); }
  function askDelete(id: string, source: HTMLElement | null) { deleteReturnFocus.current = source; setDeleteError(""); setDeleteId(id); }
  function restoreFocus(source: HTMLElement | null) { if (source?.isConnected) source.focus(); else heading.current?.focus(); }
  const conditions: Array<{ key: string; label: string; clear: () => void }> = [];
  if (filters.query) conditions.push({ key: "query", label: "搜索：" + filters.query, clear: () => patch("query", "") });
  if (filters.time !== "all") conditions.push({ key: "time", label: "时间：" + timeFilterLabels[filters.time], clear: () => patch("time", "all") });
  if (filters.subject !== null) conditions.push({ key: "subject", label: "科目：" + filters.subject, clear: () => patch("subject", null) });
  if (filters.difficulty !== null) conditions.push({ key: "difficulty", label: "难度：" + filters.difficulty, clear: () => patch("difficulty", null) });
  if (filters.errorReason !== null) conditions.push({ key: "errorReason", label: "错因：" + (filters.errorReason || "未填写"), clear: () => patch("errorReason", null) });
  if (filters.mastery !== "all") conditions.push({ key: "mastery", label: "状态：" + masteryLabels[filters.mastery], clear: () => patch("mastery", "all") });

  if (!hydrated) return <main className="mistakes-page" role="status">正在读取本地错题…</main>;
  return <main className="mistakes-page">
    <div className="mistakes-toolbar">
      <div className="mistakes-title"><h1 ref={heading} tabIndex={-1}>错题集</h1><p role="status">显示 {visible.length} / {mistakes.length} 道</p></div>
      <div className="mistakes-tools">
        <MistakeFiltersMenu records={mistakes} value={filters} onChange={setFilters} />
        <label className="mistakes-sort"><span className="inline-flex items-center gap-1.5"><ArrowDownUp aria-hidden="true" className="size-4" />排序依据</span><select aria-label="排序依据" className="mistake-native-select" value={sort} onChange={(event) => setSort(event.target.value as MistakeSort)}>{Object.entries(mistakeSortLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      </div>
    </div>
    <section aria-label="搜索与掌握状态" className="mistakes-search-row">
      <label className="mistakes-search"><span className="sr-only">搜索错题</span><Search aria-hidden="true" /><Input aria-label="搜索错题" value={filters.query} onChange={(event) => patch("query", event.target.value)} placeholder="搜索题目、知识点、错因或笔记" /></label>
      <select aria-label="筛选掌握状态" className="mistake-native-select" value={filters.mastery} onChange={(event) => patch("mastery", event.target.value as MistakeFilters["mastery"])}><option value="all">全部状态</option>{Object.entries(masteryLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
    </section>
    {conditions.length > 0 && <div aria-label="已选过滤条件" className="mistakes-active-filters">{conditions.map((condition) => <button key={condition.key} type="button" title={condition.label} aria-label={"取消" + condition.label} onClick={condition.clear}><span>{condition.label}</span><X className="size-3.5 shrink-0" aria-hidden="true" /></button>)}<Button variant="ghost" type="button" onClick={() => setFilters({ ...emptyMistakeFilters })}>清除过滤</Button></div>}
    {error && <p role="alert" className="mt-4 text-sm text-destructive">{error}</p>}
    {visible.length === 0 ? <section className="mt-8 grid min-h-72 place-items-center rounded-2xl border border-dashed p-6 text-center"><div><BookOpenCheck aria-hidden="true" className="mx-auto size-8 text-muted-foreground" /><h2 className="mt-4 font-medium">{mistakes.length ? "没有符合筛选条件的错题" : "错题集还是空的"}</h2><p className="mt-2 text-sm text-muted-foreground">{mistakes.length ? "调整搜索或过滤条件，其他错题仍保留在错题集中。" : "在答疑工作台完成解析后，记录错误原因并收藏。"}</p>{mistakes.length ? <Button type="button" variant="outline" className="mt-5" onClick={() => setFilters({ ...emptyMistakeFilters })}>清除过滤</Button> : <Button asChild className="mt-5"><a href="/solve?example=example-quadratic">查看示例题</a></Button>}</div></section>
      : <section className="mistakes-grid" aria-label="错题列表">{visible.map((item) => <MistakeCard key={item.id} item={item} onOpen={open} onDelete={askDelete} onMastery={(id, mastery) => update(id, { mastery })} />)}</section>}

    <Dialog open={!!selected} onOpenChange={(open) => { if (!open) setSelectedId(null); }}>
      <DialogContent showCloseButton={false} className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-3xl" onCloseAutoFocus={(event) => { event.preventDefault(); restoreFocus(returnFocus.current); }}>
        <DialogHeader className="pr-10"><DialogTitle>错题详情</DialogTitle><DialogDescription>{selected?.subject} · 完整题目与已保存的复习记录</DialogDescription></DialogHeader>
        <DialogClose asChild><button type="button" aria-label="关闭错题详情" className="absolute right-3 top-3 grid size-11 place-items-center rounded-lg hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"><X aria-hidden="true" className="size-5" /></button></DialogClose>
        {selected && <MistakeDetails key={selected.id} item={selected} draft={drafts.get(selected.id)} onDraft={(id, draft) => setDrafts((previous) => { const next = new Map(previous); if (draft) next.set(id, draft); else next.delete(id); return next; })} onUpdate={update} onDelete={askDelete} />}
      </DialogContent>
    </Dialog>
    <AlertDialog open={!!deleting} onOpenChange={(open) => { if (!open) setDeleteId(null); }}>
      <AlertDialogContent onCloseAutoFocus={(event) => { event.preventDefault(); restoreFocus(deleteReturnFocus.current); }}>
        <AlertDialogHeader><AlertDialogTitle>删除这道错题？</AlertDialogTitle><AlertDialogDescription>删除后无法恢复，相关学习报告统计也会更新。原题和其他错题不会被修改。</AlertDialogDescription></AlertDialogHeader>
        {deleting && <div className="max-h-32 overflow-y-auto text-sm leading-6"><MathText value={deleting.question} /></div>}
        {deleteError && <p role="alert" className="text-sm text-destructive">{deleteError}</p>}
        <AlertDialogFooter><AlertDialogCancel>取消</AlertDialogCancel><AlertDialogAction variant="destructive" onClick={(event) => {
          if (!deleting) return;
          try { removeMistake(deleting.id); if (selectedId === deleting.id) setSelectedId(null); setDeleteId(null); toast.success("错题已删除"); }
          catch { event.preventDefault(); setDeleteError("删除失败，原有记录未改动。请检查存储权限后重试。"); }
        }}>确认删除</AlertDialogAction></AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </main>;
}

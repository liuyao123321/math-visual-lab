"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { BookOpenCheck, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { Mastery } from "@/lib/math-schema";
import { masteryLabels, useMathLabStore } from "@/lib/store";

export function MistakesView() {
  const mistakes = useMathLabStore((state) => state.mistakes);
  const updateMistake = useMathLabStore((state) => state.updateMistake);
  const removeMistake = useMathLabStore((state) => state.removeMistake);
  const [query, setQuery] = useState("");
  const [subject, setSubject] = useState("all");
  const [mastery, setMastery] = useState("all");
  const subjects = [...new Set(mistakes.map((item) => item.subject))];
  const filtered = useMemo(() => mistakes.filter((item) => {
    const text = [item.question, item.questionType, ...item.topics, item.note].join(" ").toLowerCase();
    return text.includes(query.toLowerCase()) && (subject === "all" || item.subject === subject) && (mastery === "all" || item.mastery === mastery);
  }), [mistakes, query, subject, mastery]);

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 lg:px-8">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div><p className="text-sm font-medium text-amber-600 dark:text-amber-300">错题复习</p><h1 className="mt-1 text-3xl font-semibold tracking-tight">不是存起来，而是学会它</h1><p className="mt-2 text-sm text-muted-foreground">记录错误原因，重复练习，并逐步标记掌握状态。</p></div>
        <Button asChild><Link href="/solve">继续做题</Link></Button>
      </div>

      <section className="laboratory-panel mt-7 p-4">
        <div className="grid gap-3 md:grid-cols-[1fr_190px_190px]">
          <label className="relative"><Search className="absolute left-3 top-3 size-4 text-muted-foreground" /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索题目、知识点或笔记" className="pl-9" /></label>
          <Select value={subject} onValueChange={setSubject}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">全部课程</SelectItem>{subjects.map((item) => <SelectItem value={item} key={item}>{item}</SelectItem>)}</SelectContent></Select>
          <Select value={mastery} onValueChange={setMastery}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">全部状态</SelectItem>{Object.entries(masteryLabels).map(([value, label]) => <SelectItem value={value} key={value}>{label}</SelectItem>)}</SelectContent></Select>
        </div>
      </section>

      {filtered.length === 0 ? <section className="mt-8 grid min-h-80 place-items-center rounded-2xl border border-dashed border-border text-center"><div><BookOpenCheck className="mx-auto size-10 text-muted-foreground/50" /><h2 className="mt-4 font-semibold">{mistakes.length ? "没有符合筛选条件的错题" : "错题集还是空的"}</h2><p className="mt-2 text-sm text-muted-foreground">{mistakes.length ? "尝试调整搜索词或筛选条件。" : "在答疑工作台完成解析后，记录错误原因并收藏。"}</p>{!mistakes.length && <Button asChild className="mt-5"><Link href="/solve?example=example-quadratic">查看示例题</Link></Button>}</div></section> :
      <section className="mt-6 grid gap-4 md:grid-cols-2">{filtered.map((item) => <article key={item.id} className="laboratory-panel flex flex-col p-5">
        <div className="flex items-start justify-between gap-3"><div className="flex flex-wrap gap-2"><Badge variant="secondary">{item.subject}</Badge><Badge variant="outline">{item.questionType}</Badge><Badge variant="outline">{item.difficulty}</Badge></div><AlertDialog><AlertDialogTrigger asChild><Button variant="ghost" size="icon-sm" aria-label="删除错题"><Trash2 /></Button></AlertDialogTrigger><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>删除这道错题？</AlertDialogTitle><AlertDialogDescription>删除后无法恢复，相关学习报告统计也会更新。</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>取消</AlertDialogCancel><AlertDialogAction variant="destructive" onClick={() => { removeMistake(item.id); toast.success("错题已删除"); }}>删除</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog></div>
        <h2 className="mt-4 line-clamp-2 font-semibold leading-7">{item.question}</h2>
        <div className="mt-3 flex flex-wrap gap-1.5">{item.topics.map((topic) => <span key={topic} className="rounded-md bg-cyan-500/8 px-2 py-1 text-xs text-cyan-700 dark:text-cyan-300">{topic}</span>)}</div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2"><div><p className="mb-1.5 text-xs text-muted-foreground">错误原因</p><Input value={item.errorReason} onChange={(event) => updateMistake(item.id, { errorReason: event.target.value })} /></div><div><p className="mb-1.5 text-xs text-muted-foreground">掌握状态</p><Select value={item.mastery} onValueChange={(value) => updateMistake(item.id, { mastery: value as Mastery })}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent>{Object.entries(masteryLabels).map(([value, label]) => <SelectItem value={value} key={value}>{label}</SelectItem>)}</SelectContent></Select></div></div>
        <div className="mt-3"><p className="mb-1.5 text-xs text-muted-foreground">复习笔记</p><Textarea value={item.note} onChange={(event) => updateMistake(item.id, { note: event.target.value })} placeholder="记录新的理解…" className="min-h-20" /></div>
        <div className="mt-auto flex items-center justify-between border-t pt-4 text-xs text-muted-foreground"><span>已复习 {item.attempts} 次</span><Button asChild size="sm"><Link href={"/solve?mistake=" + item.id}>再次练习</Link></Button></div>
      </article>)}</section>}
    </main>
  );
}

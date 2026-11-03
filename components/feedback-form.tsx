"use client";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Check, Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { feedbackCategories, feedbackSchema, pagePaths } from "@/lib/operations/schema";
const pages = { "/": "首页", "/solve": "智能答疑", "/knowledge": "课程知识检索", "/mistakes": "错题集", "/report": "学习报告", "/practice": "专项模拟", "/settings": "设置", "/feedback": "反馈页 / 不确定" };
export function FeedbackForm() {
  const [category, setCategory] = useState<keyof typeof feedbackCategories>("bug");
  const [title, setTitle] = useState(""); const [description, setDescription] = useState("");
  const [steps, setSteps] = useState(""); const [contact, setContact] = useState(""); const [page, setPage] = useState("/feedback");
  const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const [receipt, setReceipt] = useState("");
  const submission = useRef({ content: "", id: "" }); const request = useRef<AbortController | null>(null);
  useEffect(() => { try { const from = new URL(document.referrer); if (from.origin === location.origin && pagePaths.includes(from.pathname as typeof pagePaths[number])) setPage(from.pathname); } catch { /* Direct visit. */ } return () => request.current?.abort(); }, []);
  async function submit(event: React.FormEvent) {
    event.preventDefault(); if (busy) return;
    const content = { category, title, description, steps, contact, page }; const serialized = JSON.stringify(content);
    if (submission.current.content !== serialized) submission.current = { content: serialized, id: crypto.randomUUID() };
    const payload = { ...content, submissionId: submission.current.id };
    if (!feedbackSchema.safeParse(payload).success) { setError("请填写4至100字标题和10至4000字的问题描述，并检查字段长度。"); return; }
    const controller = new AbortController(); request.current = controller; setBusy(true); setError("");
    try { const response = await fetch("/api/feedback", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload), signal: controller.signal }); const result = await response.json() as { id?: string; message?: string }; if (!response.ok) throw new Error(result.message || "提交失败，请稍后重试。"); if (typeof result.id !== "string") throw new Error("暂时无法确认反馈是否保存，请保留内容并重试。"); if (!controller.signal.aborted) setReceipt(result.id); }
    catch (cause) { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "连接失败，请稍后重试。填写内容仍保留。"); }
    finally { if (!controller.signal.aborted) setBusy(false); }
  }
  return <main className="mx-auto max-w-3xl px-4 py-8 lg:px-8"><a href="/settings" className="mb-7 inline-flex min-h-11 items-center gap-2 text-sm text-muted-foreground"><ArrowLeft className="size-4" />返回设置</a><h1 className="text-3xl font-semibold tracking-tight">把遇到的问题告诉我们</h1><p className="mt-3 max-w-xl leading-7 text-muted-foreground">功能异常、解题疑问或新的想法，都可以在这里反馈。项目维护者会在后台查看并处理。</p>
    {receipt ? <section className="laboratory-panel mt-8 p-6" aria-label="反馈提交成功"><Check className="mb-4 size-8 text-emerald-600" /><h2 className="text-xl font-semibold">反馈已收到</h2><p className="mt-3 leading-7">感谢你帮助改进知数实验室。请保留反馈编号，方便后续联系维护者。</p><p className="mt-4 break-all rounded-lg bg-muted p-3 text-sm" aria-label="反馈编号">{receipt}</p><p className="mt-3 text-sm text-muted-foreground">联系方式仅供维护者查看，系统不会自动发送邮件。</p><Button className="mt-6" onClick={() => { setReceipt(""); setTitle(""); setDescription(""); setSteps(""); setContact(""); submission.current = { content: "", id: "" }; }}>继续提交其他反馈</Button></section>
      : <form onSubmit={submit} className="laboratory-panel mt-8 space-y-6 p-5 sm:p-7"><fieldset disabled={busy} className="space-y-6">
        <div className="grid gap-5 sm:grid-cols-2"><label className="block text-sm font-medium">问题类型<select aria-label="问题类型" className="mt-2 min-h-11 w-full rounded-md border bg-background px-3" value={category} onChange={(event) => setCategory(event.target.value as keyof typeof feedbackCategories)}>{Object.entries(feedbackCategories).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label className="block text-sm font-medium">问题出现的位置<select aria-label="问题出现的位置" className="mt-2 min-h-11 w-full rounded-md border bg-background px-3" value={page} onChange={(event) => setPage(event.target.value)}>{Object.entries(pages).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label></div>
        <label className="block text-sm font-medium">标题 · 4–100字<Input className="mt-2" aria-label="反馈标题" minLength={4} maxLength={100} required value={title} onChange={(event) => setTitle(event.target.value)} placeholder="例如：修改切点后，图像没有同步变化" /></label>
        <label className="block text-sm font-medium">问题描述 · 10–4000字<Textarea className="mt-2 min-h-36" aria-label="问题描述" minLength={10} maxLength={4000} required value={description} onChange={(event) => setDescription(event.target.value)} placeholder="你原本希望看到什么？实际发生了什么？" /></label>
        <label className="block text-sm font-medium">复现步骤 · 选填<Textarea className="mt-2 min-h-24" aria-label="复现步骤" maxLength={1500} value={steps} onChange={(event) => setSteps(event.target.value)} placeholder="例如：进入智能答疑 → 打开导数示例 → 拖动切点滑块" /></label>
        <label className="block text-sm font-medium">联系方式 · 选填<Input className="mt-2" aria-label="联系方式" maxLength={120} value={contact} onChange={(event) => setContact(event.target.value)} placeholder="邮箱或其他联系方式，可留空匿名提交" /></label>
      </fieldset><p className="text-sm leading-6 text-muted-foreground">只会提交你在此填写的内容，不自动附带题目、照片或个人教材。反馈保存在网站后台，请勿填写密码或 API 密钥。</p>{error && <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}<Button type="submit" disabled={busy} className="min-h-11 w-full sm:w-auto">{busy ? <Loader2 className="animate-spin" /> : <Send />}{busy ? "正在提交" : "提交反馈"}</Button></form>}
  </main>;
}

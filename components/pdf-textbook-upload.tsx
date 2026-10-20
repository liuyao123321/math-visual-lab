"use client";

import { useEffect, useRef, useState } from "react";
import { Upload, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { extractTextbookPdf } from "@/lib/pdf-textbook-import";
import { savePersonalBook, type PersonalBook } from "@/lib/personal-library";

export function PdfTextbookUpload({ onSaved }: { onSaved: (book: PersonalBook) => void }) {
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [subject, setSubject] = useState<PersonalBook["subject"]>("高等数学");
  const [from, setFrom] = useState("1"), [to, setTo] = useState("");
  const [draft, setDraft] = useState<Awaited<ReturnType<typeof extractTextbookPdf>> | null>(null);
  const [confirmed, setConfirmed] = useState(false), [allowAiUse, setAllowAiUse] = useState(false);
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [notice, setNotice] = useState("");
  const input = useRef<HTMLInputElement>(null), sequence = useRef(0);
  const extraction = useRef<AbortController | null>(null);
  useEffect(() => () => { sequence.current++; extraction.current?.abort(); }, []);
  function invalidate() { sequence.current++; extraction.current?.abort(); setBusy(false); setDraft(null); setConfirmed(false); setError(""); setNotice(""); }
  async function extract() {
    if (!file || busy) return;
    const first = Number(from), last = to.trim() ? Number(to) : undefined;
    if (!Number.isInteger(first) || first < 1 || (last !== undefined && (!Number.isInteger(last) || last < first || last - first >= 30))) { setError("请输入有效页码范围，每次最多30页。"); return; }
    const ticket = ++sequence.current; setBusy(true); setError(""); setDraft(null); setConfirmed(false);
    extraction.current?.abort(); const controller = new AbortController(); extraction.current = controller;
    try { const next = await extractTextbookPdf(file, first, last, controller.signal); if (ticket === sequence.current) setDraft(next); }
    catch (caught) { if (ticket === sequence.current) setError(caught instanceof Error ? caught.message : "PDF提取失败，请重新选择。"); }
    finally { if (ticket === sequence.current) setBusy(false); }
  }
  function save() {
    if (!file || !draft || !confirmed) return;
    try {
      const book = savePersonalBook({ id: "local-pdf-" + crypto.randomUUID(), title: title.trim(), fileName: file.name,
        fingerprint: draft.fingerprint, subject, createdAt: new Date().toISOString(), allowAiUse, pages: draft.pages });
      setDraft(null); setFile(null); setConfirmed(false); setAllowAiUse(false); setError(""); setNotice("已保存为个人教材，可在上方选择并检索。原PDF文件未保存。");
      if (input.current) input.current.value = "";
      onSaved(book);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "保存失败，预览文字已保留。"); }
  }
  return <section aria-label="上传PDF教材" className="mt-4">
    <Button type="button" variant="outline" aria-expanded={open} onClick={() => setOpen(!open)}><Upload />上传 PDF 教材</Button>
    {open && <div className="mt-3 space-y-4 rounded-xl border bg-card p-4 sm:p-5">
      <p className="text-sm leading-6 text-muted-foreground">支持可选中文字的PDF，最大20 MB，每次最多30页、150000字符，最多保存5份章节。扫描版暂不支持OCR。PDF提取和个人教材检索在本机浏览器完成，无需密钥；仅保存你核对后的文字、文件名及PDF页码，不保存原PDF，不修改公共知识库。</p>
      <label className="block space-y-2 text-sm">选择 PDF 文件<Input ref={input} type="file" accept=".pdf,application/pdf" aria-label="选择PDF教材文件" onChange={(event) => { invalidate(); const next = event.target.files?.[0] ?? null; setFile(next); setTitle(next?.name.replace(/\.pdf$/i, "") ?? ""); setAllowAiUse(false); }} /></label>
      <div className="grid gap-3 sm:grid-cols-2"><label className="space-y-2 text-sm">起始PDF页码<Input aria-label="起始PDF页码" type="number" min="1" step="1" value={from} onChange={(event) => { invalidate(); setFrom(event.target.value); }} /></label><label className="space-y-2 text-sm">结束PDF页码（可空，最多向后30页）<Input aria-label="结束PDF页码" type="number" min="1" step="1" value={to} onChange={(event) => { invalidate(); setTo(event.target.value); }} /></label></div>
      <Button type="button" disabled={!file || busy} onClick={() => void extract()}>{busy ? <Loader2 className="animate-spin" /> : <Upload />}{busy ? "正在本地提取…" : "提取并预览文字"}</Button>
      {busy && <Button variant="ghost" onClick={invalidate}>取消本次提取</Button>}
      {draft && <div className="space-y-4 border-t pt-4">
        <p role="status" className="text-sm">原PDF共{draft.totalPages}页，已提取{draft.pages.length}页。请对照原PDF核对公式、上下标、分式及顺序；发现错误请在下方编辑。页码指文件页序，不一定等于印刷页码。预览尚未保存，离开页面会丢失本次草稿。</p>
        <label className="block space-y-2 text-sm">教材名称<Input aria-label="个人教材名称" value={title} maxLength={180} onChange={(event) => { setTitle(event.target.value); setConfirmed(false); }} /></label>
        <label className="block space-y-2 text-sm">课程<select aria-label="个人教材课程" value={subject} onChange={(event) => setSubject(event.target.value as PersonalBook["subject"])} className="h-10 w-full rounded-lg border bg-background px-3">{["高等数学", "线性代数", "概率统计", "其他"].map((item) => <option key={item}>{item}</option>)}</select></label>
        <p className="text-sm text-amber-800 dark:text-amber-200">PDF文本提取不是数学公式识别或正确性审核；无法核对的页请勿保存。</p>
        {draft.warnings.map((warning) => <p key={warning} className="text-sm text-amber-800 dark:text-amber-200">{warning}</p>)}
        {draft.pages.map((page, index) => <details key={page.pageNumber} className="rounded-lg border p-3" open={index === 0}><summary className="cursor-pointer text-sm font-medium">PDF第{page.pageNumber}页 · {page.text.length}字符</summary><Textarea className="mt-3 min-h-48" aria-label={`PDF第${page.pageNumber}页提取文字`} value={page.text} maxLength={12000} spellCheck={false} onChange={(event) => { setConfirmed(false); setDraft({ ...draft, pages: draft.pages.map((item, position) => position === index ? { ...item, text: event.target.value } : item) }); }} /><Button className="mt-2" size="sm" variant="ghost" disabled={draft.pages.length <= 1} onClick={() => { setConfirmed(false); setDraft({ ...draft, pages: draft.pages.filter((_, position) => position !== index) }); }}>不收录此页</Button></details>)}
        <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />我有权使用该资料，已核对选中页面的文字和公式，并避免包含姓名、学号等隐私。</label>
        <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={allowAiUse} onChange={(event) => setAllowAiUse(event.target.checked)} />允许用于AI答疑：启用知识库辅助且文字题匹配时，将最多4段相关摘录（每段最多1200字符）经本站代理发送给现有DeepSeek服务；不发送整本教材或原PDF。默认不启用，扫描识别不在此功能范围。</label>
        <Button type="button" onClick={save} disabled={!confirmed || !title.trim() || !draft.pages.length || draft.pages.some((page) => page.text.trim().length < 20)}>确认并加入个人教材</Button>
      </div>}
    </div>}
    {error && <p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}
    {notice && <p role="status" className="mt-3 text-sm text-emerald-700 dark:text-emerald-300">{notice}</p>}
  </section>;
}

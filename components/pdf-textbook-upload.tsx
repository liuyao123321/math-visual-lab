"use client";

import { useEffect, useRef, useState } from "react";
import { Upload, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { extractTextbookPdf, type PdfExtractionProgress } from "@/lib/pdf-textbook-import";
import { PDF_PREVIEW_PAGE_SIZE, PDF_TEXTBOOK_MAX_BYTES, PDF_TEXTBOOK_MAX_PAGE_CHARS } from "@/lib/pdf-textbook-limits";
import { savePersonalBook, type PersonalBook } from "@/lib/personal-library";
import { suggestTextbookCards, type TextbookCardDraft } from "@/lib/textbook-cards";
import { TextbookCardReview } from "@/components/textbook-card-review";

export function PdfTextbookUpload({ onSaved }: { onSaved: (book: PersonalBook) => void }) {
  const [open, setOpen] = useState(false);
  const [ocr, setOcr] = useState(true);
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [subject, setSubject] = useState<PersonalBook["subject"]>("高等数学");
  const [from, setFrom] = useState("1"), [to, setTo] = useState("");
  const [draft, setDraft] = useState<Awaited<ReturnType<typeof extractTextbookPdf>> | null>(null);
  const [cards, setCards] = useState<TextbookCardDraft[] | null>(null);
  const [confirmed, setConfirmed] = useState(false), [allowAiUse, setAllowAiUse] = useState(false);
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [notice, setNotice] = useState("");
  const [progress, setProgress] = useState<PdfExtractionProgress | null>(null);
  const [previewBatch, setPreviewBatch] = useState(0);
  const batchCount = Math.ceil((draft?.pages.length ?? 0) / PDF_PREVIEW_PAGE_SIZE);
  const currentBatch = Math.min(previewBatch, Math.max(0, batchCount - 1));
  const previewStart = currentBatch * PDF_PREVIEW_PAGE_SIZE;
  const input = useRef<HTMLInputElement>(null), sequence = useRef(0);
  const extraction = useRef<AbortController | null>(null);
  useEffect(() => () => { sequence.current++; extraction.current?.abort(); }, []);
  function invalidate() { sequence.current++; extraction.current?.abort(); setBusy(false); setDraft(null); setCards(null); setConfirmed(false); setError(""); setNotice(""); setProgress(null); setPreviewBatch(0); }
  async function extract() {
    if (!file || busy) return;
    const first = Number(from), last = to.trim() ? Number(to) : undefined;
    if (!Number.isSafeInteger(first) || first < 1 || (last !== undefined && (!Number.isSafeInteger(last) || last < first))) { setError("请输入有效的起止PDF页码。"); return; }
    if (file.size > PDF_TEXTBOOK_MAX_BYTES) { setError("PDF不能超过100 MB，请压缩文件或按章节拆分。"); return; }
    const ticket = ++sequence.current; setBusy(true); setError(""); setNotice(""); setDraft(null); setCards(null); setConfirmed(false); setProgress(null); setPreviewBatch(0);
    extraction.current?.abort(); const controller = new AbortController(); extraction.current = controller;
    try { const next = await extractTextbookPdf(file, first, last, controller.signal, (nextProgress) => { if (ticket === sequence.current) setProgress(nextProgress); }, { ocr }); if (ticket === sequence.current) setDraft(next); }
    catch (caught) { if (ticket === sequence.current) setError(caught instanceof Error ? caught.message : "PDF提取失败，请重新选择。"); }
    finally { if (ticket === sequence.current) setBusy(false); }
  }
  function save() {
    const approved = cards?.flatMap((card) => card.reviewed ? [card.reviewed] : []) ?? [];
    if (!file || !draft || !confirmed || !approved.length) return;
    try {
      const book = savePersonalBook({ id: "local-pdf-" + crypto.randomUUID(), title: title.trim(), fileName: file.name,
        fingerprint: draft.fingerprint, subject, createdAt: new Date().toISOString(), allowAiUse, pages: draft.pages, cards: approved });
      setDraft(null); setCards(null); setFile(null); setConfirmed(false); setAllowAiUse(false); setError(""); setNotice(`已保存为个人教材 · ${approved.length} 张核对卡片可检索。原PDF文件未保存。`);
      if (input.current) input.current.value = "";
      onSaved(book);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "保存失败，预览文字已保留。"); }
  }
  return <section aria-label="上传PDF教材" className="mt-4">
    <Button type="button" variant="outline" aria-expanded={open} onClick={() => setOpen(!open)}><Upload />上传 PDF 教材</Button>
    {open && <div className="mt-3 space-y-4 rounded-xl border bg-card p-4 sm:p-5">
      <p className="text-xs leading-5 text-muted-foreground">文字版 / 扫描版 PDF · ≤100 MB · 最多5份<br />本机提取，不存原文件；单份文字≤150万字符，教材库总容量≤180万字符（含元数据）。扫描页OCR速度较慢，建议先选择正文5—10页试读，再分章节导入；数学公式需人工核对。</p>
      <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={ocr} onChange={(event) => { invalidate(); setOcr(event.target.checked); }} />扫描页本机OCR：无文字层时自动识别中英文。首次加载本站识别模型，页面图片不上传，不调用付费AI。</label>
      <label className="block space-y-2 text-sm">选择 PDF 文件<Input ref={input} type="file" accept=".pdf,application/pdf" aria-label="选择PDF教材文件" onChange={(event) => { invalidate(); const next = event.target.files?.[0] ?? null; setFile(next); setTitle(next?.name.replace(/\.pdf$/i, "") ?? ""); setAllowAiUse(false); }} /></label>
      <div className="grid gap-3 sm:grid-cols-2"><label className="space-y-2 text-sm">起始PDF页码<Input aria-label="起始PDF页码" type="number" min="1" step="1" value={from} onChange={(event) => { invalidate(); setFrom(event.target.value); }} /></label><label className="space-y-2 text-sm">结束PDF页码（留空读到最后一页）<Input aria-label="结束PDF页码" type="number" min="1" step="1" value={to} onChange={(event) => { invalidate(); setTo(event.target.value); }} /></label></div>
      <Button type="button" disabled={!file || busy} onClick={() => void extract()}>{busy ? <Loader2 className="animate-spin" /> : <Upload />}{busy ? "正在本地提取…" : "提取并预览文字"}</Button>
      {busy && <Button variant="ghost" onClick={invalidate}>取消本次提取</Button>}
      {busy && progress && <div className="space-y-1"><progress aria-label="PDF提取进度" className="h-2 w-full accent-primary" max={progress.requestedPages} value={progress.processedPages} /><p role="status" className="text-xs text-muted-foreground">已处理 {progress.processedPages}/{progress.requestedPages} 页 · 当前PDF第{progress.currentPage}页，共{progress.totalPages}页{progress.stage === "ocr" ? " · 正在本机扫描识别（首次加载模型可能需要较长时间）" : ""}</p></div>}
      {draft && <div className="space-y-4 border-t pt-4">
        <p role="status" className="text-sm">原PDF共{draft.totalPages}页，已提取{draft.pages.length}页。请对照原PDF核对公式、上下标、分式及顺序；发现错误请在下方编辑。页码指文件页序，不一定等于印刷页码。预览尚未保存，离开页面会丢失本次草稿。</p>
        <label className="block space-y-2 text-sm">教材名称<Input aria-label="个人教材名称" value={title} maxLength={180} onChange={(event) => { setTitle(event.target.value); setConfirmed(false); }} /></label>
        <label className="block space-y-2 text-sm">课程<select aria-label="个人教材课程" value={subject} onChange={(event) => setSubject(event.target.value as PersonalBook["subject"])} className="h-10 w-full rounded-lg border bg-background px-3">{["高等数学", "线性代数", "概率统计", "其他"].map((item) => <option key={item}>{item}</option>)}</select></label>
        <p className="text-sm text-amber-800 dark:text-amber-200">PDF文本提取不是数学公式识别或正确性审核；无法核对的页请勿保存。</p>
        {draft.warnings.map((warning) => <p key={warning} className="text-sm text-amber-800 dark:text-amber-200">{warning}</p>)}
        {draft.pages.slice(previewStart, previewStart + PDF_PREVIEW_PAGE_SIZE).map((page, index) => <details key={page.pageNumber} className="rounded-lg border p-3" open={index === 0}><summary className="cursor-pointer text-sm font-medium">PDF第{page.pageNumber}页 · {page.text.length}字符</summary><Textarea className="mt-3 min-h-48" aria-label={`PDF第${page.pageNumber}页提取文字`} value={page.text} maxLength={PDF_TEXTBOOK_MAX_PAGE_CHARS} spellCheck={false} onChange={(event) => { setConfirmed(false); setCards(null); setDraft({ ...draft, pages: draft.pages.map((item, position) => position === previewStart + index ? { ...item, text: event.target.value } : item) }); }} /><Button className="mt-2" size="sm" variant="ghost" disabled={draft.pages.length <= 1} onClick={() => { setConfirmed(false); setCards(null); setDraft({ ...draft, pages: draft.pages.filter((_, position) => position !== previewStart + index) }); }}>不收录此页</Button></details>)}
        {batchCount > 1 && <nav aria-label="PDF预览分页" className="flex flex-wrap items-center justify-between gap-2"><Button type="button" variant="outline" size="sm" disabled={currentBatch === 0} onClick={() => setPreviewBatch(currentBatch - 1)}>上一组页面</Button><span role="status" className="text-xs text-muted-foreground">预览第{currentBatch + 1}/{batchCount}组 · 每组最多{PDF_PREVIEW_PAGE_SIZE}页，保存包含全部{draft.pages.length}页</span><Button type="button" variant="outline" size="sm" disabled={currentBatch + 1 >= batchCount} onClick={() => setPreviewBatch(currentBatch + 1)}>下一组页面</Button></nav>}
        <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />我有权使用该资料，已核对选中页面的文字和公式，并避免包含姓名、学号等隐私。</label>
        <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={allowAiUse} onChange={(event) => setAllowAiUse(event.target.checked)} />允许用于AI答疑：启用知识库辅助且文字题匹配时，将最多4段相关摘录（每段最多1200字符）经本站代理发送给现有DeepSeek服务；不发送整本教材或原PDF。默认不启用，本机OCR不需要此权限。</label>
        {!cards ? <Button type="button" variant="outline" onClick={() => { try { setCards(suggestTextbookCards(draft.pages)); setError(""); } catch (caught) { setError(caught instanceof Error ? caught.message : "分类失败。"); } }}>生成分类建议</Button> :
          <TextbookCardReview cards={cards} file={file} onChange={setCards} />}
        <Button type="button" onClick={save} disabled={!confirmed || !title.trim() || !cards?.some((card) => card.reviewed) || draft.pages.some((page) => page.text.trim().length < 20)}>确认并加入个人教材</Button>
        {cards && <p className="text-xs text-muted-foreground">保存后仅检索通过的卡片；待核对与略过的内容不会作为证据。编辑或排除原始页面会重置本次卡片审核。</p>}
      </div>}
    </div>}
    {error && <p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}
    {notice && <p role="status" className="mt-3 text-sm text-emerald-700 dark:text-emerald-300">{notice}</p>}
  </section>;
}

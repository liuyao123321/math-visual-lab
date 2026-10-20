"use client";

import { useEffect, useRef, useState } from "react";
import { BookOpen, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { MathInputPreview } from "@/components/math-input-preview";
import { KnowledgeEvidence } from "@/components/knowledge-evidence";
import { ragSnapshotSchema, type RagSnapshot } from "@/lib/rag/schema";
import { textbookCatalog, readTextbookSelection, writeTextbookSelection } from "@/lib/textbooks";
import { PdfTextbookUpload } from "@/components/pdf-textbook-upload";
import { readPersonalLibrary, PERSONAL_LIBRARY_EVENT, PERSONAL_LIBRARY_KEY, removePersonalBook, searchPersonalExcerpts, mergePersonalEvidence, emptyPersonalSnapshot, type PersonalBook } from "@/lib/personal-library";

export function KnowledgeSearch() {
  const [query, setQuery] = useState("");
  const [textbookId, setTextbookId] = useState("all");
  const [ready, setReady] = useState(false);
  const [result, setResult] = useState<RagSnapshot | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [storageError, setStorageError] = useState(false);
  const [books, setBooks] = useState<PersonalBook[]>([]);
  const [libraryError, setLibraryError] = useState("");
  const requestId = useRef(0);
  const activeRequest = useRef<AbortController | null>(null);
  useEffect(() => {
    const reload = () => { const state = readPersonalLibrary(); setBooks(state.books); setLibraryError(state.error); reset(); setTextbookId(readTextbookSelection()); };
    reload(); setReady(true);
    const sync = (event: StorageEvent) => { if (event.key === null || event.key === "mathlab.textbook-selection.v1" || event.key === PERSONAL_LIBRARY_KEY) reload(); };
    window.addEventListener("storage", sync);
    window.addEventListener(PERSONAL_LIBRARY_EVENT, reload);
    return () => { requestId.current++; activeRequest.current?.abort(); window.removeEventListener("storage", sync); window.removeEventListener(PERSONAL_LIBRARY_EVENT, reload); };
  }, []);
  function reset() {
    requestId.current++; activeRequest.current?.abort();
    setBusy(false); setResult(null); setError("");
  }
  function selectTextbook(value: string) {
    reset(); setTextbookId(value); setStorageError(!writeTextbookSelection(value));
  }
  async function search(event: React.FormEvent) {
    event.preventDefault();
    if (busy || !ready || query.trim().length < 2) return;
    const id = ++requestId.current;
    activeRequest.current?.abort();
    setBusy(true); setError(""); setResult(null);
    const controller = new AbortController();
    activeRequest.current = controller;
    const timer = setTimeout(() => controller.abort(), 6000);
    try {
      const localOnly = textbookId.startsWith("local-pdf-");
      const excerpts = searchPersonalExcerpts(query.trim(), books, textbookId);
      let base = emptyPersonalSnapshot(localOnly ? [textbookId] : undefined);
      let publicUnavailable = false;
      if (!localOnly) {
        try {
          const response = await fetch("/api/knowledge", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query: query.trim(), ...(textbookId !== "all" ? { textbookIds: [textbookId] } : {}) }), signal: controller.signal });
          const payload = await response.json() as { message?: string; data?: unknown };
          if (!response.ok) throw new Error(payload.message ?? "知识检索失败。");
          base = ragSnapshotSchema.parse(payload.data);
        } catch (caught) { if (!excerpts.length) throw caught; publicUnavailable = true; }
      }
      const parsed = ragSnapshotSchema.parse(mergePersonalEvidence(base, query.trim(), excerpts, textbookId !== "all" ? [textbookId] : undefined));
      if (publicUnavailable) parsed.message = "公共课程检索暂不可用，以下仅为本机个人PDF的文本检索结果；请核对原页。";
      if (id === requestId.current) setResult(parsed);
    } catch (caught) { if (id === requestId.current) setError(caught instanceof Error && caught.name === "AbortError" ? "检索超时，请稍后重试。" : "检索失败，请重试。"); }
    finally { clearTimeout(timer); if (id === requestId.current) setBusy(false); }
  }
  function manage(operation: () => void) { try { operation(); setError(""); } catch (caught) { setError(caught instanceof Error ? caught.message : "操作失败，原数据未改动。"); } }
  return <main className="mx-auto max-w-4xl px-4 py-6 sm:py-8">
    <h1 className="mb-2 flex items-center gap-2 text-2xl font-semibold"><BookOpen className="size-6 text-primary" />课程知识检索</h1>
    <p className="mb-5 text-sm leading-6 text-muted-foreground">选择教材，查找概念、定理和适用条件。只检索已收录资料，不调用解题 AI，无需密钥。</p>
    <form aria-label="教材知识检索" onSubmit={search} className="space-y-4 rounded-2xl border bg-card p-4 sm:p-6" aria-busy={busy}>
      <label className="block space-y-2"><span className="text-sm font-medium">检索教材</span>
        <select aria-label="检索教材" value={textbookId} disabled={!ready} onChange={(event) => selectTextbook(event.target.value)} className="h-11 w-full rounded-lg border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <option value="all">全部已收录教材</option>
          {textbookCatalog.textbooks.map((book) => <option key={book.id} value={book.id} disabled={book.status !== "available"}>{book.title}{book.status !== "available" ? "（待收录）" : ""}</option>)}
          {books.map((book) => <option key={book.id} value={book.id}>{book.title}（个人PDF）</option>)}
        </select>
      </label>
      {storageError && <p role="alert" className="text-sm text-amber-800 dark:text-amber-200">浏览器无法保存教材偏好：当前检索仍按此选择进行，但无法同步到后续答疑。</p>}
      <label className="block space-y-2"><span className="text-sm font-medium">想查什么知识？</span><Textarea aria-label="检索课程知识的问题" placeholder="例如：导数为零的点一定是极值点吗？" value={query} maxLength={2000} onChange={(event) => { reset(); setQuery(event.target.value); }} className="min-h-28" /></label>
      <MathInputPreview value={query} />
      <div className="flex items-center justify-between gap-3"><span className="text-xs text-muted-foreground">{query.length}/2000</span><Button type="submit" disabled={!ready || busy || query.trim().length < 2}><Search />{busy ? "正在检索课程资料" : "检索教材依据"}</Button></div>
    </form>
    {error && <p role="alert" className="mt-4 rounded-xl border border-destructive/30 p-4 text-sm text-destructive">{error} 输入与教材选择已保留。</p>}
    {result && <KnowledgeEvidence rag={result} preview />}
    {libraryError && <p role="alert" className="mt-4 text-sm text-destructive">{libraryError}</p>}
    <PdfTextbookUpload onSaved={(book) => { setBooks(readPersonalLibrary().books); selectTextbook(book.id); }} />
    {books.length > 0 && <section aria-label="我的PDF教材" className="mt-5 space-y-4 rounded-xl border p-4"><h2 className="font-medium">我的PDF教材（仅当前浏览器）</h2>
      {books.map((book) => <div key={book.id} className="space-y-2 border-t pt-3"><p className="break-all text-sm font-medium">{book.title} · {book.pages.length}页</p><p className="break-all text-xs text-muted-foreground">{book.fileName} · 文字保存在本机，清除网站数据会丢失；原PDF请自行保管。</p>
        <Button type="button" variant="ghost" size="sm" onClick={() => { if (window.confirm(`确定移除“${book.title}”的本地文字吗？此操作不可撤销，原PDF和其他记录不会删除。`)) manage(() => removePersonalBook(book.id)); }}>移除这份个人教材</Button>
      </div>)}
    </section>}
    <details className="mt-5 rounded-xl border p-4 text-sm"><summary className="cursor-pointer font-medium">教材收录情况</summary>
      <ul className="mt-3 space-y-3">{textbookCatalog.textbooks.map((book) => <li key={book.id}><p className="font-medium">{book.title} · {book.status === "available" ? "部分章节已收录" : "待收录"}</p><p className="mt-1 text-xs leading-5 text-muted-foreground">{book.coverage}</p></li>)}</ul>
      <p className="mt-3 text-xs leading-5 text-muted-foreground">可上传PDF的选定章节作为个人教材；公共教材后续逐步添加。个人PDF仅文本检索，不会伪装成已审核课程知识卡或全书语义索引。</p>
    </details>
  </main>;
}

export type PdfPageText = { pageNumber: number; text: string };
export async function extractTextbookPdf(file: File, startPage = 1, endPage?: number, signal?: AbortSignal) {
  if (!file.name.toLowerCase().endsWith(".pdf") || (file.type && file.type !== "application/pdf")) throw new Error("请选择PDF文件。");
  if (file.size > 20 * 1024 * 1024) throw new Error("PDF不能超过20 MB，请按章节拆分。");
  if (file.name.length > 200) throw new Error("PDF文件名过长，请重命名后重试（最多200字符）。");
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (new TextDecoder().decode(bytes.slice(0, 5)) !== "%PDF-") throw new Error("文件不是有效PDF，不能只修改扩展名。");
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const fingerprint = [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join("");
  const pdfjs = await import("pdfjs-dist");
  if (signal?.aborted) throw new DOMException("已取消", "AbortError");
  pdfjs.GlobalWorkerOptions.workerSrc = "/vendor/pdf.worker.min.mjs";
  const loading = pdfjs.getDocument({ data: bytes, stopAtErrors: true });
  let timedOut = false;
  const abort = () => { void loading.destroy(); };
  signal?.addEventListener("abort", abort, { once: true });
  const timeout = setTimeout(() => { timedOut = true; void loading.destroy(); }, 30000);
  try {
    const pdf = await loading.promise;
    const last = endPage ?? Math.min(pdf.numPages, startPage + 29);
    if (!Number.isInteger(startPage) || !Number.isInteger(last) || startPage < 1 || last < startPage || last > pdf.numPages || last - startPage >= 30) throw new Error(`PDF共${pdf.numPages}页；请输入有效页码，每次最多提取30页。`);
    const pages: PdfPageText[] = [], warnings: string[] = [];
    let total = 0;
    for (let index = startPage; index <= last; index++) {
      if (signal?.aborted) throw new DOMException("已取消", "AbortError");
      const page = await pdf.getPage(index);
      try {
        const content = await page.getTextContent();
        const text = content.items.map((item) => "str" in item ? item.str + (item.hasEOL ? "\n" : " ") : "").join("").trim();
        if (text.length < 20) { warnings.push(`PDF第${index}页未提取到足够文字，可能是扫描页，未收录该页。`); continue; }
        if (text.length > 12000 || (total += text.length) > 150000) throw new Error("选中页面文字过多，请缩小页码范围后重试，不会静默截断。");
        if (text.includes("�")) warnings.push(`PDF第${index}页有无法解码字符，请核对或重新选择文字版PDF。`);
        pages.push({ pageNumber: index, text });
      } finally { page.cleanup(); }
    }
    if (!pages.length) throw new Error("未提取到可用文字。扫描版、图片PDF暂不支持自动入库，请使用可选中文字的PDF；不会自动调用OCR或付费模型。");
    if (startPage !== 1 || last !== pdf.numPages) warnings.push(`仅提取第${startPage}—${last}页，原文件共${pdf.numPages}页，其余页面未收录。`);
    return { pages, warnings, fingerprint, totalPages: pdf.numPages };
  } catch (error) {
    if (signal?.aborted) throw new DOMException("已取消", "AbortError");
    if (timedOut) throw new Error("PDF提取超时，请缩小页码范围或换用较小的文字版PDF。");
    if (error instanceof Error && error.name === "PasswordException") throw new Error("此PDF需要密码，请先自行解密并另存后上传。不会索取或保存密码。");
    if (error instanceof Error && error.name === "InvalidPDFException") throw new Error("PDF文件损坏或格式不受支持，请重新导出后上传。");
    throw error;
  } finally { clearTimeout(timeout); signal?.removeEventListener("abort", abort); await loading.destroy(); }
}

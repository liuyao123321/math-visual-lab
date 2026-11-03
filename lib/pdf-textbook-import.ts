import { PDF_TEXTBOOK_MAX_BYTES, PDF_TEXTBOOK_MAX_PAGE_CHARS, PDF_TEXTBOOK_MAX_TEXT_CHARS, PDF_TEXTBOOK_STALL_MS } from "./pdf-textbook-limits";

export type PdfPageText = { pageNumber: number; text: string };
export type PdfExtractionProgress = { currentPage: number; totalPages: number; processedPages: number; requestedPages: number; stage?: "ocr" };

export async function extractTextbookPdf(file: File, startPage = 1, endPage?: number, signal?: AbortSignal, onProgress?: (progress: PdfExtractionProgress) => void, options: { ocr?: boolean } = {}) {
  let ocr: ReturnType<typeof import("./pdf-ocr").createPdfOcr> | undefined;
  const checkCancelled = () => { if (signal?.aborted) throw new DOMException("已取消", "AbortError"); };
  checkCancelled();
  if (!file.name.toLowerCase().endsWith(".pdf") || (file.type && file.type !== "application/pdf")) throw new Error("请选择PDF文件。");
  if (file.size > PDF_TEXTBOOK_MAX_BYTES) throw new Error("PDF不能超过100 MB，请压缩文件或按章节拆分。");
  if (file.name.length > 200) throw new Error("PDF文件名过长，请重命名后重试（最多200字符）。");
  if (!Number.isSafeInteger(startPage) || startPage < 1 || (endPage !== undefined && (!Number.isSafeInteger(endPage) || endPage < startPage))) throw new Error("请输入有效的起止PDF页码。");
  const bytes = new Uint8Array(await file.arrayBuffer());
  checkCancelled();
  if (new TextDecoder().decode(bytes.slice(0, 5)) !== "%PDF-") throw new Error("文件不是有效PDF，不能只修改扩展名。");
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const fingerprint = [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join("");
  const pdfjs = await import("pdfjs-dist");
  checkCancelled();
  pdfjs.GlobalWorkerOptions.workerSrc = "/vendor/pdf.worker.min.mjs";
  const loading = pdfjs.getDocument({ data: bytes, stopAtErrors: true });
  let destruction: Promise<void> | undefined;
  const destroy = () => destruction ??= Promise.resolve().then(() => loading.destroy());
  // Limit stalled operations, not total duration: a large book may take minutes.
  async function guarded<T>(operation: () => Promise<T>, timeoutMs = PDF_TEXTBOOK_STALL_MS): Promise<T> {
    checkCancelled();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let abort: (() => void) | undefined;
    try {
      return await Promise.race([
        Promise.resolve().then(operation),
        new Promise<never>((_, reject) => {
          abort = () => { reject(new DOMException("已取消", "AbortError")); void destroy().catch(() => undefined); };
          signal?.addEventListener("abort", abort, { once: true });
          timer = setTimeout(() => { reject(new Error(`PDF当前页面或加载过程超过${timeoutMs / 1000}秒无响应，请重试或缩小页码范围。`)); void destroy().catch(() => undefined); void ocr?.destroy().catch(() => undefined); }, timeoutMs);
          if (signal?.aborted) abort();
        }),
      ]);
    } finally { clearTimeout(timer); if (abort) signal?.removeEventListener("abort", abort); }
  }
  try {
    const pdf = await guarded(() => loading.promise);
    const last = endPage ?? pdf.numPages;
    if (startPage > pdf.numPages || last > pdf.numPages) throw new Error(`PDF共${pdf.numPages}页；请输入文件范围内的有效页码。`);
    const pages: PdfPageText[] = [], warnings: string[] = [];
    const requestedPages = last - startPage + 1;
    let total = 0;
    onProgress?.({ currentPage: startPage, totalPages: pdf.numPages, processedPages: 0, requestedPages });
    for (let index = startPage; index <= last; index++) {
      checkCancelled();
      const page = await guarded(() => pdf.getPage(index));
      try {
        const content = await guarded(() => page.getTextContent());
        const pieces: string[] = [];
        let pageLength = 0;
        for (const item of content.items) {
          if (!("str" in item)) continue;
          pageLength += item.str.length + 1;
          if (pageLength > PDF_TEXTBOOK_MAX_PAGE_CHARS) throw new Error(`PDF第${index}页文字超过20万字符，请缩小范围或重新导出。不会静默截断。`);
          pieces.push(item.str + (item.hasEOL ? "\n" : " "));
        }
        let text = pieces.join("").trim();
        if (text.length < 20 && options.ocr) {
          onProgress?.({ currentPage: index, totalPages: pdf.numPages, processedPages: index - startPage, requestedPages, stage: "ocr" });
          ocr ??= (await import("./pdf-ocr")).createPdfOcr(signal);
          const result = await guarded(() => ocr!.recognize(page), 180_000);
          text = result.text;
          warnings.push(`PDF第${index}页由本机OCR识别${result.confidence < 60 ? "，识别置信度较低" : ""}，请逐页核对中文、公式、上下标与顺序。`);
          if (text.length > PDF_TEXTBOOK_MAX_PAGE_CHARS) throw new Error(`PDF第${index}页识别文字超过20万字符，请缩小范围。不会静默截断。`);
        }
        if (text.length < 20) warnings.push(`PDF第${index}页未提取到足够文字，可能是扫描页，未收录该页。`);
        else {
          total += text.length;
          if (total > PDF_TEXTBOOK_MAX_TEXT_CHARS) throw new Error("提取文字超过本地单份教材150万字符容量，请按章节选择页码。不会静默截断，原有教材未改动。");
          if (text.includes("�")) warnings.push(`PDF第${index}页有无法解码字符，请核对或重新选择文字版PDF。`);
          pages.push({ pageNumber: index, text });
        }
      } finally { page.cleanup(); }
      checkCancelled();
      onProgress?.({ currentPage: index, totalPages: pdf.numPages, processedPages: index - startPage + 1, requestedPages });
      // Release page resources and yield for painting progress and handling Cancel.
      if ((index - startPage + 1) % 5 === 0) await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
    checkCancelled();
    if (!pages.length) throw new Error(options.ocr ? "所选页面未识别到可用文字，可能是空白页、封面或扫描不清晰。请选择包含正文的页码后重试；不会伪造教材内容。" : "未提取到可用文字。这可能是扫描版或图片PDF，请开启“扫描页本机OCR”后重试；不会自动调用付费模型。");
    if (startPage !== 1 || last !== pdf.numPages) warnings.push(`仅提取第${startPage}—${last}页，原文件共${pdf.numPages}页，其余页面未收录。`);
    return { pages, warnings, fingerprint, totalPages: pdf.numPages };
  } catch (error) {
    checkCancelled();
    if (error instanceof Error && error.name === "PasswordException") throw new Error("此PDF需要密码，请先自行解密并另存后上传。不会索取或保存密码。");
    if (error instanceof Error && error.name === "InvalidPDFException") throw new Error("PDF文件损坏或格式不受支持，请重新导出后上传。");
    throw error;
  } finally { await ocr?.destroy().catch(() => undefined); await destroy().catch(() => undefined); }
}

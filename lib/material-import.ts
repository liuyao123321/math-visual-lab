export type ImportedContent = { text: string; images: string[]; warning: string };

export async function readStudyFile(file: File): Promise<ImportedContent> {
  if (file.size > 10 * 1024 * 1024) throw new Error("资料不能超过 10 MB，请拆分后导入。");
  const extension = file.name.split(".").at(-1)?.toLowerCase();
  if (["txt", "md"].includes(extension ?? "")) {
    const text = await file.text();
    if (text.length > 20000) throw new Error("资料最多 20000 字符，请分章节导入。");
    return { text, images: [], warning: "请核对数学符号与题目编号。" };
  }
  if (extension === "docx") {
    const mammoth = await import("mammoth/mammoth.browser");
    const result = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
    if (result.value.length > 20000) throw new Error("资料最多 20000 字符，请拆分后导入。");
    return { text: result.value, images: [], warning: "Word 中的图片和原生公式可能没有被提取；保存前请在预览中补齐。" };
  }
  if (["png", "jpg", "jpeg", "webp"].includes(extension ?? "")) {
    if (file.size > 8 * 1024 * 1024) throw new Error("图片最多 8 MB。");
    const image = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(new Error("图片读取失败")); reader.readAsDataURL(file); });
    return { text: "请从图片识别试卷题目和知识点。", images: [image], warning: "图片将用于本次 AI 识别；识别后请核对题干，不保存原图。" };
  }
  if (extension !== "pdf") throw new Error("支持 PDF、DOCX、TXT、MD、JPG、PNG 和 WebP。");
  const pdfjs = await import("pdfjs-dist");
  // Served unchanged from public/, so dev HMR cannot inject window-dependent code.
  // npm predev/prebuild copies the pinned PDF.js worker into this location.
  pdfjs.GlobalWorkerOptions.workerSrc = "/vendor/pdf.worker.min.mjs";
  const loading = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()), stopAtErrors: true });
  try {
    const pdf = await loading.promise;
    if (pdf.numPages > 30) throw new Error("一次最多导入 30 页 PDF，请按章节拆分。");
    const pageTexts: string[] = []; const images: string[] = [];
    for (let index = 1; index <= pdf.numPages; index++) {
      const page = await pdf.getPage(index);
      const content = await page.getTextContent();
      const text = content.items.map((item) => "str" in item ? item.str + (item.hasEOL ? "\n" : " ") : "").join("");
      pageTexts.push(`第${index}页\n${text}`);
      if (text.trim().length < 20) {
        if (images.length >= 5) throw new Error("扫描页一次最多 5 页，请拆分 PDF。");
        const base = page.getViewport({ scale: 1 });
        if (!Number.isFinite(base.width) || !Number.isFinite(base.height) || base.width <= 0 || base.height <= 0) throw new Error("PDF 页面尺寸无效。");
        const viewport = page.getViewport({ scale: Math.min(1.2, 2000 / base.width, 2000 / base.height) });
        const canvas = document.createElement("canvas"); canvas.width = viewport.width; canvas.height = viewport.height;
        const context = canvas.getContext("2d"); if (!context) throw new Error("浏览器无法读取扫描页。");
        await page.render({ canvasContext: context, canvas, viewport }).promise;
        images.push(canvas.toDataURL("image/jpeg", 0.8));
      }
    }
    const text = pageTexts.join("\n\n");
    if (text.length > 20000) throw new Error("PDF 文本超过 20000 字符，请拆分后导入。");
    return { text, images, warning: images.length ? "检测到扫描页，将用 AI 识别。请核对公式与题目条件后保存。" : "PDF 公式的上下标和分式可能需要校正；请先核对文本预览。" };
  } finally { await loading.destroy(); }
}

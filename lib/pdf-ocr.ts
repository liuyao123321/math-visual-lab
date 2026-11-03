import type { PDFPageProxy } from "pdfjs-dist";
import type { Worker } from "tesseract.js";

export function createPdfOcr(signal?: AbortSignal) {
  let worker: Worker | undefined;
  let pending: Promise<Worker> | undefined;
  let closed = false;
  const dispose = async () => { closed = true; await worker?.terminate(); };
  const abort = () => { void dispose().catch(() => undefined); };
  signal?.addEventListener("abort", abort, { once: true });
  return {
    async recognize(page: PDFPageProxy) {
      if (closed || signal?.aborted) throw new DOMException("已取消", "AbortError");
      pending ??= import("tesseract.js").then(async ({ createWorker }) => {
        const next = await createWorker(["chi_sim", "eng"], 1, {
          workerPath: "/vendor/ocr/worker.min.js",
          corePath: "/vendor/ocr/core",
          langPath: "/vendor/ocr/lang",
          cacheMethod: "none", // Do not persist recognized textbook contents.
        });
        if (closed || signal?.aborted) { await next.terminate(); throw new DOMException("已取消", "AbortError"); }
        worker = next;
        return next;
      });
      const engine = await pending;
      const base = page.getViewport({ scale: 1 });
      if (![base.width, base.height].every((n) => Number.isFinite(n) && n > 0)) throw new Error("PDF页面尺寸无效。");
      const viewport = page.getViewport({ scale: Math.min(2.5, 2600 / Math.max(base.width, base.height)) });
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
      const context = canvas.getContext("2d");
      if (!context) throw new Error("浏览器无法渲染扫描PDF，请使用支持Canvas的浏览器。");
      const render = page.render({ canvas, canvasContext: context, viewport });
      const cancelRender = () => render.cancel();
      signal?.addEventListener("abort", cancelRender, { once: true });
      try {
        if (signal?.aborted) render.cancel();
        await render.promise;
        if (closed) throw new DOMException("已取消", "AbortError");
        const result = await engine.recognize(canvas);
        if (closed) throw new DOMException("已取消", "AbortError");
        const text = result.data.text.trim().replace(/(?<=\p{Script=Han})\s+(?=\p{Script=Han})/gu, "");
        return { text, confidence: result.data.confidence };
      } finally {
        signal?.removeEventListener("abort", cancelRender);
        canvas.width = 0; canvas.height = 0;
      }
    },
    async destroy() { signal?.removeEventListener("abort", abort); await dispose(); },
  };
}

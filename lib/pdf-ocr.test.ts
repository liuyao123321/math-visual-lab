import { afterEach, describe, expect, it, vi } from "vitest";
import type { PDFPageProxy } from "pdfjs-dist";
import { createPdfOcr } from "./pdf-ocr";
const engine = vi.hoisted(() => ({ recognize: vi.fn(), terminate: vi.fn(), create: vi.fn() }));
vi.mock("tesseract.js", () => ({ createWorker: engine.create }));
afterEach(() => { vi.restoreAllMocks(); engine.create.mockReset(); engine.recognize.mockReset(); engine.terminate.mockReset(); });
function page() {
  return { getViewport: ({ scale }: { scale: number }) => ({ width: 600 * scale, height: 800 * scale }),
    render: vi.fn(() => ({ promise: Promise.resolve(), cancel: vi.fn() })) } as unknown as PDFPageProxy;
}
describe("browser-local PDF OCR lifecycle", () => {
  it("uses same-origin assets, reuses one worker and preserves formula spaces", async () => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({} as CanvasRenderingContext2D);
    engine.create.mockResolvedValue(engine);
    engine.recognize.mockResolvedValue({ data: { text: "多 元 函 数\nf(x) = x + 1", confidence: 75 } });
    const ocr = createPdfOcr();
    const result = await ocr.recognize(page());
    await ocr.recognize(page());
    expect(result.text).toBe("多元函数\nf(x) = x + 1");
    expect(engine.create).toHaveBeenCalledTimes(1);
    expect(engine.create).toHaveBeenCalledWith(["chi_sim", "eng"], 1, expect.objectContaining({ langPath: "/vendor/ocr/lang", cacheMethod: "none" }));
    await ocr.destroy();
    expect(engine.terminate).toHaveBeenCalledTimes(1);
  });
  it("terminates a worker that finishes initializing after cancellation", async () => {
    let ready!: (value: typeof engine) => void;
    engine.create.mockImplementation(() => new Promise((resolve) => { ready = resolve; }));
    const controller = new AbortController();
    const ocr = createPdfOcr(controller.signal);
    const pending = ocr.recognize(page());
    const checked = expect(pending).rejects.toMatchObject({ name: "AbortError" });
    await vi.waitFor(() => expect(engine.create).toHaveBeenCalled());
    controller.abort(); ready(engine);
    await checked;
    expect(engine.terminate).toHaveBeenCalledTimes(1);
    expect(engine.recognize).not.toHaveBeenCalled();
  });
});

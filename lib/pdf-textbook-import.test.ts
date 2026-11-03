// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { extractTextbookPdf } from "./pdf-textbook-import";
import { PDF_TEXTBOOK_MAX_BYTES, PDF_TEXTBOOK_STALL_MS } from "./pdf-textbook-limits";
const mocks = vi.hoisted(() => ({ getDocument: vi.fn(), worker: { workerSrc: "" }, destroy: vi.fn() }));
const ocrMocks = vi.hoisted(() => ({ recognize: vi.fn(), destroy: vi.fn() }));
vi.mock("./pdf-ocr", () => ({ createPdfOcr: () => ocrMocks }));
vi.mock("pdfjs-dist", () => ({ getDocument: mocks.getDocument, GlobalWorkerOptions: mocks.worker }));
const file = () => new File(["%PDF-1.4 mock fixture only"], "test.pdf", { type: "application/pdf" });
const text = "矩阵乘法不满足交换律，应先确认相乘矩阵的行列数与乘法顺序。";
function pdf(pages: string[]) { return { numPages: pages.length, getPage: vi.fn(async (index: number) => ({ getTextContent: async () => ({ items: [{ str: pages[index - 1], hasEOL: true }] }), cleanup: vi.fn() })) }; }
beforeEach(() => { mocks.getDocument.mockReset(); mocks.destroy.mockReset().mockResolvedValue(undefined); ocrMocks.recognize.mockReset(); ocrMocks.destroy.mockReset().mockResolvedValue(undefined); });
afterEach(() => vi.useRealTimers());
describe("PDF text extraction boundaries (mock PDF.js)", () => {
  it("recognizes scans only when enabled, preserving page numbers and review warnings", async () => {
    mocks.getDocument.mockReturnValue({ promise: Promise.resolve(pdf(["", text])), destroy: mocks.destroy });
    ocrMocks.recognize.mockResolvedValue({ text, confidence: 52 });
    const result = await extractTextbookPdf(file(), 1, 2, undefined, undefined, { ocr: true });
    expect(result.pages.map((page) => page.pageNumber)).toEqual([1, 2]);
    expect(ocrMocks.recognize).toHaveBeenCalledTimes(1);
    expect(result.warnings.join(" ")).toContain("置信度较低");
    expect(ocrMocks.destroy).toHaveBeenCalledTimes(1);
  });
  it("never invents content for a blank scanned page, and cleans up after OCR failure", async () => {
    mocks.getDocument.mockReturnValue({ promise: Promise.resolve(pdf([""])), destroy: mocks.destroy });
    ocrMocks.recognize.mockResolvedValue({ text: "", confidence: 0 });
    await expect(extractTextbookPdf(file(), 1, 1, undefined, undefined, { ocr: true })).rejects.toThrow("未识别到");
    ocrMocks.recognize.mockRejectedValue(new Error("OCR资源加载失败"));
    await expect(extractTextbookPdf(file(), 1, 1, undefined, undefined, { ocr: true })).rejects.toThrow("OCR资源加载失败");
    expect(ocrMocks.destroy).toHaveBeenCalledTimes(2);
  });
  it("extracts requested original page numbers, fingerprints the file, and destroys resources", async () => {
    mocks.getDocument.mockReturnValue({ promise: Promise.resolve(pdf([text, text + "第二页"])), destroy: mocks.destroy });
    const result = await extractTextbookPdf(file(), 2, 2);
    expect(result.pages).toEqual([{ pageNumber: 2, text: text + "第二页" }]);
    expect(result.fingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(result.warnings.join(" ")).toContain("仅提取"); expect(mocks.destroy).toHaveBeenCalled();
    expect(mocks.worker.workerSrc).toBe("/vendor/pdf.worker.min.mjs");
  });
  it("rejects wrong types, fake headers and oversized files before PDF parsing", async () => {
    await expect(extractTextbookPdf(new File(["bad"], "test.txt"))).rejects.toThrow("PDF");
    await expect(extractTextbookPdf(new File(["bad"], "test.pdf"))).rejects.toThrow("有效PDF");
    const huge = file(); Object.defineProperty(huge, "size", { value: PDF_TEXTBOOK_MAX_BYTES + 1 });
    await expect(extractTextbookPdf(huge)).rejects.toThrow("100 MB"); expect(mocks.getDocument).not.toHaveBeenCalled();
  });
  it("accepts the 100 MB declared-size boundary (mock file bytes, not a memory benchmark)", async () => {
    const boundary = file(); Object.defineProperty(boundary, "size", { value: PDF_TEXTBOOK_MAX_BYTES });
    mocks.getDocument.mockReturnValue({ promise: Promise.resolve(pdf([text])), destroy: mocks.destroy });
    expect((await extractTextbookPdf(boundary)).pages).toHaveLength(1);
  });
  it("extracts all 600 pages by default, beyond the former page and text caps, with progress", async () => {
    const document = pdf(Array.from({ length: 600 }, () => text.repeat(10)));
    const progress = vi.fn();
    mocks.getDocument.mockReturnValue({ promise: Promise.resolve(document), destroy: mocks.destroy });
    const result = await extractTextbookPdf(file(), 1, undefined, undefined, progress);
    expect(result.pages).toHaveLength(600);
    expect(result.pages[599].pageNumber).toBe(600);
    expect(result.pages.reduce((total, page) => total + page.text.length, 0)).toBeGreaterThan(150000);
    expect(progress).toHaveBeenLastCalledWith({ currentPage: 600, totalPages: 600, processedPages: 600, requestedPages: 600 });
    expect(result.warnings).toEqual([]);
  });
  it("accepts explicit ranges larger than 30 pages and a start page above 10000", async () => {
    mocks.getDocument.mockReturnValue({ promise: Promise.resolve(pdf(Array(65).fill(text))), destroy: mocks.destroy });
    const ranged = await extractTextbookPdf(file(), 10, 65);
    expect(ranged.pages).toHaveLength(56); expect(ranged.pages[0].pageNumber).toBe(10);
    const document = pdf([text]); document.numPages = 10001;
    document.getPage.mockImplementation(async () => ({ getTextContent: async () => ({ items: [{ str: text, hasEOL: true }] }), cleanup: vi.fn() }));
    mocks.getDocument.mockReturnValue({ promise: Promise.resolve(document), destroy: mocks.destroy });
    expect((await extractTextbookPdf(file(), 10001)).pages[0].pageNumber).toBe(10001);
  });
  it("reports scans without silently invoking OCR or inventing text", async () => {
    mocks.getDocument.mockReturnValue({ promise: Promise.resolve(pdf(["", "123"])), destroy: mocks.destroy });
    await expect(extractTextbookPdf(file())).rejects.toThrow("扫描版");
  });
  it("warns about skipped scan pages and retains actual page references", async () => {
    mocks.getDocument.mockReturnValue({ promise: Promise.resolve(pdf(["", text])), destroy: mocks.destroy });
    const result = await extractTextbookPdf(file());
    expect(result.pages[0].pageNumber).toBe(2); expect(result.warnings[0]).toContain("第1页");
  });
  it("validates page bounds and text length without truncation", async () => {
    mocks.getDocument.mockImplementation(() => ({ promise: Promise.resolve(pdf([text])), destroy: mocks.destroy }));
    await expect(extractTextbookPdf(file(), 1, 31)).rejects.toThrow("文件范围");
    await expect(extractTextbookPdf(file(), 0)).rejects.toThrow("有效");
    await expect(extractTextbookPdf(file(), 1.5)).rejects.toThrow("有效");
    mocks.getDocument.mockReturnValue({ promise: Promise.resolve(pdf(["x".repeat(200001)])), destroy: mocks.destroy });
    await expect(extractTextbookPdf(file())).rejects.toThrow("不会静默截断");
    mocks.getDocument.mockReturnValue({ promise: Promise.resolve(pdf(Array(10).fill("x".repeat(160000)))), destroy: mocks.destroy });
    await expect(extractTextbookPdf(file())).rejects.toThrow("150万字符");
  });
  it("rejects password-protected PDFs without asking for a password", async () => {
    mocks.getDocument.mockImplementation(() => ({ promise: Promise.reject(Object.assign(new Error("password"), { name: "PasswordException" })), destroy: mocks.destroy }));
    await expect(extractTextbookPdf(file())).rejects.toThrow("不会索取或保存密码");
  });
  it("honors cancellation before parsing", async () => {
    const controller = new AbortController(); controller.abort();
    await expect(extractTextbookPdf(file(), 1, undefined, controller.signal)).rejects.toMatchObject({ name: "AbortError" });
    expect(mocks.getDocument).not.toHaveBeenCalled();
  });
  it("cancels during extraction, without returning a partial successful result", async () => {
    const controller = new AbortController();
    const document = pdf(Array(40).fill(text));
    mocks.getDocument.mockReturnValue({ promise: Promise.resolve(document), destroy: mocks.destroy });
    await expect(extractTextbookPdf(file(), 1, undefined, controller.signal, (progress) => { if (progress.processedPages === 2) controller.abort(); })).rejects.toMatchObject({ name: "AbortError" });
    expect(document.getPage).toHaveBeenCalledTimes(2);
    expect(mocks.destroy).toHaveBeenCalledTimes(1);
  });
  it("allows healthy extraction to exceed the old total timeout", async () => {
    vi.useFakeTimers();
    const document = { numPages: 3, getPage: async () => ({ getTextContent: () => new Promise((resolve) => setTimeout(() => resolve({ items: [{ str: text, hasEOL: true }] }), 20000)), cleanup: vi.fn() }) };
    mocks.getDocument.mockReturnValue({ promise: Promise.resolve(document), destroy: mocks.destroy });
    const pending = extractTextbookPdf(file());
    const checked = expect(pending).resolves.toHaveProperty("pages.length", 3);
    await vi.waitFor(() => expect(mocks.getDocument).toHaveBeenCalled());
    await vi.runAllTimersAsync();
    await checked;
  });
  it("rejects a stalled page and destroys its worker instead of waiting forever", async () => {
    vi.useFakeTimers();
    mocks.getDocument.mockReturnValue({ promise: new Promise(() => undefined), destroy: mocks.destroy });
    const checked = expect(extractTextbookPdf(file())).rejects.toThrow("45秒无响应");
    await vi.waitFor(() => expect(mocks.getDocument).toHaveBeenCalled());
    await vi.advanceTimersByTimeAsync(PDF_TEXTBOOK_STALL_MS + 1);
    await checked;
    expect(mocks.destroy).toHaveBeenCalledTimes(1);
  });
});

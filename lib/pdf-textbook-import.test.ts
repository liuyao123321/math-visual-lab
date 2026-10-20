// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { extractTextbookPdf } from "./pdf-textbook-import";
const mocks = vi.hoisted(() => ({ getDocument: vi.fn(), worker: { workerSrc: "" }, destroy: vi.fn() }));
vi.mock("pdfjs-dist", () => ({ getDocument: mocks.getDocument, GlobalWorkerOptions: mocks.worker }));
const file = () => new File(["%PDF-1.4 mock fixture only"], "test.pdf", { type: "application/pdf" });
const text = "矩阵乘法不满足交换律，应先确认相乘矩阵的行列数与乘法顺序。";
function pdf(pages: string[]) { return { numPages: pages.length, getPage: vi.fn(async (index: number) => ({ getTextContent: async () => ({ items: [{ str: pages[index - 1], hasEOL: true }] }), cleanup: vi.fn() })) }; }
beforeEach(() => { mocks.getDocument.mockReset(); mocks.destroy.mockReset().mockResolvedValue(undefined); });
afterEach(() => vi.useRealTimers());
describe("PDF text extraction boundaries (mock PDF.js)", () => {
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
    const huge = file(); Object.defineProperty(huge, "size", { value: 21 * 1024 * 1024 });
    await expect(extractTextbookPdf(huge)).rejects.toThrow("20 MB"); expect(mocks.getDocument).not.toHaveBeenCalled();
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
    await expect(extractTextbookPdf(file(), 1, 31)).rejects.toThrow("最多提取30页");
    mocks.getDocument.mockReturnValue({ promise: Promise.resolve(pdf(["x".repeat(12001)])), destroy: mocks.destroy });
    await expect(extractTextbookPdf(file())).rejects.toThrow("不会静默截断");
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
});

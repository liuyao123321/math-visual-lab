import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PdfTextbookUpload } from "./pdf-textbook-upload";
import { extractTextbookPdf } from "@/lib/pdf-textbook-import";
import { readPersonalLibrary, savePersonalBook } from "@/lib/personal-library";
import { personalBookFixture as book } from "@/testdata/personal-library";
import { PDF_TEXTBOOK_MAX_BYTES } from "@/lib/pdf-textbook-limits";
vi.mock("@/lib/pdf-textbook-import", () => ({ extractTextbookPdf: vi.fn() }));
const extracted = { pages: book.pages, fingerprint: book.fingerprint, warnings: ["请核对PDF公式"], totalPages: 5 };
const extract = vi.mocked(extractTextbookPdf);
beforeEach(() => { localStorage.clear(); extract.mockReset().mockResolvedValue(extracted); });
afterEach(() => cleanup());
async function prepare() {
  fireEvent.click(screen.getByRole("button", { name: "上传 PDF 教材" }));
  fireEvent.change(screen.getByLabelText("选择PDF教材文件"), { target: { files: [new File(["test"], "sample.pdf", { type: "application/pdf" })] } });
  fireEvent.click(screen.getByRole("button", { name: "提取并预览文字" }));
  await screen.findByLabelText("PDF第3页提取文字");
}
function approveFirst() {
  fireEvent.click(screen.getByRole("button", { name: "生成分类建议" }));
  fireEvent.change(screen.getByLabelText("内容类别"), { target: { value: "knowledge" } });
  fireEvent.click(screen.getByLabelText("已核对，原文未列额外适用条件"));
  fireEvent.click(screen.getByRole("button", { name: "核对通过" }));
}
describe("PDF upload preview (mock extraction)", () => {
  it("keeps a standalone upload button without the extra outer card", () => {
    render(<PdfTextbookUpload onSaved={vi.fn()} />);
    const trigger = screen.getByRole("button", { name: "上传 PDF 教材" });
    expect(trigger.closest("section")).not.toHaveClass("border");
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByLabelText("选择PDF教材文件")).toBeInTheDocument();
    expect(screen.getByText(/文字版 \/ 扫描版 PDF · ≤100 MB/)).toHaveTextContent("最多5份");
    expect(screen.getByText(/本机提取，不存原文件/)).toHaveTextContent("单份文字≤150万字符");
    expect(screen.queryByText(/不修改公共知识库/)).not.toBeInTheDocument();
  });
  it("requires review before saving, defaults AI consent off, and keeps original page references", async () => {
    const saved = vi.fn(); render(<PdfTextbookUpload onSaved={saved} />); await prepare();
    expect(screen.getByRole("button", { name: "确认并加入个人教材" })).toBeDisabled();
    expect(screen.getByRole("checkbox", { name: /允许用于AI答疑/ })).not.toBeChecked();
    expect(readPersonalLibrary().books).toEqual([]);
    fireEvent.change(screen.getByLabelText("个人教材名称"), { target: { value: "[测试]我的章节" } });
    fireEvent.click(screen.getByRole("checkbox", { name: /我有权使用该资料/ }));
    expect(screen.getByRole("button", { name: "确认并加入个人教材" })).toBeDisabled();
    approveFirst();
    fireEvent.click(screen.getByRole("button", { name: "确认并加入个人教材" }));
    await screen.findByText(/已保存为个人教材/);
    expect(saved).toHaveBeenCalledTimes(1);
    expect(readPersonalLibrary().books[0]).toMatchObject({ title: "[测试]我的章节", fileName: "sample.pdf", allowAiUse: false, pages: book.pages });
    expect(readPersonalLibrary().books[0].cards?.[0]).toMatchObject({ pageNumber: 3, metadata: { category: "knowledge", version: 1 } });
  });
  it("accepts a requested range beyond 30 pages and reports extraction progress", async () => {
    extract.mockImplementation(async (_file, _from, _to, _signal, progress) => {
      progress?.({ currentPage: 40, totalPages: 80, processedPages: 40, requestedPages: 80 });
      return extracted;
    });
    render(<PdfTextbookUpload onSaved={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "上传 PDF 教材" }));
    fireEvent.change(screen.getByLabelText("选择PDF教材文件"), { target: { files: [new File(["test"], "book.pdf")] } });
    fireEvent.change(screen.getByLabelText("结束PDF页码"), { target: { value: "80" } });
    fireEvent.click(screen.getByRole("button", { name: "提取并预览文字" }));
    expect(extract).toHaveBeenCalledWith(expect.any(File), 1, 80, expect.any(AbortSignal), expect.any(Function), { ocr: true });
    await screen.findByLabelText("PDF第3页提取文字");
  });
  it("paginates a large preview while editing and saving every extracted page", async () => {
    const pages = Array.from({ length: 35 }, (_, index) => ({ pageNumber: index + 1, text: book.pages[0].text }));
    extract.mockResolvedValue({ ...extracted, totalPages: 35, pages });
    render(<PdfTextbookUpload onSaved={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "上传 PDF 教材" }));
    fireEvent.change(screen.getByLabelText("选择PDF教材文件"), { target: { files: [new File(["test"], "large.pdf")] } });
    fireEvent.click(screen.getByRole("button", { name: "提取并预览文字" }));
    await screen.findByLabelText("PDF第1页提取文字");
    expect(screen.queryByLabelText("PDF第11页提取文字")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "下一组页面" }));
    const edited = "测试修订第11页：矩阵乘法不满足交换律，需要确认矩阵的行列数。";
    fireEvent.change(screen.getByLabelText("PDF第11页提取文字"), { target: { value: edited } });
    fireEvent.click(screen.getByRole("button", { name: "上一组页面" }));
    expect(screen.getByLabelText("PDF第1页提取文字")).toHaveValue(pages[0].text);
    approveFirst();
    fireEvent.click(screen.getByRole("checkbox", { name: /我有权使用该资料/ }));
    fireEvent.click(screen.getByRole("button", { name: "确认并加入个人教材" }));
    expect(readPersonalLibrary().books[0].pages).toHaveLength(35);
    expect(readPersonalLibrary().books[0].pages[10].text).toBe(edited);
  });
  it("blocks a PDF over 100 MB before extraction", () => {
    const large = new File(["test"], "large.pdf"); Object.defineProperty(large, "size", { value: PDF_TEXTBOOK_MAX_BYTES + 1 });
    render(<PdfTextbookUpload onSaved={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "上传 PDF 教材" }));
    fireEvent.change(screen.getByLabelText("选择PDF教材文件"), { target: { files: [large] } });
    fireEvent.click(screen.getByRole("button", { name: "提取并预览文字" }));
    expect(screen.getByRole("alert")).toHaveTextContent("100 MB");
    expect(extract).not.toHaveBeenCalled();
  });
  it("shows progress and ignores late progress or results after cancellation", async () => {
    let resolve!: (value: typeof extracted) => void;
    let progress!: NonNullable<Parameters<typeof extractTextbookPdf>[4]>;
    extract.mockImplementation((_file, _first, _last, _signal, report) => { progress = report!; return new Promise((done) => { resolve = done; }); });
    render(<PdfTextbookUpload onSaved={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "上传 PDF 教材" }));
    fireEvent.change(screen.getByLabelText("选择PDF教材文件"), { target: { files: [new File(["test"], "book.pdf")] } });
    fireEvent.click(screen.getByRole("button", { name: "提取并预览文字" }));
    act(() => progress({ currentPage: 40, totalPages: 80, processedPages: 40, requestedPages: 80 }));
    expect(screen.getByRole("progressbar", { name: "PDF提取进度" })).toHaveAttribute("value", "40");
    fireEvent.click(screen.getByRole("button", { name: "取消本次提取" }));
    expect(extract.mock.calls[0][3]?.aborted).toBe(true);
    await act(async () => { progress({ currentPage: 80, totalPages: 80, processedPages: 80, requestedPages: 80 }); resolve(extracted); });
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("PDF第3页提取文字")).not.toBeInTheDocument();
    expect(readPersonalLibrary().books).toEqual([]);
  });
  it("invalidates confirmation when edited text changes, without automatically correcting mathematics", async () => {
    render(<PdfTextbookUpload onSaved={vi.fn()} />); await prepare();
    fireEvent.click(screen.getByRole("checkbox", { name: /我有权使用该资料/ }));
    fireEvent.change(screen.getByLabelText("PDF第3页提取文字"), { target: { value: "这是测试原文：2x=6。保留用户原式，不能把它自动改写成另一条正确等式。" } });
    expect(screen.getByRole("checkbox", { name: /我有权使用该资料/ })).not.toBeChecked();
    expect(screen.getByRole("button", { name: "确认并加入个人教材" })).toBeDisabled();
    expect((screen.getByLabelText("PDF第3页提取文字") as HTMLTextAreaElement).value).toContain("2x=6");
  });
  it("preserves preview after duplicate-save rejection and does not overwrite previous material", async () => {
    savePersonalBook(book); render(<PdfTextbookUpload onSaved={vi.fn()} />); await prepare();
    approveFirst();
    fireEvent.click(screen.getByRole("checkbox", { name: /我有权使用该资料/ }));
    fireEvent.click(screen.getByRole("button", { name: "确认并加入个人教材" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("已经导入");
    expect(screen.getByLabelText("PDF第3页提取文字")).toHaveValue(book.pages[0].text);
    expect(readPersonalLibrary().books).toEqual([book]);
  });
  it("blocks unchecked conditions and requires re-review after card or source edits", async () => {
    render(<PdfTextbookUpload onSaved={vi.fn()} />); await prepare();
    fireEvent.click(screen.getByRole("button", { name: "生成分类建议" }));
    fireEvent.change(screen.getByLabelText("内容类别"), { target: { value: "knowledge" } });
    fireEvent.click(screen.getByRole("button", { name: "核对通过" }));
    expect(screen.getByRole("alert")).toHaveTextContent("须填写适用条件");
    fireEvent.change(screen.getByLabelText("适用条件（每行一条）"), { target: { value: "左矩阵列数等于右矩阵行数" } });
    fireEvent.click(screen.getByRole("button", { name: "核对通过" }));
    fireEvent.click(screen.getByRole("checkbox", { name: /我有权使用该资料/ }));
    expect(screen.getByRole("button", { name: "确认并加入个人教材" })).toBeEnabled();
    fireEvent.change(screen.getByLabelText("卡片标题"), { target: { value: "修改后的标题" } });
    expect(screen.getByRole("button", { name: "确认并加入个人教材" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "核对通过" }));
    fireEvent.change(screen.getByLabelText("PDF第3页提取文字"), { target: { value: book.pages[0].text + "原文已重新核对。" } });
    expect(screen.queryByRole("region", { name: "教材卡片审核" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "确认并加入个人教材" })).toBeDisabled();
  });
  it("splits and merges draft cards without retaining stale approval", async () => {
    render(<PdfTextbookUpload onSaved={vi.fn()} />); await prepare();
    approveFirst();
    const body = screen.getByLabelText("卡片正文") as HTMLTextAreaElement;
    body.setSelectionRange(24, 24);
    fireEvent.click(screen.getByRole("button", { name: "在光标处拆分" }));
    expect(screen.getByText("已通过 0 条 · 已略过 0 条 · 待核对 2 条")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "与下一条合并" }));
    expect(screen.getByText("已通过 0 条 · 已略过 0 条 · 待核对 1 条")).toBeInTheDocument();
    expect(screen.getByLabelText("卡片正文")).toHaveValue(book.pages[0].text.slice(0, 24) + "\n" + book.pages[0].text.slice(24));
  });
  it("reports scan extraction failure without adding an empty textbook", async () => {
    extract.mockRejectedValue(new Error("扫描版暂不支持"));
    render(<PdfTextbookUpload onSaved={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "上传 PDF 教材" }));
    fireEvent.change(screen.getByLabelText("选择PDF教材文件"), { target: { files: [new File(["test"], "scan.pdf")] } });
    fireEvent.click(screen.getByRole("button", { name: "提取并预览文字" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("扫描版暂不支持");
    expect(readPersonalLibrary().books).toEqual([]);
  });
  it("ignores a late extraction after selecting a different file", async () => {
    let resolve!: (value: typeof extracted) => void;
    extract.mockImplementation(() => new Promise((done) => { resolve = done; }));
    render(<PdfTextbookUpload onSaved={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "上传 PDF 教材" }));
    fireEvent.change(screen.getByLabelText("选择PDF教材文件"), { target: { files: [new File(["test"], "one.pdf")] } });
    fireEvent.click(screen.getByRole("button", { name: "提取并预览文字" }));
    fireEvent.change(screen.getByLabelText("选择PDF教材文件"), { target: { files: [new File(["test"], "two.pdf")] } });
    await act(async () => { resolve(extracted); });
    expect(screen.queryByLabelText("PDF第3页提取文字")).not.toBeInTheDocument();
    expect(readPersonalLibrary().books).toEqual([]);
    await waitFor(() => expect(screen.getByRole("button", { name: "提取并预览文字" })).toBeEnabled());
  });
});

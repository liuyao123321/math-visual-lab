import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PdfTextbookUpload } from "./pdf-textbook-upload";
import { extractTextbookPdf } from "@/lib/pdf-textbook-import";
import { readPersonalLibrary, savePersonalBook } from "@/lib/personal-library";
import { personalBookFixture as book } from "@/testdata/personal-library";
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
describe("PDF upload preview (mock extraction)", () => {
  it("keeps a standalone upload button without the extra outer card", () => {
    render(<PdfTextbookUpload onSaved={vi.fn()} />);
    const trigger = screen.getByRole("button", { name: "上传 PDF 教材" });
    expect(trigger.closest("section")).not.toHaveClass("border");
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByLabelText("选择PDF教材文件")).toBeInTheDocument();
  });
  it("requires review before saving, defaults AI consent off, and keeps original page references", async () => {
    const saved = vi.fn(); render(<PdfTextbookUpload onSaved={saved} />); await prepare();
    expect(screen.getByRole("button", { name: "确认并加入个人教材" })).toBeDisabled();
    expect(screen.getByRole("checkbox", { name: /允许用于AI答疑/ })).not.toBeChecked();
    expect(readPersonalLibrary().books).toEqual([]);
    fireEvent.change(screen.getByLabelText("个人教材名称"), { target: { value: "[测试]我的章节" } });
    fireEvent.click(screen.getByRole("checkbox", { name: /我有权使用该资料/ }));
    fireEvent.click(screen.getByRole("button", { name: "确认并加入个人教材" }));
    await screen.findByText(/已保存为个人教材/);
    expect(saved).toHaveBeenCalledTimes(1);
    expect(readPersonalLibrary().books[0]).toMatchObject({ title: "[测试]我的章节", fileName: "sample.pdf", allowAiUse: false, pages: book.pages });
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
    fireEvent.click(screen.getByRole("checkbox", { name: /我有权使用该资料/ }));
    fireEvent.click(screen.getByRole("button", { name: "确认并加入个人教材" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("已经导入");
    expect(screen.getByLabelText("PDF第3页提取文字")).toHaveValue(book.pages[0].text);
    expect(readPersonalLibrary().books).toEqual([book]);
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

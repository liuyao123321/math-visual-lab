import { describe, expect, it } from "vitest";
import { readStudyFile } from "@/lib/material-import";

describe("study file import boundaries", () => {
  it("extracts plain text without executing its contents", async () => {
    const file = new File(["1. 求 x² 的导数\n2. 求定积分"], "review.txt", { type: "text/plain" });
    Object.defineProperty(file, "text", { value: async () => "1. 求 x² 的导数\n2. 求定积分" });
    const result = await readStudyFile(file);
    expect(result.text).toContain("求 x² 的导数");
    expect(result.images).toEqual([]);
  });
  it("rejects unsupported and oversized files before parsing", async () => {
    await expect(readStudyFile(new File(["bad"], "review.exe"))).rejects.toThrow("支持 PDF");
    const large = new File([], "review.pdf");
    Object.defineProperty(large, "size", { value: 11 * 1024 * 1024 });
    await expect(readStudyFile(large)).rejects.toThrow("10 MB");
  });
  it("rejects excessive text without truncating the original question silently", async () => {
    const file = new File([], "review.md");
    Object.defineProperty(file, "text", { value: async () => "x".repeat(20001) });
    await expect(readStudyFile(file)).rejects.toThrow("20000");
  });
});

import { describe, expect, it } from "vitest";
import { readQuestionPhoto, validateQuestionPhoto, maxQuestionImageBytes } from "./question-photo";

describe("question photo input", () => {
  it("reads a supported image as a correctly typed data URL", async () => {
    await expect(readQuestionPhoto(new File(["test image"], "question.png", { type: "image/png" }))).resolves.toMatch(/^data:image\/png;base64,/);
  });
  it("handles camera files with an empty MIME using a supported extension", async () => {
    await expect(readQuestionPhoto(new File(["test camera"], "QUESTION.JPG"))).resolves.toMatch(/^data:image\/jpeg;base64,/);
  });
  it("rejects empty, oversized and unsupported files before reading", () => {
    const files = [new File([], "empty.png", { type: "image/png" }), new File([new Uint8Array(maxQuestionImageBytes + 1)], "large.png", { type: "image/png" }), new File(["bad"], "bad.png", { type: "text/html" }), new File(["bad"], "unknown")];
    for (const file of files) expect(() => validateQuestionPhoto(file)).toThrow(/JPG/);
  });
});

import { beforeEach, describe, expect, it, vi, afterEach } from "vitest";
import { examples } from "@/lib/examples";
import { consumeSolveHandoff, saveSolveHandoff, consumePhotoHandoff, savePhotoHandoff } from "@/lib/solve-handoff";
import { recognition } from "@/testdata/handwriting";
import type { PhotoTutorResult } from "./photo-tutoring";

describe("photo result handoff", () => {
  beforeEach(() => sessionStorage.clear());
  afterEach(() => vi.restoreAllMocks());

  it("passes a validated result once and contains no original photo or key", () => {
    const token = saveSolveHandoff({ ...examples[1], imageDataUrl: "private-photo", apiKey: "private-key" } as typeof examples[number]);
    const raw = sessionStorage.getItem("mathlab.solve-handoff.v1")!;
    expect(raw).not.toContain("private-photo");
    expect(raw).not.toContain("private-key");
    expect(consumeSolveHandoff(token)).toEqual(examples[1]);
    expect(consumeSolveHandoff(token)).toBeNull();
  });

  it("does not consume a different pending result", () => {
    const token = saveSolveHandoff(examples[0]);
    expect(consumeSolveHandoff("unrelated-token")).toBeNull();
    expect(consumeSolveHandoff(token)).toEqual(examples[0]);
  });

  it("rejects expired results", () => {
    const now = Date.now();
    vi.spyOn(Date, "now").mockReturnValue(now);
    const token = saveSolveHandoff(examples[0]);
    vi.spyOn(Date, "now").mockReturnValue(now + 5 * 60 * 1000 + 1);
    expect(consumeSolveHandoff(token)).toBeNull();
    expect(sessionStorage.length).toBe(0);
  });

  it("returns a safe fallback for malformed storage", () => {
    sessionStorage.setItem("mathlab.solve-handoff.v1", "not json");
    expect(consumeSolveHandoff("anything")).toBeNull();
  });

  it.each(["student_work", "uncertain"] as const)("passes a %s handoff once, stripping original images and credentials", (kind) => {
    const result = { kind, reason: "内容核对", recognition, imageDataUrl: "private-photo", apiKey: "private-key" } as PhotoTutorResult;
    const token = savePhotoHandoff(result);
    const raw = sessionStorage.getItem("mathlab.solve-handoff.v1")!;
    expect(raw).not.toContain("private-photo"); expect(raw).not.toContain("private-key");
    expect(consumePhotoHandoff("other-token")).toBeNull();
    expect(consumePhotoHandoff(token)).toMatchObject({ kind, recognition });
    expect(consumePhotoHandoff(token)).toBeNull();
  });

  it("supports old and new question-only handoffs", () => {
    expect(consumePhotoHandoff(saveSolveHandoff(examples[0]))).toEqual({ kind: "solution", solution: examples[0] });
    expect(consumePhotoHandoff(savePhotoHandoff({ kind: "solution", solution: examples[1] }))).toEqual({ kind: "solution", solution: examples[1] });
  });

  it("rejects an expired automatic-routing handoff", () => {
    const now = Date.now(); vi.spyOn(Date, "now").mockReturnValue(now);
    const token = savePhotoHandoff({ kind: "solution", solution: examples[0] });
    vi.spyOn(Date, "now").mockReturnValue(now + 300_001);
    expect(consumePhotoHandoff(token)).toBeNull();
  });
});

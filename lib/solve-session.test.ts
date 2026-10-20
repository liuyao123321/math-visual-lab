import { beforeEach, describe, expect, it, vi } from "vitest";
import { examples } from "@/lib/examples";
import { readSolveSession, SOLVE_SESSION_KEY, writeSolveSession, type SolveSession } from "@/lib/solve-session";

const snapshot = (): SolveSession => ({
  version: 1, entryKey: "", question: examples[0].normalizedQuestion, solution: examples[0], resultReady: true,
  mode: "visual", modeSelection: "auto", tutoringStyle: "guided", progressCount: 2, activeStep: 1,
  parameters: { a: 1 }, mobileView: "steps", error: "", errorCode: "", errorReason: "计算错误", note: "待完成的笔记",
  detailReason: "请解释", detail: null, practice: null, understandingCheck: null, checkAnswer: "",
  checkFeedback: null, pendingAction: "", hadPhoto: false,
});
beforeEach(() => { sessionStorage.clear(); localStorage.clear(); vi.restoreAllMocks(); });

describe("tab-local solve sessions", () => {
  it("round-trips a question, lesson and progress without permanent storage", () => {
    const saved = snapshot();
    expect(writeSolveSession(saved)).toBe(true);
    expect(readSolveSession()).toEqual(saved);
    expect(localStorage.length).toBe(0);
  });

  it("never serializes additional images, keys or profile fields", () => {
    const saved = { ...snapshot(), photo: { dataUrl: "data:image/png;base64,private" }, apiKey: "sk-not-for-storage", learningContext: { private: "profile" } };
    expect(writeSolveSession(saved)).toBe(true);
    const raw = sessionStorage.getItem(SOLVE_SESSION_KEY)!;
    expect(raw).not.toContain("data:image");
    expect(raw).not.toContain("sk-not-for-storage");
    expect(raw).not.toContain("learningContext");
  });

  it("recovers safely from malformed JSON and invalid structure without touching mistakes", () => {
    localStorage.setItem("mathlab.mistakes.v1", "existing-records");
    for (const raw of ["{broken", JSON.stringify({ ...snapshot(), version: 2 }), JSON.stringify({ ...snapshot(), solution: null })]) {
      sessionStorage.setItem(SOLVE_SESSION_KEY, raw);
      expect(readSolveSession()).toBeNull();
    }
    expect(localStorage.getItem("mathlab.mistakes.v1")).toBe("existing-records");
  });

  it("supports an unfinished draft without a valid historical answer", () => {
    const saved = { ...snapshot(), question: "还未求解的题目", solution: null, resultReady: false };
    expect(writeSolveSession(saved)).toBe(true);
    expect(readSolveSession()?.question).toBe(saved.question);
  });

  it("reports denied storage rather than dropping input or throwing", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("quota"); });
    expect(writeSolveSession(snapshot())).toBe(false);
  });
});

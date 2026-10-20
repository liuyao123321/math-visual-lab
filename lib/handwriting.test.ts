import { afterEach, describe, expect, it, vi } from "vitest";
import { confirmedWorkSchema, evaluationMatches, handwritingEvaluationSchema } from "./handwriting-schema";
import { emptyHandwritingSession, HANDWRITING_SESSION_KEY, invalidateHandwriting, moveStudentStep, readHandwritingSession, writeHandwritingSession } from "./handwriting-session";
import { validateQuestionPhoto } from "./question-photo";
import { tutorRequestSchema, mistakeRecordSchema } from "./math-schema";
import { useMathLabStore } from "./store";
import { work, evaluation, recognition } from "@/testdata/handwriting";
import { examples } from "./examples";

afterEach(() => { vi.restoreAllMocks(); sessionStorage.clear(); localStorage.clear(); });
describe("handwriting reliability boundaries", () => {
  it("rejects blank, duplicate and unconfirmed steps", () => {
    for (const bad of [{ ...work, confirmed: false }, { ...work, steps: [] }, { ...work, steps: [{ id: "a", text: " ", formulas: [] }] }, { ...work, steps: [work.steps[0], work.steps[0]] }]) {
      expect(confirmedWorkSchema.safeParse(bad).success).toBe(false);
    }
  });
  it("rejects all-correct/completed claims when there are uncertain or incorrect steps", () => {
    expect(handwritingEvaluationSchema.safeParse({ ...evaluation, status: "completed" }).success).toBe(false);
    expect(handwritingEvaluationSchema.safeParse({ ...evaluation, firstErrorStepId: null }).success).toBe(false);
    expect(handwritingEvaluationSchema.safeParse({ ...evaluation, steps: [evaluation.steps[1]] }).success).toBe(false);
  });
  it("binds verdicts to exact ids and order", () => {
    expect(evaluationMatches(work, evaluation)).toBe(true);
    expect(evaluationMatches({ steps: [...work.steps].reverse() }, evaluation)).toBe(false);
  });
  it("invalidates all old verdicts and hints without changing stable ids, notes or OCR original", () => {
    const previous = { ...emptyHandwritingSession(), ...work, evaluation, recognition: { ...recognition, status: "needs_review" as const }, note: "保留", revealedHints: 2 };
    const changed = invalidateHandwriting(previous, { steps: work.steps.map((s, i) => i ? s : { ...s, formulas: ["2x=4"] }) });
    expect(changed).toMatchObject({ confirmed: false, evaluation: null, hints: [], revealedHints: 0, note: "保留" });
    expect(changed.recognition?.steps[0].formulas).toEqual(["2x=6"]);
    expect(changed.steps.map((s) => s.id)).toEqual(["s1", "s2"]);
    expect(moveStudentStep(work.steps, 1, -1).map((s) => s.id)).toEqual(["s2", "s1"]);
  });
  it("stores only whitelisted text, never images, credentials or profiles", () => {
    const value = { ...emptyHandwritingSession(), ...work, evaluation, imageDataUrl: "private-photo", apiKey: "fake-test-only", learningContext: {} };
    expect(writeHandwritingSession(value)).toBe(true);
    const raw = sessionStorage.getItem(HANDWRITING_SESSION_KEY)!;
    expect(raw).not.toContain("private-photo"); expect(raw).not.toContain("fake-test-only"); expect(raw).not.toContain("learningContext");
    expect(readHandwritingSession()?.evaluation).toEqual(evaluation);
  });
  it("preserves existing storage on quota failures and corrupt session reads", () => {
    sessionStorage.setItem(HANDWRITING_SESSION_KEY, "{broken");
    expect(readHandwritingSession()).toBeNull();
    expect(sessionStorage.getItem(HANDWRITING_SESSION_KEY)).toBe("{broken");
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new DOMException("quota", "QuotaExceededError"); });
    expect(writeHandwritingSession(emptyHandwritingSession())).toBe(false);
  });
  it("requires confirmed content for evaluate and validates hint input", () => {
    expect(tutorRequestSchema.safeParse({ action: "evaluate-work", ...work }).success).toBe(true);
    expect(tutorRequestSchema.safeParse({ action: "evaluate-work", ...work, confirmed: false }).success).toBe(false);
    expect(tutorRequestSchema.safeParse({ action: "work-hint", ...work, evaluation, level: 4, perspective: "next" }).success).toBe(false);
  });
  it("rejects empty, unsupported and overlarge photos", () => {
    expect(() => validateQuestionPhoto(new File([], "empty.png", { type: "image/png" }))).toThrow();
    expect(() => validateQuestionPhoto(new File(["x"], "x.svg", { type: "image/svg+xml" }))).toThrow();
    expect(() => validateQuestionPhoto({ type: "image/png", size: 8 * 1024 * 1024 + 1 } as File)).toThrow();
  });
  it("a damaged optional annotation cannot invalidate an existing mistake", () => {
    useMathLabStore.setState({ mistakes: [] });
    const record = useMathLabStore.getState().addMistake({ solution: examples[0], errorReason: "测试", note: "真实记录应保留" });
    const parsed = mistakeRecordSchema.parse({ ...record, handwriting: { broken: true } });
    expect(parsed.handwriting).toBeUndefined();
    expect(parsed.question).toBe(record.question);
    expect(parsed.note).toBe("真实记录应保留");
  });
});

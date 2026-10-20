import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { callTutor } from "@/lib/tutor-client";
import { setApiKey } from "@/lib/storage";
import { examples } from "@/lib/examples";
import { recognition } from "@/testdata/handwriting";
import { writeTextbookSelection, availableTextbooks } from "./textbooks";
import { savePersonalBook, setPersonalAiConsent } from "./personal-library";
import { personalBookFixture as personalBook } from "@/testdata/personal-library";

const request = { action: "solve", question: "解方程 x+1=0", mode: "auto" } as const;
beforeEach(() => { localStorage.clear(); setApiKey("sk-test-only"); });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); localStorage.clear(); });

describe("tutor client error handling", () => {
  it("does not send private textbook text without consent, then sends only matching bounded excerpts", async () => {
    savePersonalBook(personalBook); writeTextbookSelection(personalBook.id);
    const fetcher = vi.fn().mockImplementation(() => Promise.resolve(new Response(JSON.stringify({ data: examples[0] }))));
    vi.stubGlobal("fetch", fetcher);
    const input = { ...request, question: "解释矩阵乘法的维数条件", ragEnabled: true };
    const notice = vi.fn();
    await expect(callTutor(input, { onNotice: notice })).resolves.toEqual(examples[0]);
    expect(notice).toHaveBeenCalledOnce();
    const fallback = JSON.parse(fetcher.mock.calls[0][1].body);
    expect(fallback.ragEnabled).toBe(false);
    expect(fallback.personalExcerpts).toBeUndefined();
    expect(fallback.textbookIds).toBeUndefined();
    setPersonalAiConsent(personalBook.id, true);
    await callTutor(input);
    const body = JSON.parse(fetcher.mock.calls[1][1].body);
    expect(body.personalExcerpts).toHaveLength(1);
    expect(body.personalExcerpts[0]).toMatchObject({ textbookId: personalBook.id, pageNumber: 3, text: personalBook.pages[0].text });
    expect(body.pages).toBeUndefined(); expect(body.fingerprint).toBeUndefined();
    await callTutor({ ...input, ragEnabled: false });
    expect(JSON.parse(fetcher.mock.calls[2][1].body).personalExcerpts).toBeUndefined();
  });
  it("does not silently claim private-PDF retrieval for a photo-only question", async () => {
    savePersonalBook({ ...personalBook, allowAiUse: true }); writeTextbookSelection(personalBook.id);
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: { kind: "solution", solution: examples[0] } }))); vi.stubGlobal("fetch", fetcher);
    const onNotice = vi.fn();
    await expect(callTutor({ action: "photo-tutor", question: "", mode: "auto", imageDataUrl: "data:image/png;base64,iVBORw0KGgo=", ragEnabled: true }, { onNotice })).resolves.toMatchObject({ kind: "solution" });
    expect(onNotice).toHaveBeenCalledOnce();
    expect(JSON.parse(fetcher.mock.calls[0][1].body)).toMatchObject({ ragEnabled: false, imageDataUrl: "data:image/png;base64,iVBORw0KGgo=" });
    expect(JSON.parse(fetcher.mock.calls[0][1].body).personalExcerpts).toBeUndefined();
  });
  it.each(["solve", "photo-tutor"] as const)("applies selected textbooks to %s only when course retrieval is enabled", async (action) => {
    writeTextbookSelection(availableTextbooks[0].id);
    const fetcher = vi.fn().mockImplementation(() => Promise.resolve(new Response(JSON.stringify({ data: action === "solve" ? examples[0] : { kind: "solution", solution: examples[0] } }))));
    vi.stubGlobal("fetch", fetcher);
    const input = action === "solve" ? { ...request, ragEnabled: true } : { action, question: "", mode: "auto" as const, imageDataUrl: "data:image/png;base64,iVBORw0KGgo=", ragEnabled: true };
    await callTutor(input);
    expect(JSON.parse(fetcher.mock.calls[0][1].body).textbookIds).toEqual([availableTextbooks[0].id]);
    await callTutor({ ...input, ragEnabled: false });
    expect(JSON.parse(fetcher.mock.calls[1][1].body).textbookIds).toBeUndefined();
  });
  it("validates automatic photo routing instead of parsing a transcription as a complete solution", async () => {
    const result = { kind: "student_work", reason: "发现学生解题步骤", recognition };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: result }))));
    await expect(callTutor({ action: "photo-tutor", question: "", imageDataUrl: "data:image/png;base64,iVBORw0KGgo=", mode: "auto" })).resolves.toEqual(result);
  });
  it("cancels a request when the caller edits its source", async () => {
    const caller = new AbortController();
    vi.stubGlobal("fetch", vi.fn().mockImplementation((_url, options) => new Promise((_resolve, reject) => {
      options.signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
    })));
    const pending = expect(callTutor(request, { signal: caller.signal })).rejects.toMatchObject({ code: "timeout" });
    caller.abort();
    await pending;
  });
  it("does not send a request without a key", async () => {
    setApiKey("");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(callTutor(request)).rejects.toMatchObject({ code: "missing_key" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("turns an empty service response into an explicit error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("", { status: 200 })));
    await expect(callTutor(request)).rejects.toMatchObject({ code: "empty_response" });
  });

  it("does not accept empty steps as a completed answer", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      data: { ...examples[0], steps: [], finalAnswerLatex: "" },
    }), { status: 200 })));
    await expect(callTutor(request)).rejects.toMatchObject({ code: "invalid_model_output" });
  });

  it("waits for the two-stage deadline then reports timeout", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn().mockImplementation((_url, options) => new Promise((_resolve, reject) => {
      options.signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
    })));
    const pending = expect(callTutor(request)).rejects.toMatchObject({ code: "timeout" });
    await vi.advanceTimersByTimeAsync(90_000);
    await pending;
  });
});

import { ZodError } from "zod";
import { explainResultSchema, practiceResultSchema, solveResultSchema, understandingCheckSchema, understandingFeedbackSchema, multiMethodSchema, paperSchema, materialAnalysisSchema, type TutorRequest } from "@/lib/math-schema";
import { getApiKey } from "@/lib/storage";
import { handwritingRecognitionSchema, handwritingEvaluationSchema, handwritingHintSchema } from "@/lib/handwriting-schema";
import { photoTutorResultSchema } from "@/lib/photo-tutoring";
import { readTextbookSelection } from "@/lib/textbooks";
import { readPersonalLibrary, searchPersonalExcerpts } from "@/lib/personal-library";
import { usageHeaders } from "@/lib/usage-client";

export class TutorError extends Error {
  constructor(message: string, public code: string, public status?: number) {
    super(message);
  }
}

export async function callTutor(request: TutorRequest, options: { signal?: AbortSignal; onNotice?: (message: string) => void } = {}) {
  const key = getApiKey();
  if (!key) throw new TutorError("请先在设置中保存 DeepSeek API 密钥。", "missing_key");
  const controller = new AbortController();
  const cancel = () => controller.abort();
  if (options.signal?.aborted) controller.abort();
  options.signal?.addEventListener("abort", cancel, { once: true });
  // Includes question assessment and bounded recovery within the proxy's 85s budget.
  const timeout = window.setTimeout(() => controller.abort(), 90_000);
  try {
    const selected = readTextbookSelection();
    let scopedRequest = (request.action === "solve" || request.action === "photo-tutor") && request.ragEnabled && request.textbookIds === undefined && selected !== "all"
      ? { ...request, textbookIds: [selected] } : request;
    if ((scopedRequest.action === "solve" || scopedRequest.action === "photo-tutor") && scopedRequest.ragEnabled && scopedRequest.personalExcerpts === undefined) {
      const library = readPersonalLibrary();
      const chosen = scopedRequest.textbookIds;
      const books = library.books.filter((book) => !chosen || chosen.includes(book.id));
      const unavailable = chosen?.some((id) => id.startsWith("local-pdf-") && !books.some((book) => book.id === id && book.allowAiUse));
      const photoOnly = scopedRequest.action === "photo-tutor" && !scopedRequest.question.trim() && chosen?.some((id) => id.startsWith("local-pdf-"));
      if (library.error || unavailable || photoOnly) {
        // Optional retrieval must not disable recognition or ordinary tutoring.
        // No consent is changed and no private excerpts are sent in this fallback.
        options.onNotice?.(library.error ? "个人教材暂时无法读取，本次不检索教材，继续解析题目。原资料未改动。"
          : unavailable ? "所选个人教材未授权或已不可用，本次跳过教材检索，继续答疑。可在课程知识检索中切换教材。"
          : "纯图片题本次先识别与解析，不检索个人 PDF；如需教材辅助，可补充题干文字后重试。");
        scopedRequest = { ...scopedRequest, ragEnabled: false, textbookIds: undefined, personalExcerpts: undefined };
      } else {
        // Only matching, explicitly permitted excerpts leave the browser.
        const personalExcerpts = searchPersonalExcerpts(scopedRequest.question, books, "all", true);
        if (personalExcerpts.length) scopedRequest = { ...scopedRequest, personalExcerpts };
      }
    }
    const response = await fetch("/api/tutor", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + key, ...usageHeaders() },
      body: JSON.stringify(scopedRequest),
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => null) as { message?: string; code?: string; data?: unknown } | null;
    if (!response.ok) throw new TutorError(payload?.message ?? "解析服务暂时不可用。", payload?.code ?? "request_failed", response.status);
    if (!payload) throw new TutorError("解析服务返回了空响应，请重试。", "empty_response", response.status);
    if (request.action === "photo-tutor") return photoTutorResultSchema.parse(payload.data);
    if (request.action === "recognize-work") return handwritingRecognitionSchema.parse(payload.data);
    if (request.action === "evaluate-work") return handwritingEvaluationSchema.parse(payload.data);
    if (request.action === "work-hint") return handwritingHintSchema.parse(payload.data);
    if (request.action === "multi-method") return multiMethodSchema.parse(payload.data);
    if (request.action === "generate-paper") return paperSchema.parse(payload.data);
    if (request.action === "analyze-material") return materialAnalysisSchema.parse(payload.data);
    if (request.action === "solve") return solveResultSchema.parse(payload.data);
    if (request.action === "explain-step") return explainResultSchema.parse(payload.data);
    if (request.action === "similar-practice") return practiceResultSchema.parse(payload.data);
    if (request.action === "generate-check") return understandingCheckSchema.parse(payload.data);
    return understandingFeedbackSchema.parse(payload.data);
  } catch (error) {
    if (error instanceof TutorError) throw error;
    if (error instanceof ZodError) throw new TutorError("解析服务返回的数据结构不可靠，请重新尝试。", "invalid_model_output");
    if (error instanceof DOMException && error.name === "AbortError") throw new TutorError("请求超时，请稍后重试。", "timeout");
    throw new TutorError("网络连接失败，请检查网络后重试。", "network");
  } finally {
    window.clearTimeout(timeout);
    options.signal?.removeEventListener("abort", cancel);
  }
}

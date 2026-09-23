import { explainResultSchema, practiceResultSchema, solveResultSchema, type TutorRequest } from "@/lib/math-schema";
import { getApiKey } from "@/lib/storage";

export class TutorError extends Error {
  constructor(message: string, public code: string, public status?: number) {
    super(message);
  }
}

export async function callTutor(request: TutorRequest) {
  const key = getApiKey();
  if (!key) throw new TutorError("请先在设置中保存 DeepSeek API 密钥。", "missing_key");
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 35_000);
  try {
    const response = await fetch("/api/tutor", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + key },
      body: JSON.stringify(request),
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) throw new TutorError(payload?.message ?? "解析服务暂时不可用。", payload?.code ?? "request_failed", response.status);
    if (request.action === "solve") return solveResultSchema.parse(payload.data);
    if (request.action === "explain-step") return explainResultSchema.parse(payload.data);
    return practiceResultSchema.parse(payload.data);
  } catch (error) {
    if (error instanceof TutorError) throw error;
    if (error instanceof DOMException && error.name === "AbortError") throw new TutorError("请求超时，请稍后重试。", "timeout");
    throw new TutorError("网络连接失败，请检查网络后重试。", "network");
  } finally {
    window.clearTimeout(timeout);
  }
}

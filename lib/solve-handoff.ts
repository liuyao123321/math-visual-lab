import { solveResultSchema, type SolveResult } from "@/lib/math-schema";
import { photoTutorResultSchema, type PhotoTutorResult } from "./photo-tutoring";

const key = "mathlab.solve-handoff.v1";
const lifetime = 5 * 60 * 1000;

// One-use, tab-local result handoff for native navigation. Never save the
// request, original photo, API key or learner profile in this temporary record.
export function saveSolveHandoff(solution: SolveResult): string {
  const parsed = solveResultSchema.parse(solution);
  const token = crypto.randomUUID();
  try {
    sessionStorage.setItem(key, JSON.stringify({ token, createdAt: Date.now(), solution: parsed }));
  } catch {
    throw new Error("浏览器无法暂存解析结果，请允许本站使用会话存储后重试。");
  }
  return token;
}

export function consumeSolveHandoff(token: string): SolveResult | null {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const record = JSON.parse(raw);
    if (record.token !== token) return null;
    sessionStorage.removeItem(key);
    const age = Date.now() - record.createdAt;
    if (!Number.isFinite(age) || age < 0 || age > lifetime) return null;
    const result = solveResultSchema.safeParse(record.solution);
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

export function savePhotoHandoff(result: PhotoTutorResult): string {
  const parsed = photoTutorResultSchema.parse(result);
  const token = crypto.randomUUID();
  try {
    const raw = JSON.stringify({ token, createdAt: Date.now(), photoResult: parsed });
    if (raw.length > 250_000) throw new Error("oversized");
    sessionStorage.setItem(key, raw);
  } catch {
    throw new Error("浏览器无法暂存图片识别结果，请到智能答疑页上传，或检查会话存储权限。");
  }
  return token;
}

// Understand old question-only handoffs too; existing navigation remains valid.
export function consumePhotoHandoff(token: string): PhotoTutorResult | null {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw || raw.length > 250_000) return null;
    const record = JSON.parse(raw);
    if (record.token !== token) return null;
    sessionStorage.removeItem(key);
    const age = Date.now() - record.createdAt;
    if (!Number.isFinite(age) || age < 0 || age > lifetime) return null;
    const result = photoTutorResultSchema.safeParse(record.photoResult ?? { kind: "solution", solution: record.solution });
    return result.success ? result.data : null;
  } catch { return null; }
}

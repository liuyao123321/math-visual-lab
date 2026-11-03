import { examples } from "@/lib/examples";
import type { MistakeRecord } from "@/lib/math-schema";

// Isolated UI fixtures, never inserted into the user's browser or real library.
export function mistakeFixture(id: string, patch: Partial<MistakeRecord> = {}): MistakeRecord {
  return { id, question: "【界面测试】" + examples[0].normalizedQuestion, solution: structuredClone(examples[0]), subject: "高等数学", topics: ["二次函数"], questionType: "函数", difficulty: "基础", errorReason: "计算错误", note: "", mastery: "unreviewed", attempts: 0,
    createdAt: "2026-10-27T04:00:00.000Z", updatedAt: "2026-10-27T04:00:00.000Z", lastPracticedAt: null, ...patch };
}

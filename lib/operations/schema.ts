import { z } from "zod";

export const pagePaths = ["/", "/solve", "/knowledge", "/mistakes", "/report", "/practice", "/settings", "/feedback"] as const;
export const feedbackCategories = { bug: "功能异常", answer: "解题或图像有误", suggestion: "功能建议", other: "其他问题" } as const;
export const feedbackStatuses = { new: "待处理", in_progress: "处理中", resolved: "已解决", closed: "已关闭" } as const;
export const eventSchema = z.object({ id: z.string().uuid(), kind: z.enum(["page_view", "mistake_saved", "practice_submitted"]), path: z.enum(pagePaths) }).strict();
export const feedbackSchema = z.object({
  submissionId: z.string().uuid(), category: z.enum(["bug", "answer", "suggestion", "other"]),
  title: z.string().trim().min(4).max(100), description: z.string().trim().min(10).max(4000),
  steps: z.string().trim().max(1500).default(""), contact: z.string().trim().max(120).default(""),
  page: z.enum(pagePaths), website: z.string().max(0).optional(),
}).strict();
export const feedbackUpdateSchema = z.object({ status: z.enum(["new", "in_progress", "resolved", "closed"]), note: z.string().trim().max(1500), version: z.number().int().positive() }).strict();
export type FeedbackInput = z.infer<typeof feedbackSchema>;
export type FeedbackStatus = keyof typeof feedbackStatuses;
export type Feedback = Omit<FeedbackInput, "submissionId" | "website"> & { id: string; status: FeedbackStatus; note: string; version: number; createdAt: number; updatedAt: number };
export type Stats = {
  days: number; start: string; end: string; pv: number; uv: number; newVisitors: number; activeVisitors: number;
  aiRequests: number; aiSuccess: number; aiAverageMs: number | null; solveRequests: number;
  ragRequests: number; ragMatches: number; pendingFeedback: number;
  daily: Array<{ date: string; pv: number; uv: number }>;
  features: Array<{ name: string; count: number }>; failures: Array<{ status: number; count: number }>;
};

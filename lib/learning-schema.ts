import { z } from "zod";
import { materialAnalysisSchema, paperSchema, understandingFeedbackSchema } from "@/lib/math-schema";

export const reviewTaskSchema = z.object({ id: z.string(), day: z.string(), topic: z.string(), reason: z.string(), minutes: z.number().int().positive(), mistakeId: z.string().optional(), completed: z.boolean() });
export const reviewPlanSchema = z.object({ id: z.string(), createdAt: z.string(), examDate: z.string(), dailyMinutes: z.number().int().min(10).max(120), tasks: z.array(reviewTaskSchema).max(90) });
export type ReviewPlan = z.infer<typeof reviewPlanSchema>;
export const storedMaterialSchema = materialAnalysisSchema.extend({ id: z.string(), createdAt: z.string(), name: z.string() });
export const paperSessionSchema = z.object({ id: z.string(), createdAt: z.string(), origin: z.enum(["ai", "offline"]), paper: paperSchema, answers: z.record(z.string().max(1200)), feedback: z.record(understandingFeedbackSchema), submittedAt: z.string().nullable() });
export type PaperSession = z.infer<typeof paperSessionSchema>;
export const learningDataSchema = z.object({ version: z.literal(1), plan: reviewPlanSchema.nullable(), materials: z.array(storedMaterialSchema).max(20), sessions: z.array(paperSessionSchema).max(10), activityDays: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).max(366) });
export type LearningData = z.infer<typeof learningDataSchema>;

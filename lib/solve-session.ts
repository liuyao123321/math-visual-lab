import { z } from "zod";
import { explainResultSchema, explanationModeSchema, explanationSelectionSchema, practiceResultSchema, solveResultSchema, tutoringStyleSchema, understandingCheckSchema, understandingFeedbackSchema } from "@/lib/math-schema";
import { clarificationDraftSchema } from "@/lib/question-clarification";
import { photoWorkSchema } from "./photo-tutoring";

export const SOLVE_SESSION_KEY = "mathlab.solve-session.v1";
const maxSnapshotCharacters = 250_000;

// A single tab-local working draft, not a second collection of permanent mistakes.
// Explicit fields deliberately exclude original images, credentials and profiles.
export const solveSessionSchema = z.object({
  version: z.literal(1),
  entryKey: z.string().max(5000),
  question: z.string().max(20000),
  solution: solveResultSchema.nullable(),
  resultReady: z.boolean(),
  mode: explanationModeSchema,
  modeSelection: explanationSelectionSchema,
  tutoringStyle: tutoringStyleSchema,
  progressCount: z.number().int().min(0).max(12),
  activeStep: z.number().int().min(0).max(12),
  parameters: z.record(z.number().finite()).refine((value) => Object.keys(value).length <= 4),
  mobileView: z.enum(["input", "steps", "visual"]),
  error: z.string().max(2000),
  errorCode: z.string().max(100),
  errorReason: z.string().max(300),
  note: z.string().max(20000),
  detailReason: z.string().max(20000),
  detail: explainResultSchema.nullable(),
  practice: practiceResultSchema.nullable(),
  understandingCheck: understandingCheckSchema.nullable(),
  checkAnswer: z.string().max(20000),
  checkFeedback: understandingFeedbackSchema.nullable(),
  pendingAction: z.enum(["", "solve", "detail", "practice", "check", "evaluate"]),
  hadPhoto: z.boolean(),
  clarificationDraft: clarificationDraftSchema.optional(),
  answerMethod: z.enum(["standard", "handwriting"]).optional(),
  ragEnabled: z.boolean().optional(),
  photoReview: photoWorkSchema.nullable().optional(),
  stepFeedback: z.record(z.object({ reason: z.string().max(20000), detail: explainResultSchema.nullable() })).refine((value) => Object.keys(value).length <= 12).optional(),
}).refine((value) => !value.resultReady || !!value.solution, "有效解析必须包含题解");
export type SolveSession = z.infer<typeof solveSessionSchema>;

export function readSolveSession(): SolveSession | null {
  try {
    const raw = sessionStorage.getItem(SOLVE_SESSION_KEY);
    if (!raw || raw.length > maxSnapshotCharacters) return null;
    const parsed = solveSessionSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch { return null; }
}

export function writeSolveSession(value: SolveSession): boolean {
  try {
    const parsed = solveSessionSchema.safeParse(value);
    if (!parsed.success) return false;
    const raw = JSON.stringify(parsed.data);
    if (raw.length > maxSnapshotCharacters) return false;
    sessionStorage.setItem(SOLVE_SESSION_KEY, raw);
    return true;
  } catch { return false; }
}

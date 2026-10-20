import { z } from "zod";
import { handwritingEvaluationSchema, handwritingHintSchema, handwritingRecognitionSchema, studentStepsSchema, type StudentStep } from "./handwriting-schema";

export const HANDWRITING_SESSION_KEY = "mathlab.handwriting-session.v1";
export const handwritingSessionSchema = z.object({
  entryKey: z.string().max(100).nullable().default(null),
  version: z.literal(1), question: z.string().max(2000), conditions: z.array(z.string().max(300)).max(10),
  steps: studentStepsSchema, confirmed: z.boolean(),
  recognition: handwritingRecognitionSchema.nullable(),
  evaluation: handwritingEvaluationSchema.nullable(),
  hints: z.array(handwritingHintSchema).max(3),
  revealedHints: z.number().int().min(0).max(3),
  note: z.string().max(5000), errorReason: z.string().max(300),
  pending: z.boolean(), hadPhoto: z.boolean(),
  savedMistakeId: z.string().max(100).nullable(),
}).superRefine((value, ctx) => {
  if (value.evaluation && (!value.confirmed || value.steps.length !== value.evaluation.steps.length
    || value.steps.some((s, i) => s.id !== value.evaluation!.steps[i].stepId))) {
    ctx.addIssue({ code: "custom", message: "评价与已确认的步骤不匹配" });
  }
});
export type HandwritingSession = z.infer<typeof handwritingSessionSchema>;
export const emptyHandwritingSession = (): HandwritingSession => ({
  version: 1, entryKey: null, question: "", conditions: [], steps: [], confirmed: false,
  recognition: null, evaluation: null, hints: [], revealedHints: 0,
  note: "", errorReason: "", pending: false, hadPhoto: false, savedMistakeId: null,
});
export function readHandwritingSession(): HandwritingSession | null {
  try {
    const raw = sessionStorage.getItem(HANDWRITING_SESSION_KEY);
    if (!raw || raw.length > 180000) return null;
    const value = handwritingSessionSchema.safeParse(JSON.parse(raw));
    return value.success ? value.data : null;
  } catch { return null; }
}
export function writeHandwritingSession(value: HandwritingSession): boolean {
  try {
    // Schema whitelists fields: no image data, key, profile or full answer.
    const checked = handwritingSessionSchema.parse(value);
    const raw = JSON.stringify(checked);
    if (raw.length > 180000) return false;
    sessionStorage.setItem(HANDWRITING_SESSION_KEY, raw);
    return true;
  } catch { return false; }
}
export function invalidateHandwriting(value: HandwritingSession, patch: Partial<Pick<HandwritingSession, "question" | "conditions" | "steps">>): HandwritingSession {
  // Conservatively invalidate ALL verdicts; always includes edited step and successors.
  return { ...value, ...patch, confirmed: false, evaluation: null, hints: [], revealedHints: 0, pending: false, savedMistakeId: null };
}
export function moveStudentStep(steps: StudentStep[], index: number, delta: -1 | 1): StudentStep[] {
  const target = index + delta;
  if (target < 0 || target >= steps.length) return steps;
  const next = [...steps];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

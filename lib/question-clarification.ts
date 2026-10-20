import { z } from "zod";
import type { ClarificationQuestion, SolveResult } from "@/lib/math-schema";

export const clarificationDraftSchema = z.record(z.object({
  selected: z.string().max(20),
  custom: z.string().max(300),
})).refine((value) => Object.keys(value).length <= 5);
export type ClarificationDraft = z.infer<typeof clarificationDraftSchema>;

export function clarificationQuestionsFor(solution: Pick<SolveResult, "inputAssessment" | "limitations">): ClarificationQuestion[] {
  const assessment = solution.inputAssessment;
  const missing = assessment?.classification === "incomplete" ? assessment.missingInformation : solution.limitations;
  return missing.slice(0, 5).map((item, index) =>
    assessment?.classification === "incomplete" && assessment.clarificationQuestions?.find((question) => question.missingIndex === index)
      || { missingIndex: index, title: item, options: [] });
}

export function clarificationAnswer(question: ClarificationQuestion, draft?: ClarificationDraft[string]): string {
  if (!draft) return "";
  if (draft.selected === "custom" || question.options.length === 0) return draft.custom.trim();
  const match = /^option-(\d+)$/.exec(draft.selected);
  return match ? question.options[Number(match[1])]?.value ?? "" : "";
}

// Selections are explicit user supplements, not silently invented original conditions.
// Always run the normal assessment again; choosing an option does not certify completeness.
export function supplementedQuestion(base: string, questions: ClarificationQuestion[], draft: ClarificationDraft): string | null {
  if (!questions.length) return null;
  const answers = questions.map((question) => clarificationAnswer(question, draft[String(question.missingIndex)]));
  if (answers.some((answer) => !answer)) return null;
  const result = base.trim() + "\n\n用户确认的补充条件：\n" + questions.map((question, index) => `${question.title}：${answers[index]}`).join("\n");
  return result.length <= 2000 ? result : null;
}

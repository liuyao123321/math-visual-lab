import { explanationModeSchema, type ExplanationMode } from "./math-schema";

export const TUTOR_MODE_EVENT = "mathlab:tutor-mode";
export const tutorModes = [
  { mode: "concise", label: "简洁答疑", description: "重点结论，必要步骤。", symbol: "x = 2" },
  { mode: "detailed", label: "详细答疑", description: "展开推导，讲清每一步依据。", symbol: "∴" },
  { mode: "visual", label: "可视化答疑", description: "结合图像，理解公式与过程。", symbol: "ƒ(x)" },
] as const;

export function parseTutorMode(value: unknown): ExplanationMode | undefined {
  const parsed = explanationModeSchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}

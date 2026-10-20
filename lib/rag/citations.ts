import type { SolveResult } from "@/lib/math-schema";
import type { RagSnapshot } from "./schema";

export function citationError(solution: SolveResult, snapshot: RagSnapshot): string | null {
  const cards = new Map(snapshot.cards.map((card) => [card.id, card]));
  for (const step of solution.steps) {
    const ids = step.knowledgeIds ?? [];
    if (new Set(ids).size !== ids.length) return "同一步的知识引用编号不能重复。";
    if (ids.length && !step.citationPurpose) return "有知识引用的步骤必须说明citationPurpose。";
    for (const id of ids) {
      const card = cards.get(id);
      if (!card) return `知识编号${id}不在本次提供的资料内，禁止编造引用。`;
      if (card.kind === "excerpt" && step.citationPurpose === "apply") return "个人PDF原文摘录尚未结构化核验定理条件，只能用于explain或contrast，不能标为已核验定理直接应用。";
      const checks = (step.conditionChecks ?? []).filter((check) => check.knowledgeId === id);
      if (step.citationPurpose === "apply") {
        if (checks.length !== card.conditions.length || card.conditions.some((condition) => !checks.some((check) => check.conditionId === condition.id))) return `应用${id}时必须逐项检查全部适用条件。`;
        if (checks.some((check) => check.status !== "satisfied")) return `条件未知或不满足时不能直接应用${id}，需补充依据或说明不适用。`;
      }
    }
    const seen = new Set<string>();
    for (const check of step.conditionChecks ?? []) {
      const key = `${check.knowledgeId}:${check.conditionId}`;
      if (seen.has(key) || !ids.includes(check.knowledgeId)
        || !cards.get(check.knowledgeId)?.conditions.some((condition) => condition.id === check.conditionId)) return "条件检查必须唯一对应本步骤已引用知识的真实条件。";
      seen.add(key);
    }
  }
  return null;
}

export function attachRagSnapshot(solution: SolveResult, snapshot: RagSnapshot): SolveResult {
  const usedKnowledgeIds = [...new Set(solution.steps.flatMap((step) => step.knowledgeIds ?? []))];
  const next = { ...snapshot, usedKnowledgeIds };
  if (next.cards.length && !usedKnowledgeIds.length) {
    next.status = "not_used";
    next.message = "已检索到候选资料，但本次解析未引用；请按通用AI解析核对。";
  }
  return { ...solution, rag: next };
}

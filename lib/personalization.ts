import type { LearnerProfile, LearningContextSummary, MistakeRecord } from "@/lib/math-schema";

export const subjectLabels = ["高等数学", "线性代数", "概率统计"] as const;
export const selfLevelLabels = { foundation: "基础薄弱", intermediate: "一般", advanced: "较熟练" } as const;
export const learningGoalLabels = { preview: "预习新知识", homework: "完成作业", review: "复习巩固", exam: "准备考试" } as const;
export const explanationPreferenceLabels = { formula: "公式推导", visual: "图像直观", analogy: "生活类比", comparison: "例题对比" } as const;
export const tutoringStyleLabels = { "hint-first": "先给提示", guided: "分步引导", complete: "直接完整解析" } as const;

export function buildLearningContext(
  profile: LearnerProfile,
  mistakes: MistakeRecord[],
  now = new Date(),
): LearningContextSummary | undefined {
  if (!profile.personalizationEnabled) return undefined;

  const unresolved = mistakes.filter((item) => item.mastery !== "mastered");
  const topicCounts = new Map<string, number>();
  const reasonCounts = new Map<string, number>();
  for (const item of unresolved) {
    for (const topic of item.topics) topicCounts.set(topic, (topicCounts.get(topic) ?? 0) + 1);
    const reason = item.errorReason.trim().slice(0, 80);
    if (reason) reasonCounts.set(reason, (reasonCounts.get(reason) ?? 0) + 1);
  }

  const since = now.getTime() - 7 * 24 * 60 * 60 * 1000;
  const recentPracticeCount = mistakes.filter((item) => {
    const timestamp = Date.parse(item.lastPracticedAt ?? item.createdAt);
    return Number.isFinite(timestamp) && timestamp >= since;
  }).length;

  return {
    profile,
    weakTopics: [...topicCounts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "zh-CN"))
      .slice(0, 3)
      .map(([topic, unresolvedCount]) => ({ topic, unresolvedCount })),
    frequentErrorReasons: [...reasonCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([reason]) => reason),
    recentPracticeCount,
  };
}

export function coachingStrategies(context?: LearningContextSummary) {
  if (!context) return ["个性化已关闭，本次使用通用讲解策略。"];
  const { profile } = context;
  const items = [
    profile.selfLevel === "foundation"
      ? "按照你的基础水平，本题会补充关键中间步骤。"
      : profile.selfLevel === "advanced"
        ? "按照你的熟练程度，本题会减少重复定义并保留关键推理。"
        : "本题会保留必要推导，并在关键转折处解释原因。",
    `你偏好${explanationPreferenceLabels[profile.preferredExplanation]}，仅在适合当前题目时优先采用；讲解方式由题意决定。`,
    `当前目标是${learningGoalLabels[profile.learningGoal]}，本次会据此调整讲解重点。`,
  ];
  if (context.weakTopics[0]) {
    items.push(`错题记录显示“${context.weakTopics[0].topic}”仍需巩固，可在相关题目中重点复习。`);
  }
  return items.slice(0, 4);
}

export function buildStudyRecommendations(mistakes: MistakeRecord[], profile: LearnerProfile) {
  const unresolved = mistakes.filter((item) => item.mastery !== "mastered");
  const byTopic = new Map<string, MistakeRecord[]>();
  for (const item of unresolved) {
    for (const topic of item.topics) byTopic.set(topic, [...(byTopic.get(topic) ?? []), item]);
  }
  return [...byTopic.entries()]
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, 3)
    .map(([topic, records], index) => ({
      topic,
      count: records.length,
      mistakeId: [...records].sort((a, b) => a.attempts - b.attempts)[0]?.id,
      order: index + 1,
      reason: `你有 ${records.length} 道“${topic}”相关错题仍未掌握。`,
      action: profile.learningGoal === "exam" ? "先限时重做，再核对关键步骤。" : "先重做一道，再用自己的话解释方法。",
    }));
}

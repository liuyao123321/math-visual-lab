import type { MistakeRecord, UnderstandingAttempt } from "@/lib/math-schema";
import type { ReviewPlan } from "@/lib/learning-schema";

export function localDay(date = new Date()) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`; }

export const topicCatalog = [
  { topic: "函数", subject: "高等数学", prerequisites: [], note: "先明确自变量、对应关系、定义域和值域。" },
  { topic: "二次函数", subject: "高等数学", prerequisites: ["函数"], note: "联系一般式、顶点式和因式分解形式。" },
  { topic: "函数零点", subject: "高等数学", prerequisites: ["二次函数"], note: "令函数值为零，验证解是否在定义域内。" },
  { topic: "配方法", subject: "高等数学", prerequisites: ["二次函数"], note: "将二次式化为顶点式，联系对称轴与最值。" },
  { topic: "极限", subject: "高等数学", prerequisites: ["函数"], note: "区分函数值和趋近过程，先观察定义域与趋近方向。" },
  { topic: "导数", subject: "高等数学", prerequisites: ["极限"], note: "导数表示局部变化率，图中对应切线斜率。" },
  { topic: "切线", subject: "高等数学", prerequisites: ["导数"], note: "切点坐标与导数共同决定切线方程。" },
  { topic: "极值", subject: "高等数学", prerequisites: ["导数"], note: "驻点不一定是极值点，要判断导数符号变化。" },
  { topic: "原函数", subject: "高等数学", prerequisites: ["导数"], note: "求导能回到被积函数，可用来核对积分结果。" },
  { topic: "定积分", subject: "高等数学", prerequisites: ["原函数"], note: "定积分是带符号的累积量，几何面积需考虑正负区间。" },
  { topic: "几何面积", subject: "高等数学", prerequisites: ["定积分", "函数零点"], note: "找出变号点后分段积分，面积取非负贡献。" },
  { topic: "矩阵", subject: "线性代数", prerequisites: ["向量"], note: "关注矩阵维度和乘法顺序。" },
  { topic: "向量", subject: "线性代数", prerequisites: [], note: "区分向量、向量组、线性组合与线性相关。" },
  { topic: "行列式", subject: "线性代数", prerequisites: ["矩阵"], note: "行列式仅适用于方阵，注意行变换对值的影响。" },
  { topic: "线性方程组", subject: "线性代数", prerequisites: ["矩阵"], note: "用行变换分析秩、自由变量和解的存在性。" },
  { topic: "特征值", subject: "线性代数", prerequisites: ["矩阵", "行列式"], note: "由特征方程求值，再验证对应非零特征向量。" },
  { topic: "条件概率", subject: "概率统计", prerequisites: ["概率"], note: "明确条件改变了哪个样本空间。" },
  { topic: "概率", subject: "概率统计", prerequisites: [], note: "明确样本空间与事件，再检查取值范围和基本运算。" },
  { topic: "概率分布", subject: "概率统计", prerequisites: ["概率"], note: "检查概率非负和总概率为1。" },
  { topic: "数学期望", subject: "概率统计", prerequisites: ["概率分布"], note: "根据离散或连续类型选择求和或积分。" },
];

export function knowledgeMap(mistakes: MistakeRecord[], attempts: UnderstandingAttempt[], extraTopics: string[] = []) {
  const names = new Set([...topicCatalog.map((item) => item.topic), ...mistakes.flatMap((item) => item.topics), ...extraTopics]);
  return [...names].map((topic) => {
    const meta = topicCatalog.find((item) => item.topic === topic);
    const related = mistakes.filter((item) => item.topics.includes(topic));
    const pending = related.filter((item) => item.mastery !== "mastered").length;
    const checks = attempts.filter((item) => item.topics.includes(topic));
    return { topic, subject: meta?.subject ?? related[0]?.subject ?? "其他", prerequisites: meta?.prerequisites ?? [], note: meta?.note ?? "结合相关例题梳理定义、适用条件和典型方法。", pending, related, checks: checks.length, status: pending ? "待巩固" : related.length ? "已标记掌握" : "未记录" };
  });
}

export function generateReviewPlan(mistakes: MistakeRecord[], examDate: string, dailyMinutes: number, now = new Date()): ReviewPlan {
  const end = new Date(examDate + "T23:59:59");
  if (!Number.isFinite(end.getTime()) || end < now || end.getTime() - now.getTime() > 90 * 86400000) throw new Error("请选择今天到未来 90 天内的考试日期。");
  if (!Number.isInteger(dailyMinutes) || dailyMinutes < 10 || dailyMinutes > 120) throw new Error("每天学习时间应为 10 到 120 分钟。");
  const unresolved = mistakes.filter((item) => item.mastery !== "mastered");
  if (!unresolved.length) throw new Error("先收藏至少一道未掌握的错题，再生成专属复习计划。");
  const days = Math.floor((new Date(examDate + "T00:00:00").getTime() - new Date(localDay(now) + "T00:00:00").getTime()) / 86400000) + 1;
  const tasks: ReviewPlan["tasks"] = [];
  const ranked = [...unresolved].sort((a, b) => a.attempts - b.attempts);
  for (let day = 0; day < Math.min(days, 90); day++) {
    const date = new Date(now); date.setDate(now.getDate() + day);
    const item = ranked[day % ranked.length];
    tasks.push({ id: crypto.randomUUID(), day: localDay(date), topic: item.topics[0] ?? item.questionType, minutes: dailyMinutes, mistakeId: item.id, completed: false,
      reason: day < ranked.length ? `针对“${item.errorReason || "未记录错误原因"}”：先回忆定义，再重做错题并解释关键步骤。` : "间隔复习：先独立重做，再进行相似题和理解检查。" });
  }
  return { id: crypto.randomUUID(), createdAt: now.toISOString(), examDate, dailyMinutes, tasks };
}

export function activityStreak(days: string[], now = new Date()) {
  const unique = new Set(days); const cursor = new Date(now);
  if (!unique.has(localDay(cursor))) cursor.setDate(cursor.getDate() - 1);
  let count = 0;
  while (unique.has(localDay(cursor))) { count++; cursor.setDate(cursor.getDate() - 1); }
  return count;
}

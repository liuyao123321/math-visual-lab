import type { Mastery, MistakeRecord } from "./math-schema";

export type MistakeFilters = { query: string; time: "all" | "today" | "week" | "month"; subject: string | null; difficulty: string | null; errorReason: string | null; mastery: Mastery | "all" };
export type MistakeSort = "newest" | "oldest" | "practiced" | "attempts" | "easy" | "hard";
export const emptyMistakeFilters: MistakeFilters = { query: "", time: "all", subject: null, difficulty: null, errorReason: null, mastery: "all" };
export const mistakeSortLabels: Record<MistakeSort, string> = {
  newest: "收藏时间：最新在前", oldest: "收藏时间：最早在前", practiced: "最近练习时间：最近在前",
  attempts: "练习次数：从多到少", easy: "难度：从易到难", hard: "难度：从难到易",
};
export const timeFilterLabels = { all: "全部时间", today: "今天", week: "最近7天", month: "最近30天" };
export const normalizeMistakeValue = (value: string) => value.trim().replace(/\s+/g, " ");
export const mistakeSubject = (value: string) => normalizeMistakeValue(value) || "未分类";
export const mistakeDifficulty = (value: string) => normalizeMistakeValue(value) || "未标注";
export function mistakeTimestamp(value: string | null): number | null {
  if (!value?.trim()) return null;
  const date = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})(?:T|\s|$)/);
  if (!date) return null;
  const [, year, month, day] = date.map(Number);
  const days = [31, year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (month < 1 || month > 12 || day < 1 || day > days[month - 1]) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}
export function difficultyRank(value: string): number | null {
  const ranks: Record<string, number> = { 基础: 0, 简单: 0, 容易: 0, 中等: 1, 进阶: 2, 较难: 2, 困难: 2, 挑战: 2 };
  const normalized = normalizeMistakeValue(value);
  return Object.hasOwn(ranks, normalized) ? ranks[normalized] : null;
}
function comparePresent(a: number | null, b: number | null, direction: 1 | -1) {
  if (a === null || b === null) return a === b ? 0 : a === null ? 1 : -1;
  return (a < b ? -1 : a > b ? 1 : 0) * direction;
}
export function filterMistakes(records: readonly MistakeRecord[], filters: MistakeFilters, now = new Date()) {
  const start = new Date(now); start.setHours(0, 0, 0, 0);
  if (filters.time === "week") start.setDate(start.getDate() - 6);
  if (filters.time === "month") start.setDate(start.getDate() - 29);
  const end = new Date(now); end.setHours(0, 0, 0, 0); end.setDate(end.getDate() + 1);
  const query = filters.query.trim().toLocaleLowerCase();
  return records.filter((item) => {
    const timestamp = mistakeTimestamp(item.createdAt);
    const text = [item.question, item.questionType, ...item.topics, item.note, item.errorReason].join(" ").toLocaleLowerCase();
    return (!query || text.includes(query))
      && (filters.subject === null || mistakeSubject(item.subject) === filters.subject)
      && (filters.difficulty === null || mistakeDifficulty(item.difficulty) === filters.difficulty)
      && (filters.errorReason === null || normalizeMistakeValue(item.errorReason) === filters.errorReason)
      && (filters.mastery === "all" || item.mastery === filters.mastery)
      && (filters.time === "all" || (timestamp !== null && timestamp >= start.getTime() && timestamp < end.getTime()));
  });
}
export function sortMistakes(records: readonly MistakeRecord[], sort: MistakeSort) {
  return [...records].sort((a, b) => {
    let primary = 0;
    if (sort === "newest" || sort === "oldest") primary = comparePresent(mistakeTimestamp(a.createdAt), mistakeTimestamp(b.createdAt), sort === "newest" ? -1 : 1);
    if (sort === "practiced") primary = comparePresent(mistakeTimestamp(a.lastPracticedAt), mistakeTimestamp(b.lastPracticedAt), -1);
    if (sort === "attempts") primary = b.attempts - a.attempts;
    if (sort === "easy" || sort === "hard") primary = comparePresent(difficultyRank(a.difficulty), difficultyRank(b.difficulty), sort === "easy" ? 1 : -1);
    return primary || comparePresent(mistakeTimestamp(a.createdAt), mistakeTimestamp(b.createdAt), -1) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  });
}
export function mistakeFilterOptions(records: readonly MistakeRecord[]) {
  const unique = (values: string[]) => [...new Set(values)].sort((a, b) => a.localeCompare(b, "zh-CN"));
  return { subjects: unique(records.map((item) => mistakeSubject(item.subject))),
    difficulties: unique(records.map((item) => mistakeDifficulty(item.difficulty))).sort((a, b) => comparePresent(difficultyRank(a), difficultyRank(b), 1)),
    reasons: unique(records.map((item) => normalizeMistakeValue(item.errorReason))) };
}
export function mistakePalette(subject: string): "forest" | "navy" | "plum" | "paper" {
  const palettes = new Map<string, "forest" | "navy" | "plum">([["高等数学", "forest"], ["线性代数", "navy"], ["概率统计", "plum"]]);
  return palettes.get(mistakeSubject(subject)) ?? "paper";
}
export function mistakeDateLabel(value: string) {
  const timestamp = mistakeTimestamp(value);
  return timestamp === null ? "时间未记录" : new Date(timestamp).toLocaleDateString("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit" });
}

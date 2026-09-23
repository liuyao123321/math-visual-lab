import { compile } from "mathjs";
import type { VisualizationSpec } from "@/lib/math-schema";

const SAFE_EXPRESSION = /^[0-9a-zA-Z_+\-*/^().,\s]+$/;
const SAFE_BUILT_INS = new Set(["x", "pi", "e", "sin", "cos", "tan", "exp", "log", "sqrt", "abs", "min", "max", "ceil", "floor", "round"]);

export function compileSafeExpression(expression: string, allowedVariables: string[] = []) {
  const allowed = new Set([...SAFE_BUILT_INS, ...allowedVariables]);
  const identifiers = expression.match(/[a-zA-Z_][a-zA-Z0-9_]*/g) ?? [];
  if (!SAFE_EXPRESSION.test(expression) || expression.length > 200 || identifiers.some((name) => !allowed.has(name))) {
    throw new Error("表达式包含不支持的内容");
  }
  const compiled = compile(expression);
  return (scope: Record<string, number>) => {
    const value = compiled.evaluate(scope);
    if (typeof value !== "number" || !Number.isFinite(value)) return null;
    return value;
  };
}

export function sampleExpression(expression: string, domain: [number, number], parameters: Record<string, number>, points = 161) {
  const fn = compileSafeExpression(expression, Object.keys(parameters));
  const x: number[] = [];
  const y: Array<number | null> = [];
  const [min, max] = domain;
  for (let index = 0; index < points; index += 1) {
    const value = min + (index / (points - 1)) * (max - min);
    x.push(value);
    try { y.push(fn({ ...parameters, x: value })); } catch { y.push(null); }
  }
  return { x, y };
}

export function defaultParameterValues(spec?: VisualizationSpec) {
  return Object.fromEntries((spec?.parameters ?? []).map((item) => [item.key, item.defaultValue]));
}

export function reportSummary(mistakes: Array<{ topics: string[]; mastery: string; createdAt: string; lastPracticedAt: string | null }>) {
  const topicCounts = new Map<string, number>();
  const dayCounts = new Map<string, number>();
  for (const item of mistakes) {
    if (item.mastery !== "mastered") {
      for (const topic of item.topics) topicCounts.set(topic, (topicCounts.get(topic) ?? 0) + 1);
    }
    const date = (item.lastPracticedAt ?? item.createdAt).slice(0, 10);
    dayCounts.set(date, (dayCounts.get(date) ?? 0) + 1);
  }
  const weakTopics = [...topicCounts.entries()].sort((a, b) => b[1] - a[1]).map(([topic, count]) => ({ topic, count })).slice(0, 6);
  const mastered = mistakes.filter((item) => item.mastery === "mastered").length;
  return { total: mistakes.length, mastered, masteredRate: mistakes.length ? Math.round((mastered / mistakes.length) * 100) : 0, weakTopics, dayCounts };
}

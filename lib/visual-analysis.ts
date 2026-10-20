import type { SolveResult } from "@/lib/math-schema";
import { parse } from "mathjs";
import { compileSafeExpression, evaluateExpression, sampleExpression } from "@/lib/math";
import { appropriateVisualization } from "@/lib/visualization-policy";

export function experimentReadouts(solution: SolveResult, parameters: Record<string, number>) {
  const spec = appropriateVisualization(solution);
  if (!spec) return [];
  solution = { ...solution, visualization: spec };
  parameters = Object.fromEntries(spec.parameters.map((item) => [item.key, parameters[item.key] ?? item.defaultValue]));
  const n = (value: number) => Number(value.toFixed(4)).toString();
  if (solution.id === "example-quadratic") {
    const k = parameters.k ?? 3;
    return [
      { label: "当前函数", latex: `f(x)=x^2-4x+(${k})=(x-2)^2+(${k}-4)` },
      { label: "顶点与对称轴", latex: `V\\approx(2,${n(k - 4)}),\\quad x=2` },
      { label: "零点", latex: k <= 4 ? `x_{1,2}=2\\pm\\sqrt{4-(${k})},\\quad x_1\\approx${n(2 - Math.sqrt(4 - k))},\\quad x_2\\approx${n(2 + Math.sqrt(4 - k))}` : "\\text{没有实数零点}" },
    ];
  }
  if (solution.id === "example-derivative") {
    const t = parameters.t ?? 0, y = t ** 3 - 3 * t, slope = 3 * t ** 2 - 3;
    return [
      { label: "当前切点", latex: `P\\approx(${n(t)},${n(y)})` },
      { label: "切线斜率", latex: `f'(t)=3t^2-3\\approx${n(slope)}` },
      { label: "切线方程", latex: `y=(3(${t})^2-3)(x-(${t}))+(${t})^3-3(${t})` },
    ];
  }
  if (solution.id === "example-integral") {
    const b = parameters.b ?? 2;
    return [{ label: "当前积分与面积", latex: `\\int_0^{${b}}(2x-x^2)\\,dx=\\left[x^2-\\frac{x^3}{3}\\right]_0^{${b}}\\approx${n(b ** 2 - b ** 3 / 3)}` }];
  }
  const readouts = Object.entries(parameters).map(([key, value]) => ({ label: `当前参数 ${key}`, latex: `${key}=${value}` }));
  for (const layer of solution.visualization?.layers ?? []) {
    try {
      if (layer.expression) {
        compileSafeExpression(layer.expression, Object.keys(parameters));
        const substituted = layer.expression.replace(/[a-zA-Z_][a-zA-Z0-9_]*/g, (name) => name in parameters ? `(${parameters[name]})` : name);
        readouts.push({ label: layer.label, latex: `y=${parse(substituted).toTex()}` });
        if (layer.type === "area") {
          const domain = layer.domainExpressions ? layer.domainExpressions.map((expression) => evaluateExpression(expression, parameters)) : layer.domain ?? solution.visualization!.xDomain;
          if (domain[0] === null || domain[1] === null) continue;
          const [start, end] = domain as [number, number];
          const sampled = sampleExpression(layer.expression, [start, end], parameters, 501);
          if (sampled.y.some((y) => y === null)) continue;
          const dx = (end - start) / 500;
          const area = sampled.y.reduce<number>((sum, y, index) => sum + (y ?? 0) * (index === 0 || index === 500 ? 0.5 : 1), 0) * dx;
          readouts.push({ label: `${layer.label}（带符号数值积分）`, latex: `\\int_{${n(start)}}^{${n(end)}}f(x)\\,dx\\approx${n(area)}` });
        }
      }
      if (layer.type === "points") {
        const x = layer.xExpressions?.map((expression) => evaluateExpression(expression, parameters)) ?? layer.x ?? [];
        const y = layer.yExpressions?.map((expression) => evaluateExpression(expression, parameters)) ?? layer.y ?? [];
        const coordinates = x.flatMap((value, index) => value !== null && y[index] != null ? [`(${n(value)},${n(y[index]!)})`] : []);
        readouts.push({ label: layer.label, latex: coordinates.join(",\\quad") || "\\text{当前参数下无有效关键点}" });
      }
    } catch { /* Graph module presents expression errors; keep other readouts usable. */ }
  }
  return readouts;
}

import type { SolveResult, VisualizationSpec } from "@/lib/math-schema";

const variationIntent = /变化|改变|移动|调整|不同位置|动态|运动|取值范围|随.+变化|vary|moving|animate/i;

/** Old snapshots are deliberately static unless their interactions have been
 * reviewed against the original question. Never apply saved exploratory values
 * to a parameter that only represented a fixed condition of the problem. */
export function appropriateVisualization(solution: Pick<SolveResult, "normalizedQuestion" | "visualization" | "inputAssessment">): VisualizationSpec | undefined {
  const spec = solution.visualization;
  if (!spec || solution.inputAssessment?.visualizationUseful === false) return undefined;
  const relevant = new Set((spec.interactiveParameters ?? []).filter((item) =>
    solution.normalizedQuestion.includes(item.sourceQuote) && variationIntent.test(item.sourceQuote)
  ).map((item) => item.key));
  const fixed = new Map(spec.parameters.filter((item) => !relevant.has(item.key)).map((item) => [item.key, item.defaultValue]));
  if ([...fixed.values()].some((value) => !Number.isFinite(value))) return undefined;
  // Replace whole identifiers only, retaining signs/precedence and never evaling.
  const freeze = (expression: string) => expression.replace(/[A-Za-z_][A-Za-z0-9_]*/g, (name) => fixed.has(name) ? `(${fixed.get(name)})` : name);
  return {
    ...spec,
    parameters: spec.parameters.filter((item) => relevant.has(item.key)),
    layers: spec.layers.map((layer) => ({
      ...layer,
      ...(layer.expression !== undefined ? { expression: freeze(layer.expression) } : {}),
      ...(layer.xExpressions ? { xExpressions: layer.xExpressions.map(freeze) } : {}),
      ...(layer.yExpressions ? { yExpressions: layer.yExpressions.map(freeze) } : {}),
      ...(layer.domainExpressions ? { domainExpressions: layer.domainExpressions.map(freeze) as [string, string] } : {}),
    })),
  };
}

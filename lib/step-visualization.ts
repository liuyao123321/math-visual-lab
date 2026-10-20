import type { SolutionStep, VisualizationSpec } from "./math-schema";

/** Do not expose later steps' points, shaded regions or parameter controls. */
export function visualizationForStep(spec: VisualizationSpec | undefined, step: SolutionStep): VisualizationSpec | undefined {
  if (!spec) return;
  const layers = spec.layers.filter((layer) => step.visualLayerIds.includes(layer.id));
  if (!layers.length) return;
  const expressions = layers.map((layer) => JSON.stringify(layer)).join(" ");
  const parameters = spec.parameters.filter((parameter) => new RegExp(`\\b${parameter.key}\\b`).test(expressions));
  return { ...spec, title: step.title + " · 图像", layers, parameters };
}

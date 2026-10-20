"use client";

import { useMemo } from "react";
import type { SolutionStep, SolveResult, VisualizationSpec } from "@/lib/math-schema";
import { visualizationForStep } from "@/lib/step-visualization";
import { VisualExperiment } from "./visual-experiment";

export function StepVisualization({ solution, spec, step, parameters, onChange }: {
  solution: SolveResult; spec: VisualizationSpec; step: SolutionStep; parameters: Record<string, number>;
  onChange: (value: Record<string, number>) => void;
}) {
  const scene = useMemo(() => visualizationForStep(spec, step), [spec, step]);
  if (!scene) return null;
  return <figure className="step-visualization" aria-label={`“${step.title}”的步骤图像`}>
    <VisualExperiment solution={solution} specOverride={scene} inline parameters={parameters} onChange={(next) => onChange({ ...parameters, ...next })} activeLayerIds={step.visualLayerIds} />
  </figure>;
}

import { describe, expect, it } from "vitest";
import { appropriateVisualization } from "@/lib/visualization-policy";
import { examples } from "@/lib/examples";
import { createPlotTraces } from "@/components/math-plot";

const legacy = {
  ...examples[0], visualization: {
    ...examples[0].visualization!,
    parameters: [{ key: "k", label: "常数项 k", min: 0, max: 6, step: 0.5, defaultValue: 3 }],
    layers: [
      { id: "curve", label: "函数", type: "function" as const, expression: "x^2-4*x+k" },
      { id: "point", label: "顶点", type: "points" as const, xExpressions: ["2"], yExpressions: ["k-4"] },
      { id: "area", label: "区域", type: "area" as const, expression: "x+k", domainExpressions: ["0", "k"] as [string, string] },
    ],
  },
};

describe("problem-relevant visualization", () => {
  it("freezes legacy invented parameters in every expression without altering stored data", () => {
    const original = structuredClone(legacy);
    const spec = appropriateVisualization(legacy)!;
    expect(spec.parameters).toEqual([]);
    expect(spec.layers[0].expression).toBe("x^2-4*x+(3)");
    expect(spec.layers[2].domainExpressions).toEqual(["0", "(3)"]);
    const point = createPlotTraces(spec, { k: 5 }, []).find((trace) => trace.name === "顶点");
    expect(point).toMatchObject({ x: [2], y: [-1] });
    expect(legacy).toEqual(original);
  });
  it("retains a purposefully moving tangent", () => {
    expect(appropriateVisualization(examples[1])!.parameters.map((item) => item.key)).toEqual(["t"]);
  });
  it("rejects a invented or non-interactive source quote", () => {
    for (const sourceQuote of ["改变常数项 k", "求函数"]) {
      expect(appropriateVisualization({ ...legacy, visualization: { ...legacy.visualization, interactiveParameters: [{ key: "k", reason: "探索", sourceQuote }] } })!.parameters).toEqual([]);
    }
  });
  it("retains approved parameters only, freezing additional invented ones", () => {
    const derivative = examples[1];
    const result = appropriateVisualization({ ...derivative, visualization: { ...derivative.visualization!, parameters: [...derivative.visualization!.parameters, ...legacy.visualization.parameters], layers: [{ id: "curve", label: "曲线", type: "function", expression: "x+t+k" }] } })!;
    expect(result.parameters.map((item) => item.key)).toEqual(["t"]);
    expect(result.layers[0].expression).toBe("x+t+(3)");
  });
  it("does not force a graph when the assessment says it is unhelpful", () => {
    expect(appropriateVisualization({ ...examples[0], inputAssessment: { classification: "complete", normalizedQuestion: "计算1+1", message: "完整", missingInformation: [], recommendedMode: "concise", modeReason: "简单计算", visualizationUseful: false } })).toBeUndefined();
  });
  it("fails safely for non-finite legacy defaults", () => {
    expect(appropriateVisualization({ ...legacy, visualization: { ...legacy.visualization, parameters: [{ ...legacy.visualization.parameters[0], defaultValue: Infinity }] } })).toBeUndefined();
  });
});

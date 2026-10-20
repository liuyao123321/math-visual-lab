import { describe, expect, it } from "vitest";
import { examples } from "./examples";
import { visualizationForStep } from "./step-visualization";

describe("step-linked plots", () => {
  it("shows only this step's layers, without later answer markers", () => {
    const [first, vertex] = examples[0].steps;
    expect(visualizationForStep(examples[0].visualization, first)?.layers.map((x) => x.id)).toEqual(["curve"]);
    expect(visualizationForStep(examples[0].visualization, vertex)?.layers.map((x) => x.id)).toEqual(["curve", "vertex"]);
  });
  it("reserves tangent controls for the tangent step", () => {
    const example = examples[1];
    expect(visualizationForStep(example.visualization, example.steps[0])?.parameters).toEqual([]);
    expect(visualizationForStep(example.visualization, example.steps[3])?.parameters.map((x) => x.key)).toEqual(["t"]);
  });
  it("does not invent a graph for a text-only step", () => {
    expect(visualizationForStep(examples[0].visualization, { ...examples[0].steps[0], visualLayerIds: [] })).toBeUndefined();
    expect(visualizationForStep(undefined, examples[0].steps[0])).toBeUndefined();
  });
});
